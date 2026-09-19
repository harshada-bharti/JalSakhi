import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---- JalSakhi: staff accounts (Worker / Admin only; residents never log in) ----
    staff: defineTable({
      staffId: v.string(), // login ID, e.g. "ADM-01" / "WRK-01"
      name: v.string(),
      password: v.string(), // prototype-grade, hashed on write in staff.ts
      role: v.union(v.literal("admin"), v.literal("worker")),
      active: v.boolean(),
    }).index("staffId", ["staffId"]),

    // ---- JalSakhi: complaints ----
    complaints: defineTable({
      complaintNo: v.string(), // human reference, e.g. "JS-000123"
      seq: v.number(), // numeric sequence for complaintNo
      sourceId: v.string(),
      sourceName: v.string(),
      landmark: v.string(),
      reporterName: v.optional(v.string()),
      reporterPhone: v.optional(v.string()),
      observations: v.array(v.string()),
      description: v.string(),
      photo: v.optional(v.id("_storage")), // Convex file storage
      video: v.optional(v.id("_storage")),
      riskScore: v.number(),
      riskLevel: v.union(
        v.literal("low"),
        v.literal("moderate"),
        v.literal("high"),
      ),
      status: v.union(
        v.literal("SUBMITTED"),
        v.literal("REVIEWING"),
        v.literal("WORKER_ASSIGNED"),
        v.literal("FIELD_VERIFICATION"),
        v.literal("VERIFIED"),
        v.literal("NOT_CONFIRMED"),
        v.literal("NEEDS_INFO"),
        v.literal("IN_PROGRESS"),
        v.literal("WORK_COMPLETED"), // Work Completed — pending Admin evidence review
        v.literal("RESIDENT_CONFIRMATION"), // evidence reviewed → resident asked to confirm
        v.literal("RESIDENT_CONFIRMED"),
        v.literal("RECHECK_REQUIRED"),
        v.literal("RESOLVED"),
      ),
      assignedWorkerId: v.optional(v.string()), // staff table _id as string
      assignedWorkerName: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("complaintNo", ["complaintNo"]),

    // ---- JalSakhi: worker field verification reports ----
    verifications: defineTable({
      complaintId: v.id("complaints"),
      workerId: v.string(),
      workerName: v.string(),
      problemFound: v.boolean(),
      findings: v.string(),
      notes: v.string(),
      recommendedAction: v.string(),
      photo: v.optional(v.id("_storage")),
      video: v.optional(v.id("_storage")),
      inspectedAt: v.number(),
    }).index("complaintId", ["complaintId"]),

    // ---- JalSakhi: admin final verification decision ----
    decisions: defineTable({
      complaintId: v.id("complaints"),
      outcome: v.union(
        v.literal("VERIFIED"),
        v.literal("NOT_CONFIRMED"),
        v.literal("NEEDS_INFO"),
      ),
      adminId: v.string(),
      adminName: v.string(),
      note: v.string(),
      decidedAt: v.number(),
    }).index("complaintId", ["complaintId"]),

    // ---- JalSakhi: worker completion evidence (mandatory for WORK COMPLETED) ----
    resolutions: defineTable({
      complaintId: v.id("complaints"),
      workerId: v.string(),
      workerName: v.string(),
      actionTaken: v.string(), // mandatory completion note describing the work done
      note: v.string(),
      photo: v.optional(v.id("_storage")), // mandatory geotagged completion photo
      video: v.optional(v.id("_storage")),
      // Mandatory device GPS capture — never entered manually by the worker.
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      gpsAccuracy: v.optional(v.number()), // metres
      locationSource: v.optional(v.literal("device_gps")),
      capturedAt: v.optional(v.number()), // automatic device/GPS timestamp (ms)
      recordedAt: v.number(), // server submission time
    }).index("complaintId", ["complaintId"]),

    // ---- JalSakhi: anonymous community support ("I'm also facing this problem") ----
    // Residents never log in, so a support is tied to an anonymous, non-identifying
    // per-browser key. No personal information is stored or exposed.
    supports: defineTable({
      complaintId: v.id("complaints"),
      sourceId: v.string(), // denormalised for grouping by water source
      supportKey: v.string(), // anonymous, non-identifying device key (hashed client-side)
      at: v.number(),
    })
      .index("complaintId", ["complaintId"])
      .index("supportKey", ["supportKey"]),

    // ---- JalSakhi: resident final resolution feedback (no login; by complaint ID) ----
    residentFeedback: defineTable({
      complaintId: v.id("complaints"),
      resolved: v.boolean(), // YES, problem resolved / NO, problem still exists
      at: v.number(),
    }).index("complaintId", ["complaintId"]),

    // ---- JalSakhi: lifecycle timeline events ----
    events: defineTable({
      complaintId: v.id("complaints"),
      stage: v.string(), // "SUBMITTED" | "REVIEWING" | ...
      actor: v.string(), // "Resident", "Admin", "Worker ..."
      detail: v.string(),
      at: v.number(),
    }).index("complaintId", ["complaintId"]),

    // ---- JalSakhi: staff login sessions ----
    sessions: defineTable({
      token: v.string(),
      staffId: v.id("staff"),
      createdAt: v.number(),
    }).index("token", ["token"]),

    // ---- JalSakhi: complaint id sequence ----
    counters: defineTable({
      key: v.string(),
      value: v.number(),
    }).index("key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
