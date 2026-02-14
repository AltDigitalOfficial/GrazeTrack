import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { apiGet, apiPostJson, apiPutJson, apiPostForm, apiPutForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";

// Standard grazing species options for Ranch Settings
const SPECIES_OPTIONS = [
  "Bison",
  "Cattle",
  "Sheep",
  "Goats",
  "Pigs",
  "Horses",
  "Donkeys",
  "Mules",
  "Yaks",
  "Water Buffalo",
  "Alpacas",
  "Llamas",
  "Deer",
  "Elk",
] as const;
type SpeciesOption = (typeof SPECIES_OPTIONS)[number];
const OTHER_SPECIES_VALUE = "OTHER" as const;

type StandardVocab = {
  male_desc: string;
  female_desc: string;
  male_neut_desc: string;
  female_neut_desc: string;
  baby_desc: string;
};

// Default per-species vocabulary terms (editable by the rancher).
// Note: female_neut_desc is uncommon in practice; we default it blank for most species.
const STANDARD_VOCAB_BY_SPECIES: Record<SpeciesOption, StandardVocab> = {
  Bison: { male_desc: "Bull", female_desc: "Cow", male_neut_desc: "Steer", female_neut_desc: "", baby_desc: "Calf" },
  Cattle: { male_desc: "Bull", female_desc: "Cow", male_neut_desc: "Steer", female_neut_desc: "", baby_desc: "Calf" },
  Sheep: { male_desc: "Ram", female_desc: "Ewe", male_neut_desc: "Wether", female_neut_desc: "", baby_desc: "Lamb" },
  Goats: { male_desc: "Buck", female_desc: "Doe", male_neut_desc: "Wether", female_neut_desc: "", baby_desc: "Kid" },
  Pigs: { male_desc: "Boar", female_desc: "Sow", male_neut_desc: "Barrow", female_neut_desc: "", baby_desc: "Piglet" },
  Horses: { male_desc: "Stallion", female_desc: "Mare", male_neut_desc: "Gelding", female_neut_desc: "", baby_desc: "Foal" },
  Donkeys: { male_desc: "Jack", female_desc: "Jenny", male_neut_desc: "Gelding", female_neut_desc: "", baby_desc: "Foal" },
  Mules: { male_desc: "John", female_desc: "Molly", male_neut_desc: "Gelding", female_neut_desc: "", baby_desc: "Foal" },
  Yaks: { male_desc: "Bull", female_desc: "Cow", male_neut_desc: "Steer", female_neut_desc: "", baby_desc: "Calf" },
  "Water Buffalo": { male_desc: "Bull", female_desc: "Cow", male_neut_desc: "Steer", female_neut_desc: "", baby_desc: "Calf" },
  Alpacas: { male_desc: "Macho", female_desc: "Hembra", male_neut_desc: "Gelding", female_neut_desc: "", baby_desc: "Cria" },
  Llamas: { male_desc: "Macho", female_desc: "Hembra", male_neut_desc: "Gelding", female_neut_desc: "", baby_desc: "Cria" },
  Deer: { male_desc: "Buck", female_desc: "Doe", male_neut_desc: "", female_neut_desc: "", baby_desc: "Fawn" },
  Elk: { male_desc: "Bull", female_desc: "Cow", male_neut_desc: "", female_neut_desc: "", baby_desc: "Calf" },
};

type RanchDTO = {
  id: string;
  name?: string | null;
  description?: string | null;
  dba?: string | null;
  phone?: string | null;

  phys_street?: string | null;
  phys_city?: string | null;
  phys_state?: string | null;
  phys_zip?: string | null;

  mail_street?: string | null;
  mail_city?: string | null;
  mail_state?: string | null;
  mail_zip?: string | null;

  logoImageUrl?: string | null;
  brandImageUrl?: string | null;
};

type RanchSpeciesDTO = {
  species: string;
  male_desc: string | null;
  female_desc: string | null;
  male_neut_desc: string | null;
  female_neut_desc: string | null;
  baby_desc: string | null;
};

type RanchAgeBandDTO = {
  id: string;
  species: string;
  label: string;
  teeth_desc: string | null;
  min_months: number;
  max_months: number | null;
  sort_order: number;
};

type RanchSettingsDTO = {
  ranch: RanchDTO;
  species: RanchSpeciesDTO[];
  age_bands: RanchAgeBandDTO[];
};

type SpeciesPanel = {
  panel_id: string;
  species_choice: SpeciesOption | typeof OTHER_SPECIES_VALUE | "";
  species_other: string;
  species: string;
  male_desc: string;
  female_desc: string;
  male_neut_desc: string;
  female_neut_desc: string;
  baby_desc: string;
  age_bands: Array<{
    id?: string; // existing rows have id; new rows omit and backend can generate later (next increment)
    client_id: string;
    label: string;
    teeth_desc: string;
    min_months: string; // keep as string for inputs
    max_months: string; // blank = null
    sort_order: number;
  }>;
};

const newClientId = () => {
  // crypto.randomUUID is available in modern browsers; fallback keeps keys stable enough for UI.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function RanchSettingsPage() {
  const { activeRanchId, loading: meLoading, error: meError, refreshMe } = useRanch();

  // Ranch identity
  const [name, setName] = useState("");
  const [dba, setDba] = useState("");
  const [phone, setPhone] = useState("");

  // Physical Address
  const [physStreet, setPhysStreet] = useState("");
  const [physCity, setPhysCity] = useState("");
  const [physState, setPhysState] = useState("");
  const [physZip, setPhysZip] = useState("");

  // Mailing Address
  const [sameAsPhysical, setSameAsPhysical] = useState(false);
  const [mailStreet, setMailStreet] = useState("");
  const [mailCity, setMailCity] = useState("");
  const [mailState, setMailState] = useState("");
  const [mailZip, setMailZip] = useState("");

  // Branding
  const [brandImage, setBrandImage] = useState<File | null>(null);
  const [logoImage, setLogoImage] = useState<File | null>(null);

  // Ranch-level animal configuration (species + vocabulary + age bands)
  const [speciesPanels, setSpeciesPanels] = useState<SpeciesPanel[]>([]);
  const [loadingRanchSettings, setLoadingRanchSettings] = useState(false);

  // UX state
  const [saving, setSaving] = useState(false);
  const [loadingRanch, setLoadingRanch] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setDba("");
    setPhone("");

    setPhysStreet("");
    setPhysCity("");
    setPhysState("");
    setPhysZip("");

    setSameAsPhysical(false);
    setMailStreet("");
    setMailCity("");
    setMailState("");
    setMailZip("");

    setBrandImage(null);
    setLogoImage(null);

    setSaveSuccess(false);
    setErrorMsg(null);
  };

  const markDirty = () => {
    setSaveSuccess(false);
    setErrorMsg(null);
  };

  useEffect(() => {
    if (!saveSuccess) return;
    const t = setTimeout(() => setSaveSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [saveSuccess]);

  // ✅ Load ranch data whenever activeRanchId changes (login/user switch)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!activeRanchId) {
        resetForm();
        return;
      }

      setLoadingRanch(true);
      setErrorMsg(null);

      try {
        const r = await apiGet<RanchDTO>(`/ranches/${activeRanchId}`);
        if (!alive) return;

        setName(r.name ?? "");
        setDba(r.dba ?? "");
        setPhone(r.phone ?? "");

        setPhysStreet(r.phys_street ?? "");
        setPhysCity(r.phys_city ?? "");
        setPhysState(r.phys_state ?? "");
        setPhysZip(r.phys_zip ?? "");

        setMailStreet(r.mail_street ?? "");
        setMailCity(r.mail_city ?? "");
        setMailState(r.mail_state ?? "");
        setMailZip(r.mail_zip ?? "");

        const physical = `${r.phys_street ?? ""}|${r.phys_city ?? ""}|${r.phys_state ?? ""}|${r.phys_zip ?? ""}`;
        const mailing = `${r.mail_street ?? ""}|${r.mail_city ?? ""}|${r.mail_state ?? ""}|${r.mail_zip ?? ""}`;
        setSameAsPhysical(physical.length > 3 && physical === mailing);

        setSaveSuccess(false);
      } catch (err: unknown) {
        console.error("Error loading ranch:", err);
        if (alive) {
          const msg = err instanceof Error && err.message.trim() ? err.message : "Failed to load ranch.";
          setErrorMsg(msg);
        }
      } finally {
        if (alive) setLoadingRanch(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [activeRanchId]);

  useEffect(() => {
    let alive = true;

    const loadRanchSettings = async () => {
      if (!activeRanchId) {
        setSpeciesPanels([]);
        return;
      }

      setLoadingRanchSettings(true);
      try {
        const rs = await apiGet<RanchSettingsDTO>(`/ranch-settings`);
        if (!alive) return;

        // Build panels by species, attaching age bands (sorted) to the matching species.
        const bySpecies: Record<string, RanchAgeBandDTO[]> = {};
        for (const b of rs.age_bands || []) {
          if (!bySpecies[b.species]) bySpecies[b.species] = [];
          bySpecies[b.species].push(b);
        }

        const panels: SpeciesPanel[] = (rs.species || []).map((s) => {
          const bands = (bySpecies[s.species] || []).slice().sort((a, b) => a.sort_order - b.sort_order);
          return {
            panel_id: newClientId(),
            species_choice: (SPECIES_OPTIONS as readonly string[]).includes(s.species) ? (s.species as SpeciesOption) : OTHER_SPECIES_VALUE,
            species_other: (SPECIES_OPTIONS as readonly string[]).includes(s.species) ? "" : s.species,
            species: s.species,
            male_desc: s.male_desc ?? "",
            female_desc: s.female_desc ?? "",
            male_neut_desc: s.male_neut_desc ?? "",
            female_neut_desc: s.female_neut_desc ?? "",
            baby_desc: s.baby_desc ?? "",
            age_bands: bands.map((b) => ({
              id: b.id,
              client_id: b.id ?? newClientId(),
              label: b.label ?? "",
              teeth_desc: b.teeth_desc ?? "",
              min_months: String(b.min_months ?? ""),
              max_months: b.max_months === null || b.max_months === undefined ? "" : String(b.max_months),
              sort_order: b.sort_order ?? 0,
            })),
          };
        });

        setSpeciesPanels(panels);
      } catch (err: unknown) {
        console.error("Error loading ranch settings:", err);
        if (alive) {
          // Don't block the page; show a friendly message only if ranch exists.
          const msg =
            err instanceof Error && err.message.trim() ? err.message : "Failed to load ranch species/age bands.";
          setErrorMsg(msg);
        }
      } finally {
        if (alive) setLoadingRanchSettings(false);
      }
    };

    loadRanchSettings();

    return () => {
      alive = false;
    };
  }, [activeRanchId]);

  const handleSameAsPhysical = (checked: boolean) => {
    markDirty();
    setSameAsPhysical(checked);

    if (checked) {
      setMailStreet(physStreet);
      setMailCity(physCity);
      setMailState(physState);
      setMailZip(physZip);
    }
  };

  const addSpeciesPanel = () => {
    markDirty();
    setSpeciesPanels((prev) => [
      ...prev,
      {
        
      panel_id: newClientId(),
      species_choice: "",
      species_other: "",
      species: "",
        male_desc: "",
        female_desc: "",
        male_neut_desc: "",
        female_neut_desc: "",
        baby_desc: "",
        age_bands: [],
      },
    ]);
  };

  const removeSpeciesPanel = (index: number) => {
    markDirty();
    setSpeciesPanels((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSpeciesPanel = (index: number, patch: Partial<SpeciesPanel>) => {
    markDirty();
    setSpeciesPanels((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const addAgeBandRow = (speciesIndex: number) => {
    markDirty();
    setSpeciesPanels((prev) =>
      prev.map((p, i) => {
        if (i !== speciesIndex) return p;

        const nextSort = p.age_bands.length ? Math.max(...p.age_bands.map((b) => b.sort_order)) + 1 : 0;

        return {
          ...p,
          age_bands: [
            ...p.age_bands,
            {
              client_id: newClientId(),
              label: "",
              teeth_desc: "",
              min_months: "",
              max_months: "",
              sort_order: nextSort,
            },
          ],
        };
      })
    );
  };

  const removeAgeBandRow = (speciesIndex: number, bandKey: string) => {
    markDirty();
    setSpeciesPanels((prev) =>
      prev.map((p, i) => {
        if (i !== speciesIndex) return p;
        return {
          ...p,
          age_bands: p.age_bands.filter((b) => (b.id ?? b.client_id) !== bandKey),
        };
      })
    );
  };

  const updateAgeBandRow = (
    speciesIndex: number,
    bandKey: string,
    patch: Partial<SpeciesPanel["age_bands"][number]>
  ) => {
    markDirty();
    setSpeciesPanels((prev) =>
      prev.map((p, i) => {
        if (i !== speciesIndex) return p;
        return {
          ...p,
          age_bands: p.age_bands.map((b) =>(b.id ?? b.client_id) === bandKey ? { ...b, ...patch } : b),
        };
      })
    );
  };

  const handleSubmit = async () => {
    if (saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const finalMailStreet = sameAsPhysical ? physStreet : mailStreet;
      const finalMailCity = sameAsPhysical ? physCity : mailCity;
      const finalMailState = sameAsPhysical ? physState : mailState;
      const finalMailZip = sameAsPhysical ? physZip : mailZip;

      const payload = {
        name,
        dba,
        phone,
        phys_street: physStreet,
        phys_city: physCity,
        phys_state: physState,
        phys_zip: physZip,
        mail_street: finalMailStreet,
        mail_city: finalMailCity,
        mail_state: finalMailState,
        mail_zip: finalMailZip,
      };

      const hasFiles = Boolean(brandImage || logoImage);

      const isUpdate = Boolean(activeRanchId);
      const path = isUpdate ? `/ranches/${activeRanchId}` : `/ranches`;

      let result: { id: string };

      if (!hasFiles) {
        result = isUpdate
          ? await apiPutJson<{ id: string }>(path, payload)
          : await apiPostJson<{ id: string }>(path, payload);
      } else {
        const form = new FormData();
        for (const [k, v] of Object.entries(payload)) form.append(k, v ?? "");
        if (brandImage) form.append("brand", brandImage);
        if (logoImage) form.append("logo", logoImage);

        result = isUpdate
          ? await apiPutForm<{ id: string }>(path, form)
          : await apiPostForm<{ id: string }>(path, form);
      }

      setBrandImage(null);
      setLogoImage(null);
      setSaveSuccess(true);

      // If we created a ranch, /me needs to reflect membership/activeRanchId
      // so refresh the global context once.
      if (!isUpdate && result?.id) {
        await refreshMe();
      }

      // Save ranch-level animal configuration (species/vocabulary/age bands)
      // NOTE: ranch-settings endpoint is scoped by active ranch context, so we only
      // attempt this when activeRanchId is present (i.e., editing an existing ranch).
      if (activeRanchId) {
        const speciesPayload = speciesPanels
          .map((p) => ({
            species: p.species.trim(),
            male_desc: p.male_desc.trim() || null,
            female_desc: p.female_desc.trim() || null,
            male_neut_desc: p.male_neut_desc.trim() || null,
            female_neut_desc: p.female_neut_desc.trim() || null,
            baby_desc: p.baby_desc.trim() || null,
          }))
          .filter((p) => p.species.length > 0);

        const ageBandsPayload = speciesPanels
          .flatMap((p) =>
            (p.age_bands || []).map((b) => ({
              species: p.species.trim(),
              label: b.label.trim(),
              teeth_desc: b.teeth_desc.trim() || null,
              min_months: b.min_months === "" ? null : Number(b.min_months),
              max_months: b.max_months === "" ? null : Number(b.max_months),
              sort_order: b.sort_order,
            }))
          )
          .filter((b) => b.species.length > 0);

        await apiPutJson(`/ranch-settings`, {
          species: speciesPayload,
          age_bands: ageBandsPayload,
        });
      }
    } catch (err: unknown) {
      console.error("Save failed:", err);
      setSaveSuccess(false);
      const msg = err instanceof Error && err.message.trim() ? err.message : "Save failed.";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || loadingRanch || loadingRanchSettings || meLoading;

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-6">
      <h1 className="text-3xl font-bold">Ranch Settings</h1>

      {meError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          <strong>Profile error:</strong> {meError}
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-800">
          <strong>Data saved successfully!</strong>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          <strong>Save failed:</strong> {errorMsg}
        </div>
      )}

      {(meLoading || loadingRanch) && (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-stone-700">
          Loading…
        </div>
      )}

      {/* Ranch Identity */}
      <section className="space-y-4 border p-6 rounded-lg">
        <h2 className="text-xl font-semibold">Ranch Identity</h2>

        <div>
          <Label>Ranch Name *</Label>
          <Input
            placeholder="Lazy S Ranch"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            required
            disabled={disabled}
          />
        </div>

        <div>
          <Label>DBA (optional)</Label>
          <Input
            placeholder="Doing business as..."
            value={dba}
            onChange={(e) => {
              setDba(e.target.value);
              markDirty();
            }}
            disabled={disabled}
          />
        </div>

        <div>
          <Label>Ranch Phone Number *</Label>
          <Input
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              markDirty();
            }}
            required
            disabled={disabled}
          />
        </div>
      </section>

      {/* Physical Address */}
      <section className="space-y-4 border p-6 rounded-lg">
        <h2 className="text-xl font-semibold">Physical Address *</h2>

        <div>
          <Label>Street</Label>
          <Input
            value={physStreet}
            onChange={(e) => {
              setPhysStreet(e.target.value);
              markDirty();
            }}
            required
            disabled={disabled}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>City</Label>
            <Input
              value={physCity}
              onChange={(e) => {
                setPhysCity(e.target.value);
                markDirty();
              }}
              required
              disabled={disabled}
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={physState}
              onChange={(e) => {
                setPhysState(e.target.value);
                markDirty();
              }}
              required
              disabled={disabled}
            />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input
              value={physZip}
              onChange={(e) => {
                setPhysZip(e.target.value);
                markDirty();
              }}
              required
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* Mailing Address */}
      <section className="space-y-4 border p-6 rounded-lg">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={sameAsPhysical}
            onCheckedChange={(val) => handleSameAsPhysical(Boolean(val))}
            disabled={disabled}
          />
          <Label>Mailing address same as physical</Label>
        </div>

        <h2 className="text-xl font-semibold">Mailing Address</h2>

        <div>
          <Label>Street</Label>
          <Input
            value={mailStreet}
            onChange={(e) => {
              setMailStreet(e.target.value);
              markDirty();
            }}
            disabled={disabled || sameAsPhysical}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>City</Label>
            <Input
              value={mailCity}
              onChange={(e) => {
                setMailCity(e.target.value);
                markDirty();
              }}
              disabled={disabled || sameAsPhysical}
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={mailState}
              onChange={(e) => {
                setMailState(e.target.value);
                markDirty();
              }}
              disabled={disabled || sameAsPhysical}
            />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input
              value={mailZip}
              onChange={(e) => {
                setMailZip(e.target.value);
                markDirty();
              }}
              disabled={disabled || sameAsPhysical}
            />
          </div>
        </div>
      </section>

      {/* Branding */}
      <section className="space-y-4 border p-6 rounded-lg">
        <h2 className="text-xl font-semibold">Branding</h2>

        <div>
          <Label>Ranch Brand (optional)</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setBrandImage(e.target.files?.[0] || null);
              markDirty();
            }}
            disabled={disabled}
          />
        </div>

        <div>
          <Label>Business Logo (optional)</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setLogoImage(e.target.files?.[0] || null);
              markDirty();
            }}
            disabled={disabled}
          />
        </div>

      {/* Animals Raised + Vocabulary + Age Bands (per species) */}
      <section className="space-y-4 border p-6 rounded-lg">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Animals Raised</h2>
          <Button
            variant="outline"
            onClick={addSpeciesPanel}
            disabled={disabled || !activeRanchId}
            aria-label="Add Species"
          >
            Add Species
          </Button>
        </div>

        {!activeRanchId && (
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-stone-700">
            Save your ranch first, then you can add species, vocabulary, and age bands.
          </div>
        )}

        {activeRanchId && loadingRanchSettings && (
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-stone-700">
            Loading species settings…
          </div>
        )}

        {activeRanchId && !loadingRanchSettings && speciesPanels.length === 0 && (
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-stone-700">
            No species added yet. Click <strong>Add Species</strong> to get started.
          </div>
        )}

        {speciesPanels.map((panel, i) => (
          <div key={panel.panel_id} className="rounded-lg border p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Label>Species *</Label>
<Select
  value={panel.species_choice}
  onValueChange={(v) => {
    markDirty();

    if (v === OTHER_SPECIES_VALUE) {
      // Switching to Other: clear species until user types it
      updateSpeciesPanel(i, {
        species_choice: OTHER_SPECIES_VALUE,
        species_other: "",
        species: "",
        // reset per-species fields when changing species
        male_desc: "",
        female_desc: "",
        male_neut_desc: "",
        female_neut_desc: "",
        baby_desc: "",
        age_bands: [],
      });
      return;
    }

    
// Switching to a standard species option: populate standard vocab + default age bands
const species = v as SpeciesOption;
const vocab = STANDARD_VOCAB_BY_SPECIES[species];

updateSpeciesPanel(i, {
  species_choice: species,
  species_other: "",
  species: species as string,
  male_desc: vocab.male_desc,
  female_desc: vocab.female_desc,
  male_neut_desc: vocab.male_neut_desc,
  female_neut_desc: vocab.female_neut_desc,
  baby_desc: vocab.baby_desc,
});
}}
  disabled={disabled}
>
  <SelectTrigger aria-label="Species">
    <SelectValue placeholder="Select species" />
  </SelectTrigger>
  <SelectContent>
    {SPECIES_OPTIONS.map((s) => (
      <SelectItem key={s} value={s}>
        {s}
      </SelectItem>
    ))}
    <SelectItem value={OTHER_SPECIES_VALUE}>Other</SelectItem>
  </SelectContent>
</Select>

{panel.species_choice === OTHER_SPECIES_VALUE && (
  <div className="mt-2">
    <Label>Other species *</Label>
    <Input
      placeholder="Enter species"
      value={panel.species_other}
      onChange={(e) => {
        markDirty();
        updateSpeciesPanel(i, {
          species_other: e.target.value,
          species: e.target.value,
        });
      }}
      disabled={disabled}
      aria-label="Other species"
    />
  </div>
)}              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => removeSpeciesPanel(i)}
                disabled={disabled}
                aria-label={`Remove species panel ${i + 1}`}
              >
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Male term</Label>
                <Input
                  placeholder="Buck"
                  value={panel.male_desc}
                  onChange={(e) => updateSpeciesPanel(i, { male_desc: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label>Female term</Label>
                <Input
                  placeholder="Doe"
                  value={panel.female_desc}
                  onChange={(e) => updateSpeciesPanel(i, { female_desc: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label>Neutered male term</Label>
                <Input
                  placeholder="Wether"
                  value={panel.male_neut_desc}
                  onChange={(e) => updateSpeciesPanel(i, { male_neut_desc: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label>Neutered female term</Label>
                <Input
                  placeholder="(optional)"
                  value={panel.female_neut_desc}
                  onChange={(e) => updateSpeciesPanel(i, { female_neut_desc: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Baby term (optional)</Label>
                <Input
                  placeholder="Kid"
                  value={panel.baby_desc}
                  onChange={(e) => updateSpeciesPanel(i, { baby_desc: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Age Bands</h3>
                <Button
                  variant="outline"
                  onClick={() => addAgeBandRow(i)}
                  disabled={disabled || panel.species.trim().length === 0}
                  aria-label={`Add age band for species ${panel.species || "new"}`}
                >
                  Add Age Band
                </Button>
              </div>

              <div className="rounded-lg border bg-white">
                <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm font-semibold">
                  <div className="col-span-2">Min (mo)</div>
                  <div className="col-span-2">Max (mo)</div>
                  <div className="col-span-3">Label</div>
                  <div className="col-span-3">Teeth</div>
                  <div className="col-span-2 text-right">Action</div>
                </div>

                {panel.age_bands.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-stone-700">
                    No age bands yet. After saving, default bands may be generated for this species.
                  </div>
                ) : (
                  panel.age_bands
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((band) => (
                      <div key={band.id ?? band.client_id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-b-0">
                        <div className="col-span-2">
                          <Input
                            value={band.min_months}
                            onChange={(e) => updateAgeBandRow(i, (band.id ?? band.client_id), { min_months: e.target.value })}
                            disabled={disabled}
                            aria-label="Minimum months"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            value={band.max_months}
                            onChange={(e) => updateAgeBandRow(i, (band.id ?? band.client_id), { max_months: e.target.value })}
                            disabled={disabled}
                            aria-label="Maximum months"
                          />
                        </div>
                        <div className="col-span-3">
                          <Input
                            value={band.label}
                            onChange={(e) => updateAgeBandRow(i, (band.id ?? band.client_id), { label: e.target.value })}
                            disabled={disabled}
                            aria-label="Age band label"
                          />
                        </div>
                        <div className="col-span-3">
                          <Input
                            value={band.teeth_desc}
                            onChange={(e) => updateAgeBandRow(i, (band.id ?? band.client_id), { teeth_desc: e.target.value })}
                            disabled={disabled}
                            aria-label="Teeth description"
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeAgeBandRow(i, (band.id ?? band.client_id))}
                            disabled={disabled}
                            aria-label="Remove age band"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                )}
              </div>

              <div className="text-sm text-stone-600">
                Tip: Leave Max blank for “no upper bound”. Age bands cannot overlap for the same species.
              </div>
            </div>
          </div>
        ))}
      </section>

      </section>

      <Button className="w-full" onClick={handleSubmit} disabled={disabled}>
        {saving ? "Saving…" : saveSuccess ? "Saved ✓" : "Save Ranch"}
      </Button>
    </div>
  );
}
