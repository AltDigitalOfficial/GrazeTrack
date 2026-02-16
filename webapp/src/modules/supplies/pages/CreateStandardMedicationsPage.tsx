import { useEffect, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes";
import { apiPost, apiPostForm } from "@/lib/api";
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

const dosingPerUnitOptions = ["animal", "lb", "kg"] as const;

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
  onLabelDoseText: z.string().optional(),
  onLabelDoseAmount: z.string().optional(),
  onLabelDoseUnit: z.string().optional(),
  onLabelPerAmount: z.string().optional(),
  onLabelPerUnit: z.string().optional(),
  applicableSpecies: z.array(z.string()).optional(),

  standardDoseAmount: z.string().min(1, "Dose amount is required"),
  standardDoseUnit: z.string().min(1, "Dose unit is required"),
  standardPerAmount: z.string().min(1, "Per amount is required"),
  standardPerUnit: z.string().min(1, "Per unit is required"),
  startDate: z.string().min(10, "Start date is required"),
  usesOffLabel: z.boolean().optional(),
});

type FormValues = z.input<typeof FormSchema>;

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

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      chemicalName: "",
      format: "pill",
      concentrationValue: "",
      concentrationUnit: "mg",
      manufacturerName: "",
      brandName: "",
      onLabelDoseText: "",
      onLabelDoseAmount: "",
      onLabelDoseUnit: "mL",
      onLabelPerAmount: "",
      onLabelPerUnit: "lb",
      applicableSpecies: [],
      standardDoseAmount: "",
      standardDoseUnit: "mL",
      standardPerAmount: "",
      standardPerUnit: "lb",
      startDate: todayIsoDate(),
      usesOffLabel: false,
    },
    mode: "onBlur",
  });

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId, [ranchLoading, activeRanchId]);

  const totalImages = useMemo(() => {
    return Object.values(imagesByPurpose).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
  }, [imagesByPurpose]);

  useEffect(() => {
    if (!activeRanchId) return;
    let alive = true;

    const loadSpecies = async () => {
      setSpeciesLoading(true);
      try {
        const rs = await apiGet<{ species?: Array<{ species?: string }> }>(
          `/ranches/${encodeURIComponent(activeRanchId)}/settings`
        );
        if (!alive) return;
        const values = Array.isArray(rs?.species)
          ? rs.species
              .map((s) => (s?.species ?? "").trim())
              .filter((s): s is string => s.length > 0)
          : [];
        setRanchSpeciesOptions(Array.from(new Set(values)).sort((a, b) => a.localeCompare(b)));
      } catch {
        if (alive) setRanchSpeciesOptions([]);
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

  const onSubmit: SubmitHandler<FormValues> = async (v) => {
    if (!activeRanchId) {
      form.setError("chemicalName", {
        type: "server",
        message: "No active ranch selected. Please select a ranch and try again.",
      });
      return;
    }

    const parsed = FormSchema.parse(v);

    if (!looksPositiveNumber(parsed.standardDoseAmount)) {
      form.setError("standardDoseAmount", { type: "validate", message: "Enter a positive number." });
      return;
    }
    if (!looksPositiveNumber(parsed.standardPerAmount)) {
      form.setError("standardPerAmount", { type: "validate", message: "Enter a positive number." });
      return;
    }

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

    const concentrationValue =
      parsed.concentrationValue && parsed.concentrationValue.trim().length > 0
        ? parsed.concentrationValue.trim()
        : null;

    const concentrationUnit =
      concentrationValue && parsed.concentrationUnit && parsed.concentrationUnit.trim().length > 0
        ? parsed.concentrationUnit.trim()
        : null;

    const standard = {
      usesOffLabel: Boolean(parsed.usesOffLabel),
      standardDoseText: buildDoseText(
        parsed.standardDoseAmount.trim(),
        parsed.standardDoseUnit!.trim(),
        parsed.standardPerAmount.trim(),
        parsed.standardPerUnit!.trim()
      ),
      standardDoseAmount: parsed.standardDoseAmount.trim(),
      standardDoseUnit: parsed.standardDoseUnit!.trim(),
      standardPerAmount: parsed.standardPerAmount.trim(),
      standardPerUnit: parsed.standardPerUnit!.trim(),
      startDate: parsed.startDate,
    };

    const applicableSpecies = (parsed.applicableSpecies ?? []).map((s) => s.trim()).filter(Boolean);
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
          onLabelDoseText,
          onLabelDoseAmount: hasAllOnLabelMath ? parsed.onLabelDoseAmount!.trim() : null,
          onLabelDoseUnit: hasAllOnLabelMath ? parsed.onLabelDoseUnit!.trim() : null,
          onLabelPerAmount: hasAllOnLabelMath ? parsed.onLabelPerAmount!.trim() : null,
          onLabelPerUnit: hasAllOnLabelMath ? parsed.onLabelPerUnit!.trim() : null,
          applicableSpecies,
          standard,
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
      if (onLabelDoseText) fd.append("onLabelDoseText", onLabelDoseText);
      if (hasAllOnLabelMath) {
        fd.append("onLabelDoseAmount", parsed.onLabelDoseAmount!.trim());
        fd.append("onLabelDoseUnit", parsed.onLabelDoseUnit!.trim());
        fd.append("onLabelPerAmount", parsed.onLabelPerAmount!.trim());
        fd.append("onLabelPerUnit", parsed.onLabelPerUnit!.trim());
      }
      fd.append("applicableSpecies", JSON.stringify(applicableSpecies));
      fd.append("standard", JSON.stringify(standard));

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

            <div className="space-y-2">
              <Label htmlFor="onLabelDoseAmount">On-label dose amount (optional)</Label>
              <Input id="onLabelDoseAmount" {...form.register("onLabelDoseAmount")} disabled={!canInteract} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onLabelDoseUnit">On-label dose unit (optional)</Label>
              <Input id="onLabelDoseUnit" {...form.register("onLabelDoseUnit")} disabled={!canInteract} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onLabelPerAmount">On-label per amount (optional)</Label>
              <Input id="onLabelPerAmount" {...form.register("onLabelPerAmount")} disabled={!canInteract} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onLabelPerUnit">On-label per unit (optional)</Label>
              <Select
                value={form.watch("onLabelPerUnit") || "lb"}
                onValueChange={(value) => form.setValue("onLabelPerUnit", value, { shouldValidate: true })}
                disabled={!canInteract}
              >
                <SelectTrigger id="onLabelPerUnit" aria-label="On-label per unit" title="On-label per unit">
                  <SelectValue placeholder="Select per unit" />
                </SelectTrigger>
                <SelectContent>
                  {dosingPerUnitOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Applicable Species</Label>
              <div className="rounded-md border p-3 space-y-2">
                {speciesLoading && <div className="text-xs text-muted-foreground">Loading species...</div>}
                {!speciesLoading && ranchSpeciesOptions.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    No species configured in Ranch Settings yet.
                  </div>
                )}
                {!speciesLoading && ranchSpeciesOptions.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ranchSpeciesOptions.map((species) => {
                      const selected = form.watch("applicableSpecies") ?? [];
                      const checked = selected.includes(species);
                      return (
                        <label key={species} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = new Set(form.getValues("applicableSpecies") ?? []);
                              if (v === true) next.add(species);
                              else next.delete(species);
                              form.setValue("applicableSpecies", Array.from(next), { shouldValidate: true });
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
            <CardTitle className="text-base">Ranch Dosing Standard</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" {...form.register("startDate")} disabled={!canInteract} />
              {form.formState.errors.startDate?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.startDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Off-label practice</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(form.getValues("usesOffLabel"))}
                  onCheckedChange={(v) => form.setValue("usesOffLabel", Boolean(v), { shouldValidate: true })}
                  disabled={!canInteract}
                />
                <span className="text-sm">We use off-label dosing practices</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="standardDoseAmount">Dose amount</Label>
              <Input id="standardDoseAmount" {...form.register("standardDoseAmount")} disabled={!canInteract} />
              {form.formState.errors.standardDoseAmount?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.standardDoseAmount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="standardDoseUnit">Dose unit</Label>
              <Input
                id="standardDoseUnit"
                {...form.register("standardDoseUnit")}
                placeholder={form.watch("concentrationUnit") || "mL"}
                disabled={!canInteract}
              />
              <p className="text-xs text-muted-foreground">
                Use the same unit family as concentration (for example, mL with mg/mL concentration).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="standardPerAmount">Per amount</Label>
              <Input id="standardPerAmount" {...form.register("standardPerAmount")} disabled={!canInteract} />
              {form.formState.errors.standardPerAmount?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.standardPerAmount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="standardPerUnit">Per unit</Label>
              <Select
                value={form.watch("standardPerUnit") || "lb"}
                onValueChange={(value) => form.setValue("standardPerUnit", value, { shouldValidate: true })}
                disabled={!canInteract}
              >
                <SelectTrigger id="standardPerUnit" aria-label="Per unit" title="Per unit">
                  <SelectValue placeholder="Select per unit" />
                </SelectTrigger>
                <SelectContent>
                  {dosingPerUnitOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Derived ranch standard</Label>
              <div className="rounded-md border px-3 py-2 text-sm text-stone-700 bg-stone-50">
                {buildDoseText(
                  form.watch("standardDoseAmount") || "0",
                  form.watch("standardDoseUnit") || (form.watch("concentrationUnit") || "unit"),
                  form.watch("standardPerAmount") || "0",
                  form.watch("standardPerUnit") || "animal"
                )}
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
