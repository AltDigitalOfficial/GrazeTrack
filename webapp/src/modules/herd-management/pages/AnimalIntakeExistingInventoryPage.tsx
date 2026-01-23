import * as React from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";

import { apiPost } from "@/lib/api";
import { ANIMAL_SPECIES, type AnimalSpecies } from "@/components/lookups/animalLookups";

// TODO: confirm backend route
const EXISTING_INVENTORY_INTAKE_ENDPOINT = "/api/animal-intake/existing-inventory";

const SexEnum = z.enum(["female", "male", "castrated", "unknown"]);
const TagColorEnum = z.enum([
  "white",
  "yellow",
  "green",
  "blue",
  "red",
  "orange",
  "pink",
  "purple",
  "black",
  "brown",
  "gray",
  "other",
]);
const TagEarEnum = z.enum(["left", "right"]);

const speciesValueSet = new Set<string>(ANIMAL_SPECIES.map((s) => s.value));
const SpeciesSchema = z.custom<AnimalSpecies>(
  (val) => typeof val === "string" && speciesValueSet.has(val),
  { message: "Species is required" }
);

const formSchema = z.object({
  species: SpeciesSchema,
  breed: z.string().trim().min(1, "Breed is required").max(100, "Breed is too long"),
  sex: SexEnum,

  birthDate: z
    .string()
    .trim()
    .optional()
    .refine((val) => {
      if (!val) return true;
      return /^\d{4}-\d{2}-\d{2}$/.test(val);
    }, { message: "Birth date must be a valid date" }),

  // IMPORTANT: keep this as z.boolean() (no .default) to avoid resolver typing mismatch
  isBirthDateEstimated: z.boolean(),

  tagNumber: z.string().trim().min(1, "Tag number is required").max(50, "Tag number is too long"),
  tagColor: TagColorEnum,
  tagEar: TagEarEnum,

  initialWeightLbs: z
    .string()
    .trim()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const n = Number(val);
      return Number.isFinite(n) && n > 0;
    }, { message: "Weight must be a positive number" }),

  notes: z.string().trim().max(2000, "Notes are too long").optional(),
});

type FormValues = z.infer<typeof formSchema>;

const sexOptions: Array<{ value: FormValues["sex"]; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "castrated", label: "Castrated" },
  { value: "unknown", label: "Unknown" },
];

const tagColorOptions: Array<{ value: FormValues["tagColor"]; label: string }> = [
  { value: "white", label: "White" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "pink", label: "Pink" },
  { value: "purple", label: "Purple" },
  { value: "black", label: "Black" },
  { value: "brown", label: "Brown" },
  { value: "gray", label: "Gray" },
  { value: "other", label: "Other" },
];

const tagEarOptions: Array<{ value: FormValues["tagEar"]; label: string }> = [
  { value: "left", label: "Left ear" },
  { value: "right", label: "Right ear" },
];

function fieldErrorText(message?: string) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-destructive">{message}</p>;
}

export default function AnimalIntakeExistingInventoryPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      species: "cattle",
      breed: "",
      sex: "unknown",
      birthDate: "",
      isBirthDateEstimated: false,
      tagNumber: "",
      tagColor: "yellow",
      tagEar: "left",
      initialWeightLbs: "",
      notes: "",
    },
    mode: "onBlur",
  });

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setIsSubmitting(true);
    try {
      const payload = {
        species: values.species,
        breed: values.breed,
        sex: values.sex,

        birthDate: values.birthDate ? values.birthDate : null,
        isBirthDateEstimated: values.birthDate ? values.isBirthDateEstimated : false,

        tag: {
          tagNumber: values.tagNumber,
          tagColor: values.tagColor,
          tagEar: values.tagEar,
        },

        initialWeightLbs: values.initialWeightLbs ? Number(values.initialWeightLbs) : null,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      };

      await apiPost(EXISTING_INVENTORY_INTAKE_ENDPOINT, payload);

      toast({
        title: "Animal added",
        description: "Existing inventory intake was recorded successfully.",
      });

      form.reset({
        species: values.species,
        breed: "",
        sex: "unknown",
        birthDate: "",
        isBirthDateEstimated: false,
        tagNumber: "",
        tagColor: values.tagColor,
        tagEar: values.tagEar,
        initialWeightLbs: "",
        notes: "",
      });

      setTimeout(() => {
        const el = document.getElementById("tagNumber") as HTMLInputElement | null;
        el?.focus();
      }, 0);
    } catch (err: unknown) {
      const e = err as any;
      const message =
        e?.message ||
        e?.response?.data?.message ||
        "Failed to record intake. Check server logs and network tab for details.";

      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const birthDateValue = form.watch("birthDate");

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Animal Intake — Existing Inventory</CardTitle>
            <CardDescription>
              Add one animal at a time to your inventory. Tags are stored historically.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="species" className="text-sm font-medium">
                    Species
                  </label>
                  <Select
                    value={form.getValues("species")}
                    onValueChange={(val: string) =>
                      form.setValue("species", val as AnimalSpecies, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger id="species" className="mt-1">
                      <SelectValue placeholder="Select species" />
                    </SelectTrigger>
                    <SelectContent>
                      {ANIMAL_SPECIES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrorText(form.formState.errors.species?.message)}
                </div>

                <div className="md:col-span-1">
                  <label htmlFor="breed" className="text-sm font-medium">
                    Breed
                  </label>
                  {/* Next increment: convert this to a dropdown based on species, same as CreateHerdPage */}
                  <Input id="breed" className="mt-1" placeholder="e.g., Angus" {...form.register("breed")} />
                  {fieldErrorText(form.formState.errors.breed?.message)}
                </div>

                <div>
                  <label htmlFor="sex" className="text-sm font-medium">
                    Sex
                  </label>
                  <Select
                    value={form.getValues("sex")}
                    onValueChange={(val: string) =>
                      form.setValue("sex", val as FormValues["sex"], { shouldValidate: true })
                    }
                  >
                    <SelectTrigger id="sex" className="mt-1">
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      {sexOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrorText(form.formState.errors.sex?.message)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label htmlFor="birthDate" className="text-sm font-medium">
                    Birth date (optional)
                  </label>
                  <Input id="birthDate" type="date" className="mt-1" {...form.register("birthDate")} />
                  {fieldErrorText(form.formState.errors.birthDate?.message)}
                </div>

                <div className="md:col-span-2 flex items-end">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="isBirthDateEstimated"
                      checked={form.getValues("isBirthDateEstimated")}
                      disabled={!birthDateValue || isSubmitting}
                      onCheckedChange={(checked: boolean | "indeterminate") =>
                        form.setValue("isBirthDateEstimated", checked === true, { shouldValidate: true })
                      }
                    />
                    <label htmlFor="isBirthDateEstimated" className="text-sm">
                      Birth date is estimated
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Tag assignment</div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-1">
                    <label htmlFor="tagNumber" className="text-sm font-medium">
                      Tag number
                    </label>
                    <Input
                      id="tagNumber"
                      className="mt-1"
                      placeholder="e.g., 1047"
                      {...form.register("tagNumber")}
                    />
                    {fieldErrorText(form.formState.errors.tagNumber?.message)}
                  </div>

                  <div>
                    <label htmlFor="tagColor" className="text-sm font-medium">
                      Tag color
                    </label>
                    <Select
                      value={form.getValues("tagColor")}
                      onValueChange={(val: string) =>
                        form.setValue("tagColor", val as FormValues["tagColor"], { shouldValidate: true })
                      }
                    >
                      <SelectTrigger id="tagColor" className="mt-1">
                        <SelectValue placeholder="Select color" />
                      </SelectTrigger>
                      <SelectContent>
                        {tagColorOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrorText(form.formState.errors.tagColor?.message)}
                  </div>

                  <div>
                    <label htmlFor="tagEar" className="text-sm font-medium">
                      Tag ear
                    </label>
                    <Select
                      value={form.getValues("tagEar")}
                      onValueChange={(val: string) =>
                        form.setValue("tagEar", val as FormValues["tagEar"], { shouldValidate: true })
                      }
                    >
                      <SelectTrigger id="tagEar" className="mt-1">
                        <SelectValue placeholder="Select ear" />
                      </SelectTrigger>
                      <SelectContent>
                        {tagEarOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrorText(form.formState.errors.tagEar?.message)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label htmlFor="initialWeightLbs" className="text-sm font-medium">
                    Initial weight (lbs, optional)
                  </label>
                  <Input
                    id="initialWeightLbs"
                    inputMode="decimal"
                    className="mt-1"
                    placeholder="e.g., 850"
                    {...form.register("initialWeightLbs")}
                  />
                  {fieldErrorText(form.formState.errors.initialWeightLbs?.message)}
                </div>
              </div>

              <div>
                <label htmlFor="notes" className="text-sm font-medium">
                  Notes (optional)
                </label>
                <Textarea
                  id="notes"
                  className="mt-1 min-h-27.5"
                  placeholder="Anything worth noting about this animal…"
                  {...form.register("notes")}
                />
                {fieldErrorText(form.formState.errors.notes?.message)}
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => form.reset()}>
                  Clear
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : "Add animal"}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                Endpoint: <span className="font-mono">{EXISTING_INVENTORY_INTAKE_ENDPOINT}</span> (update if needed)
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
