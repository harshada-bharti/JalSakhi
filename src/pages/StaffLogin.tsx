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
import { api } from "@/convex/_generated/api";
import {
  loadSession,
  readMutationError,
  saveSession,
  type StaffSession,
} from "@/lib/jalsakhi";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, Droplets, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

function resolveReturnTo(
  returnTo: string | null,
  fallback: string,
): string {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

export default function StaffLogin() {
  const { role: roleParam } = useParams<{ role: string }>();
  const role = roleParam === "admin" ? "admin" : "worker";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useMutation(api.staff.login);
  const ensureDemoData = useMutation(api.staff.ensureDemoData);

  // Make sure demo staff accounts exist and are healthy before the user
  // submits, so a cold or previously-seeded database never blocks sign-in.
  useEffect(() => {
    ensureDemoData().catch(() => {
      // best-effort; login itself re-runs the bootstrap server-side
    });
  }, [ensureDemoData]);

  // If already signed in as the right role, go straight to the dashboard.
  useEffect(() => {
    const s = loadSession();
    if (s && s.role === role) {
      navigate(resolveReturnTo(searchParams.get("returnTo"), `/${role}`), {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login({ staffId: staffId.trim(), password });
      const session: StaffSession = {
        token: res.token,
        id: res.staff.id,
        staffId: res.staff.staffId,
        name: res.staff.name,
        role: res.staff.role,
      };
      if (session.role !== role) {
        setError(
          `This ID belongs to a ${session.role === "admin" ? "Admin" : "Worker"} account. Please use the ${session.role === "admin" ? "Admin" : "Worker"} login.`,
        );
        setLoading(false);
        return;
      }
      saveSession(session);
      navigate(resolveReturnTo(searchParams.get("returnTo"), `/${role}`), {
        replace: true,
      });
    } catch (err) {
      setError(readMutationError(err));
      setLoading(false);
    }
  };

  const isAdmin = role === "admin";

  return (
    <div className="flex min-h-screen flex-col px-4">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" /> JalSakhi home
        </Link>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Droplets className="size-6" />
            </div>
            <CardTitle className="text-lg">
              {isAdmin ? "Admin Login" : "Worker Login"}
            </CardTitle>
            <CardDescription>
              {isAdmin
                ? "For water board office staff with an Admin ID."
                : "For field staff with a Worker ID issued by the office."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="staffId">
                  {isAdmin ? "Admin ID" : "Worker ID"}
                </Label>
                <Input
                  id="staffId"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder={isAdmin ? "ADM-01" : "WRK-01"}
                  className="font-mono"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    <Lock className="size-4" />
                    Sign in
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Demo credentials</p>
              {isAdmin ? (
                <p>Admin ID: ADM-01 · Password: admin123</p>
              ) : (
                <p>Worker IDs: WRK-01, WRK-02, WRK-03 · Password: worker123</p>
              )}
              <p className="mt-1">
                Workers and Admins use different logins — each role only sees its
                own dashboard.
              </p>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Resident? You don't need to log in —{" "}
              <Link to="/report" className="font-medium text-primary hover:underline">
                report a problem directly
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
