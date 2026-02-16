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

type ActiveMedicationOption = {
  id: string;
  displayName: string;
  format?: string;
  concentrationValue?: string | null;
  concentrationUnit?: string | null;
  currentStandard?: {
    id: string;
    usesOffLabel: boolean;
    standardDoseText: string;
    startDate: string;
    endDate: string | null;
  };
};

type StandardMedicationImageDTO = {
  id: string;
  purpose: string;
  url: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string;
};

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

const FormSchema = z.object({
  standardMedicationId: z.string().optional(),
  quantity: z.string().min(1, "Quantity is required"),
  totalPrice: z.string().optional(),
  purchaseDate: z.string().min(10, "Purchase date is required"),
  supplierName: z.string().min(1, "Supplier is required"),

  creatingNew: z.boolean().optional(),

  chemicalName: z.string().optional(),
  format: z.string().optional(),
  concentrationValue: z.string().optional(),
  concentrationUnit: z.string().optional(),
  manufacturerName: z.string().optional(),
  brandName: z.string().optional(),
  onLabelDoseText: z.string().optional(),
  usesOffLabel: z.boolean().optional(),
  standardDoseText: z.string().optional(),
  standardStartDate: z.string().optional(),
});

type FormValues = z.input<typeof FormSchema>;

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isNumberString(v: string): boolean {
  const trimmed = v.trim();
  if (trimmed.length === 0) return false;
  return /^(\d+)(\.\d+)?$/.test(trimmed);
}

function buildNewMedPreview(v: Partial<FormValues>) {
  const chem = v.chemicalName?.trim() || "Chemical";
  const brand = v.brandName?.trim() || "Brand";
  const fmt = v.format?.trim() || "format";
  const conc =
    v.concentrationValue && v.concentrationUnit
      ? ` ${v.concentrationValue}${v.concentrationUnit}`
      : "";
  return `${brand} â€” ${chem}${conc} (${fmt})`;
}

function canonicalUnitFromFormat(format?: string): string {
  switch ((format || "").toLowerCase()) {
    case "pill":
      return "pills";
    case "powder":
      return "g";
    case "liquid":
    case "injectable":
    case "paste":
    case "topical":
      return "mL";
    default:
      return "units";
  }
}

function bytesToNiceSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/* ------------------------------------------------------------------------------------------------
 * Purchase images (local selection)
 * ------------------------------------------------------------------------------------------------ */

type PurchaseImagePurpose = "receipt" | "label" | "packaging" | "misc";

type LocalImage = {
  id: string;
  file: File;
  url: string;
  originalName: string;
  mimeType?: string;
  sizeBytes?: number;
};

