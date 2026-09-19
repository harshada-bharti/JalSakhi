import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function staffFromToken(
  ctx: { db: any },
  token: string,
  expectedRole: "admin" | "worker",
) {
  const sessions = await ctx.db.query("sessions").collect();
  const found = sessions.find((s: Doc<"sessions">) => s.token === token);
  if (!found) return null;
  const account = await ctx.db.get(found.staffId);
  if (!account || !account.active || account.role !== expectedRole) return null;
  return account;
}

async function addEvent(
  ctx: { db: any },
  complaintId: Id<"complaints">,
  stage: string,
  actor: string,
  detail: string,
) {
  await ctx.db.insert("events", { complaintId, stage, actor, detail, at: Date.now() });
}

async function nextComplaintNo(ctx: { db: any }) {
  const counters = await ctx.db.query("counters").collect();
  let row = counters.find((c: Doc<"counters">) => c.key === "complaint");
  const next = (row?.value ?? 0) + 1;
  if (row) {
    await ctx.db.patch(row._id, { value: next });
  } else {
    await ctx.db.insert("counters", { key: "complaint", value: next });
  }
  return { seq: next, complaintNo: `JS-${String(next).padStart(6, "0")}` };
}

// ---------------------------------------------------------------------------
// File uploads: real Convex storage (no fake URLs)
// ---------------------------------------------------------------------------

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const fileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

// ---------------------------------------------------------------------------
// Resident (no login): submit complaint
// ---------------------------------------------------------------------------

export const submit = mutation({
  args: {
    sourceId: v.string(),
    sourceName: v.string(),
    landmark: v.string(),
    reporterName: v.optional(v.string()),
    reporterPhone: v.optional(v.string()),
    observations: v.array(v.string()),
    description: v.string(),
    photo: v.optional(v.id("_storage")),
    video: v.optional(v.id("_storage")),
    riskScore: v.number(),
    riskLevel: v.union(v.literal("low"), v.literal("moderate"), v.literal("high")),
  },
  handler: async (ctx, args) => {
    if (!args.sourceId || !args.landmark.trim() || args.observations.length === 0) {
      throw new Error("Water source, landmark and at least one observation are required.");
    }
    const { seq, complaintNo } = await nextComplaintNo(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("complaints", {
      complaintNo,
      seq,
      sourceId: args.sourceId,
      sourceName: args.sourceName,
      landmark: args.landmark.trim(),
      reporterName: args.reporterName?.trim() || undefined,
      reporterPhone: args.reporterPhone?.trim() || undefined,
      observations: args.observations,
      description: args.description.trim(),
      photo: args.photo,
      video: args.video,
      riskScore: args.riskScore,
      riskLevel: args.riskLevel,
      status: "SUBMITTED",
      createdAt: now,
      updatedAt: now,
    });
    await addEvent(
      ctx,
      id,
      "SUBMITTED",
      args.reporterName?.trim() || "Resident",
      `Complaint submitted for ${args.sourceName} (${args.landmark.trim()}).`,
    );
    return { complaintId: id, complaintNo };
  },
});

// ---------------------------------------------------------------------------
// Admin: complaints queue
// ---------------------------------------------------------------------------

export const adminList = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) return null; // wrong role or not signed in → caller redirects
    const all = await ctx.db.query("complaints").collect();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getForStaff = query({
  args: { token: v.string(), complaintId: v.id("complaints") },
  handler: async (ctx, { token, complaintId }) => {
    const sessions = await ctx.db.query("sessions").collect();
    const found = sessions.find((s: Doc<"sessions">) => s.token === token);
    if (!found) return null;
    const account = await ctx.db.get(found.staffId);
    if (!account || !account.active) return null;

    const complaint = await ctx.db.get(complaintId);
    if (!complaint) return null;

    // Workers may only read complaints assigned to them.
    if (account.role === "worker" && complaint.assignedWorkerId !== account._id) {
      return null;
    }

    const verifications = await ctx.db
      .query("verifications")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();
    const decisions = await ctx.db
      .query("decisions")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();
    const resolutions = await ctx.db
      .query("resolutions")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();
    const events = await ctx.db
      .query("events")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();

    return {
      role: account.role,
      complaint,
      verification: verifications.sort((a, b) => b.inspectedAt - a.inspectedAt)[0] ?? null,
      decision: decisions.sort((a, b) => b.decidedAt - a.decidedAt)[0] ?? null,
      resolutions: resolutions.sort((a, b) => b.recordedAt - a.recordedAt),
      events: events.sort((a, b) => a.at - b.at),
    };
  },
});

