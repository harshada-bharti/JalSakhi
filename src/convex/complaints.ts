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
    const residentFeedback = await ctx.db
      .query("residentFeedback")
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
      residentFeedback: residentFeedback.sort((a, b) => b.at - a.at),
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

// ---------------------------------------------------------------------------
// Worker: mark work completed — MANDATORY completion evidence required
// (geotagged photo + device GPS + automatic timestamp + completion note)
// ---------------------------------------------------------------------------

export const resolve = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    actionTaken: v.string(),
    note: v.string(),
    photo: v.id("_storage"), // MANDATORY geotagged completion photo
    video: v.optional(v.id("_storage")),
    latitude: v.number(), // device GPS — captured, never hand-entered
    longitude: v.number(),
    gpsAccuracy: v.optional(v.number()),
    capturedAt: v.number(), // automatic device timestamp when GPS was captured
  },
  handler: async (
    ctx,
    { token, complaintId, actionTaken, note, photo, video, latitude, longitude, gpsAccuracy, capturedAt },
  ) => {
    const worker = await staffFromToken(ctx, token, "worker");
    if (!worker) throw new Error("Only the assigned Worker can mark work completed.");

    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.assignedWorkerId !== worker._id) {
      throw new Error("This complaint is not assigned to you.");
    }
    if (complaint.status !== "IN_PROGRESS") {
      throw new Error("Admin must verify the complaint and assign the work first.");
    }
    // ---- Mandatory evidence gate (server-side; the UI also enforces it) ----
    if (!actionTaken.trim()) {
      throw new Error("A completion note describing the work done is required.");
    }
    if (!photo) {
      throw new Error(
        "A geotagged completion photo is required before marking work completed.",
      );
    }
    // Reject hand-entered / fake coordinates: the client must supply real
    // device GPS values with a valid capture timestamp.
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      (latitude === 0 && longitude === 0) ||
      !Number.isFinite(capturedAt) ||
      capturedAt <= 0 ||
      Math.abs(Date.now() - capturedAt) > 10 * 60 * 1000
    ) {
      throw new Error(
        "Valid device GPS location is required. Enable location access and capture your position on site.",
      );
    }

    await ctx.db.insert("resolutions", {
      complaintId,
      workerId: worker.staffId,
      workerName: worker.name,
      actionTaken: actionTaken.trim(),
      note: note.trim(),
      photo,
      video,
      latitude,
      longitude,
      gpsAccuracy,
      locationSource: "device_gps" as const,
      capturedAt,
      recordedAt: Date.now(),
    });
    // Not RESOLVED yet: completion evidence must pass Admin review first.
    await ctx.db.patch(complaintId, { status: "WORK_COMPLETED", updatedAt: Date.now() });
    await addEvent(
      ctx,
      complaintId,
      "WORK_COMPLETED",
      `Worker (${worker.staffId})`,
      `Work completed with mandatory evidence (photo + GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}). Pending Admin review.`,
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Admin: review the worker's completion evidence
// — accept → resident confirmation stage, or reject → back to the worker
// ---------------------------------------------------------------------------

export const reviewCompletion = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    outcome: v.union(v.literal("ACCEPTED"), v.literal("REJECTED")),
    note: v.string(),
  },
  handler: async (ctx, { token, complaintId, outcome, note }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) throw new Error("Only Admin can review completion evidence.");

    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status !== "WORK_COMPLETED") {
      throw new Error("Completion evidence is not awaiting review for this complaint.");
    }

    const resolutions = await ctx.db
      .query("resolutions")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();
    const latest = resolutions.sort((a, b) => b.recordedAt - a.recordedAt)[0];
    if (!latest || !latest.photo || latest.locationSource !== "device_gps") {
      throw new Error("No valid completion evidence was found — cannot accept the completion.");
    }

    if (outcome === "ACCEPTED") {
      // Evidence accepted → the resident is now asked to confirm the fix.
      await ctx.db.patch(complaintId, { status: "RESIDENT_CONFIRMATION", updatedAt: Date.now() });
      await addEvent(
        ctx,
        complaintId,
        "RESIDENT_CONFIRMATION",
        `Admin (${admin.staffId})`,
        `Completion evidence reviewed and accepted. Resident confirmation requested.${note.trim() ? ` Note: ${note.trim()}` : ""}`,
      );
    } else {
      // Evidence insufficient → back to the worker with the Admin's reason.
      await ctx.db.patch(complaintId, { status: "IN_PROGRESS", updatedAt: Date.now() });
      await addEvent(
        ctx,
        complaintId,
        "RECHECK_REQUIRED",
        `Admin (${admin.staffId})`,
        `Completion evidence rejected — work reopened for the worker.${note.trim() ? ` Reason: ${note.trim()}` : ""}`,
      );
    }
    return true;
  },
});

