import { clearSession, loadSession, type StaffSession } from "@/lib/jalsakhi";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Staff-only guard for Worker and Admin dashboards.
 * Residents never pass through here — their pages are public by design.
 */
export function RequireStaffAuth({
  role,
  children,
}: {
  role: "worker" | "admin";
  children: (session: StaffSession) => ReactNode;
}) {
  const [session, setSession] = useState<StaffSession | null | undefined>(undefined);
  const location = useLocation();

  useEffect(() => {
    const stored = loadSession();
    setSession(stored && stored.role === role ? stored : null);
  }, [role]);

  if (session === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (session === null) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login/${role}?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return <>{children(session)}</>;
}
