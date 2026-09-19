import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { makeToken, hashPassword, verifyPassword } from "./hash";

// ---------------------------------------------------------------------------
// Demo staff accounts (prototype bootstrap)
// ---------------------------------------------------------------------------
// - Passwords are stored ONLY as hashed values (see hash.ts). They are never
//   returned by any query, never logged, and never included in login results.
// - The seeder is idempotent AND self-healing: if an earlier build left rows
//   with a different/stale credential format, they are repaired to the
//   documented demo credentials so the login screens keep working.
const DEMO_ACCOUNTS = [
  { staffId: "ADM-01", name: "Water Board Office", role: "admin" as const, password: "admin123" },
  { staffId: "WRK-01", name: "Ravi Kumar", role: "worker" as const, password: "worker123" },
  { staffId: "WRK-02", name: "Sunita Devi", role: "worker" as const, password: "worker123" },
  { staffId: "WRK-03", name: "Imran Khan", role: "worker" as const, password: "worker123" },
];

/**
 * Ensure every demo account exists with the documented credentials.
 * - Missing row → insert it (password hashed on write).
 * - Stale row from an older build (unverifiable hash) → repaired in place.
 * - Duplicate rows for the same Staff ID → keep one healthy row, drop the rest.
 * Runs before every login (cheap, indexed) so a fresh or previously-seeded
 * database can never end up with un-loginable demo accounts.
 */
export const ensureDemoAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    let changed = false;
    for (const demo of DEMO_ACCOUNTS) {
      const rows = await ctx.db
        .query("staff")
        .withIndex("staffId", (q) => q.eq("staffId", demo.staffId))
        .collect();

      const healthy = rows.find(
        (r) =>
          r.active &&
          r.role === demo.role &&
          verifyPassword(demo.password, r.password),
      );

      if (healthy) {
        for (const r of rows) {
          if (r._id !== healthy._id) {
            await ctx.db.delete(r._id);
            changed = true;
          }
        }
      } else if (rows.length > 0) {
        // Heal the oldest row in place instead of failing login forever.
        const keep = rows.reduce((a, b) =>
          a._creationTime <= b._creationTime ? a : b,
        );
        await ctx.db.patch(keep._id, {
          name: demo.name,
          role: demo.role,
          password: hashPassword(demo.password),
          active: true,
        });
        for (const r of rows) {
          if (r._id !== keep._id) await ctx.db.delete(r._id);
        }
        changed = true;
      } else {
        await ctx.db.insert("staff", {
          staffId: demo.staffId,
          name: demo.name,
          role: demo.role,
          password: hashPassword(demo.password),
          active: true,
        });
        changed = true;
      }
    }
    await ctx.runMutation(internal.complaints.seedDemoComplaints);
    return { changed };
  },
});

/** Public bootstrap the UI calls on mount: seeds/heals demo data. Idempotent. */
export const ensureDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.staff.ensureDemoAccounts);
    return true;
  },
});

/** Worker list for the Admin assignment dropdown (no password material). */
export const listWorkers = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("staff").collect();
    return all
      .filter((s) => s.role === "worker" && s.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => ({
        id: w._id,
        staffId: w.staffId,
        name: w.name,
        role: w.role,
      }));
  },
});

/** Public counts for the landing page (no sensitive fields). */
export const publicStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("staff").collect();
    return {
      workers: all.filter((s) => s.role === "worker" && s.active).length,
      admins: all.filter((s) => s.role === "admin" && s.active).length,
    };
  },
});

/**
 * Staff login with Staff ID + password. Returns a token stored client-side
 * (localStorage) — roles stay fully separate because every later call
 * re-resolves the token server-side.
 *
 * Security notes:
 * - Passwords are verified against the stored hash only (verifyPassword);
 *   there is deliberately no bypass, plaintext comparison, or "accept any
 *   password" path.
 * - No password material is logged or returned; the response contains only a
 *   session token and public profile fields.
 */
export const login = mutation({
  args: { staffId: v.string(), password: v.string() },
  handler: async (ctx, { staffId, password }) => {
    // Guarantee the demo accounts exist and are healthy before verifying, so
    // stale rows from an earlier build can never block sign-in.
    await ctx.runMutation(internal.staff.ensureDemoAccounts);

    const id = staffId.trim();
    if (!id) throw new ConvexError("Please enter your Staff ID.");
    const trimmedPassword = password.trim();
    if (!trimmedPassword) throw new ConvexError("Please enter your password.");

    let rows = await ctx.db
      .query("staff")
      .withIndex("staffId", (q) => q.eq("staffId", id))
      .collect();
    if (rows.length === 0) {
      // Case-insensitive fallback (e.g. "adm-01" → "ADM-01").
      const all = await ctx.db.query("staff").collect();
      rows = all.filter((s) => s.staffId.toLowerCase() === id.toLowerCase());
    }
    if (rows.length === 0) {
      throw new ConvexError("Staff ID not found. Check your ID and try again.");
    }

    // Verify against the stored hash. Duplicates are removed by the seeder;
    // checking every row that shares the ID is just belt-and-braces.
    const account = rows.find((r) => verifyPassword(trimmedPassword, r.password));
    if (!account) {
      throw new ConvexError("Incorrect password. Please try again.");
    }
    if (!account.active) {
      throw new ConvexError("This account is inactive. Contact the water board office.");
    }

    const token = makeToken(account._id);
    await ctx.db.insert("sessions", { token, staffId: account._id, createdAt: Date.now() });
    return {
      token,
      staff: {
        id: account._id,
        staffId: account.staffId,
        name: account.name,
        role: account.role,
      },
    };
  },
});

/** Resolve a session token to the signed-in staff member (server-side role check). */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db.query("sessions").collect();
    const found = session.find((s) => s.token === token);
    if (!found) return null;
    const account = await ctx.db.get(found.staffId);
    if (!account || !account.active) return null;
    return {
      id: account._id,
      staffId: account.staffId,
      name: account.name,
      role: account.role,
    };
  },
});

/** End a session. */
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db.query("sessions").collect();
    const found = session.find((s) => s.token === token);
    if (found) await ctx.db.delete(found._id);
    return true;
  },
});