// ---------------------------------------------------------------------------
// Resident (no login): final resolution feedback, keyed by complaint ID
// ---------------------------------------------------------------------------

export const residentConfirmation = mutation({
  args: {
    complaintNo: v.string(),
    resolved: v.boolean(),
  },
  handler: async (ctx, { complaintNo, resolved }) => {
    const rows = await ctx.db
      .query("complaints")
      .withIndex("complaintNo", (q) => q.eq("complaintNo", complaintNo.trim().toUpperCase()))
      .collect();
    const complaint = rows[0];
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status !== "RESIDENT_CONFIRMATION") {
      throw new Error(
        "This complaint is not yet asking for resident confirmation. Confirmation opens only after the work completion evidence is reviewed.",
      );
    }
    await ctx.db.insert("residentFeedback", {
      complaintId: complaint._id,
      resolved,
      at: Date.now(),
    });
    await ctx.db.patch(complaint._id, {
      status: resolved ? "RESIDENT_CONFIRMED" : "RECHECK_REQUIRED",
      updatedAt: Date.now(),
    });
    await addEvent(
      ctx,
      complaint._id,
      resolved ? "RESIDENT_CONFIRMED" : "RECHECK_REQUIRED",
      "Resident",
      resolved
        ? "Resident confirmed the problem is resolved. Admin can now close the complaint."
        : "Resident reported the problem still exists. Recheck required — Admin to decide next action.",
    );
    return true;
  },
});

// ---------------------------------------------------------------------------
// Admin: final close (only after resident confirmation) + reopen for recheck
// ---------------------------------------------------------------------------

export const closeComplaint = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    note: v.string(),
  },
  handler: async (ctx, { token, complaintId, note }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) throw new Error("Only Admin can close a complaint.");
    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status !== "RESIDENT_CONFIRMED") {
      throw new Error(
        "A complaint can be closed only after the resident confirms the issue is resolved.",
      );
    }
    await ctx.db.patch(complaintId, { status: "RESOLVED", updatedAt: Date.now() });
    await addEvent(
      ctx,
      complaintId,
      "RESOLVED",
      `Admin (${admin.staffId})`,
      `Complaint closed as resolved.${note.trim() ? ` Note: ${note.trim()}` : ""} Resident and worker have been notified.`,
    );
    return true;
  },
});