function nicePurchasePurposeLabel(purpose: PurchaseImagePurpose): string {
  switch (purpose) {
    case "receipt":
      return "Receipt photos";
    case "label":
      return "Label photos";
    case "packaging":
      return "Packaging photos";
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
            {active?.sizeBytes ? ` â€¢ ${bytesToNiceSize(active.sizeBytes)}` : ""}
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
          <Button type="button" variant="destructive" size="sm" onClick={() => onRemove(active.id)}>
            Remove
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="w-full aspect-video bg-stone-50 flex items-center justify-center">
          <img
            src={active.url}
            alt={active.originalName || "Purchase image"}
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

/* ------------------------------------------------------------------------------------------------
 * Standard images viewer (already persisted)
 * ------------------------------------------------------------------------------------------------ */

function ImageCarousel({
  title,
  images,
}: {
  title: string;
  images: StandardMedicationImageDTO[];
}) {
  const [idx, setIdx] = useState(0);

  if (!images || images.length === 0) {
    return <div className="text-sm text-muted-foreground">No photos yet.</div>;
  }

  const safeIdx = Math.min(Math.max(idx, 0), images.length - 1);
  const active = images[safeIdx];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {images.length} photo{images.length === 1 ? "" : "s"}
            {active?.purpose ? ` â€¢ ${active.purpose}` : ""}
            {active?.sizeBytes ? ` â€¢ ${bytesToNiceSize(active.sizeBytes)}` : ""}
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
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="w-full aspect-video bg-stone-50 flex items-center justify-center">
          <img
            src={active.url}
            alt={active.originalFilename || active.purpose || "Medication image"}
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
                title={img.purpose || img.originalFilename || "photo"}
              >
                <img
                  src={img.url}
                  alt={img.originalFilename || img.purpose || "thumb"}
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

/* ------------------------------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------------------------------ */

export default function CreateMedicationPurchasePage() {
  const navigate = useNavigate();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [options, setOptions] = useState<ActiveMedicationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [standardImages, setStandardImages] = useState<StandardMedicationImageDTO[]>([]);
  const [loadingStandardImages, setLoadingStandardImages] = useState(false);
  const [standardImagesError, setStandardImagesError] = useState<string | null>(null);

  const [purchaseImagesByPurpose, setPurchaseImagesByPurpose] = useState<
    Record<PurchaseImagePurpose, LocalImage[]>
  >({
    receipt: [],
    label: [],
    packaging: [],
    misc: [],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      standardMedicationId: "",
      quantity: "",
      totalPrice: "",
      purchaseDate: todayIsoDate(),
      supplierName: "",
      creatingNew: false,

      chemicalName: "",
      format: "pill",
      concentrationValue: "",
      concentrationUnit: "mg",
      manufacturerName: "Generic",
      brandName: "Generic",
      onLabelDoseText: "",
      usesOffLabel: false,
      standardDoseText: "",
      standardStartDate: todayIsoDate(),
    },
    mode: "onBlur",
  });

  const creatingNew = Boolean(form.watch("creatingNew"));
  const selectedStandardMedicationId = form.watch("standardMedicationId") || "";
  const newMedPreview = useMemo(() => buildNewMedPreview(form.watch()), [form]);

  const canInteract = useMemo(
    () => !ranchLoading && !!activeRanchId,
    [ranchLoading, activeRanchId]
  );

  const selectedOption = useMemo(() => {
    if (!selectedStandardMedicationId) return null;
    return options.find((o) => o.id === selectedStandardMedicationId) ?? null;
  }, [options, selectedStandardMedicationId]);

  const derivedUnitForStandard = useMemo(() => {
    return canonicalUnitFromFormat(selectedOption?.format);
  }, [selectedOption?.format]);

  const totalPurchaseImages = useMemo(() => {
    return Object.values(purchaseImagesByPurpose).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
  }, [purchaseImagesByPurpose]);

  function addPurchaseImages(purpose: PurchaseImagePurpose, fileList: FileList | null) {
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

    setPurchaseImagesByPurpose((prev) => ({
      ...prev,
      [purpose]: [...prev[purpose], ...next],
    }));
  }

  function removePurchaseImage(purpose: PurchaseImagePurpose, id: string) {
    setPurchaseImagesByPurpose((prev) => {
      const img = prev[purpose].find((x) => x.id === id);
      if (img?.url) URL.revokeObjectURL(img.url);

      return {
        ...prev,
        [purpose]: prev[purpose].filter((x) => x.id !== id),
      };
    });
  }

  useEffect(() => {
    if (!activeRanchId) return;

    const load = async () => {
      setLoadingOptions(true);
      setOptionsError(null);
      try {
        const res = await apiGet<{ medications: ActiveMedicationOption[] }>(
          `/standard-medications/active`
        );
        setOptions(res.medications ?? []);
      } catch (err: unknown) {
        const msg = err instanceof Error && err.message.trim() ? err.message : "Failed to load medications";
        setOptionsError(msg);
      } finally {
        setLoadingOptions(false);
      }
    };

    load();
  }, [activeRanchId]);

  useEffect(() => {
    if (!activeRanchId) return;

    if (creatingNew) {
      setStandardImages([]);
      setStandardImagesError(null);
      setLoadingStandardImages(false);
      return;
    }

    if (!selectedStandardMedicationId) {
      setStandardImages([]);
      setStandardImagesError(null);
      setLoadingStandardImages(false);
      return;
    }

    let alive = true;

    const loadImages = async () => {
      setLoadingStandardImages(true);
      setStandardImagesError(null);
      try {
        const res = await apiGet<{ images: StandardMedicationImageDTO[] }>(
          `/standard-medications/${encodeURIComponent(selectedStandardMedicationId)}/images`
        );
        if (!alive) return;
        setStandardImages(res.images ?? []);
      } catch (err: unknown) {
        if (!alive) return;
        setStandardImages([]);
        const msg = err instanceof Error && err.message.trim() ? err.message : "Failed to load photos for this medication.";
        setStandardImagesError(msg);
      } finally {
        if (alive) {
          setLoadingStandardImages(false);
        }
      }
    };

    loadImages();

    return () => {
      alive = false;
    };
  }, [activeRanchId, creatingNew, selectedStandardMedicationId]);

  const onSubmit: SubmitHandler<FormValues> = async (v) => {
    if (!activeRanchId) {
      form.setError("quantity", {
        type: "server",
        message: "No active ranch selected. Please select a ranch and try again.",
      });
      return;
    }

    const parsed = FormSchema.parse(v);

    if (!isNumberString(parsed.quantity)) {
      form.setError("quantity", { type: "validate", message: "Enter a number (e.g. 200 or 1.5)" });
      return;
    }

    if (parsed.totalPrice && parsed.totalPrice.trim().length > 0 && !isNumberString(parsed.totalPrice)) {
      form.setError("totalPrice", { type: "validate", message: "Enter a number (e.g. 10 or 10.99)" });
      return;
    }

    if (!creatingNew && (!parsed.standardMedicationId || parsed.standardMedicationId.trim().length === 0)) {
      form.setError("standardMedicationId", {
        type: "validate",
        message: "Choose a medication or click Add New Medication",
      });
      return;
    }

    if (creatingNew) {
      const required: Array<[keyof FormValues, string]> = [
        ["chemicalName", "Chemical name is required"],
        ["format", "Format is required"],
        ["manufacturerName", "Manufacturer is required"],
        ["brandName", "Brand is required"],
        ["standardDoseText", "Ranch standard dosing is required"],
        ["standardStartDate", "Start date is required"],
      ];

      for (const [key, msg] of required) {
        const value = (parsed[key] as string | undefined) ?? "";
        if (value.trim().length === 0) {
          form.setError(key, { type: "validate", message: msg });
          return;
        }
      }
    }

    // Base payload fields (weâ€™ll use these for both JSON and multipart)
    const basePayload: Record<string, unknown> = {
      quantity: parsed.quantity.trim(),
      purchaseDate: parsed.purchaseDate,
      totalPrice: parsed.totalPrice && parsed.totalPrice.trim().length > 0 ? parsed.totalPrice.trim() : null,
      supplierName: parsed.supplierName.trim(),
    };

    if (!creatingNew) {
      basePayload.standardMedicationId = parsed.standardMedicationId;
    } else {
      const concentrationValue =
        parsed.concentrationValue && parsed.concentrationValue.trim().length > 0
          ? parsed.concentrationValue.trim()
          : null;

      const concentrationUnit =
        concentrationValue && parsed.concentrationUnit && parsed.concentrationUnit.trim().length > 0
          ? parsed.concentrationUnit.trim()
          : null;

      basePayload.createNewMedication = {
        chemicalName: parsed.chemicalName!.trim(),
        format: parsed.format!.trim(),
        concentrationValue,
        concentrationUnit,
        manufacturerName: parsed.manufacturerName!.trim(),
        brandName: parsed.brandName!.trim(),
        onLabelDoseText:
          parsed.onLabelDoseText && parsed.onLabelDoseText.trim().length > 0
            ? parsed.onLabelDoseText.trim()
            : null,
        standard: {
          usesOffLabel: Boolean(parsed.usesOffLabel),
          standardDoseText: parsed.standardDoseText!.trim(),
          startDate: parsed.standardStartDate!,
        },
      };
    }

    try {
      // If no purchase images selected, keep the simpler JSON request.
      if (totalPurchaseImages === 0) {
        await apiPost("/medication-purchases", basePayload);
        navigate(ROUTES.supplies.medications);
        return;
      }

      // Multipart submit (purchase fields + optional createNewMedication JSON + images)
      const fd = new FormData();
      fd.append("quantity", basePayload.quantity);
      fd.append("purchaseDate", basePayload.purchaseDate);
      if (basePayload.totalPrice != null) fd.append("totalPrice", String(basePayload.totalPrice));
      fd.append("supplierName", basePayload.supplierName);

      if (basePayload.standardMedicationId) {
        fd.append("standardMedicationId", basePayload.standardMedicationId);
      }
      if (basePayload.createNewMedication) {
        fd.append("createNewMedication", JSON.stringify(basePayload.createNewMedication));
      }

      for (const img of purchaseImagesByPurpose.receipt) fd.append("receipt", img.file, img.originalName);
      for (const img of purchaseImagesByPurpose.label) fd.append("label", img.file, img.originalName);
      for (const img of purchaseImagesByPurpose.packaging) fd.append("packaging", img.file, img.originalName);
      for (const img of purchaseImagesByPurpose.misc) fd.append("misc", img.file, img.originalName);

      await apiPostForm("/medication-purchases", fd);
      navigate(ROUTES.supplies.medications);
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.trim() ? err.message : "Failed to record purchase";
      form.setError("quantity", { type: "server", message: msg });
    }
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const arr of Object.values(purchaseImagesByPurpose)) {
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
          <h1 className="text-2xl font-semibold">Record Medication Purchase</h1>
          <p className="text-sm text-muted-foreground">
            Add an append-only purchase record. Inventory updates automatically.
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
            Select a ranch to record purchases.
          </CardContent>
        </Card>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Purchase Details</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="standardMedicationId">Medication</Label>

                <Button
                  type="button"
                  variant={creatingNew ? "outline" : "default"}
                  disabled={!canInteract}
                  onClick={() => {
                    const next = !creatingNew;
                    form.setValue("creatingNew", next);
                    if (next) form.setValue("standardMedicationId", "");
                  }}
                >
                  {creatingNew ? "Use Existing Medication" : "Add New Medication"}
                </Button>
              </div>

              {!creatingNew && (
                <>
                  {optionsError && <div className="text-sm text-red-600">Error: {optionsError}</div>}

                  <Select
                    value={form.watch("standardMedicationId") || ""}
                    onValueChange={(value) =>
                      form.setValue("standardMedicationId", value, { shouldValidate: true })
                    }
                    disabled={!canInteract || loadingOptions}
                  >
                    <SelectTrigger id="standardMedicationId" aria-label="Medication" title="Medication">
                      <SelectValue placeholder={loadingOptions ? "Loading…" : "Select a medication…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {form.formState.errors.standardMedicationId?.message && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.standardMedicationId.message}
                    </p>
                  )}

                  {selectedOption && (
                    <p className="text-xs text-muted-foreground">
                      Unit will be recorded as{" "}
                      <span className="font-medium">{derivedUnitForStandard}</span> based on the medication format.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Only active standards appear here. Retired standards wonâ€™t show.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" placeholder="200" {...form.register("quantity")} disabled={!canInteract} />
              {form.formState.errors.quantity?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.quantity.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalPrice">Total price (optional)</Label>
              <Input id="totalPrice" placeholder="10.99" {...form.register("totalPrice")} disabled={!canInteract} />
              {form.formState.errors.totalPrice?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.totalPrice.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input id="purchaseDate" type="date" {...form.register("purchaseDate")} disabled={!canInteract} />
              {form.formState.errors.purchaseDate?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.purchaseDate.message}</p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="supplierName">Supplier</Label>
              <Input
                id="supplierName"
                placeholder="Walmart, Valley Vet, Local Co-opâ€¦"
                {...form.register("supplierName")}
                disabled={!canInteract}
              />
              {form.formState.errors.supplierName?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.supplierName.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Supplier will be upserted for spend reporting later.
              </p>
            </div>
          </CardContent>
        </Card>

        {creatingNew && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">New Medication</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium">{newMedPreview}</div>
                  <div className="text-muted-foreground">
                    This will be saved as a standard medication and used for this purchase.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <Textarea id="onLabelDoseText" rows={4} {...form.register("onLabelDoseText")} disabled={!canInteract} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranch Standard</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="standardStartDate">Start date</Label>
                  <Input id="standardStartDate" type="date" {...form.register("standardStartDate")} disabled={!canInteract} />
                </div>

                <div className="space-y-2">
                  <Label>Off-label practice</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={Boolean(form.getValues("usesOffLabel"))}
                      onCheckedChange={(val) => form.setValue("usesOffLabel", Boolean(val))}
                      disabled={!canInteract}
                    />
                    <span className="text-sm">We use off-label dosing practices</span>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="standardDoseText">Ranch standard dosing</Label>
                  <Textarea id="standardDoseText" rows={5} {...form.register("standardDoseText")} disabled={!canInteract} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!creatingNew && selectedStandardMedicationId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Medication Photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingStandardImages && (
                <div className="text-sm text-muted-foreground">Loading photosâ€¦</div>
              )}

              {!loadingStandardImages && standardImagesError && (
                <div className="text-sm text-red-600">{standardImagesError}</div>
              )}

              {!loadingStandardImages && !standardImagesError && (
                <ImageCarousel title="Standard reference photos" images={standardImages} />
              )}

              <p className="text-xs text-muted-foreground">
                Tip: photos help confirm youâ€™re selecting the right product.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Purchase image uploads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Purchase Photos (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-sm text-muted-foreground">
              Add a receipt or packaging photos now so you donâ€™t have to dig later.
            </div>

            {(["receipt", "label", "packaging", "misc"] as PurchaseImagePurpose[]).map((purpose) => (
              <div key={purpose} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
                  <div className="min-w-0">
                    <div className="font-medium md:whitespace-nowrap">
                      {nicePurchasePurposeLabel(purpose)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {purpose === "receipt" && "Receipt / invoice photos."}
                      {purpose === "label" && "Label close-ups from the purchased container."}
                      {purpose === "packaging" && "Box / bottle / packaging photos (front/back)."}
                      {purpose === "misc" && "Anything else worth keeping with this purchase."}
                    </div>
                  </div>

                  <div className="w-full">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      className="w-full"
                      aria-label={`${nicePurchasePurposeLabel(purpose)} upload`}
                      title={`${nicePurchasePurposeLabel(purpose)} upload`}
                      onChange={(e) => addPurchaseImages(purpose, e.target.files)}
                      disabled={!canInteract}
                    />
                  </div>
                </div>

                <LocalImageCarousel
                  title={nicePurchasePurposeLabel(purpose)}
                  images={purchaseImagesByPurpose[purpose]}
                  onRemove={(id) => removePurchaseImage(purpose, id)}
                />
              </div>
            ))}

            <div className="text-xs text-muted-foreground">
              Total selected: <span className="font-medium">{totalPurchaseImages}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(ROUTES.supplies.medications)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canInteract || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Savingâ€¦" : "Save Purchase"}
          </Button>
        </div>
      </form>
    </div>
  );
}