// ---------------------------------------------------------------------------
// Admin: mark a new complaint as under review (lifecycle step 2)
// ---------------------------------------------------------------------------

export const startReview = mutation({
  args: { token: v.string(), complaintId: v.id("complaints") },
  handler: async (ctx, { token, complaintId }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) throw new Error("Only Admin can review complaints.");
    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status !== "SUBMITTED") {
      throw new Error("Only newly submitted complaints can move to review.");
    }
    await ctx.db.patch(complaintId, { status: "REVIEWING", updatedAt: Date.now() });
    await addEvent(
      ctx,
      complaintId,
      "REVIEWING",
      `Admin (${admin.staffId})`,
      "Complaint picked up for review.",
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Worker: only complaints assigned to this worker
// ---------------------------------------------------------------------------

export const workerList = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const worker = await staffFromToken(ctx, token, "worker");
    if (!worker) return null; // wrong role or not signed in → caller redirects
    const all = await ctx.db.query("complaints").collect();
    return all
      .filter((c) => c.assignedWorkerId === worker._id)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// Admin: assign a worker (main workflow step 2) — never auto-verifies
// ---------------------------------------------------------------------------

export const assignWorker = mutation({
  args: { token: v.string(), complaintId: v.id("complaints"), workerStaffRowId: v.id("staff") },
  handler: async (ctx, { token, complaintId, workerStaffRowId }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) throw new Error("Only Admin can assign a worker.");

    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status === "RESOLVED") throw new Error("This complaint is already resolved.");

    const worker = await ctx.db.get(workerStaffRowId);
    if (!worker || worker.role !== "worker" || !worker.active) {
      throw new Error("Selected worker account not found.");
    }

    await ctx.db.patch(complaintId, {
      assignedWorkerId: worker._id,
      assignedWorkerName: `${worker.name} (${worker.staffId})`,
      status: "WORKER_ASSIGNED",
      updatedAt: Date.now(),
    });
    await addEvent(
      ctx,
      complaintId,
      "WORKER_ASSIGNED",
      `Admin (${admin.staffId})`,
      `Assigned to ${worker.name} (${worker.staffId}) for field verification.`,
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Worker: verification report (does NOT change status to verified)
// ---------------------------------------------------------------------------

export const submitVerification = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    problemFound: v.boolean(),
    findings: v.string(),
    notes: v.string(),
    recommendedAction: v.string(),
    photo: v.optional(v.id("_storage")),
    video: v.optional(v.id("_storage")),
    inspectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const worker = await staffFromToken(ctx, args.token, "worker");
    if (!worker) throw new Error("Only a signed-in Worker can submit a verification report.");

    const complaint = await ctx.db.get(args.complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.assignedWorkerId !== worker._id) {
      throw new Error("This complaint is not assigned to you.");
    }
    if (!args.findings.trim() || !args.recommendedAction.trim()) {
      throw new Error("Observations and recommended action are required.");
    }

    await ctx.db.insert("verifications", {
      complaintId: args.complaintId,
      workerId: worker.staffId,
      workerName: worker.name,
      problemFound: args.problemFound,
      findings: args.findings.trim(),
      notes: args.notes.trim(),
      recommendedAction: args.recommendedAction.trim(),
      photo: args.photo,
      video: args.video,
      inspectedAt: args.inspectedAt,
    });

    // Status moves to FIELD_VERIFICATION (report sent to Admin for decision).
    await ctx.db.patch(args.complaintId, { status: "FIELD_VERIFICATION", updatedAt: Date.now() });
    await addEvent(
      ctx,
      args.complaintId,
      "FIELD_VERIFICATION",
      `Worker (${worker.staffId})`,
      `Field verification submitted — problem ${args.problemFound ? "confirmed on site" : "not found on site"}. Waiting for Admin decision.`,
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Admin: final verification decision — the ONLY place a complaint gets verified
// ---------------------------------------------------------------------------

export const decideVerification = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    outcome: v.union(v.literal("VERIFIED"), v.literal("NOT_CONFIRMED"), v.literal("NEEDS_INFO")),
    note: v.string(),
  },
  handler: async (ctx, { token, complaintId, outcome, note }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) throw new Error("Only Admin can make the final verification decision.");

    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");

    const verifications = await ctx.db
      .query("verifications")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();
    if (verifications.length === 0) {
      throw new Error("No field verification report has been submitted yet.");
    }

    await ctx.db.insert("decisions", {
      complaintId,
      outcome,
      adminId: admin.staffId,
      adminName: admin.name,
      note: note.trim(),
      decidedAt: Date.now(),
    });
    await ctx.db.patch(complaintId, { status: outcome, updatedAt: Date.now() });
    await addEvent(
      ctx,
      complaintId,
      outcome,
      `Admin (${admin.staffId})`,
      outcome === "VERIFIED"
        ? "Admin verified the complaint — ACTION REQUIRED."
        : outcome === "NOT_CONFIRMED"
          ? "Admin marked the complaint as not confirmed."
          : "Admin requested more information.",
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Admin: assign resolution to the worker after confirming the problem
// ---------------------------------------------------------------------------

export const assignResolution = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    actionRequired: v.string(),
    note: v.string(),
  },
  handler: async (ctx, { token, complaintId, actionRequired, note }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) throw new Error("Only Admin can assign resolution work.");

    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status !== "VERIFIED") {
      throw new Error("Only VERIFIED complaints can move to Action in Progress.");
    }
    if (!complaint.assignedWorkerId) throw new Error("No worker is assigned to this complaint.");
    if (!actionRequired.trim()) throw new Error("Describe the required action.");

    await ctx.db.patch(complaintId, { status: "IN_PROGRESS", updatedAt: Date.now() });
    await addEvent(
      ctx,
      complaintId,
      "IN_PROGRESS",
      `Admin (${admin.staffId})`,
      `Resolution assigned to ${complaint.assignedWorkerName}: ${actionRequired.trim()}${note.trim() ? ` — ${note.trim()}` : ""}`,
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Worker: mark resolved with a resolution note / evidence
// ---------------------------------------------------------------------------

export const resolve = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    actionTaken: v.string(),
    note: v.string(),
    photo: v.optional(v.id("_storage")),
    video: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { token, complaintId, actionTaken, note, photo, video }) => {
    const worker = await staffFromToken(ctx, token, "worker");
    if (!worker) throw new Error("Only the assigned Worker can resolve a complaint.");

    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.assignedWorkerId !== worker._id) {
      throw new Error("This complaint is not assigned to you.");
    }
    if (complaint.status !== "IN_PROGRESS") {
      throw new Error("Admin must verify the complaint and assign the resolution first.");
    }
    if (!actionTaken.trim()) throw new Error("Describe the action taken.");

    await ctx.db.insert("resolutions", {
      complaintId,
      workerId: worker.staffId,
      workerName: worker.name,
      actionTaken: actionTaken.trim(),
      note: note.trim(),
      photo,
      video,
      recordedAt: Date.now(),
    });
    await ctx.db.patch(complaintId, { status: "RESOLVED", updatedAt: Date.now() });
    await addEvent(
      ctx,
      complaintId,
      "RESOLVED",
      `Worker (${worker.staffId})`,
      `Issue resolved: ${actionTaken.trim()}`,
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Resident: track by complaint number (no auth) + landing stats
// ---------------------------------------------------------------------------

export const trackByComplaintNo = query({
  args: { complaintNo: v.string() },
  handler: async (ctx, { complaintNo }) => {
    const rows = await ctx.db
      .query("complaints")
      .withIndex("complaintNo", (q) => q.eq("complaintNo", complaintNo.trim().toUpperCase()))
      .collect();
    const complaint = rows[0];
    if (!complaint) return null;

    const events = await ctx.db
      .query("events")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaint._id))
      .collect();
    const decisions = await ctx.db
      .query("decisions")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaint._id))
      .collect();
    const resolutions = await ctx.db
      .query("resolutions")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaint._id))
      .collect();

    return {
      complaint: {
        complaintNo: complaint.complaintNo,
        sourceName: complaint.sourceName,
        landmark: complaint.landmark,
        observations: complaint.observations,
        status: complaint.status,
        createdAt: complaint.createdAt,
        updatedAt: complaint.updatedAt,
        riskLevel: complaint.riskLevel,
        riskScore: complaint.riskScore,
        assignedWorkerName: complaint.assignedWorkerName,
      },
      events: events.sort((a, b) => a.at - b.at),
      decision: decisions.sort((a, b) => b.decidedAt - a.decidedAt)[0] ?? null,
      resolution: resolutions.sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null,
    };
  },
});

