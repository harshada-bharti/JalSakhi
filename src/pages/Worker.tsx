import { RequireStaffAuth } from "@/components/RequireAuth";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MediaView } from "@/components/Media";
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
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ImageIcon,
  Info,
  MapPin,
  Video,
  Wrench,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

export default function Worker() {
  return (
    <RequireStaffAuth role="worker">
      {(session) => <WorkerDashboard session={session} />}
    </RequireStaffAuth>
  );
}

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

function SessionError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="text-sm text-muted-foreground">
        Your session has expired. Please sign in again from the Worker login.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <a href="/login/worker">Worker login</a>
        </Button>
        <Button asChild variant="ghost">
          <a href="/">Back to home</a>
        </Button>
      </div>
    </div>
  );
}

function WorkerDashboard({ session }: { session: StaffSession }) {
  const complaints = useQuery(api.complaints.workerList, { token: session.token });
  const [detailId, setDetailId] = useState<Id<"complaints"> | null>(null);

  if (complaints === null) {
    return <SessionError />;
  }

  const needsVerification = (complaints ?? []).filter((c) =>
    ["WORKER_ASSIGNED", "FIELD_VERIFICATION", "NEEDS_INFO"].includes(c.status),
  );
  const needsResolution = (complaints ?? []).filter(
    (c) => c.status === "IN_PROGRESS",
  );
  const pendingAdminReview = (complaints ?? []).filter((c) =>
    ["WORK_COMPLETED", "RESIDENT_CONFIRMATION", "RESIDENT_CONFIRMED"].includes(c.status),
  );
  const recheck = (complaints ?? []).filter((c) => c.status === "RECHECK_REQUIRED");
  const closed = (complaints ?? []).filter((c) =>
    ["RESOLVED", "NOT_CONFIRMED"].includes(c.status),
  );

  return (
    <div className="min-h-screen pb-14">
      <StaffHeader current={session} />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Worker dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Only complaints assigned to you are shown. Inspect the location,
              submit your field verification, and complete the assigned work
              with mandatory evidence.
            </p>
          </div>
          <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-900">
            <Wrench className="mr-1 size-3.5" /> Worker access
          </Badge>
        </div>

        {complaints === undefined ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading your assignments…
            </CardContent>
          </Card>
        ) : (complaints ?? []).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No complaints assigned to you yet. When the office assigns one, it
              will appear here.
            </CardContent>
          </Card>
        ) : (
          <>
            {[
              { title: "To inspect & verify", items: needsVerification },
              { title: "Pending work — carry out the fix", items: needsResolution },
              { title: "Work completed — pending Admin review", items: pendingAdminReview },
              { title: "Recheck requested", items: recheck },
              { title: "Closed", items: closed },
            ]
              .filter((g) => g.items.length > 0)
              .map((group) => (
                <section key={group.title}>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    {group.title}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      {group.items.length}
                    </span>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {group.items.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => setDetailId(c._id)}
                        className={`cursor-pointer rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 ${
                          detailId === c._id
                            ? "border-primary ring-1 ring-primary/30"
                            : ""
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
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
          </>
        )}

        <Separator />

        {detailId ? (
          <AssignedComplaint session={session} complaintId={detailId} onClose={() => setDetailId(null)} />
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Select a complaint above to see the full details, submit your field
              verification, or complete the assigned work.
            </CardContent>
          </Card>
        )}

        <DisclaimerNote />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assigned complaint detail: verification report + completion with evidence
// ---------------------------------------------------------------------------

function AssignedComplaint({
  session,
  complaintId,
  onClose,
}: {
  session: StaffSession;
  complaintId: Id<"complaints">;
  onClose: () => void;
}) {
  const data = useQuery(api.complaints.getForStaff, {
    token: session.token,
    complaintId,
  });
  const submitVerification = useMutation(api.complaints.submitVerification);
  const resolveComplaint = useMutation(api.complaints.resolve);
  const generateUploadUrl = useMutation(api.complaints.generateUploadUrl);

  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [problemFound, setProblemFound] = useState(true);
  const [findings, setFindings] = useState("");
  const [notes, setNotes] = useState("");
  const [recommendedAction, setRecommendedAction] = useState("");
  const [inspectedAt, setInspectedAt] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  );
  const [verifyPhoto, setVerifyPhoto] = useState<File | null>(null);
  const [verifyVideo, setVerifyVideo] = useState<File | null>(null);

  const [showResolveForm, setShowResolveForm] = useState(false);
  const [actionTaken, setActionTaken] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [resolvePhoto, setResolvePhoto] = useState<File | null>(null);
  const [resolveVideo, setResolveVideo] = useState<File | null>(null);
  // Mandatory completion evidence: real device GPS (never hand-entered),
  // automatic capture time, geotagged photo, and a completion note.
  const [gpsStatus, setGpsStatus] = useState<
    "idle" | "capturing" | "captured" | "denied" | "unavailable" | "timeout"
  >("idle");
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
    capturedAt: number;
  } | null>(null);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Mandatory completion-evidence capture (device GPS only) ----
  // Hooks must be called unconditionally BEFORE any early return below,
  // otherwise React throws "Rendered more hooks than during the previous
  // render" once the query resolves.

  const captureGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable");
      setGpsMessage(
        "Location services are not available on this device/browser. Work cannot be marked completed without a real GPS location.",
      );
      return;
    }
    setGpsStatus("capturing");
    setGpsMessage("Capturing your current GPS location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          capturedAt: pos.timestamp || Date.now(),
        });
        setGpsStatus("captured");
        setGpsMessage(
          `Location captured (±${Math.round(pos.coords.accuracy ?? 0)} m accuracy) at ${new Date(
            pos.timestamp || Date.now(),
          ).toLocaleTimeString()}.`,
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus("denied");
          setGpsMessage(
            "Location permission was denied. Enable location access in your browser settings — work cannot be marked completed without a real GPS location.",
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsStatus("unavailable");
          setGpsMessage(
            "Your location could not be determined. Move to an open area or enable device location services and try again.",
          );
        } else {
          setGpsStatus("timeout");
          setGpsMessage("Location capture timed out. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  // Fresh capture each time the completion form opens; reset on close.
  // The IN_PROGRESS check uses optional chaining so this is safe while the
  // query is still loading (data undefined) or failed (data null).
  useEffect(() => {
    if (showResolveForm && data?.complaint?.status === "IN_PROGRESS") {
      setGpsCoords(null);
      setGpsStatus("idle");
      setGpsMessage(null);
      captureGps();
    }
  }, [showResolveForm, data?.complaint?.status, captureGps]);

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
    return <SessionError />;
  }

  const { complaint, verification, decision, resolutions, events } = data;
  const c = complaint as Complaint;

  const pickFile = (
    file: File | undefined,
    maxBytes: number,
    kind: string,
    setter: (f: File | null) => void,
  ) => {
    if (!file) return;
    if (file.size > maxBytes) {
      setError(
        `${kind} is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please choose a file under ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
      return;
    }
    setError(null);
    setter(file);
  };

  /** Upload a file to Convex storage, returning its storage id. */
  const uploadFile = async (file: File): Promise<string> => {
    const url = await generateUploadUrl({});
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const data = (await res.json()) as { storageId: string };
    return data.storageId;
  };

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

  // One verification report per round; a new one can follow a NEEDS_INFO request.
  const canVerify = ["WORKER_ASSIGNED", "NEEDS_INFO"].includes(c.status);

  const canResolve = c.status === "IN_PROGRESS";

  // All required evidence must be provided before WORK COMPLETED unlocks.
  const evidenceComplete =
    gpsStatus === "captured" &&
    gpsCoords !== null &&
    resolvePhoto !== null &&
    actionTaken.trim().length > 0;

  const resetCompletionForm = () => {
    setShowResolveForm(false);
    setActionTaken("");
    setResolveNote("");
    setResolvePhoto(null);
    setResolveVideo(null);
    setGpsCoords(null);
    setGpsStatus("idle");
    setGpsMessage(null);
  };

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
        {/* Resident's reported problem */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reported problem
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

        {/* Field verification */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Field verification report
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
                  inspected {formatDateTime(verification.inspectedAt)} · by{" "}
                  {verification.workerName} ({verification.workerId})
                </span>
              </p>
              <p>
                <span className="font-medium">What was observed: </span>
                {verification.findings}
              </p>
              {verification.notes && (
                <p>
                  <span className="font-medium">Notes: </span>
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
              {decision && (
                <div className="rounded-lg border bg-card p-3">
                  <p className="font-medium">Admin decision: {statusLabel(decision.outcome)}</p>
                  {decision.note && (
                    <p className="mt-0.5 text-muted-foreground">{decision.note}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Final approval is made by the Admin only — your report was
                    forwarded for their decision.
                  </p>
                </div>
              )}
              {!decision && c.status === "FIELD_VERIFICATION" && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="size-3.5" />
                  Sent to the office — waiting for the Admin's final decision.
                  You do not give the final approval.
                </p>
              )}
            </div>
          ) : canVerify ? (
            showVerifyForm ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="space-y-1.5">
                  <Label>Was the reported problem found at the location?</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={problemFound ? "default" : "outline"}
                      onClick={() => setProblemFound(true)}
                    >
                      <BadgeCheck className="size-4" /> Yes, found
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!problemFound ? "default" : "outline"}
                      onClick={() => setProblemFound(false)}
                    >
                      <XCircle className="size-4" /> Not found
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="findings">
                    What you observed at the location <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="findings"
                    value={findings}
                    onChange={(e) => setFindings(e.target.value)}
                    placeholder="e.g. Strong sewage smell near the tap stand; water pooling with greenish tint; pressure normal at time of visit."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Verification notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything else the office should know — talked to residents, checked the valve, etc."
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recommended">
                    Recommended action <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="recommended"
                    value={recommendedAction}
                    onChange={(e) => setRecommendedAction(e.target.value)}
                    placeholder="e.g. Repair the leak and disinfect the tank"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="inspectedAt">Date & time of inspection</Label>
                    <Input
                      id="inspectedAt"
                      type="datetime-local"
                      value={inspectedAt}
                      onChange={(e) => setInspectedAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Evidence (optional)</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImageIcon className="size-4" /> Photo
                      </Button>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                        <Video className="size-4" /> Video
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            setVerifyVideo(null);
                            if (f) pickFile(f, MAX_VIDEO_BYTES, "Video", setVerifyVideo);
                          }}
                        />
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          setVerifyPhoto(null);
                          if (f) pickFile(f, MAX_PHOTO_BYTES, "Photo", setVerifyPhoto);
                        }}
                      />
                    </div>
                    {verifyPhoto && <p className="text-xs text-muted-foreground">Photo attached ✓</p>}
                    {verifyVideo && <p className="text-xs text-muted-foreground">Video attached ✓</p>}
                    {/* previews */}
                    {verifyPhoto && (
                      <img
                        src={URL.createObjectURL(verifyPhoto)}
                        alt="Verification photo preview"
                        className="max-h-36 rounded-lg border object-contain"
                      />
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={busy || !findings.trim() || !recommendedAction.trim()}
                    onClick={() =>
                      run(async () => {
                        await submitVerification({
                          token: session.token,
                          complaintId,
                          problemFound,
                          findings,
                          notes,
                          recommendedAction,
                          photo: verifyPhoto ? ((await uploadFile(verifyPhoto)) as never) : undefined,
                          video: verifyVideo ? ((await uploadFile(verifyVideo)) as never) : undefined,
                          inspectedAt: new Date(inspectedAt).getTime(),
                        });
                        setShowVerifyForm(false);
                      })
                    }
                  >
                    <ClipboardCheck className="size-4" /> Submit verification to Admin
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setShowVerifyForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm">
                <p className="text-muted-foreground">
                  Physically inspect the reported location, then file your field
                  verification report. Your report goes to the Admin — it does
                  not approve or verify the complaint yourself.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowVerifyForm(true)}
                >
                  <ClipboardCheck className="size-4" /> Start field verification report
                </Button>
              </div>
            )
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Verification already submitted — the Admin is reviewing it.
            </p>
          )}
        </section>

        {/* Resolution */}
        {(c.status === "IN_PROGRESS" ||
          c.status === "WORK_COMPLETED" ||
          c.status === "RECHECK_REQUIRED" ||
          resolutions.length > 0) && (
          <>
            <Separator />
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Resolution work
              </p>
              {resolutions.length > 0 && (
                <div className="space-y-2">
                  {resolutions.map((r, i) => (
                    <div key={i} className="rounded-lg border bg-emerald-50/60 p-3 text-sm">
                      <p className="font-medium text-emerald-900">
                        {r.workerName} ({r.workerId}) · {formatDateTime(r.recordedAt)}
                      </p>
                      <p className="mt-0.5">Action taken: {r.actionTaken}</p>
                      {r.note && <p className="text-muted-foreground">Note: {r.note}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {r.photo && (
                          <MediaView storageId={r.photo} kind="image" label="Completion photo" />
                        )}
                        {typeof r.latitude === "number" && typeof r.longitude === "number" && (
                          <span className="font-mono">
                            GPS {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                            {typeof r.capturedAt === "number"
                              ? ` · captured ${formatDateTime(r.capturedAt)}`
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canResolve ? (
                showResolveForm ? (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="actionTaken">
                        Completion note — what work was done?{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="actionTaken"
                        value={actionTaken}
                        onChange={(e) => setActionTaken(e.target.value)}
                        placeholder="e.g. Replaced the leaking junction, flushed the line, disinfected the tap stand."
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="resolveNote">Resolution note</Label>
                      <Textarea
                        id="resolveNote"
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="Optional note for the office record."
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Geotagged completion photo <span className="text-destructive">*</span>
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                          <Camera className="size-4" />
                          {resolvePhoto ? "Change photo" : "Take / choose photo"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              setResolvePhoto(null);
                              if (f) pickFile(f, MAX_PHOTO_BYTES, "Photo", setResolvePhoto);
                            }}
                          />
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                          <Video className="size-4" /> Video (optional)
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              setResolveVideo(null);
                              if (f) pickFile(f, MAX_VIDEO_BYTES, "Video", setResolveVideo);
                            }}
                          />
                        </label>
                      </div>
                      {resolvePhoto ? (
                        <img
                          src={URL.createObjectURL(resolvePhoto)}
                          alt="Completion photo preview"
                          className="max-h-36 rounded-lg border object-contain"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Required — a photo of the completed work, taken on site.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="flex items-center gap-1.5">
                          <MapPin className="size-4" /> GPS location at completion{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={gpsStatus === "capturing"}
                          onClick={captureGps}
                        >
                          {gpsStatus === "capturing"
                            ? "Capturing…"
                            : gpsCoords
                              ? "Re-capture location"
                              : "Capture location"}
                        </Button>
                      </div>
                      {gpsMessage && (
                        <p
                          className={`text-xs ${
                            gpsStatus === "captured"
                              ? "text-emerald-700"
                              : gpsStatus === "denied" || gpsStatus === "unavailable"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {gpsMessage}
                        </p>
                      )}
                      {gpsCoords && (
                        <div className="grid gap-0.5 text-xs">
                          <span>
                            Latitude:{" "}
                            <span className="font-mono font-medium">
                              {gpsCoords.latitude.toFixed(6)}
                            </span>
                          </span>
                          <span>
                            Longitude:{" "}
                            <span className="font-mono font-medium">
                              {gpsCoords.longitude.toFixed(6)}
                            </span>
                          </span>
                          {gpsCoords.accuracy != null && (
                            <span>Accuracy: ±{Math.round(gpsCoords.accuracy)} m</span>
                          )}
                          <span className="text-muted-foreground">
                            Location captured: {formatDateTime(gpsCoords.capturedAt)} · automatic
                            device GPS (cannot be entered manually)
                          </span>
                        </div>
                      )}
                      {!gpsCoords && gpsStatus !== "capturing" && (
                        <p className="text-xs text-muted-foreground">
                          The location is captured automatically from this device's GPS. It cannot
                          be typed in manually.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={busy || !evidenceComplete}
                        title={
                          evidenceComplete
                            ? undefined
                            : "All mandatory evidence is needed first: geotagged photo, GPS location, and completion note."
                        }
                        onClick={() =>
                          run(async () => {
                            if (!resolvePhoto || !gpsCoords) return;
                            const photoId = (await uploadFile(resolvePhoto)) as never;
                            await resolveComplaint({
                              token: session.token,
                              complaintId,
                              actionTaken,
                              note: resolveNote,
                              photo: photoId,
                              video: resolveVideo ? ((await uploadFile(resolveVideo)) as never) : undefined,
                              latitude: gpsCoords.latitude,
                              longitude: gpsCoords.longitude,
                              gpsAccuracy: gpsCoords.accuracy,
                              capturedAt: gpsCoords.capturedAt,
                            });
                            resetCompletionForm();
                          })
                        }
                      >
                        <CheckCircle2 className="size-4" /> Mark work completed
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={resetCompletionForm}
                      >
                        Cancel
                      </Button>
                    </div>
                    {!evidenceComplete && (
                      <p className="text-xs text-muted-foreground">
                        "Mark work completed" stays disabled until the geotagged photo, GPS
                        location, and completion note are all provided.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm">
                    <p className="text-muted-foreground">
                      The office has approved this work and it is in your Pending
                      Work list. Carry out the required action on site, then mark
                      it completed with mandatory evidence: a geotagged photo,
                      your device GPS location, automatic date & time, and a
                      completion note describing what work was done.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowResolveForm(true)}
                    >
                      <Wrench className="size-4" /> Update / mark work completed
                    </Button>
                  </div>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  {c.status === "WORK_COMPLETED"
                    ? "Completion evidence submitted — the Admin will review your photo, GPS location, timestamp, and note before the resident is asked to confirm."
                    : c.status === "RECHECK_REQUIRED"
                      ? "The resident reported the issue still exists. The Admin will reopen this work — revisit the site and complete it again with fresh evidence."
                      : resolutions.length === 0
                        ? "The Admin has not yet assigned the resolution work."
                        : null}
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
