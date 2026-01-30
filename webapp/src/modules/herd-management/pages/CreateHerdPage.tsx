import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { apiGet, apiPostJson, apiPutJson } from "@/lib/api";
import { ROUTES } from "@/routes";

import {
  ANIMAL_SPECIES,
  getBreedsForSpecies,
  type AnimalSpecies,
} from "@/components/lookups/animalLookups";

type HerdPayload = {
  name: string;
  shortDescription?: string;
  species?: string;
  breed?: string;
  maleDesc?: string;
  femaleDesc?: string;
  babyDesc?: string;
  male_neut_desc?: string;
  female_neut_desc?: string;
  longDescription?: string;
};

export default function CreateHerdPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const herdId = (location.state as any)?.herdId as string | undefined;
  const isEdit = Boolean(herdId);

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");

  const [species, setSpecies] = useState<AnimalSpecies | "">("");
  const [breed, setBreed] = useState<string>("");

  const [maleDesc, setMaleDesc] = useState("");
  const [femaleDesc, setFemaleDesc] = useState("");
  const [babyDesc, setBabyDesc] = useState("");
  const [maleNeutDesc, setMaleNeutDesc] = useState("");
  const [femaleNeutDesc, setFemaleNeutDesc] = useState("");

  const [longDescription, setLongDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

        const loadedSpecies = (data?.species ?? "") as string;
        setSpecies((loadedSpecies as AnimalSpecies) || "");

        setBreed(data?.breed ?? "");

        setMaleDesc(data?.maleDesc ?? "");
        setFemaleDesc(data?.femaleDesc ?? "");
        setBabyDesc(data?.babyDesc ?? "");
        setMaleNeutDesc(data?.male_neut_desc ?? "");
        setFemaleNeutDesc(data?.female_neut_desc ?? "");

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
    if (!species) return [];
    return getBreedsForSpecies(species);
  }, [species]);

  useEffect(() => {
    // If the user changes species, reset breed if it no longer applies
    if (!species) {
      if (breed) setBreed("");
      return;
    }
    if (!breed) return;

    const valid = breedOptions.some((b) => b.value === breed);
    if (!valid) setBreed("");
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

      // Store stable identifiers from the lookup table (e.g. "bison", "buelingo")
      species: species || undefined,
      breed: breed || undefined,

      maleDesc: maleDesc.trim() || undefined,
      femaleDesc: femaleDesc.trim() || undefined,
      babyDesc: babyDesc.trim() || undefined,
      male_neut_desc: maleNeutDesc.trim() || undefined,
      female_neut_desc: femaleNeutDesc.trim() || undefined,
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
        <Button variant="outline" onClick={() => navigate(ROUTES.herd.list)} disabled={loading}>
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
          <label htmlFor="name" className="text-sm font-medium">
            Herd Name
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            placeholder="e.g. North Pasture Bison"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="shortDescription" className="text-sm font-medium">
            Short Description (optional)
          </label>
          <Input
            id="shortDescription"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            disabled={loading}
            placeholder="e.g. Bison herd kept near north fence line"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="species" className="text-sm font-medium">
              Species (optional)
            </label>
            <select
              id="species"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={species}
              onChange={(e) => {
                const v = e.target.value as AnimalSpecies;
                setSpecies(v || "");
              }}
              disabled={loading}
            >
              <option value="">Select species…</option>
              {ANIMAL_SPECIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="breed" className="text-sm font-medium">
              Breed
            </label>
            <select
              id="breed"
              className="w-full h-10 rounded-md border px-3 bg-white"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              disabled={loading || !species}
            >
              <option value="">{species ? "Select breed…" : "Select species first…"}</option>
              {breedOptions.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* visual break + section header */}
        <div className="pt-4 border-t">
          <div className="text-sm font-semibold">Breed Terms</div>
          <div className="text-xs text-muted-foreground">
            Optional labels used throughout the UI (e.g. “Bull / Cow / Calf”, “Sire / Dam / Calf”, etc.).
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <label htmlFor="maleDesc" className="text-sm font-medium">
              Male
            </label>
            <Input
              id="maleDesc"
              value={maleDesc}
              onChange={(e) => setMaleDesc(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="maleNeutDesc" className="text-sm font-medium">
              Neutered male
            </label>
            <Input
              id="maleNeutDesc"
              value={maleNeutDesc}
              onChange={(e) => setMaleNeutDesc(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="femaleDesc" className="text-sm font-medium">
              Female
            </label>
            <Input
              id="femaleDesc"
              value={femaleDesc}
              onChange={(e) => setFemaleDesc(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="femaleNeutDesc" className="text-sm font-medium">
              Neutered female
            </label>
            <Input
              id="femaleNeutDesc"
              value={femaleNeutDesc}
              onChange={(e) => setFemaleNeutDesc(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="babyDesc" className="text-sm font-medium">
              Baby
            </label>
            <Input
              id="babyDesc"
              value={babyDesc}
              onChange={(e) => setBabyDesc(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="notes" className="text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
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