export const communityStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("complaints").collect();
    return {
      total: all.length,
      resolved: all.filter((c) => c.status === "RESOLVED").length,
      open: all.filter((c) => c.status !== "RESOLVED").length,
      highRisk: all.filter((c) => c.riskLevel === "high" && c.status !== "RESOLVED").length,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal: seed a couple of demo complaints so dashboards are not empty
// ---------------------------------------------------------------------------

export const seedDemoComplaints = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("complaints").collect();
    if (existing.length > 0) return { seeded: false };

    const demos = [
      {
        sourceId: "WS-101",
        sourceName: "Community Handpump — Ward 4",
        landmark: "Near the banyan tree, opposite the primary school",
        observations: ["Bad smell", "Unusual colour"],
        description:
          "Water has smelled strange since Monday and looks slightly yellow when collected in the morning.",
        riskScore: 62,
        riskLevel: "moderate" as const,
      },
      {
        sourceId: "WS-207",
        sourceName: "Public Tap — Nehru Colony",
        landmark: "Third lane, next to the ration shop",
        observations: ["Sewage overflow", "Flooding nearby", "Illness reported"],
        description:
          "Overflow from the drain is pooling around the tap stand. Two children in the lane had stomach illness this week.",
        riskScore: 88,
        riskLevel: "high" as const,
      },
      {
        sourceId: "WS-115",
        sourceName: "Overhead Tank — Ward 2",
        landmark: "Behind the panchayat office",
        observations: ["Low pressure"],
        description: "Pressure is very low in the evening supply hours; tank was cleaned last month.",
        riskScore: 30,
        riskLevel: "low" as const,
      },
    ];

    for (const d of demos) {
      const { seq, complaintNo } = await nextComplaintNo(ctx);
      const now = Date.now() - seq * 36 * 60 * 60 * 1000;
      const id = await ctx.db.insert("complaints", {
        ...d,
        complaintNo,
        seq,
        reporterName: "Community member",
        description: d.description,
        status: "SUBMITTED",
        createdAt: now,
        updatedAt: now,
      });
      await addEvent(
        ctx,
        id,
        "SUBMITTED",
        "Community member",
        `Complaint submitted for ${d.sourceName}.`,
      );
    }
    return { seeded: true };
  },
});
