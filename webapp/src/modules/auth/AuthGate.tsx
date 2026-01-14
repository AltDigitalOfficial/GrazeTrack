import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ROUTES } from "@/routes";

export default function AuthGate() {
  const location = useLocation();

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  // Small loading state avoids flicker on refresh
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 text-stone-700">
        Checking session…
      </div>
    );
  }

  // Not logged in → go login and remember where they were trying to go
  if (!user) {
    return (
      <Navigate
        to={ROUTES.auth.login}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // Logged in → render protected routes
  return <Outlet />;
}
