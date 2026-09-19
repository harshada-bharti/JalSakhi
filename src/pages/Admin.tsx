import { RequireStaffAuth } from "@/components/RequireAuth";
import { MediaView } from "@/components/Media";
import { DisclaimerNote, StaffHeader } from "@/components/StaffHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatDateTime,
  observationLabel,
  RISK_STYLES,
  statusBadgeClass,
  statusLabel,
  timeAgo,
  type RiskLevel,
  type StaffSession,
} from "@/lib/jalsakhi";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Eye,
  ImageIcon,
  MapPin,
  ShieldCheck,
  UserPlus,
  Video,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Complaint = {
  _id: Id<"complaints">;
  complaintNo: string;
  sourceName: string;
  landmark: string;
  observations: string[];
  description: string;
  photo?: string;
  video?: string;
  riskLevel: RiskLevel;
  riskScore: number;
  status: string;
  assignedWorkerName?: string;
  reporterName?: string;
  createdAt: number;
};

const QUEUE_GROUPS: { key: string; title: string; statuses: string[] }[] = [
  {
    key: "new",
    title: "New — needs review & worker assignment",
    statuses: ["SUBMITTED", "REVIEWING"],
  },
  {
    key: "verification",
    title: "Field verification — awaiting final decision",
    statuses: ["FIELD_VERIFICATION"],
  },
  {
    key: "confirmed",
    title: "Verified — assign resolution",
    statuses: ["VERIFIED"],
  },
  { key: "progress", title: "Action in progress", statuses: ["IN_PROGRESS"] },
  { key: "closed", title: "Closed", statuses: ["RESOLVED", "NOT_CONFIRMED", "NEEDS_INFO"] },
];

export default function Admin() {
  return (
    <RequireStaffAuth role="admin">
      {(session) => <AdminDashboard session={session} />}
    </RequireStaffAuth>
  );
}

function RoleError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="text-sm text-muted-foreground">
        Your session has expired or this dashboard is not available for your
        account. Please sign in again from the Admin login.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <a href="/login/admin">Admin login</a>
        </Button>
        <Button asChild variant="ghost">
          <a href="/">Back to home</a>
        </Button>
      </div>
    </div>
  );
}

