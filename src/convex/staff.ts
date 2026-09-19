import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { makeToken, hashPassword, verifyPassword } from "./hash";

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
 */
export const login = mutation({
  args: { staffId: v.string(), password: v.string() },
  handler: async (ctx, { staffId, password }) => {
    const id = staffId.trim();
    const rows = await ctx.db
      .query("staff")
      .withIndex("staffId", (q) => q.eq("staffId", id))
      .collect();
    const account = rows[0];
    if (!account) throw new Error("Staff ID not found. Check your ID and try again.");
    if (!account.active) throw new Error("This account is inactive. Contact the water board office.");
    if (!verifyPassword(password, account.password)) {
      throw new Error("Incorrect password. Please try again.");
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

/**
 * Idempotent demo bootstrap: seeds staff accounts (and demo complaints on
 * first load) so the prototype is usable immediately. Safe to call often.
 */
export const ensureDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("staff").collect();
    if (existing.length === 0) {
      const accounts = [
        { staffId: "ADM-01", name: "Water Board Office", role: "admin" as const, password: "admin123" },
        { staffId: "WRK-01", name: "Ravi Kumar", role: "worker" as const, password: "worker123" },
        { staffId: "WRK-02", name: "Sunita Devi", role: "worker" as const, password: "worker123" },
        { staffId: "WRK-03", name: "Imran Khan", role: "worker" as const, password: "worker123" },
      ];
      for (const a of accounts) {
        await ctx.db.insert("staff", {
          staffId: a.staffId,
          name: a.name,
          role: a.role,
          password: hashPassword(a.password),
          active: true,
        });
      }
    }
    await ctx.runMutation(internal.complaints.seedDemoComplaints);
    return true;
  },
});

/** One-time demo seed: one admin, three workers (idempotent). */
export const seedDemoAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("staff").collect();
    if (existing.length > 0) return { seeded: false };

    const accounts = [
      { staffId: "ADM-01", name: "Water Board Office", role: "admin" as const, password: "admin123" },
      { staffId: "WRK-01", name: "Ravi Kumar", role: "worker" as const, password: "worker123" },
      { staffId: "WRK-02", name: "Sunita Devi", role: "worker" as const, password: "worker123" },
      { staffId: "WRK-03", name: "Imran Khan", role: "worker" as const, password: "worker123" },
    ];
    for (const a of accounts) {
      await ctx.db.insert("staff", {
        staffId: a.staffId,
        name: a.name,
        role: a.role,
        password: hashPassword(a.password),
        active: true,
      });
    }
    return { seeded: true };
  },
});
