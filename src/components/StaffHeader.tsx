import { Button } from "@/components/ui/button";
import {
  clearSession,
  DISCLAIMER,
  loadSession,
  type StaffSession,
} from "@/lib/jalsakhi";
import { Droplets, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

/** Shared top bar for staff dashboards. */
export function StaffHeader({ current }: { current: StaffSession }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    setSession(loadSession());
  }, []);

  const handleSignOut = () => {
    clearSession();
    navigate("/");
  };

  const roleLabel = current.role === "admin" ? "Admin" : "Worker";
  const isCurrent =
    session?.token === current.token && session?.role === current.role;

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex cursor-pointer items-center gap-2.5 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Droplets className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-bold leading-tight">JalSakhi</span>
            <span className="block text-xs leading-tight text-muted-foreground">
              {roleLabel} dashboard · {current.name} ({current.staffId})
            </span>
          </span>
        </button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={isCurrent ? "" : "hidden"}
          onClick={handleSignOut}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}

/** The required prototype disclaimer, shown on every surface. */
export function DisclaimerNote({ className = "" }: { className?: string }) {
  return (
    <p
      className={
        "rounded-lg border border-border/70 bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground " +
        className
      }
    >
      {DISCLAIMER}
    </p>
  );
}
