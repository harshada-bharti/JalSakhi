import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DisclaimerNote } from "@/components/StaffHeader";
import { api } from "@/convex/_generated/api";
import {
  DISCLAIMER,
  RISK_STYLES,
  WATER_SOURCES,
  type RiskLevel,
} from "@/lib/jalsakhi";
import { useMutation, useQuery } from "convex/react";
import {
  ClipboardList,
  Droplets,
  LogIn,
  MapPin,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";

export default function Landing() {
  const stats = useQuery(api.complaints.communityStats);
  const staffStats = useQuery(api.staff.publicStats);
  const ensureDemoData = useMutation(api.staff.ensureDemoData);

  useEffect(() => {
    ensureDemoData().catch(() => {
      // seeding is best-effort; the app still works without it
    });
  }, [ensureDemoData]);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Droplets className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold">JalSakhi</p>
              <p className="text-xs text-muted-foreground">
                Community water early-warning
              </p>
            </div>
          </div>
          <Link
            to="/track"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent"
          >
            <ClipboardList className="size-4" />
            Track a complaint
          </Link>
        </div>
      </header>

      {/* Hero + access */}
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <section className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
            Ward water monitoring · prototype
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            See a water problem? Report it in a minute.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            JalSakhi lets residents flag problems with shared water sources,
            routes them to the water board office, and gets a field worker to
            check the spot on the ground — with every step visible.
          </p>
        </section>

        {/* Three clearly separated entry points */}
        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {/* 1 — Resident, no login */}
          <Card className="flex flex-col border-primary/25 ring-1 ring-primary/10">
            <CardHeader className="pb-3">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserRound className="size-5" />
              </div>
              <CardTitle className="text-base">Resident</CardTitle>
              <p className="text-sm text-muted-foreground">
                Report a problem — no login, no password, no OTP needed.
              </p>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• Pick your water source and landmark</li>
                <li>• Tick everything you noticed</li>
                <li>• Add a photo or short video if you can</li>
                <li>• Get a complaint ID to track it later</li>
              </ul>
              <Button asChild className="w-full">
                <Link to="/report">
                  <Droplets className="size-4" />
                  Report a Problem
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* 2 — Worker login */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Wrench className="size-5" />
              </div>
              <CardTitle className="text-base">Field Worker</CardTitle>
              <p className="text-sm text-muted-foreground">
                For water board staff with a Worker ID.
              </p>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• See only complaints assigned to you</li>
                <li>• Inspect the spot and file a verification report</li>
                <li>• Carry out the assigned fix and update status</li>
              </ul>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login/worker">
                  <LogIn className="size-4" />
                  Worker Login
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* 3 — Admin login */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <ShieldCheck className="size-5" />
              </div>
              <CardTitle className="text-base">Water Board Admin</CardTitle>
              <p className="text-sm text-muted-foreground">
                For the office with the Admin ID.
              </p>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• Review incoming complaints</li>
                <li>• Assign workers and confirm field reports</li>
                <li>• Make the final verification decision</li>
              </ul>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login/admin">
                  <LogIn className="size-4" />
                  Admin Login
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Small print separating the roles even more clearly */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Residents never create an account. Workers and Admins sign in with
          separate IDs issued by the water board office.
        </p>

        <Separator className="my-10" />

        {/* Water source board — community signal information */}
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Monitored water sources
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Community reporting signal per source — not a lab test result.
              </p>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              {(Object.keys(RISK_STYLES) as RiskLevel[]).map((level) => (
                <span key={level} className="flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-full ${RISK_STYLES[level].dot}`} />
                  {level === "low" ? "Green" : level === "moderate" ? "Yellow" : "Red"}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WATER_SOURCES.map((source) => (
              <Card key={source.id} className="shadow-none">
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold leading-snug">{source.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" />
                        {source.ward} · {source.id}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${RISK_STYLES.low.chip}`}
                    >
                      No open alert
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {source.serves} · {source.landmarkHint}
                  </p>
                  <Button asChild variant="secondary" size="sm" className="w-full">
                    <Link to={`/report?source=${source.id}`}>Report about this source</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="my-10" />

        {/* Lifecycle explainer */}
        <section>
          <h2 className="text-xl font-bold tracking-tight">How a complaint moves</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same lifecycle is shown to the resident tracking their ID and to
            staff inside their dashboards.
          </p>
          <ol className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["1. Submitted", "A resident files the complaint — no login."],
              ["2. Admin review", "The office checks details and assigns a worker."],
              ["3. Field verification", "The worker inspects and reports findings."],
              ["4. Final decision", "Only Admin verifies, rejects, or asks for more info."],
              ["5. Action in progress", "Admin assigns the fix to the worker."],
              ["6. Resolved", "The worker marks it resolved with notes and evidence."],
            ].map(([title, body]) => (
              <li key={title} className="rounded-lg border bg-card p-4">
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>

          {stats && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Reports so far", stats.total],
                ["Open", stats.open],
                ["Resolved", stats.resolved],
                ["High-risk open", stats.highRisk],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-card p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 space-y-4">
          <DisclaimerNote />
          {staffStats && (
            <p className="text-center text-xs text-muted-foreground">
              Demo staff IDs — Admin: ADM-01 / admin123 · Worker: WRK-01 / worker123
              (also WRK-02, WRK-03)
            </p>
          )}
        </div>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground">
          JalSakhi prototype · {DISCLAIMER}
        </div>
      </footer>
    </div>
  );
}
