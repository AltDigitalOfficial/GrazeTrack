import { useEffect, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes";
import { apiGet, apiPost } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

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
    v.concentrationValue && v.concentrationUnit ? ` ${v.concentrationValue}${v.concentrationUnit}` : "";
  return `${brand} — ${chem}${conc} (${fmt})`;
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

/**
 * Standard image URLs coming back from the backend are often "/images/...".
 * If we render those directly in the Vite dev server, the browser requests
 * http://localhost:5173/images/... and images break.
 *
 * We resolve relative /images paths against VITE_API_BASE_URL (if present),
 * otherwise we leave them as-is (works when frontend is served by backend).
 */
const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || "";

function resolveBackendUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (!trimmed.startsWith("/")) return trimmed;

  const base = API_BASE_URL.trim().replace(/\/+$/, "");
  return base ? `${base}${trimmed}` : trimmed;
}

function ImageCarousel({
  title,
  images,
}: {
  title: string;
  images: StandardMedicationImageDTO[];
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [images?.length]);

  if (!images || images.length === 0) {
    return <div className="text-sm text-muted-foreground">No photos yet.</div>;
  }

  const safeIdx = Math.min(Math.max(idx, 0), images.length - 1);
  const active = images[safeIdx];
  const activeUrl = resolveBackendUrl(active.url);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {images.length} photo{images.length === 1 ? "" : "s"}
            {active?.purpose ? ` • ${active.purpose}` : ""}
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
            onClick={() => window.open(activeUrl, "_blank", "noopener,noreferrer")}
          >
            Open
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="w-full aspect-video bg-stone-50 flex items-center justify-center">
          <img
            src={activeUrl}
            alt={active.originalFilename || active.purpose || "Medication image"}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <div className="border-t p-2 overflow-x-auto">
          <div className="flex gap-2">
            {images.map((img, i) => {
              const thumbUrl = resolveBackendUrl(img.url);
              return (
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
                    src={thumbUrl}
                    alt={img.originalFilename || img.purpose || "thumb"}
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreateMedicationPurchasePage() {
  const navigate = useNavigate();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [options, setOptions] = useState<ActiveMedicationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [standardImages, setStandardImages] = useState<StandardMedicationImageDTO[]>([]);
  const [loadingStandardImages, setLoadingStandardImages] = useState(false);
  const [standardImagesError, setStandardImagesError] = useState<string | null>(null);

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

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId, [ranchLoading, activeRanchId]);

  const selectedOption = useMemo(() => {
    if (!selectedStandardMedicationId) return null;
    return options.find((o) => o.id === selectedStandardMedicationId) ?? null;
  }, [options, selectedStandardMedicationId]);

  const derivedUnitForStandard = useMemo(() => {
    return canonicalUnitFromFormat(selectedOption?.format);
  }, [selectedOption?.format]);

  useEffect(() => {
    if (!activeRanchId) return;

    const load = async () => {
      setLoadingOptions(true);
      setOptionsError(null);
      try {
        const res = await apiGet<{ medications: ActiveMedicationOption[] }>(`/standard-medications/active`);
        setOptions(res.medications ?? []);
      } catch (e: any) {
        setOptionsError(e?.message || "Failed to load medications");
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
      } catch (e: any) {
        if (!alive) return;
        setStandardImages([]);
        setStandardImagesError(e?.message || "Failed to load photos for this medication.");
      } finally {
        if (!alive) return;
        setLoadingStandardImages(false);
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
          form.setError(key as any, { type: "validate", message: msg });
          return;
        }
      }
    }

    const payload: any = {
      quantity: parsed.quantity.trim(),
      purchaseDate: parsed.purchaseDate,
      totalPrice: parsed.totalPrice && parsed.totalPrice.trim().length > 0 ? parsed.totalPrice.trim() : null,
      supplierName: parsed.supplierName.trim(),
    };

    if (!creatingNew) {
      payload.standardMedicationId = parsed.standardMedicationId;
    } else {
      const concentrationValue =
        parsed.concentrationValue && parsed.concentrationValue.trim().length > 0
          ? parsed.concentrationValue.trim()
          : null;

      const concentrationUnit =
        concentrationValue && parsed.concentrationUnit && parsed.concentrationUnit.trim().length > 0
          ? parsed.concentrationUnit.trim()
          : null;

      payload.createNewMedication = {
        chemicalName: parsed.chemicalName!.trim(),
        format: parsed.format!.trim(),
        concentrationValue,
        concentrationUnit,
        manufacturerName: parsed.manufacturerName!.trim(),
        brandName: parsed.brandName!.trim(),
        onLabelDoseText:
          parsed.onLabelDoseText && parsed.onLabelDoseText.trim().length > 0 ? parsed.onLabelDoseText.trim() : null,
        standard: {
          usesOffLabel: Boolean(parsed.usesOffLabel),
          standardDoseText: parsed.standardDoseText!.trim(),
          startDate: parsed.standardStartDate!,
        },
      };
    }

    try {
      await apiPost("/medication-purchases", payload);
      navigate(ROUTES.supplies.medications);
    } catch (e: any) {
      const msg = e?.message || e?.response?.data?.error || "Failed to record purchase";
      form.setError("quantity", { type: "server", message: msg });
    }
  };

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
          <CardContent className="text-sm text-stone-700">Select a ranch to record purchases.</CardContent>
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

                  <select
                    id="standardMedicationId"
                    aria-label="Medication"
                    title="Medication"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    disabled={!canInteract || loadingOptions}
                    value={form.getValues("standardMedicationId") || ""}
                    onChange={(e) => form.setValue("standardMedicationId", e.target.value, { shouldValidate: true })}
                  >
                    <option value="">{loadingOptions ? "Loading…" : "Select a medication…"}</option>
                    {options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>

                  {form.formState.errors.standardMedicationId?.message && (
                    <p className="text-sm text-red-600">{form.formState.errors.standardMedicationId.message}</p>
                  )}

                  {selectedOption && (
                    <p className="text-xs text-muted-foreground">
                      Unit will be recorded as{" "}
                      <span className="font-medium">{derivedUnitForStandard}</span> based on the medication format.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Only active standards appear here. Retired standards won’t show.
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
                placeholder="Walmart, Valley Vet, Local Co-op…"
                {...form.register("supplierName")}
                disabled={!canInteract}
              />
              {form.formState.errors.supplierName?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.supplierName.message}</p>
              )}
              <p className="text-xs text-muted-foreground">Supplier will be upserted for spend reporting later.</p>
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
                  <div className="text-muted-foreground">This will be saved as a standard medication and used for this purchase.</div>
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
              {loadingStandardImages && <div className="text-sm text-muted-foreground">Loading photos…</div>}

              {!loadingStandardImages && standardImagesError && (
                <div className="text-sm text-red-600">{standardImagesError}</div>
              )}

              {!loadingStandardImages && !standardImagesError && (
                <ImageCarousel title="Standard reference photos" images={standardImages} />
              )}

              <p className="text-xs text-muted-foreground">Tip: photos help confirm you’re selecting the right product.</p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(ROUTES.supplies.medications)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canInteract || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Save Purchase"}
          </Button>
        </div>
      </form>
    </div>
  );
}
