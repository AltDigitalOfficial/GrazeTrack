import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getMe, type MeResponse } from "@/lib/api";

type RanchContextValue = {
  me: MeResponse | null;
  activeRanchId: string | null;
  loading: boolean;
  error: string | null;
  refreshMe: () => Promise<void>;
  setActiveRanchId: (ranchId: string | null) => void;
};

const RanchContext = createContext<RanchContextValue | null>(null);

export function RanchProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [activeRanchId, setActiveRanchIdState] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncLocalStorage = (ranchId: string | null) => {
    if (ranchId) localStorage.setItem("currentRanchId", ranchId);
    else localStorage.removeItem("currentRanchId");
  };

  const setActiveRanchId = (ranchId: string | null) => {
    setActiveRanchIdState(ranchId);
    syncLocalStorage(ranchId);
  };

  const refreshMe = async () => {
    setLoading(true);
    setError(null);

    try {
      const profile = await getMe();
      setMe(profile);

      const ranchId = profile.activeRanchId ?? null;
      setActiveRanchIdState(ranchId);
      syncLocalStorage(ranchId);
    } catch (err: any) {
      setMe(null);
      setActiveRanchIdState(null);
      syncLocalStorage(null);

      setError(err?.message || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // One-shot auth listener for the whole app
    const unsub = onAuthStateChanged(auth, (user) => {
      // Reset everything on user changes (prevents “user A ranch leaks into user B”)
      setMe(null);
      setActiveRanchIdState(null);
      syncLocalStorage(null);

      if (!user) {
        setLoading(false);
        setError(null);
        return;
      }

      // Logged in: load /me
      refreshMe();
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<RanchContextValue>(
    () => ({
      me,
      activeRanchId,
      loading,
      error,
      refreshMe,
      setActiveRanchId,
    }),
    [me, activeRanchId, loading, error]
  );

  return <RanchContext.Provider value={value}>{children}</RanchContext.Provider>;
}

export function useRanch() {
  const ctx = useContext(RanchContext);
  if (!ctx) {
    throw new Error("useRanch() must be used within <RanchProvider>");
  }
  return ctx;
}
