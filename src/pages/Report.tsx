import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DisclaimerNote } from "@/components/StaffHeader";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  communitySignalLevel,
  computeRisk,
  getMyComplaintNos,
  getSupportKey,
  observationLabel,
  rememberMyComplaint,
  statusBadgeClass,
  statusLabel,
  timeAgo,
  OBSERVATIONS,
  RISK_STYLES,
  WATER_SOURCES,
  type RiskLevel,
} from "@/lib/jalsakhi";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Droplets,
  ImageIcon,
  MapPin,
  Users,
  Video,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

export default function Report() {
  const [searchParams] = useSearchParams();
  const initialSource =
    WATER_SOURCES.find((s) => s.id === searchParams.get("source"))?.id ??
    WATER_SOURCES[0].id;

  const [sourceId, setSourceId] = useState(initialSource);
  const [landmark, setLandmark] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ complaintNo: string } | null>(null);

  const submitComplaint = useMutation(api.complaints.submit);
  const generateUploadUrl = useMutation(api.complaints.generateUploadUrl);
  const supportComplaint = useMutation(api.complaints.supportComplaint);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // ---- Community support (anonymous, no login) ----
  // All hooks live here, before the early return for the success screen.
  const supportKey = useMemo(() => getSupportKey(), []);
  const myComplaintNos = useMemo(() => getMyComplaintNos(), []);
  const communityData = useQuery(api.complaints.communityList, { sourceId });
  const mySupportedIds = useQuery(api.complaints.mySupportedIds, { supportKey });
  const [supportBusyId, setSupportBusyId] = useState<string | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);

  const source = WATER_SOURCES.find((s) => s.id === sourceId)!;
  const risk = useMemo(() => computeRisk(selected), [selected]);
  const riskStyle = RISK_STYLES[risk.level as RiskLevel];
  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  const videoPreview = useMemo(
    () => (videoFile ? URL.createObjectURL(videoFile) : null),
    [videoFile],
  );

  const toggleObservation = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) {
      setError("Please tick at least one thing you noticed.");
      return;
    }
    if (!landmark.trim()) {
      setError("Please describe the exact location or landmark.");
      return;
    }
    setSubmitting(true);
    try {
      let photoId: string | undefined;
      let videoId: string | undefined;
      if (photoFile) photoId = await uploadFile(photoFile);
      if (videoFile) videoId = await uploadFile(videoFile);
      const res = await submitComplaint({
        sourceId: source.id,
        sourceName: source.name,
        landmark: landmark.trim(),
        reporterName: reporterName.trim() || undefined,
        reporterPhone: reporterPhone.trim() || undefined,
        observations: selected,
        description,
        photo: photoId as never,
        video: videoId as never,
        riskScore: risk.score,
        riskLevel: risk.level,
      });
      setResult({ complaintNo: res.complaintNo });
      rememberMyComplaint(res.complaintNo);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the complaint.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Add this browser as a supporting resident for an existing complaint. */
  const handleSupport = async (complaintId: Id<"complaints">) => {
    setSupportBusyId(complaintId);
    setSupportError(null);
    try {
      await supportComplaint({ complaintId, supportKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not record your support.";
      setSupportError(
        msg.includes("Uncaught Error:")
          ? msg.split("Uncaught Error:")[1].split("\n")[0].trim()
          : msg,
      );
    } finally {
      setSupportBusyId(null);
    }
  };

  // ---- Success screen (resident notification) ----
  if (result) {
    return (
      <div className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-lg space-y-5 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Complaint submitted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your report has been sent to the water board office. You will be
              notified here once it is reviewed — no account needed.
            </p>
          </div>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Your complaint ID
              </p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-2xl font-bold tracking-wide text-primary">
                  {result.complaintNo}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => navigator.clipboard?.writeText(result.complaintNo)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Write this number down or take a screenshot. Anyone with this ID
                can follow the complaint's progress — nothing else is needed.
              </p>
              <div className="rounded-lg border bg-muted/50 p-3 text-left text-sm">
                <p className="font-medium">What happens next</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
                  <li>The office reviews your complaint</li>
                  <li>A field worker is assigned and inspects the spot</li>
                  <li>The office makes the final decision and arranges the fix</li>
                </ol>
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to={`/track?id=${result.complaintNo}`}>Track this complaint</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
          <DisclaimerNote className="text-left" />
        </div>
      </div>
    );
  }

  // ---- Form ----
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/" className="text-sm font-medium text-primary hover:underline">
              ← JalSakhi home
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Report a water problem
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              No login needed. Your report goes straight to the water board office.
            </p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground sm:flex">
            <Droplets className="size-3.5 text-primary" />
            Resident report
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1 — water source */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Which water source?</CardTitle>
              <CardDescription>
                Pick the source nearest to the problem.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {WATER_SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSourceId(s.id)}
                    className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                      sourceId === s.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <p className="text-sm font-semibold leading-snug">{s.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.id} · {s.ward}
                    </p>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landmark">
                  Exact location / landmark <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="landmark"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder={`e.g. ${source.landmarkHint}`}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Step 2 — observations (multi-select) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. What did you notice?</CardTitle>
              <CardDescription>
                Tick everything that applies — you can select multiple.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {OBSERVATIONS.map((obs) => (
                  <label
                    key={obs.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={selected.includes(obs.id)}
                      onCheckedChange={() => toggleObservation(obs.id)}
                    />
                    <span className="text-sm">{obs.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      +{obs.weight}
                    </span>
                  </label>
                ))}
              </div>

              {/* Transparent risk signal */}
              <div className="mt-4 rounded-lg border bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Community risk signal</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Simple sum of the points shown above — a rough early
                      warning, not a water test.
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStyle.chip}`}
                  >
                    {risk.score} · {riskStyle.label}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Community section — support existing complaints instead of duplicates */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="size-4 text-primary" /> My Area / Nearby Water Issues
                  </CardTitle>
                  <CardDescription>
                    Active complaints for <span className="font-medium text-foreground">{source.name}</span>. If you face the same problem, support the existing report instead of filing a duplicate.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {communityData === undefined ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  Checking nearby issues…
                </p>
              ) : communityData.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No active complaints for this water source yet. Your report below will be the first.
                </p>
              ) : (
                <div className="space-y-3">
                  {communityData.map((item) => {
                    const mine =
                      myComplaintNos.includes(item.complaintNo) ||
                      (mySupportedIds ?? []).some(
                        (id) => String(id) === String(item.complaintId),
                      );
                    const signal = communitySignalLevel(item.affectedCount);
                    return (
                      <div key={item.complaintId} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-primary">
                              {item.complaintNo}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold leading-snug">
                              {item.sourceName}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" /> {item.landmark}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(item.status)}`}
                          >
                            {statusLabel(item.status)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.observations.map((o) => (
                            <span
                              key={o}
                              className="rounded-full border bg-secondary px-2 py-0.5 text-xs"
                            >
                              {observationLabel(o)}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5">
                              <Users className="size-3" /> {item.affectedCount} resident{item.affectedCount > 1 ? "s" : ""} affected
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 ${signal.chip}`}>{signal.label}</span>
                            <span>· reported {timeAgo(item.createdAt)}</span>
                          </div>
                          {mine ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                              <CheckCircle2 className="size-3.5" /> You reported this issue
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={supportBusyId === item.complaintId}
                              onClick={() => handleSupport(item.complaintId)}
                            >
                              {supportBusyId === item.complaintId
                                ? "Recording…"
                                : "I'm also facing this problem"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {supportError && (
                    <p className="text-xs text-destructive" role="alert">
                      {supportError}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Supporting an existing report strengthens its community signal for the water board office — it does not verify the complaint. Only the office's official verification process can do that.
              </p>
            </CardContent>
          </Card>

          {/* Step 3 — description + evidence */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Describe it (optional)</CardTitle>
              <CardDescription>
                Details help the office and the field worker act faster.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Since when? How many households affected? Anything else we should know…"
                rows={4}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="photo" className="flex items-center gap-1.5">
                    <ImageIcon className="size-3.5" /> Photo (optional)
                  </Label>
                  <Input
                    id="photo"
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="mt-1.5 cursor-pointer"
                    onChange={(e) => {
                      pickFile(e.target.files?.[0], MAX_PHOTO_BYTES, "Photo", setPhotoFile);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="video" className="flex items-center gap-1.5">
                    <Video className="size-3.5" /> Short video (optional)
                  </Label>
                  <Input
                    id="video"
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="mt-1.5 cursor-pointer"
                    onChange={(e) => {
                      pickFile(e.target.files?.[0], MAX_VIDEO_BYTES, "Video", setVideoFile);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Attached photo preview"
                  className="max-h-48 rounded-lg border object-contain"
                />
              )}
              {videoPreview && (
                <video src={videoPreview} controls className="max-h-56 w-full rounded-lg border" />
              )}

              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Your name & phone (optional — only if you want updates)
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Name"
                  />
                  <Input
                    value={reporterPhone}
                    onChange={(e) => setReporterPhone(e.target.value)}
                    placeholder="Phone number"
                    type="tel"
                  />
                </div>
              </details>
            </CardContent>
          </Card>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selected.length === 0
                ? "Tick at least one observation to submit."
                : `${selected.length} observation${selected.length > 1 ? "s" : ""} selected`}
            </p>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting
                ? photoFile || videoFile
                  ? "Uploading & submitting…"
                  : "Submitting…"
                : "Submit complaint"}
            </Button>
          </div>
        </form>

        <DisclaimerNote />
      </div>
    </div>
  );
}
