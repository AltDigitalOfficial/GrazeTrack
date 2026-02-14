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

  standardDoseText: z.string().min(1, "Ranch standard dosing is required"),
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
      standardDoseText: "",
      startDate: todayIsoDate(),
      usesOffLabel: false,
    },
    mode: "onBlur",
  });

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId, [ranchLoading, activeRanchId]);

  const totalImages = useMemo(() => {
    return Object.values(imagesByPurpose).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
  }, [imagesByPurpose]);

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
      standardDoseText: parsed.standardDoseText.trim(),
      startDate: parsed.startDate,
    };

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
          onLabelDoseText:
            parsed.onLabelDoseText && parsed.onLabelDoseText.trim().length > 0
              ? parsed.onLabelDoseText.trim()
              : null,
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
      if (parsed.onLabelDoseText && parsed.onLabelDoseText.trim().length > 0) {
        fd.append("onLabelDoseText", parsed.onLabelDoseText.trim());
      }
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
              <select
                id="formatSelect"
                aria-label="Medication format"
                title="Medication format"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={!canInteract}
                value={form.getValues("format") || "pill"}
                onChange={(e) => form.setValue("format", e.target.value, { shouldValidate: true })}
              >
                {medicationFormatOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
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
              <select
                id="concentrationUnitSelect"
                aria-label="Concentration unit"
                title="Concentration unit"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={!canInteract}
                value={form.getValues("concentrationUnit") || "mg"}
                onChange={(e) => form.setValue("concentrationUnit", e.target.value)}
              >
                {concentrationUnitOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
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

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="standardDoseText">Ranch standard dosing</Label>
              <Textarea id="standardDoseText" rows={5} {...form.register("standardDoseText")} disabled={!canInteract} />
              {form.formState.errors.standardDoseText?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.standardDoseText.message}</p>
              )}
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