export const reopenForRecheck = mutation({
  args: {
    token: v.string(),
    complaintId: v.id("complaints"),
    note: v.string(),
  },
  handler: async (ctx, { token, complaintId, note }) => {
    const admin = await staffFromToken(ctx, token, "admin");
    if (!admin) throw new Error("Only Admin can reopen a complaint for recheck.");
    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status !== "RECHECK_REQUIRED") {
      throw new Error("Only complaints with a resident recheck request can be reopened.");
    }
    if (!complaint.assignedWorkerId) throw new Error("No worker is assigned to this complaint.");
    await ctx.db.patch(complaintId, { status: "IN_PROGRESS", updatedAt: Date.now() });
    await addEvent(
      ctx,
      complaintId,
      "IN_PROGRESS",
      `Admin (${admin.staffId})`,
      `Complaint reopened — ${complaint.assignedWorkerName} must revisit and complete the work again.${note.trim() ? ` Note: ${note.trim()}` : ""}`,
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
    const residentFeedback = await ctx.db
      .query("residentFeedback")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaint._id))
      .collect();

    // Completion evidence is shown on the tracking page only once the Admin
    // has reviewed it (status past WORK_COMPLETED) — never while pending.
    const evidencePublic =
      complaint.status !== "WORK_COMPLETED" &&
      complaint.status !== "IN_PROGRESS" &&
      resolutions.length > 0;
    const latestResolution = resolutions.sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null;

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
      resolution:
        evidencePublic && latestResolution
          ? {
              actionTaken: latestResolution.actionTaken,
              recordedAt: latestResolution.recordedAt,
              photo: latestResolution.photo,
            }
          : null,
      latestFeedback: residentFeedback.sort((a, b) => b.at - a.at)[0] ?? null,
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
// Community support ("I'm also facing this problem") — anonymous, no login.
// Supports only strengthen the community signal; they never verify a complaint
// or alter the Admin → Worker workflow.
// ---------------------------------------------------------------------------

/** Active = still moving through the workflow (not a terminal outcome). */
function isActiveStatus(status: string): boolean {
  return !["RESOLVED", "NOT_CONFIRMED"].includes(status);
}

/**
 * Has this anonymous browser key already supported this complaint?
 * Used for the "You reported this issue" state.
 */
export const mySupportedIds = query({
  args: { supportKey: v.string() },
  handler: async (ctx, { supportKey }) => {
    const rows = await ctx.db
      .query("supports")
      .withIndex("supportKey", (q) => q.eq("supportKey", supportKey))
      .collect();
    return rows.map((s) => s.complaintId);
  },
});

/**
 * Add an anonymous support to an existing complaint — never creates a
 * duplicate complaint. Idempotent per browser key.
 */
export const supportComplaint = mutation({
  args: {
    complaintId: v.id("complaints"),
    supportKey: v.string(),
  },
  handler: async (ctx, { complaintId, supportKey }) => {
    const complaint = await ctx.db.get(complaintId);
    if (!complaint) throw new Error("Complaint not found.");
    if (!isActiveStatus(complaint.status)) {
      throw new Error("This complaint is already closed and cannot be supported.");
    }
    if (!supportKey.trim()) {
      throw new Error("Missing browser key — please refresh the page and try again.");
    }

    const existing = await ctx.db
      .query("supports")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();
    if (existing.some((s) => s.supportKey === supportKey)) {
      return { alreadySupported: true, count: existing.length + 1 };
    }

    await ctx.db.insert("supports", {
      complaintId,
      sourceId: complaint.sourceId,
      supportKey: supportKey.trim(),
      at: Date.now(),
    });
    await addEvent(
      ctx,
      complaintId,
      complaint.status,
      "Resident",
      "Another resident confirmed they are facing the same problem (community support).",
    );
    return { alreadySupported: false, count: existing.length + 1 };
  },
});

/**
 * Active complaints for one water source for the resident's
 * "My Area / Nearby Water Issues" section. Anonymous: no reporter data.
 */
export const communityList = query({
  args: { sourceId: v.string() },
  handler: async (ctx, { sourceId }) => {
    const all = await ctx.db.query("complaints").collect();
    const sourceComplaints = all.filter(
      (c) => c.sourceId === sourceId && isActiveStatus(c.status),
    );
    // Most recent first — the freshest signals lead the list.
    sourceComplaints.sort((a, b) => b.createdAt - a.createdAt);

    const supports = await ctx.db.query("supports").collect();
    const countByComplaint = new Map<string, number>();
    for (const s of supports) {
      countByComplaint.set(
        s.complaintId,
        (countByComplaint.get(s.complaintId) ?? 0) + 1,
      );
    }

    return sourceComplaints.map((c) => ({
      complaintId: c._id,
      complaintNo: c.complaintNo,
      sourceId: c.sourceId,
      sourceName: c.sourceName,
      landmark: c.landmark,
      observations: c.observations,
      description: c.description.slice(0, 160), // teaser only, no personal data
      status: c.status,
      riskLevel: c.riskLevel,
      createdAt: c.createdAt,
      affectedCount: 1 + (countByComplaint.get(c._id) ?? 0),
    }));
  },
});

/** Support counts per complaint — powers the Admin community-signal view. */
export const communitySignal = query({
  args: {},
  handler: async (ctx) => {
    const supports = await ctx.db.query("supports").collect();
    const countByComplaint = new Map<string, number>();
    for (const s of supports) {
      countByComplaint.set(
        s.complaintId,
        (countByComplaint.get(s.complaintId) ?? 0) + 1,
      );
    }
    return Array.from(countByComplaint.entries()).map(([complaintId, count]) => ({
      complaintId,
      supportCount: count,
    }));
  },
});

/** Anonymous support log for one complaint (Admin detail view) — timestamps only. */
export const supportLog = query({
  args: { complaintId: v.id("complaints") },
  handler: async (ctx, { complaintId }) => {
    const rows = await ctx.db
      .query("supports")
      .withIndex("complaintId", (q) => q.eq("complaintId", complaintId))
      .collect();
    return rows.sort((a, b) => b.at - a.at).map((s) => ({ at: s.at }));
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
