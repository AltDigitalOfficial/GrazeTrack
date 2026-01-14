import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { apiGet, apiPostJson, apiPutJson } from "@/lib/api";
import { ROUTES } from "@/routes";

type HerdPayload = {
  name: string;
  shortDescription?: string;
  species?: string;
  breed?: string;
  maleDesc?: string;
  femaleDesc?: string;
  babyDesc?: string;
  longDescription?: string;
};

const SPECIES = ["Cattle", "Bison"] as const;

const BREEDS: Record<string, string[]> = {
  Cattle: ["Angus", "Hereford", "Charolais", "Brahman", "Buelingo"],
  Bison: ["Plains Bison", "Wood Bison"],
};

export default function CreateHerdPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const herdId = (location.state as any)?.herdId as string | undefined;
  const isEdit = Boolean(herdId);

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [species, setSpecies] = useState<string>("");
  const [breed, setBreed] = useState<string>("");

  const [maleDesc, setMaleDesc] = useState("");
  const [femaleDesc, setFemaleDesc] = useState("");
  const [babyDesc, setBabyDesc] = useState("");

  const [longDescription, setLongDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load herd for edit
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isEdit || !herdId) return;

      setLoading(true);
      setErrorMsg(null);

      try {
        const data = await apiGet<any>(`/herds/${herdId}`);
        if (cancelled) return;

        setName(data?.name ?? "");
        setShortDescription(data?.shortDescription ?? "");
        setSpecies(data?.species ?? "");
        setBreed(data?.breed ?? "");

        setMaleDesc(data?.maleDesc ?? "");
        setFemaleDesc(data?.femaleDesc ?? "");
        setBabyDesc(data?.babyDesc ?? "");

        setLongDescription(data?.longDescription ?? "");
      } catch (e: any) {
        if (!cancelled) setErrorMsg(e?.message || "Failed to load herd");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, herdId]);

  const breedOptions = useMemo(() => {
    return species ? BREEDS[species] ?? [] : [];
  }, [species]);

  // When species changes, reset breed if it no longer applies
  useEffect(() => {
    if (!species) return;
    if (breed && !breedOptions.includes(breed)) setBreed("");
  }, [species, breed, breedOptions]);

  const canSubmit = useMemo(() => {
    return name.trim().length > 0 && !loading;
  }, [name, loading]);

  const handleSave = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setBanner(null);
    setErrorMsg(null);

    const payload: HerdPayload = {
      name: name.trim(),
      shortDescription: shortDescription.trim() || undefined,
      species: species || undefined,
      breed: breed || undefined,
      maleDesc: maleDesc.trim() || undefined,
      femaleDesc: femaleDesc.trim() || undefined,
      babyDesc: babyDesc.trim() || undefined,
      longDescription: longDescription.trim() || undefined,
    };

    try {
      if (isEdit && herdId) {
        await apiPutJson(`/herds/${herdId}`, payload);
        setBanner("Herd updated successfully!");
      } else {
        await apiPostJson(`/herds`, payload);
        setBanner("Herd created successfully!");
      }

      // Go back to list after a brief tick so the banner shows if you want.
      // If you prefer immediate navigation, remove setTimeout.
      setTimeout(() => {
        navigate(ROUTES.herd.list, { replace: true });
      }, 250);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to save herd");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{isEdit ? "Edit Herd" : "Create Herd"}</h1>

        <Button
          variant="outline"
          onClick={() => navigate(ROUTES.herd.list)}
          disabled={loading}
        >
          Back
        </Button>
      </div>

      {banner && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {banner}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}

      <section className="space-y-4 border p-6 rounded-lg bg-white">
        <div className="space-y-2">
          <Label>Herd Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
        </div>

        <div className="space-y-2">
          <Label>Quick Description</Label>
          <Input
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Species</Label>
            <select
              className="w-full h-10 rounded-md border px-3 bg-white"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              disabled={loading}
            >
              <option value="">Select species…</option>
              {SPECIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Breed</Label>
            <select
              className="w-full h-10 rounded-md border px-3 bg-white"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              disabled={loading || !species}
            >
              <option value="">{species ? "Select breed…" : "Select species first…"}</option>
              {breedOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Male label</Label>
            <Input value={maleDesc} onChange={(e) => setMaleDesc(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Female label</Label>
            <Input value={femaleDesc} onChange={(e) => setFemaleDesc(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Baby label</Label>
            <Input value={babyDesc} onChange={(e) => setBabyDesc(e.target.value)} disabled={loading} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <textarea
            className="w-full min-h-35 rounded-md border p-3 bg-white"
            value={longDescription}
            onChange={(e) => setLongDescription(e.target.value)}
            disabled={loading}
            placeholder="Longer description / notes…"
          />
        </div>

        <Button className="w-full" onClick={handleSave} disabled={!canSubmit}>
          {loading ? "Saving…" : isEdit ? "Save Changes" : "Create Herd"}
        </Button>
      </section>
    </div>
  );
}
