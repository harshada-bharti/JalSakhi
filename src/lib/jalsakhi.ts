// ---------------------------------------------------------------------------
// JalSakhi shared domain helpers: water sources, observations, risk scoring,
// complaint lifecycle metadata and staff session storage.
// ---------------------------------------------------------------------------

export const DISCLAIMER =
  "JalSakhi is an early-warning and community reporting prototype. It does not replace laboratory water testing or official advice from local water or health authorities.";

export type RiskLevel = "low" | "moderate" | "high";

export type WaterSource = {
  id: string;
  name: string;
  type: "Handpump" | "Public Tap" | "Overhead Tank" | "Well" | "Pipeline";
  ward: string;
  serves: string;
  landmarkHint: string;
};

export const WATER_SOURCES: WaterSource[] = [
  {
    id: "WS-101",
    name: "Community Handpump — Ward 4",
    type: "Handpump",
    ward: "Ward 4",
    serves: "About 40 households",
    landmarkHint: "Near the banyan tree, opposite the primary school",
  },
  {
    id: "WS-207",
    name: "Public Tap — Nehru Colony",
    type: "Public Tap",
    ward: "Ward 7",
    serves: "About 120 households",
    landmarkHint: "Third lane, next to the ration shop",
  },
  {
    id: "WS-115",
    name: "Overhead Tank — Ward 2",
    type: "Overhead Tank",
    ward: "Ward 2",
    serves: "About 300 households",
    landmarkHint: "Behind the panchayat office",
  },
  {
    id: "WS-303",
    name: "Open Well — Old Market",
    type: "Well",
    ward: "Ward 9",
    serves: "About 25 households",
    landmarkHint: "Behind the vegetable market sheds",
  },
  {
    id: "WS-402",
    name: "Pipeline Junction — Ambedkar Road",
    type: "Pipeline",
    ward: "Ward 5",
    serves: "About 80 households",
    landmarkHint: "Junction box near the bus stop shelter",
  },
];

export type Observation = { id: string; label: string; weight: number };

// Weights are deliberately visible/simple — "transparent risk scoring".
export const OBSERVATIONS: Observation[] = [
  { id: "smell", label: "Bad smell", weight: 14 },
  { id: "colour", label: "Unusual colour", weight: 12 },
  { id: "taste", label: "Taste change", weight: 10 },
  { id: "sewage", label: "Sewage overflow", weight: 20 },
  { id: "flooding", label: "Flooding nearby", weight: 16 },
  { id: "pressure", label: "Low pressure", weight: 6 },
  { id: "illness", label: "Illness reported", weight: 22 },
  { id: "wildlife", label: "Fish/insects disappeared", weight: 12 },
  { id: "repair", label: "Recent pipe repair", weight: 8 },
  { id: "other", label: "Other", weight: 4 },
];

export const OBSERVATION_LABELS: Record<string, string> = Object.fromEntries(
  OBSERVATIONS.map((o) => [o.id, o.label]),
);

export function observationLabel(id: string): string {
  return OBSERVATION_LABELS[id] ?? id;
}

/** Transparent risk scoring: sum of selected observation weights. */
export function computeRisk(selected: string[]): {
  score: number;
  level: RiskLevel;
  contributions: { label: string; weight: number }[];
} {
  const contributions = selected
    .map((id) => {
      const obs = OBSERVATIONS.find((o) => o.id === id);
      return obs ? { label: obs.label, weight: obs.weight } : null;
    })
    .filter((x): x is { label: string; weight: number } => x !== null);
  const score = Math.min(100, contributions.reduce((sum, c) => sum + c.weight, 0));
  const level: RiskLevel = score >= 55 ? "high" : score >= 30 ? "moderate" : "low";
  return { score, level, contributions };
}

// ---------------------------------------------------------------------------
// Complaint lifecycle
// ---------------------------------------------------------------------------

export const LIFECYCLE = [
  "SUBMITTED",
  "REVIEWING",
  "WORKER_ASSIGNED",
  "FIELD_VERIFICATION",
  "VERIFIED",
  "IN_PROGRESS",
  "RESOLVED",
] as const;

export type LifecycleStage = (typeof LIFECYCLE)[number];

export const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Complaint Submitted",
  REVIEWING: "Admin Reviewing",
  WORKER_ASSIGNED: "Worker Assigned",
  FIELD_VERIFICATION: "Field Verification",
  VERIFIED: "Admin Verified",
  NOT_CONFIRMED: "Not Confirmed",
  NEEDS_INFO: "Needs More Information",
  IN_PROGRESS: "Action in Progress",
  RESOLVED: "Resolved",
};

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  SUBMITTED: "bg-sky-100 text-sky-900 border-sky-200",
  REVIEWING: "bg-amber-50 text-amber-900 border-amber-200",
  WORKER_ASSIGNED: "bg-indigo-50 text-indigo-900 border-indigo-200",
  FIELD_VERIFICATION: "bg-violet-50 text-violet-900 border-violet-200",
  VERIFIED: "bg-teal-100 text-teal-900 border-teal-300",
  NOT_CONFIRMED: "bg-stone-100 text-stone-700 border-stone-200",
  NEEDS_INFO: "bg-orange-50 text-orange-900 border-orange-200",
  IN_PROGRESS: "bg-yellow-100 text-yellow-900 border-yellow-300",
  RESOLVED: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status] ?? "bg-muted text-foreground border-border";
}

/**
 * Where the complaint sits on the 7-step resident lifecycle.
 * NOT_CONFIRMED / NEEDS_INFO map back to the stage just before verification.
 */
export function lifecycleIndex(status: string): number {
  if (status === "NOT_CONFIRMED" || status === "NEEDS_INFO") return 3; // Field Verification
  const idx = LIFECYCLE.indexOf(status as LifecycleStage);
  return idx >= 0 ? idx : 0;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  return formatDateTime(ms);
}

export const RISK_STYLES: Record<RiskLevel, { chip: string; dot: string; label: string }> = {
  low: { chip: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500", label: "Green — Low signal" },
  moderate: { chip: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500", label: "Yellow — Watch closely" },
  high: { chip: "bg-red-50 text-red-800 border-red-200", dot: "bg-red-500", label: "Red — Urgent attention" },
};

// ---------------------------------------------------------------------------
// Staff session storage (worker / admin only — residents never sign in)
// ---------------------------------------------------------------------------

export type StaffSession = {
  token: string;
  id: string;
  staffId: string;
  name: string;
  role: "worker" | "admin";
};

const SESSION_KEY = "jalsakhi_staff_session";

export function saveSession(session: StaffSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffSession;
    if (!parsed.token || !parsed.role || !parsed.staffId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
