import { useEffect, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes";
import { apiGet, apiPost, apiPostForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const medicationFormatOptions = [
  "pill",
  "liquid",
  "powder",
  "paste",
  "injectable",
  "topical",
  "other",
] as const;

const concentrationUnitOptions = [
  "mg",
  "g",
  "mcg",
  "%",
  "mg/mL",
  "IU/mL",
  "mEq/mL",
  "other",
] as const;

const medicationPurposeOptions = [
  "VACCINATION",
  "ANTIBIOTIC",
  "DEWORMER",
  "ANTI_INFLAMMATORY",
  "VITAMIN_SUPPLEMENT",
  "TOPICAL_WOUND",
  "OTHER",
] as const;

const dosingBasisOptions = [
  { value: "PER_HEAD", label: "Per Head" },
  { value: "PER_WEIGHT", label: "Per Weight" },
] as const;

const doseWeightUnitOptions = ["lb", "kg"] as const;

const dosingPerUnitOptions = [
  { value: "animal", label: "Per Animal" },
  { value: "lb", label: "Pounds (lb)" },
  { value: "kg", label: "Kilograms (kg)" },
] as const;

type ImagePurpose = "label" | "insert" | "misc";

type LocalImage = {
  id: string;
  file: File;
  url: string;
  originalName: string;
  mimeType?: string;
  sizeBytes?: number;
};

const FormSchema = z.object({
  chemicalName: z.string().min(1, "Chemical name is required"),
  format: z.string().min(1, "Format is required"),
  concentrationValue: z.string().optional(),
  concentrationUnit: z.string().optional(),
  manufacturerName: z.string().min(1, "Manufacturer is required"),
  brandName: z.string().min(1, "Brand name is required"),
  purpose: z.string().min(1, "Purpose is required"),
  dosingBasis: z.string().optional(),
  doseValue: z.string().optional(),
  doseUnit: z.string().optional(),
  doseWeightUnit: z.string().optional(),
  onLabelDoseText: z.string().optional(),
  onLabelDoseAmount: z.string().optional(),
  onLabelDoseUnit: z.string().optional(),
  onLabelPerAmount: z.string().optional(),
  onLabelPerUnit: z.string().optional(),
  applicableSpecies: z.array(z.string()).optional(),

  startDate: z.string().min(10, "Start date is required"),
});

type FormValues = z.input<typeof FormSchema>;

type SpeciesStandardDraft = {
  usesOffLabel: boolean;
  standardDoseAmount: string;
  standardDoseUnit: string;
  standardPerAmount: string;
  standardPerUnit: string;
};

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function bytesToNiceSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function nicePurposeLabel(purpose: ImagePurpose): string {
  switch (purpose) {
    case "label":
      return "Label photos";
    case "insert":
      return "Insert / documentation";
    case "misc":
      return "Misc photos";
    default:
      return "Photos";
  }
}

function looksPositiveNumber(value?: string): boolean {
  const s = String(value ?? "").trim();
  if (!s.length) return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function buildDoseText(amount: string, unit: string, perAmount: string, perUnit: string): string {
  return `${amount} ${unit} per ${perAmount} ${perUnit}`;
}

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function defaultSpeciesStandardDraft(defaultDoseUnit?: string): SpeciesStandardDraft {
  return {
    usesOffLabel: false,
    standardDoseAmount: "",
    standardDoseUnit: defaultDoseUnit && defaultDoseUnit.trim().length > 0 ? defaultDoseUnit.trim() : "mL",
    standardPerAmount: "",
    standardPerUnit: "lb",
  };
}

function LocalImageCarousel({
  title,
  images,
  onRemove,
}: {
  title: string;
  images: LocalImage[];
  onRemove: (id: string) => void;
}) {
  const [idx, setIdx] = useState(0);

  if (!images || images.length === 0) {
    return <div className="text-sm text-muted-foreground">No photos selected.</div>;
  }

  const safeIdx = Math.min(Math.max(idx, 0), images.length - 1);
  const active = images[safeIdx];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {images.length} photo{images.length === 1 ? "" : "s"}
            {active?.sizeBytes ? ` • ${bytesToNiceSize(active.sizeBytes)}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIdx((p) => Math.max(p - 1, 0))}
            disabled={safeIdx <= 0}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIdx((p) => Math.min(p + 1, images.length - 1))}
            disabled={safeIdx >= images.length - 1}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}
          >
            Open
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onRemove(active.id)}
          >
            Remove
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="w-full aspect-video bg-stone-50 flex items-center justify-center">
          <img
            src={active.url}
            alt={active.originalName || "Medication image"}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <div className="border-t p-2 overflow-x-auto">
          <div className="flex gap-2">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setIdx(i)}
                className={[
                  "h-14 w-14 rounded-md overflow-hidden border",
                  i === safeIdx ? "ring-2 ring-stone-400" : "hover:border-stone-400",
                ].join(" ")}
                title={img.originalName || "photo"}
              >
                <img
                  src={img.url}
                  alt={img.originalName || "thumb"}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreateStandardMedicationsPage() {
  const navigate = useNavigate();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [imagesByPurpose, setImagesByPurpose] = useState<Record<ImagePurpose, LocalImage[]>>({
    label: [],
    insert: [],
    misc: [],
  });
  const [ranchSpeciesOptions, setRanchSpeciesOptions] = useState<string[]>([]);
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [speciesLoadError, setSpeciesLoadError] = useState<string | null>(null);
  const [speciesStandards, setSpeciesStandards] = useState<Record<string, SpeciesStandardDraft>>({});
  const [showOnLabelMath, setShowOnLabelMath] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      chemicalName: "",
      format: "pill",
      concentrationValue: "",
      concentrationUnit: "mg",
      manufacturerName: "",
      brandName: "",
      purpose: "OTHER",
      dosingBasis: "",
      doseValue: "",
      doseUnit: "",
      doseWeightUnit: "",
      onLabelDoseText: "",
      onLabelDoseAmount: "",
      onLabelDoseUnit: "",
      onLabelPerAmount: "",
      onLabelPerUnit: "",
      applicableSpecies: [],
      startDate: todayIsoDate(),
    },
    mode: "onBlur",
  });

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId, [ranchLoading, activeRanchId]);

  const totalImages = useMemo(() => {
    return Object.values(imagesByPurpose).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
  }, [imagesByPurpose]);
  const selectedSpecies = form.watch("applicableSpecies") ?? [];
  const selectedDosingBasis = form.watch("dosingBasis") || "";

  useEffect(() => {
    const hasOnLabelErrors =
      !!form.formState.errors.onLabelDoseAmount ||
      !!form.formState.errors.onLabelDoseUnit ||
      !!form.formState.errors.onLabelPerAmount ||
      !!form.formState.errors.onLabelPerUnit;
    if (hasOnLabelErrors) setShowOnLabelMath(true);
  }, [
    form.formState.errors.onLabelDoseAmount,
    form.formState.errors.onLabelDoseUnit,
    form.formState.errors.onLabelPerAmount,
    form.formState.errors.onLabelPerUnit,
  ]);

  useEffect(() => {
    if (!activeRanchId) return;
    let alive = true;

    const loadSpecies = async () => {
      setSpeciesLoading(true);
      setSpeciesLoadError(null);
      try {
        const [directRes, settingsRes, herdsRes, animalsRes] = await Promise.allSettled([
          apiGet<{ species?: string[] }>(`/medications/species-options`),
          apiGet<{ species?: Array<{ species?: string }> }>(`/ranch-settings`),
          apiGet<Array<{ species?: string | null }> | { herds?: Array<{ species?: string | null }> }>(`/herds`),
          apiGet<{ animals?: Array<{ species?: string | null }> }>(`/animals`),
        ]);

        const directSpecies =
          directRes.status === "fulfilled" && Array.isArray(directRes.value?.species)
            ? directRes.value.species.map((s) => String(s ?? "").trim()).filter((s) => s.length > 0)
            : [];

        const settingsSpecies =
          settingsRes.status === "fulfilled" && Array.isArray(settingsRes.value?.species)
            ? settingsRes.value.species
                .map((s) => (s?.species ?? "").trim())
                .filter((s): s is string => s.length > 0)
            : [];

        const herdRows =
          herdsRes.status === "fulfilled"
            ? Array.isArray(herdsRes.value)
              ? herdsRes.value
              : Array.isArray(herdsRes.value?.herds)
                ? herdsRes.value.herds
                : []
            : [];

        const herdSpecies =
          herdRows
            .map((h) => (h?.species ?? "").trim())
            .filter((s): s is string => s.length > 0);

        const animalSpecies =
          animalsRes.status === "fulfilled" && Array.isArray(animalsRes.value?.animals)
            ? animalsRes.value.animals
                .map((a) => (a?.species ?? "").trim())
                .filter((s): s is string => s.length > 0)
            : [];

        const values = [...directSpecies, ...settingsSpecies, ...herdSpecies, ...animalSpecies]
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.toLowerCase() !== "mixed");

        if (!alive) return;
        const deduped = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
        setRanchSpeciesOptions(deduped);

        const allFailed =
          directRes.status === "rejected" &&
          settingsRes.status === "rejected" &&
          herdsRes.status === "rejected" &&
          animalsRes.status === "rejected";

        if (allFailed) {
          setSpeciesLoadError("Unable to load species right now. Refresh the page, then try again.");
        } else if (deduped.length === 0) {
          setSpeciesLoadError(
            "No species were returned from Ranch Settings, Herds, or Animal Inventory for the active ranch."
          );
        } else {
          setSpeciesLoadError(null);
        }
      } catch (err: unknown) {
        if (alive) {
          setRanchSpeciesOptions([]);
          const detail = err instanceof Error && err.message.trim() ? ` (${err.message.trim()})` : "";
          setSpeciesLoadError(`Unable to load species right now. Refresh the page and try again.${detail}`);
        }
      } finally {
        if (alive) setSpeciesLoading(false);
      }
    };

    void loadSpecies();
    return () => {
      alive = false;
    };
  }, [activeRanchId]);

  function addImages(purpose: ImagePurpose, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const next: LocalImage[] = [];
    for (const file of Array.from(fileList)) {
      const id = crypto.randomUUID();
      next.push({
        id,
        file,
        url: URL.createObjectURL(file),
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    setImagesByPurpose((prev) => ({
      ...prev,
      [purpose]: [...prev[purpose], ...next],
    }));
  }

  function removeImage(purpose: ImagePurpose, id: string) {
    setImagesByPurpose((prev) => {
      const img = prev[purpose].find((x) => x.id === id);
      if (img?.url) URL.revokeObjectURL(img.url);

      return {
        ...prev,
        [purpose]: prev[purpose].filter((x) => x.id !== id),
      };
    });
  }

  function toggleApplicableSpecies(species: string, checked: boolean) {
    const next = new Set(form.getValues("applicableSpecies") ?? []);
    if (checked) next.add(species);
    else next.delete(species);
    form.setValue("applicableSpecies", Array.from(next), { shouldValidate: true });
    setSpeciesStandards((prev) => {
      const nextDrafts = { ...prev };
      if (checked) {
        nextDrafts[species] = nextDrafts[species] ?? defaultSpeciesStandardDraft(form.getValues("concentrationUnit"));
      } else {
        delete nextDrafts[species];
      }
      return nextDrafts;
    });
  }

  function updateSpeciesStandard(species: string, patch: Partial<SpeciesStandardDraft>) {
    setSpeciesStandards((prev) => ({
      ...prev,
      [species]: {
        ...(prev[species] ?? defaultSpeciesStandardDraft(form.getValues("concentrationUnit"))),
        ...patch,
      },
    }));
  }

  const onSubmit: SubmitHandler<FormValues> = async (v) => {
    if (!activeRanchId) {
      form.setError("chemicalName", {
        type: "server",
        message: "No active ranch selected. Please select a ranch and try again.",
      });
      return;
    }

    const parsed = FormSchema.parse(v);

    const hasAnyOnLabelMath =
      String(parsed.onLabelDoseAmount ?? "").trim().length > 0 ||
      String(parsed.onLabelDoseUnit ?? "").trim().length > 0 ||
      String(parsed.onLabelPerAmount ?? "").trim().length > 0 ||
      String(parsed.onLabelPerUnit ?? "").trim().length > 0;
    const hasAllOnLabelMath =
      String(parsed.onLabelDoseAmount ?? "").trim().length > 0 &&
      String(parsed.onLabelDoseUnit ?? "").trim().length > 0 &&
      String(parsed.onLabelPerAmount ?? "").trim().length > 0 &&
      String(parsed.onLabelPerUnit ?? "").trim().length > 0;

    if (hasAnyOnLabelMath && !hasAllOnLabelMath) {
      form.setError("onLabelDoseAmount", {
        type: "validate",
        message: "If using on-label math, complete all four on-label fields.",
      });
      return;
    }
    if (hasAllOnLabelMath) {
      if (!looksPositiveNumber(parsed.onLabelDoseAmount)) {
        form.setError("onLabelDoseAmount", { type: "validate", message: "Enter a positive number." });
        return;
      }
      if (!looksPositiveNumber(parsed.onLabelPerAmount)) {
        form.setError("onLabelPerAmount", { type: "validate", message: "Enter a positive number." });
        return;
      }
    }

    const purpose = parsed.purpose.trim();
    const dosingBasisValue = (parsed.dosingBasis ?? "").trim();
    const dosingBasis = dosingBasisValue === "PER_HEAD" || dosingBasisValue === "PER_WEIGHT" ? dosingBasisValue : null;
    const doseValue = (parsed.doseValue ?? "").trim();
    const doseUnit = (parsed.doseUnit ?? "").trim();
    const doseWeightUnit = (parsed.doseWeightUnit ?? "").trim();
    const hasAnyDosingInput =
      !!dosingBasis || doseValue.length > 0 || doseUnit.length > 0 || doseWeightUnit.length > 0;

    if (hasAnyDosingInput && !dosingBasis) {
      form.setError("dosingBasis", {
        type: "validate",
        message: "Select a dosing basis or clear dosing fields.",
      });
      return;
    }
    if (dosingBasis) {
      if (!looksPositiveNumber(doseValue)) {
        form.setError("doseValue", { type: "validate", message: "Dose value must be a positive number." });
        return;
      }
      if (!doseUnit.length) {
        form.setError("doseUnit", { type: "validate", message: "Dose unit is required." });
        return;
      }
      if (dosingBasis === "PER_WEIGHT" && !doseWeightUnit.length) {
        form.setError("doseWeightUnit", { type: "validate", message: "Weight unit is required for per-weight dosing." });
        return;
      }
      if (dosingBasis === "PER_HEAD" && doseWeightUnit.length) {
        form.setError("doseWeightUnit", { type: "validate", message: "Weight unit only applies to per-weight dosing." });
        return;
      }
    }

    const concentrationValue =
      parsed.concentrationValue && parsed.concentrationValue.trim().length > 0
        ? parsed.concentrationValue.trim()
        : null;

    const concentrationUnit =
      concentrationValue && parsed.concentrationUnit && parsed.concentrationUnit.trim().length > 0
        ? parsed.concentrationUnit.trim()
        : null;

    const applicableSpecies = (parsed.applicableSpecies ?? []).map((s) => s.trim()).filter(Boolean);
    if (applicableSpecies.length === 0) {
      form.setError("applicableSpecies", {
        type: "validate",
        message: "Select at least one species for this medication.",
      });
      return;
    }

    const speciesStandardsPayload: Array<{
      species: string;
      usesOffLabel: boolean;
      standardDoseText: string;
      standardDoseAmount: string;
      standardDoseUnit: string;
      standardPerAmount: string;
      standardPerUnit: string;
      startDate: string;
    }> = [];

    for (const species of applicableSpecies) {
      const draft = speciesStandards[species] ?? defaultSpeciesStandardDraft(concentrationUnit);
      if (!looksPositiveNumber(draft.standardDoseAmount)) {
        form.setError("applicableSpecies", {
          type: "validate",
          message: `Enter a valid dose amount for ${species}.`,
        });
        return;
      }
      if (!looksPositiveNumber(draft.standardPerAmount)) {
        form.setError("applicableSpecies", {
          type: "validate",
          message: `Enter a valid per-amount value for ${species}.`,
        });
        return;
      }
      if (!draft.standardDoseUnit.trim()) {
        form.setError("applicableSpecies", {
          type: "validate",
          message: `Dose unit is required for ${species}.`,
        });
        return;
      }
      if (!draft.standardPerUnit.trim()) {
        form.setError("applicableSpecies", {
          type: "validate",
          message: `Per unit is required for ${species}.`,
        });
        return;
      }

      speciesStandardsPayload.push({
        species,
        usesOffLabel: draft.usesOffLabel,
        standardDoseText: buildDoseText(
          draft.standardDoseAmount.trim(),
          draft.standardDoseUnit.trim(),
          draft.standardPerAmount.trim(),
          draft.standardPerUnit.trim()
        ),
        standardDoseAmount: draft.standardDoseAmount.trim(),
        standardDoseUnit: draft.standardDoseUnit.trim(),
        standardPerAmount: draft.standardPerAmount.trim(),
        standardPerUnit: draft.standardPerUnit.trim(),
        startDate: parsed.startDate,
      });
    }

    const standard = speciesStandardsPayload[0];
    const onLabelDoseText =
      parsed.onLabelDoseText && parsed.onLabelDoseText.trim().length > 0
        ? parsed.onLabelDoseText.trim()
        : hasAllOnLabelMath
          ? buildDoseText(
              parsed.onLabelDoseAmount!.trim(),
              parsed.onLabelDoseUnit!.trim(),
              parsed.onLabelPerAmount!.trim(),
              parsed.onLabelPerUnit!.trim()
            )
          : null;

    const hasAnyImages = totalImages > 0;

    try {
      if (!hasAnyImages) {
        await apiPost("/standard-medications", {
          chemicalName: parsed.chemicalName.trim(),
          format: parsed.format.trim(),
          concentrationValue,
          concentrationUnit,
          manufacturerName: parsed.manufacturerName.trim(),
          brandName: parsed.brandName.trim(),
          purpose,
          dosingBasis,
          doseValue: dosingBasis ? doseValue : null,
          doseUnit: dosingBasis ? doseUnit : null,
          doseWeightUnit: dosingBasis === "PER_WEIGHT" ? doseWeightUnit : null,
          onLabelDoseText,
          onLabelDoseAmount: hasAllOnLabelMath ? parsed.onLabelDoseAmount!.trim() : null,
          onLabelDoseUnit: hasAllOnLabelMath ? parsed.onLabelDoseUnit!.trim() : null,
          onLabelPerAmount: hasAllOnLabelMath ? parsed.onLabelPerAmount!.trim() : null,
          onLabelPerUnit: hasAllOnLabelMath ? parsed.onLabelPerUnit!.trim() : null,
          applicableSpecies,
          standard,
          speciesStandards: speciesStandardsPayload,
        });

        navigate(ROUTES.supplies.medications);
        return;
      }

      const fd = new FormData();
      fd.append("chemicalName", parsed.chemicalName.trim());
      fd.append("format", parsed.format.trim());
      if (concentrationValue) fd.append("concentrationValue", concentrationValue);
      if (concentrationUnit) fd.append("concentrationUnit", concentrationUnit);
      fd.append("manufacturerName", parsed.manufacturerName.trim());
      fd.append("brandName", parsed.brandName.trim());
      fd.append("purpose", purpose);
      if (dosingBasis) fd.append("dosingBasis", dosingBasis);
      if (dosingBasis && doseValue.length > 0) fd.append("doseValue", doseValue);
      if (dosingBasis && doseUnit.length > 0) fd.append("doseUnit", doseUnit);
      if (dosingBasis === "PER_WEIGHT" && doseWeightUnit.length > 0) {
        fd.append("doseWeightUnit", doseWeightUnit);
      }
      if (onLabelDoseText) fd.append("onLabelDoseText", onLabelDoseText);
      if (hasAllOnLabelMath) {
        fd.append("onLabelDoseAmount", parsed.onLabelDoseAmount!.trim());
        fd.append("onLabelDoseUnit", parsed.onLabelDoseUnit!.trim());
        fd.append("onLabelPerAmount", parsed.onLabelPerAmount!.trim());
        fd.append("onLabelPerUnit", parsed.onLabelPerUnit!.trim());
      }
      fd.append("applicableSpecies", JSON.stringify(applicableSpecies));
      fd.append("standard", JSON.stringify(standard));
      fd.append("speciesStandards", JSON.stringify(speciesStandardsPayload));

      for (const img of imagesByPurpose.label) fd.append("label", img.file, img.originalName);
      for (const img of imagesByPurpose.insert) fd.append("insert", img.file, img.originalName);
      for (const img of imagesByPurpose.misc) fd.append("misc", img.file, img.originalName);

      await apiPostForm("/standard-medications", fd);
      navigate(ROUTES.supplies.medications);
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.trim() ? err.message : "Failed to create standard medication";
      form.setError("chemicalName", { type: "server", message: msg });
    }
  };

  useEffect(() => {
    return () => {
      for (const arr of Object.values(imagesByPurpose)) {
        for (const img of arr) {
          if (img.url) URL.revokeObjectURL(img.url);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Create Standard Medication</h1>
          <p className="text-sm text-muted-foreground">
            Add a medication you typically buy. This feeds the purchase dropdown.
          </p>
        </div>

        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {!ranchLoading && !activeRanchId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No Ranch Selected</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-stone-700">
            Select a ranch to add standards.
          </CardContent>
        </Card>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medication Details</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chemicalName">Chemical name</Label>
              <Input id="chemicalName" {...form.register("chemicalName")} disabled={!canInteract} />
              {form.formState.errors.chemicalName?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.chemicalName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="formatSelect">Format</Label>
              <Select
                value={form.watch("format") || "pill"}
                onValueChange={(value) => form.setValue("format", value, { shouldValidate: true })}
                disabled={!canInteract}
              >
                <SelectTrigger id="formatSelect" aria-label="Medication format" title="Medication format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {medicationFormatOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.format?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.format.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="manufacturerName">Manufacturer</Label>
              <Input id="manufacturerName" {...form.register("manufacturerName")} disabled={!canInteract} />
              {form.formState.errors.manufacturerName?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.manufacturerName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="brandName">Brand name</Label>
              <Input id="brandName" {...form.register("brandName")} disabled={!canInteract} />
              {form.formState.errors.brandName?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.brandName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="concentrationValue">Concentration (optional)</Label>
              <Input id="concentrationValue" {...form.register("concentrationValue")} disabled={!canInteract} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="concentrationUnitSelect">Concentration unit (optional)</Label>
              <Select
                value={form.watch("concentrationUnit") || "mg"}
                onValueChange={(value) => form.setValue("concentrationUnit", value)}
                disabled={!canInteract}
              >
                <SelectTrigger
                  id="concentrationUnitSelect"
                  aria-label="Concentration unit"
                  title="Concentration unit"
                >
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {concentrationUnitOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purposeSelect">Purpose</Label>
              <Select
                value={form.watch("purpose") || "OTHER"}
                onValueChange={(value) => form.setValue("purpose", value, { shouldValidate: true })}
                disabled={!canInteract}
              >
                <SelectTrigger id="purposeSelect" aria-label="Medication purpose" title="Medication purpose">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  {medicationPurposeOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {formatEnumLabel(opt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.purpose?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.purpose.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dosingBasisSelect">Dosing basis (optional)</Label>
              <Select
                value={selectedDosingBasis || "NONE"}
                onValueChange={(value) => {
                  const next = value === "NONE" ? "" : value;
                  form.setValue("dosingBasis", next, { shouldValidate: true });
                  if (next === "PER_WEIGHT") {
                    const current = form.getValues("doseWeightUnit");
                    if (!current || !current.trim()) {
                      form.setValue("doseWeightUnit", "lb", { shouldValidate: true });
                    }
                  } else {
                    form.setValue("doseWeightUnit", "", { shouldValidate: true });
                  }
                }}
                disabled={!canInteract}
              >
                <SelectTrigger id="dosingBasisSelect" aria-label="Dosing basis" title="Dosing basis">
                  <SelectValue placeholder="Select dosing basis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Not set</SelectItem>
                  {dosingBasisOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.dosingBasis?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.dosingBasis.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="doseValue">Dose value (optional)</Label>
              <Input
                id="doseValue"
                {...form.register("doseValue")}
                disabled={!canInteract}
                placeholder="e.g. 2.5"
              />
              {form.formState.errors.doseValue?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.doseValue.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="doseUnit">Dose unit (optional)</Label>
              <Input
                id="doseUnit"
                {...form.register("doseUnit")}
                disabled={!canInteract}
                placeholder="e.g. mL"
              />
              {form.formState.errors.doseUnit?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.doseUnit.message}</p>
              )}
            </div>

            {selectedDosingBasis === "PER_WEIGHT" && (
              <div className="space-y-2">
                <Label htmlFor="doseWeightUnitSelect">Dose weight unit</Label>
                <Select
                  value={form.watch("doseWeightUnit") || "lb"}
                  onValueChange={(value) => form.setValue("doseWeightUnit", value, { shouldValidate: true })}
                  disabled={!canInteract}
                >
                  <SelectTrigger
                    id="doseWeightUnitSelect"
                    aria-label="Dose weight unit"
                    title="Dose weight unit"
                  >
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {doseWeightUnitOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.doseWeightUnit?.message && (
                  <p className="text-sm text-red-600">{form.formState.errors.doseWeightUnit.message}</p>
                )}
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <p className="text-xs text-muted-foreground">
                Dosing model is used for working-day medication quantity estimation. Leave it blank if unknown.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="onLabelDoseText">On-label dosing (optional)</Label>
              <Textarea
                id="onLabelDoseText"
                {...form.register("onLabelDoseText")}
                placeholder="Paste label dosing guidance here (freeform)."
                rows={4}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-3 md:col-span-2 rounded-md border border-dashed p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Advanced: Structured On-label Math</div>
                  <div className="text-xs text-muted-foreground">
                    Optional. Working Day estimates use the Dosing Model above.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOnLabelMath((prev) => !prev)}
                  disabled={!canInteract}
                >
                  {showOnLabelMath ? "Hide Fields" : "Add Structured Math"}
                </Button>
              </div>

              {showOnLabelMath && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="onLabelDoseAmount">On-label dose amount</Label>
                    <Input id="onLabelDoseAmount" {...form.register("onLabelDoseAmount")} disabled={!canInteract} />
                    {form.formState.errors.onLabelDoseAmount?.message && (
                      <p className="text-sm text-red-600">{form.formState.errors.onLabelDoseAmount.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onLabelDoseUnit">On-label dose unit</Label>
                    <Input id="onLabelDoseUnit" {...form.register("onLabelDoseUnit")} disabled={!canInteract} />
                    {form.formState.errors.onLabelDoseUnit?.message && (
                      <p className="text-sm text-red-600">{form.formState.errors.onLabelDoseUnit.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onLabelPerAmount">On-label per amount</Label>
                    <Input id="onLabelPerAmount" {...form.register("onLabelPerAmount")} disabled={!canInteract} />
                    {form.formState.errors.onLabelPerAmount?.message && (
                      <p className="text-sm text-red-600">{form.formState.errors.onLabelPerAmount.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onLabelPerUnit">On-label per unit</Label>
                    <Select
                      value={form.watch("onLabelPerUnit") || "NONE"}
                      onValueChange={(value) =>
                        form.setValue("onLabelPerUnit", value === "NONE" ? "" : value, {
                          shouldValidate: true,
                        })
                      }
                      disabled={!canInteract}
                    >
                      <SelectTrigger id="onLabelPerUnit" aria-label="On-label per unit" title="On-label per unit">
                        <SelectValue placeholder="Select per unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Not set</SelectItem>
                        {dosingPerUnitOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.onLabelPerUnit?.message && (
                      <p className="text-sm text-red-600">{form.formState.errors.onLabelPerUnit.message}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Applicable Species</Label>
              <div className="rounded-md border p-3 space-y-2">
                {speciesLoading && <div className="text-xs text-muted-foreground">Loading species...</div>}
                {!speciesLoading && !speciesLoadError && ranchSpeciesOptions.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    No species found yet. Add species in Ranch Settings or assign species to herds.
                  </div>
                )}
                {speciesLoadError && (
                  <div className="text-xs text-red-600">{speciesLoadError}</div>
                )}
                {!speciesLoading && ranchSpeciesOptions.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ranchSpeciesOptions.map((species) => {
                      const checked = selectedSpecies.includes(species);
                      return (
                        <label key={species} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              toggleApplicableSpecies(species, v === true);
                            }}
                            disabled={!canInteract}
                          />
                          <span>{species}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {form.formState.errors.applicableSpecies?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.applicableSpecies.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Photos (recommended)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-sm text-muted-foreground">
              Add label/insert photos to make it easy to confirm the right standard during purchase entry.
            </div>

            {(["label", "insert", "misc"] as ImagePurpose[]).map((purpose) => (
              <div key={purpose} className="space-y-3">
                {/* ✅ alignment fix: use a grid + top alignment on desktop */}
                <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
                  <div className="min-w-0">
                    <div className="font-medium md:whitespace-nowrap">{nicePurposeLabel(purpose)}</div>
                    <div className="text-xs text-muted-foreground">
                      {purpose === "label" && "Label photos (front/back, dose/concentration close-ups)."}
                      {purpose === "insert" && "Insert/documentation photos."}
                      {purpose === "misc" && "Any other useful reference photos."}
                    </div>
                  </div>

                  <div className="w-full">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      className="w-full"
                      aria-label={`${nicePurposeLabel(purpose)} upload`}
                      title={`${nicePurposeLabel(purpose)} upload`}
                      onChange={(e) => addImages(purpose, e.target.files)}
                      disabled={!canInteract}
                    />
                  </div>
                </div>

                <LocalImageCarousel
                  title={nicePurposeLabel(purpose)}
                  images={imagesByPurpose[purpose]}
                  onRemove={(id) => removeImage(purpose, id)}
                />
              </div>
            ))}

            <div className="text-xs text-muted-foreground">
              Total selected: <span className="font-medium">{totalImages}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Species Dosing Standards</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" {...form.register("startDate")} disabled={!canInteract} />
              {form.formState.errors.startDate?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.startDate.message}</p>
              )}
            </div>

            <div className="md:col-span-2 space-y-4">
              {selectedSpecies.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Select one or more species above, then set a dosing standard for each species.
                </div>
              ) : (
                selectedSpecies.map((species) => {
                  const draft = speciesStandards[species] ?? defaultSpeciesStandardDraft(form.getValues("concentrationUnit"));
                  return (
                    <div key={species} className="rounded-md border p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{species}</div>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={draft.usesOffLabel}
                            onCheckedChange={(v) =>
                              updateSpeciesStandard(species, { usesOffLabel: v === true })
                            }
                            disabled={!canInteract}
                          />
                          <span>Off-label practice</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Dose amount</Label>
                          <Input
                            value={draft.standardDoseAmount}
                            onChange={(e) => updateSpeciesStandard(species, { standardDoseAmount: e.target.value })}
                            disabled={!canInteract}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Dose unit</Label>
                          <Input
                            value={draft.standardDoseUnit}
                            placeholder={form.watch("concentrationUnit") || "mL"}
                            onChange={(e) => updateSpeciesStandard(species, { standardDoseUnit: e.target.value })}
                            disabled={!canInteract}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Per amount</Label>
                          <Input
                            value={draft.standardPerAmount}
                            onChange={(e) => updateSpeciesStandard(species, { standardPerAmount: e.target.value })}
                            disabled={!canInteract}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Per unit</Label>
                          <Select
                            value={draft.standardPerUnit || "lb"}
                            onValueChange={(value) => updateSpeciesStandard(species, { standardPerUnit: value })}
                            disabled={!canInteract}
                          >
                            <SelectTrigger aria-label={`Per unit for ${species}`} title={`Per unit for ${species}`}>
                              <SelectValue placeholder="Select per unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {dosingPerUnitOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Standard:{" "}
                        <span className="font-medium text-stone-700">
                          {buildDoseText(
                            draft.standardDoseAmount || "0",
                            draft.standardDoseUnit || (form.watch("concentrationUnit") || "unit"),
                            draft.standardPerAmount || "0",
                            draft.standardPerUnit || "animal"
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="text-xs text-muted-foreground">
                Dosing can differ by species. Each selected species must have a complete standard.
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(ROUTES.supplies.medications)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canInteract || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Save Standard"}
          </Button>
        </div>
      </form>
    </div>
  );
}