function AdminDashboard({ session }: { session: StaffSession }) {
  const complaints = useQuery(api.complaints.adminList, { token: session.token });
  const workers = useQuery(api.staff.listWorkers);

  const [detailId, setDetailId] = useState<Id<"complaints"> | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (detailId) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [detailId]);

  // Wrong role or stale session → adminList returns null → back to admin login.
  if (complaints === null) {
    return <RoleError />;
  }

  const byGroup = (statuses: string[]) =>
    (complaints ?? []).filter((c) => statuses.includes(c.status));

  return (
    <div className="min-h-screen pb-14">
      <StaffHeader current={session} />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review complaints → assign workers → confirm field reports → assign
              resolution. Final verification is always made here, by you.
            </p>
          </div>
          <Badge variant="outline" className="border-teal-300 bg-teal-50 text-teal-900">
            <ShieldCheck className="mr-1 size-3.5" /> Admin access
          </Badge>
        </div>

        {complaints === undefined ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading complaints…
            </CardContent>
          </Card>
        ) : complaints.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ClipboardList className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No complaints yet. Resident reports will appear here as soon as
                they are submitted.
              </p>
            </CardContent>
          </Card>
        ) : (
          QUEUE_GROUPS.map((group) => {
            const items = byGroup(group.statuses);
            if (items.length === 0) return null;
            return (
              <section key={group.key}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  {group.title}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {items.length}
                  </span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setDetailId(c._id)}
                      className={`cursor-pointer rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 ${
                        detailId === c._id ? "border-primary ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-bold text-primary">
                            {c.complaintNo}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold leading-snug">
                            {c.sourceName}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" /> {c.landmark}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(c.status)}`}
                        >
                          {statusLabel(c.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span
                          className={`rounded-full border px-2 py-0.5 ${RISK_STYLES[c.riskLevel].chip}`}
                        >
                          {c.riskScore}/100
                        </span>
                        <span>{c.observations.length} observations</span>
                        <span>· {timeAgo(c.createdAt)}</span>
                        {c.assignedWorkerName && <span>· {c.assignedWorkerName}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })
        )}

        <Separator />

        {/* Detail / action panel */}
        <div ref={detailRef}>
          {detailId ? (
            <ComplaintDetail
              session={session}
              complaintId={detailId}
              workers={workers ?? []}
              onClose={() => setDetailId(null)}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Eye className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Select a complaint above to review it, assign a worker, or make
                  the final verification decision.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <DisclaimerNote />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel: full complaint + worker verification + admin actions
// ---------------------------------------------------------------------------

function ComplaintDetail({
  session,
  complaintId,
  workers,
  onClose,
}: {
  session: StaffSession;
  complaintId: Id<"complaints">;
  workers: { id: string; staffId: string; name: string }[];
  onClose: () => void;
}) {
  const data = useQuery(api.complaints.getForStaff, {
    token: session.token,
    complaintId,
  });
  const startReview = useMutation(api.complaints.startReview);
  const assignWorker = useMutation(api.complaints.assignWorker);
  const decideVerification = useMutation(api.complaints.decideVerification);
  const assignResolution = useMutation(api.complaints.assignResolution);

  const [workerChoice, setWorkerChoice] = useState<string>("");
  const [decision, setDecision] = useState<
    "" | "VERIFIED" | "NOT_CONFIRMED" | "NEEDS_INFO"
  >("");
  const [decisionNote, setDecisionNote] = useState("");
  const [actionRequired, setActionRequired] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading complaint…
        </CardContent>
      </Card>
    );
  }
  if (data === null) {
    return <RoleError />;
  }

  const {
    complaint,
    verification,
    decision: existingDecision,
    resolutions,
    events,
  } = data;
  const c = complaint as Complaint;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const canAssignWorker = [
    "SUBMITTED",
    "REVIEWING",
    "WORKER_ASSIGNED",
    "NEEDS_INFO",
    "NOT_CONFIRMED",
  ].includes(c.status);

  const canDecide = c.status === "FIELD_VERIFICATION" && verification && !existingDecision;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-mono text-lg font-bold text-primary">{c.complaintNo}</p>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(c.status)}`}
              >
                {statusLabel(c.status)}
              </span>
            </div>
            <CardTitle className="mt-1 text-base">{c.sourceName}</CardTitle>
            <CardDescription className="mt-0.5">
              {c.landmark} · reported {formatDateTime(c.createdAt)}
              {c.reporterName ? ` by ${c.reporterName}` : " by a resident"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${RISK_STYLES[c.riskLevel].chip}`}
            >
              {RISK_STYLES[c.riskLevel].label} · {c.riskScore}/100
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Original complaint */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resident complaint
          </p>
          <div className="flex flex-wrap gap-1.5">
            {c.observations.map((o) => (
              <span
                key={o}
                className="rounded-full border bg-secondary px-2.5 py-0.5 text-xs"
              >
                {observationLabel(o)}
              </span>
            ))}
          </div>
          {c.description && (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">
              {c.description}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            {c.photo && (
              <MediaView storageId={c.photo} kind="image" label="Resident photo" />
            )}
            {c.video && (
              <MediaView storageId={c.video} kind="video" label="Resident video" />
            )}
          </div>
        </section>

        <Separator />

        {/* Step 1 — assign worker */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 1 · Assign a field worker
          </p>
          {c.status === "SUBMITTED" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => run(() => startReview({ token: session.token, complaintId }))}
            >
              Mark as reviewing
            </Button>
          )}
          {canAssignWorker ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 space-y-1.5">
                <Label>Worker</Label>
                <Select value={workerChoice} onValueChange={setWorkerChoice}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Choose a worker" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} ({w.staffId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                className="mb-0.5"
                disabled={busy || !workerChoice}
                onClick={() =>
                  run(async () => {
                    await assignWorker({
                      token: session.token,
                      complaintId,
                      workerStaffRowId: workerChoice as Id<"staff">,
                    });
                    setWorkerChoice("");
                  })
                }
              >
                <UserPlus className="size-4" />
                {c.assignedWorkerName ? "Reassign worker" : "Assign worker"}
              </Button>
              {c.assignedWorkerName && (
                <p className="mb-1 text-xs text-muted-foreground">
                  Currently assigned:{" "}
                  <span className="font-medium text-foreground">{c.assignedWorkerName}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {c.status === "FIELD_VERIFICATION"
                ? "A field verification report is in — make the final decision below."
                : c.status === "VERIFIED"
                  ? "Worker is set. Assign the resolution below."
                  : "Assignment is locked at this stage."}
            </p>
          )}
        </section>

        <Separator />

        {/* Worker's field verification */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Field verification report{" "}
            {verification ? `· ${verification.workerName} (${verification.workerId})` : ""}
          </p>
          {verification ? (
            <div className="space-y-2.5 rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="flex items-center gap-2">
                {verification.problemFound ? (
                  <BadgeCheck className="size-4 text-emerald-600" />
                ) : (
                  <XCircle className="size-4 text-stone-500" />
                )}
                <span className="font-medium">
                  Problem {verification.problemFound ? "found on site" : "not found on site"}
                </span>
                <span className="text-xs text-muted-foreground">
                  inspected {formatDateTime(verification.inspectedAt)}
                </span>
              </p>
              <p>
                <span className="font-medium">What was observed: </span>
                {verification.findings}
              </p>
              {verification.notes && (
                <p>
                  <span className="font-medium">Verification notes: </span>
                  {verification.notes}
                </p>
              )}
              <p>
                <span className="font-medium">Recommended action: </span>
                {verification.recommendedAction}
              </p>
              <div className="flex flex-wrap gap-4">
                {verification.photo && (
                  <MediaView storageId={verification.photo} kind="image" label="Worker photo" />
                )}
                {verification.video && (
                  <MediaView storageId={verification.video} kind="video" label="Worker video" />
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              <Wrench className="mr-1.5 inline size-4" />
              Waiting for the assigned worker to inspect the location and submit
              their verification report.
            </p>
          )}
        </section>

        <Separator />

        {/* Step 2 — final verification decision (Admin only) */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 2 · Final verification decision (Admin only)
          </p>
          {existingDecision ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium">
                Decision:{" "}
                <span
                  className={
                    existingDecision.outcome === "VERIFIED"
                      ? "text-teal-700"
                      : existingDecision.outcome === "NOT_CONFIRMED"
                        ? "text-stone-600"
                        : "text-orange-700"
                  }
                >
                  {statusLabel(existingDecision.outcome)}
                </span>
              </p>
              {existingDecision.note && (
                <p className="mt-1 text-muted-foreground">
                  Note: {existingDecision.note}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                by {existingDecision.adminName} ({existingDecision.adminId}) ·{" "}
                {formatDateTime(existingDecision.decidedAt)}
              </p>
            </div>
          ) : canDecide ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={decision === "VERIFIED" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => setDecision("VERIFIED")}
                >
                  <CheckCircle2 className="size-4" /> Verified / action required
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={decision === "NOT_CONFIRMED" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => setDecision("NOT_CONFIRMED")}
                >
                  <XCircle className="size-4" /> Not confirmed
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={decision === "NEEDS_INFO" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => setDecision("NEEDS_INFO")}
                >
                  <AlertTriangle className="size-4" /> Needs more information
                </Button>
              </div>
              <Textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Decision note (optional) — visible to the worker and on the resident's tracking page."
                rows={2}
              />
              <Button
                type="button"
                disabled={busy || !decision}
                onClick={() =>
                  run(async () => {
                    await decideVerification({
                      token: session.token,
                      complaintId,
                      outcome: decision as "VERIFIED" | "NOT_CONFIRMED" | "NEEDS_INFO",
                      note: decisionNote,
                    });
                    setDecision("");
                    setDecisionNote("");
                  })
                }
              >
                <ClipboardCheck className="size-4" />
                Record final decision
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The decision panel opens once the worker has submitted their field
              verification report.
            </p>
          )}
        </section>

        {/* Step 3 — resolution assignment */}
        {(c.status === "VERIFIED" || resolutions.length > 0) && (
          <>
            <Separator />
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step 3 · Resolution{" "}
                {c.assignedWorkerName ? `· ${c.assignedWorkerName}` : ""}
              </p>
              {c.status === "VERIFIED" && (
                <div className="space-y-2">
                  <Label>Required action for the worker</Label>
                  <Textarea
                    value={actionRequired}
                    onChange={(e) => setActionRequired(e.target.value)}
                    placeholder="e.g. Repair the leaking junction and disinfect the tap stand; recheck in 48 hours."
                    rows={2}
                  />
                  <Input
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    placeholder="Extra note (optional)"
                  />
                  <Button
                    type="button"
                    disabled={busy || !actionRequired.trim()}
                    onClick={() =>
                      run(async () => {
                        await assignResolution({
                          token: session.token,
                          complaintId,
                          actionRequired,
                          note: resolutionNote,
                        });
                        setActionRequired("");
                        setResolutionNote("");
                      })
                    }
                  >
                    <Wrench className="size-4" /> Assign resolution to worker
                  </Button>
                </div>
              )}
              {resolutions.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-emerald-50/60 p-3 text-sm"
                >
                  <p className="font-medium text-emerald-900">
                    {r.workerName} ({r.workerId}) · {formatDateTime(r.recordedAt)}
                  </p>
                  <p className="mt-0.5">Action taken: {r.actionTaken}</p>
                  {r.note && (
                    <p className="text-muted-foreground">Note: {r.note}</p>
                  )}
                </div>
              ))}
              {c.status === "IN_PROGRESS" && resolutions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Waiting for the worker to carry out the action and update the
                  complaint to Resolved.
                </p>
              )}
            </section>
          </>
        )}

        <Separator />

        {/* Timeline */}
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Complaint history
          </p>
          <ol className="space-y-2">
            {events.map((e, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>
                  <span className="text-muted-foreground">{formatDateTime(e.at)}</span>{" "}
                  — <span className="font-medium">{e.actor}:</span> {e.detail}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
