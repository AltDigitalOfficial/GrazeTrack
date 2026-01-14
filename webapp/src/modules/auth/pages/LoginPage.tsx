import { useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, } from "firebase/auth";
import { useNavigate, useLocation } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase";

function friendlyFirebaseError(code?: string) {
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn’t look valid.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a few minutes.";
    case "auth/operation-not-allowed":
      return "Email/password login is not enabled in Firebase yet.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Login failed. Please try again.";
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  
  const location = useLocation();
  const from = (location.state as any)?.from || "/";
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 🔐 Tiny guard: redirect if already logged in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) navigate("/", { replace: true });
    });
    return () => unsub();
  }, [navigate]);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  const handleLogin = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);

      // Firebase persists session automatically.
      navigate(from, { replace: true });
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : undefined;
      setErrorMsg(friendlyFirebaseError(code));
      console.error("Firebase login error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-stone-600">
            Log in to continue to GrazeTrack.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
            {errorMsg}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />
            <p className="text-xs text-stone-500">Minimum 6 characters.</p>
          </div>

          <Button className="w-full" onClick={handleLogin} disabled={!canSubmit}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <div className="text-xs text-stone-500">
            Need a login?  Call Tina Valdez @ 303.588.4180
          </div>
        </div>
      </div>
    </div>
  );
}
