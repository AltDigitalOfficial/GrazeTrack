import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { apiGet, apiPostJson, apiPutJson } from "@/lib/api";
import { ROUTES } from "@/routes";

import { getBreedsForSpecies, type AnimalSpecies } from "@/components/lookups/animalLookups";

type HerdPayload = {
  name: string;
  shortDescription?: string;
  species?: string;
  breed?: string;
  longDescription?: string;
};

// Minimal shape needed for Herd Create
type RanchSettingsDTO = {
  species?: Array<{
    species: string;
  }>;
};

type SpeciesOption = { value: string; label: string };

type HerdBreedsResponse = {
  breeds: string[];
};

const MIXED_VALUE = "Mixed";
const OTHER_VALUE = "Other"; // Breed only

export default function CreateHerdPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const herdId = (location.state as any)?.herdId as string | undefined;
  const isEdit = Boolean(herdId);

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");

  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([]);
  const [species, setSpecies] = useState<string>("");

  // Breed UI:
  // - breedMode is what the select holds: "" | "Mixed" | "Other" | standard-breed-value
  // - otherBreedText is only used when breedMode === "Other"
  const [breedMode, setBreedMode] = useState<string>("");
  const [otherBreedText, setOtherBreedText] = useState<string>("");

  // Ranch-specific previously-used breeds for the selected species
  const [ranchBreedOptions, setRanchBreedOptions] = useState<string[]>([]);
  const [loadingRanchBreeds, setLoadingRanchBreeds] = useState(false);

  const [longDescription, setLongDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingRanchSettings, setLoadingRanchSettings] = useState(false);

  const [banner, setBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [ranchHasNoSpecies, setRanchHasNoSpecies] = useState(false);

  const isMixedSpecies = species === MIXED_VALUE;

  useEffect(() => {
    let cancelled = false;

    async function loadRanchSettingsSpecies() {
      setLoadingRanchSettings(true);
      try {
        const rs = await apiGet<RanchSettingsDTO>(`/ranch-settings`);
        if (cancelled) return;

        const raw = (rs?.species || [])
          .map((s) => (s?.species ?? "").trim())
          .filter((v) => v.length > 0);

        // unique + stable order
        const seen = new Set<string>();
        const unique = raw.filter((v) => {
          const key = v.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (unique.length === 0) {
          setSpeciesOptions([]);
          setRanchHasNoSpecies(true);

          // Don't force-clear on edit, but for create this avoids weird state.
          if (!isEdit) setSpecies("");
          return;
        }

        setRanchHasNoSpecies(false);

        // Build dropdown: ranch species first, then Mixed at bottom.
        const opts: SpeciesOption[] = unique.map((v) => ({ value: v, label: v }));
        opts.push({ value: MIXED_VALUE, label: "Mixed" });

        setSpeciesOptions(opts);
      } catch (e: any) {
        if (cancelled) return;

        // If we can't load ranch settings, block create rather than guessing.
        setSpeciesOptions([]);
        setRanchHasNoSpecies(true);
        setErrorMsg(e?.message || "Failed to load ranch settings (species)");
      } finally {
        if (!cancelled) setLoadingRanchSettings(false);
      }
    }

    loadRanchSettingsSpecies();
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  useEffect(() => {
    let cancelled = false;

    async function loadHerd() {
      if (!isEdit || !herdId) return;

      setLoading(true);
      setErrorMsg(null);

      try {
        const data = await apiGet<any>(`/herds/${herdId}`);
        if (cancelled) return;

        setName(data?.name ?? "");
        setShortDescription(data?.shortDescription ?? "");
        setSpecies(data?.species ?? "");
        setLongDescription(data?.longDescription ?? "");

        const loadedBreed = (data?.breed ?? "") as string;

        if (!loadedBreed) {
          setBreedMode("");
          setOtherBreedText("");
        } else if (loadedBreed === MIXED_VALUE) {
          setBreedMode(MIXED_VALUE);
          setOtherBreedText("");
        } else {
          setBreedMode(loadedBreed);
          setOtherBreedText("");
        }
      } catch (e: any) {
        if (!cancelled) setErrorMsg(e?.message || "Failed to load herd");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHerd();
    return () => {
      cancelled = true;
    };
  }, [isEdit, herdId]);

  // Load ranch-specific previously-used breeds whenever species changes (and isn't Mixed)
  useEffect(() => {
    let cancelled = false;

    async function loadRanchBreeds() {
      // Clear when species is empty or Mixed
      if (!species || isMixedSpecies) {
        setRanchBreedOptions([]);
        return;
      }

      setLoadingRanchBreeds(true);
      try {
        const qs = new URLSearchParams({ species }).toString();
        const resp = await apiGet<HerdBreedsResponse>(`/herds/breeds?${qs}`);
        if (cancelled) return;

        const raw = Array.isArray(resp?.breeds) ? resp.breeds : [];
        const seen = new Set<string>();
        const unique = raw
          .map((b) => (b ?? "").trim())
          .filter((b) => b.length > 0 && b !== MIXED_VALUE)
          .filter((b) => {
            const key = b.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

        setRanchBreedOptions(unique);
      } catch {
        if (cancelled) return;
        // Non-blocking: we can still use standard lookup + Other free-entry
        setRanchBreedOptions([]);
      } finally {
        if (!cancelled) setLoadingRanchBreeds(false);
      }
    }

    loadRanchBreeds();
    return () => {
      cancelled = true;
    };
  }, [species, isMixedSpecies]);

  const standardBreedOptions = useMemo(() => {
    if (!species) return [];
    if (isMixedSpecies) return [];
    // species values are ranch-defined strings; your lookup expects AnimalSpecies.
    // If species isn't a recognized lookup key, this will return [] and that's OK.
    return getBreedsForSpecies(species as AnimalSpecies);
  }, [species, isMixedSpecies]);

  const cleanedStandardBreedOptions = useMemo(() => {
    // Remove any existing "Mixed"/"Other"/"Mixed/Crossbred" from lookup list so we only show our special options once.
    return standardBreedOptions.filter((b) => {
      const v = (b.value ?? "").toLowerCase();
      const l = (b.label ?? "").toLowerCase();

      if (v === "other") return false;
      if (l === "other") return false;

      if (v === "mixed") return false;
      if (l === "mixed") return false;

      if (l.includes("mixed/crossbred")) return false;
      if (l.includes("mixed crossbred")) return false;

      return true;
    });
  }, [standardBreedOptions]);

  // Dedup lookup breeds against ranch breeds (case-insensitive) so ranch values appear once.
  const dedupedLookupBreedOptions = useMemo(() => {
    const ranchKeys = new Set(ranchBreedOptions.map((b) => b.toLowerCase()));
    return cleanedStandardBreedOptions.filter((b) => {
      const v = (b.value ?? "").trim();
      if (!v) return false;
      return !ranchKeys.has(v.toLowerCase());
    });
  }, [cleanedStandardBreedOptions, ranchBreedOptions]);

  useEffect(() => {
    // If species changes, keep dependent fields explicit.
    if (!species) {
      if (breedMode) setBreedMode("");
      if (otherBreedText) setOtherBreedText("");
      return;
    }

    // If species changes to Mixed, clear breed state and disable the control.
    if (isMixedSpecies) {
      if (breedMode) setBreedMode("");
      if (otherBreedText) setOtherBreedText("");
      return;
    }

    // If switching away from Other, clear the freeform value.
    if (breedMode !== OTHER_VALUE && otherBreedText) {
      setOtherBreedText("");
    }

    // If breedMode is a standard value, verify it is valid for this species (when we have options).
    if (!breedMode) return;
    if (breedMode === MIXED_VALUE) return;
    if (breedMode === OTHER_VALUE) return;

    const inRanchList = ranchBreedOptions.some((b) => b.toLowerCase() === breedMode.toLowerCase());
    const inLookupList = dedupedLookupBreedOptions.some(
      (b) => (b.value ?? "").toLowerCase() === breedMode.toLowerCase()
    );

    // If we have options and the selected value is not one of them, clear it.
    // This keeps the old behavior without forcing you to type it again.
    if ((ranchBreedOptions.length > 0 || dedupedLookupBreedOptions.length > 0) && !inRanchList && !inLookupList) {
      setBreedMode("");
    }
  }, [species, isMixedSpecies, breedMode, otherBreedText, ranchBreedOptions, dedupedLookupBreedOptions]);

  const resolvedBreedForPayload = useMemo(() => {
    if (isMixedSpecies) return undefined;
    if (!breedMode) return undefined;

    if (breedMode === MIXED_VALUE) return MIXED_VALUE;

    if (breedMode === OTHER_VALUE) {
      const v = otherBreedText.trim();
      return v.length > 0 ? v : undefined;
    }

    return breedMode;
  }, [isMixedSpecies, breedMode, otherBreedText]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (loadingRanchSettings) return false;
    if (name.trim().length === 0) return false;

    // Block creating a herd if ranch has no species configured.
    // For edit: allow save even if settings are empty (don’t brick legacy edits).
    if (!isEdit && ranchHasNoSpecies) return false;

    return true;
  }, [name, loading, loadingRanchSettings, ranchHasNoSpecies, isEdit]);

  const handleSave = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setBanner(null);
    setErrorMsg(null);

    const payload: HerdPayload = {
      name: name.trim(),
      shortDescription: shortDescription.trim() || undefined,
      species: species || undefined,
      breed: resolvedBreedForPayload,
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

      {!isEdit && ranchHasNoSpecies && !loadingRanchSettings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm space-y-2">
          <div className="font-medium">You can’t create herds yet.</div>
          <div>
            Before creating herds, add at least one species in Ranch Settings so we know what animals you
            raise on this ranch.
          </div>
          <div>
            <Button variant="outline" onClick={() => navigate(ROUTES.admin.ranch)} disabled={loading}>
              Go to Ranch Settings
            </Button>
          </div>
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
            disabled={loading || (!isEdit && ranchHasNoSpecies)}
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
            disabled={loading || (!isEdit && ranchHasNoSpecies)}
            placeholder="e.g. Herd kept near north fence line"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="species" className="text-sm font-medium">
              Species
            </label>
            <select
              id="species"
              className="w-full border rounded-md px-3 py-2 text-sm bg-white h-10"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              disabled={loading || loadingRanchSettings || (!isEdit && ranchHasNoSpecies)}
            >
              <option value="">{loadingRanchSettings ? "Loading species…" : "Select species…"}</option>
              {speciesOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <div className="text-xs text-muted-foreground">
              Need another species? Add it in Ranch Settings.
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="breed" className="text-sm font-medium">
              Breed
            </label>
            <select
              id="breed"
              className="w-full h-10 rounded-md border px-3 bg-white text-sm"
              value={breedMode}
              onChange={(e) => setBreedMode(e.target.value)}
              disabled={
                loading ||
                loadingRanchSettings ||
                (!species || isMixedSpecies) ||
                (!isEdit && ranchHasNoSpecies)
              }
            >
              <option value="">
                {isMixedSpecies
                  ? "Breed disabled for Mixed herds"
                  : species
                  ? loadingRanchBreeds
                    ? "Loading breeds…"
                    : "Select breed…"
                  : "Select species first…"}
              </option>

              {/* Ranch-entered breeds (DB-sourced) at the top */}
              {!isMixedSpecies &&
                ranchBreedOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}

              {/* Special options */}
              {!isMixedSpecies && (
                <>
                  <option value={MIXED_VALUE}>Mixed</option>
                  <option value={OTHER_VALUE}>Other</option>
                </>
              )}

              {/* Lookup breeds (deduped against ranch-entered breeds) */}
              {!isMixedSpecies &&
                dedupedLookupBreedOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
            </select>

            {breedMode === OTHER_VALUE && !isMixedSpecies && (
              <div className="space-y-2 pt-2">
                <label htmlFor="otherBreed" className="text-sm font-medium">
                  Breed (Other)
                </label>
                <Input
                  id="otherBreed"
                  value={otherBreedText}
                  onChange={(e) => setOtherBreedText(e.target.value)}
                  disabled={loading || (!isEdit && ranchHasNoSpecies)}
                  placeholder="Enter breed…"
                />
              </div>
            )}
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
            disabled={loading || (!isEdit && ranchHasNoSpecies)}
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
