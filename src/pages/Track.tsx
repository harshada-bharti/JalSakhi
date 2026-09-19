import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DisclaimerNote } from "@/components/StaffHeader";
import { api } from "@/convex/_generated/api";
import {
  formatDateTime,
  lifecycleIndex,
  observationLabel,
  RISK_STYLES,
  statusBadgeClass,
  statusLabel,
  type RiskLevel,
} from "@/lib/jalsakhi";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ClipboardList,
  Loader2,
  Search,
} from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

const LIFECYCLE_STEPS = [
  "Complaint Submitted",
  "Admin Reviewing",
  "Worker Assigned",
  "Field Verification",
  "Admin Verified",
  "Action in Progress",
  "Resolved",
];

/** Resident-facing status message in plain language. */
function residentNotice(status: string): string {
  switch (status) {
    case "SUBMITTED":
      return "Your complaint has reached the water board office. It is waiting to be reviewed.";
    case "REVIEWING":
      return "The office is reviewing your complaint now.";
    case "WORKER_ASSIGNED":
      return "A field worker has been assigned and will inspect the location.";
    case "FIELD_VERIFICATION":
      return "The field worker has inspected the spot. The office will decide next.";
    case "VERIFIED":
      return "The office has confirmed the problem. A fix is being arranged.";
    case "NOT_CONFIRMED":
      return "The inspection did not confirm this problem. The office has recorded its decision.";
    case "NEEDS_INFO":
      return "The office needs more information. If you left a phone number, staff may contact you.";
    case "IN_PROGRESS":
      return "The fix is underway. The assigned worker will update the status when done.";
    case "RESOLVED":
      return "This complaint has been marked resolved. Thank you for reporting it.";
    default:
      return "Status updates will appear here.";
  }
}

export default function Track() {
  const [searchParams] = useSearchParams();
  const [complaintNo, setComplaintNo] = useState(searchParams.get("id") ?? "");
  const [submittedId, setSubmittedId] = useState(searchParams.get("id") ?? "");

  const data = useQuery(
    api.complaints.trackByComplaintNo,
    submittedId.trim() ? { complaintNo: submittedId.trim() } : "skip",
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedId(complaintNo.trim());
  };

  const complaint = data?.complaint ?? null;

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" /> JalSakhi home
        </Link>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Track a complaint</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the complaint ID you received after reporting. No account needed.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={complaintNo}
            onChange={(e) => setComplaintNo(e.target.value)}
            placeholder="e.g. JS-000001"
            className="font-mono"
          />
          <Button type="submit" disabled={!complaintNo.trim()}>
            <Search className="size-4" />
            Track
          </Button>
        </form>

        {submittedId && data === undefined && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Looking up {submittedId}…
          </div>
        )}

        {submittedId && data === null && (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              No complaint found with ID{" "}
              <span className="font-mono font-semibold text-foreground">{submittedId}</span>.
              Check the ID — it looks like <span className="font-mono">JS-000001</span>.
            </CardContent>
          </Card>
        )}

        {complaint && data && (
          <div className="space-y-5">
            {/* Summary */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-lg font-bold text-primary">
                      {complaint.complaintNo}
                    </p>
                    <CardTitle className="mt-1 text-base">{complaint.sourceName}</CardTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {complaint.landmark} · reported {formatDateTime(complaint.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(complaint.status)}`}
                    >
                      {statusLabel(complaint.status)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${RISK_STYLES[complaint.riskLevel as RiskLevel].chip}`}
                    >
                      Signal: {complaint.riskScore}/100
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Reported observations
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {complaint.observations.map((obsId) => (
                      <span
                        key={obsId}
                        className="rounded-full border bg-secondary px-2.5 py-0.5 text-xs"
                      >
                        {observationLabel(obsId)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Status update</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {residentNotice(complaint.status)}
                  </p>
                  {complaint.assignedWorkerName && (
                    <p className="mt-1 text-muted-foreground">
                      Assigned worker: {complaint.assignedWorkerName}
                    </p>
                  )}
                  {data.decision?.note && (
                    <p className="mt-1 text-muted-foreground">
                      Office note: {data.decision.note}
                    </p>
                  )}
                  {data.resolution && (
                    <p className="mt-1 text-muted-foreground">
                      Resolution: {data.resolution.actionTaken}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Lifecycle timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Complaint progress</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-0">
                  {LIFECYCLE_STEPS.map((step, idx) => {
                    const currentIdx = lifecycleIndex(complaint.status);
                    const done = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const isTerminal =
                      complaint.status === "RESOLVED" && idx === LIFECYCLE_STEPS.length - 1;
                    return (
                      <li key={step} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          {done || isTerminal ? (
                            <CheckCircle2 className="size-5 text-emerald-600" />
                          ) : isCurrent ? (
                            <span className="flex size-5 items-center justify-center">
                              <span className="size-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
                            </span>
                          ) : (
                            <Circle className="size-5 text-border" />
                          )}
                          {idx < LIFECYCLE_STEPS.length - 1 && (
                            <span
                              className={`w-px flex-1 ${done ? "bg-emerald-400" : "bg-border"}`}
                              style={{ minHeight: 28 }}
                            />
                          )}
                        </div>
                        <div className="pb-5">
                          <p
                            className={`text-sm font-medium ${
                              isCurrent ? "text-primary" : done || isTerminal ? "" : "text-muted-foreground"
                            }`}
                          >
                            {step}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="text-xs text-muted-foreground">
                  {complaint.status === "NOT_CONFIRMED" || complaint.status === "NEEDS_INFO"
                    ? "The office decision is shown above — the field report did not lead to confirmation at this time."
                    : `Last updated ${formatDateTime(complaint.updatedAt)}`}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {!submittedId && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <ClipboardList className="size-4 shrink-0" />
            Your complaint ID was shown after you submitted the report — it looks
            like <span className="font-mono">JS-000001</span>.
          </div>
        )}

        <DisclaimerNote />
      </div>
    </div>
  );
}
