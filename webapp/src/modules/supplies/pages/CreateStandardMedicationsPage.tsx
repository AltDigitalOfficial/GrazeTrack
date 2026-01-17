import { useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes";
import { apiPost } from "@/lib/api";
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

const FormSchema = z.object({
  chemicalName: z.string().min(1, "Chemical name is required"),
  format: z.string().min(1, "Format is required"),

  concentrationValue: z.string().optional(),
  concentrationUnit: z.string().optional(),

  manufacturerName: z.string().min(1, "Manufacturer is required"),
  brandName: z.string().min(1, "Brand is required"),

  onLabelDoseText: z.string().optional(),

  usesOffLabel: z.boolean().optional(),
  standardDoseText: z.string().min(1, "Ranch standard dose is required"),
  startDate: z.string().min(10, "Start date is required (YYYY-MM-DD)"),
});

type FormValues = z.input<typeof FormSchema>;

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildDisplayPreview(v: Partial<FormValues>) {
  const chem = v.chemicalName?.trim() || "Chemical";
  const brand = v.brandName?.trim() || "Brand";
  const fmt = v.format?.trim() || "format";
  const conc =
    v.concentrationValue && v.concentrationUnit
      ? ` ${v.concentrationValue}${v.concentrationUnit}`
      : "";
  return `${brand} — ${chem}${conc} (${fmt})`;
}

export default function CreateStandardMedicationsPage() {
  const navigate = useNavigate();
  const { activeRanchId, loading } = useRanch();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      chemicalName: "",
      format: "pill",
      concentrationValue: "",
      concentrationUnit: "mg",
      manufacturerName: "Generic",
      brandName: "Generic",
      onLabelDoseText: "",
      usesOffLabel: false,
      standardDoseText: "",
      startDate: todayIsoDate(),
    },
    mode: "onBlur",
  });

  const values = form.watch();
  const preview = useMemo(() => buildDisplayPreview(values), [values]);

  const canSubmit = !loading && !!activeRanchId;

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

    const payload = {
      ranchId: activeRanchId,
      chemicalName: parsed.chemicalName.trim(),
      format: parsed.format,
      concentrationValue,
      concentrationUnit,
      manufacturerName: parsed.manufacturerName.trim(),
      brandName: parsed.brandName.trim(),
      onLabelDoseText: parsed.onLabelDoseText?.trim() ? parsed.onLabelDoseText.trim() : null,
      standard: {
        usesOffLabel: Boolean(parsed.usesOffLabel),
        standardDoseText: parsed.standardDoseText.trim(),
        startDate: parsed.startDate,
      },
    };

    try {
      // IMPORTANT: apiPost already prefixes /api, so do NOT include "/api" here.
      await apiPost("/standard-medications", payload);
      navigate(ROUTES.supplies.medications);
    } catch (e: any) {
      const msg = e?.message || e?.response?.data?.error || "Failed to create standard medication";
      form.setError("chemicalName", { type: "server", message: msg });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Define Medication Standard</h1>
          <p className="text-sm text-muted-foreground">
            Create a medication you usually purchase and set the ranch’s current dosing standard.
          </p>
        </div>

        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {!loading && !activeRanchId && (
        <Card className="mb-6">
          <CardContent className="py-4 text-sm text-stone-700">
            No active ranch selected. Please select a ranch to create medication standards.
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Quick Preview</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="font-medium">{preview}</div>
          <div className="text-muted-foreground mt-1">
            This is how it will appear in the Purchase dropdown.
          </div>
        </CardContent>
      </Card>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medication Details</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chemicalName">Chemical name</Label>
              <Input
                id="chemicalName"
                {...form.register("chemicalName")}
                placeholder="Ibuprofen, Ivermectin, Vitamin D…"
              />
              {form.formState.errors.chemicalName?.message && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.chemicalName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <select
                id="format"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <Input id="manufacturerName" {...form.register("manufacturerName")} />
              {form.formState.errors.manufacturerName?.message && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.manufacturerName.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Tip: use <span className="font-medium">Generic</span> if unknown or not applicable.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brandName">Brand name</Label>
              <Input id="brandName" {...form.register("brandName")} />
              {form.formState.errors.brandName?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.brandName.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Tip: use <span className="font-medium">Generic</span> if this is a generic product.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="concentrationValue">Concentration (optional)</Label>
              <Input
                id="concentrationValue"
                {...form.register("concentrationValue")}
                placeholder="200 (or 5 for 5%)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="concentrationUnit">Concentration unit (optional)</Label>
              <select
                id="concentrationUnit"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.getValues("concentrationUnit") || "mg"}
                onChange={(e) => form.setValue("concentrationUnit", e.target.value)}
              >
                {concentrationUnitOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                If concentration is blank, unit is ignored.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="onLabelDoseText">On-label dosing (optional)</Label>
              <Textarea
                id="onLabelDoseText"
                {...form.register("onLabelDoseText")}
                placeholder="Paste label dosing guidance here (freeform)."
                rows={4}
              />
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
              <Input id="startDate" type="date" {...form.register("startDate")} />
              {form.formState.errors.startDate?.message && (
                <p className="text-sm text-red-600">{form.formState.errors.startDate.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                End date will be blank (active) until you retire the standard.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Off-label practice</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(form.getValues("usesOffLabel"))}
                  onCheckedChange={(v) =>
                    form.setValue("usesOffLabel", Boolean(v), { shouldValidate: true })
                  }
                />
                <span className="text-sm">We use off-label dosing practices</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Toggle this on if your ranch’s standard differs from on-label guidance.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="standardDoseText">Ranch standard dosing</Label>
              <Textarea
                id="standardDoseText"
                {...form.register("standardDoseText")}
                placeholder="Example: 10 mL per adult cow, subcutaneous, repeat in 14 days…"
                rows={5}
              />
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
          <Button type="submit" disabled={!canSubmit || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : "Save Standard"}
          </Button>
        </div>
      </form>
    </div>
  );
}
