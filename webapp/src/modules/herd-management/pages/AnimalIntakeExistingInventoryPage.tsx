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

import { apiPost, apiPostForm } from "@/lib/api";
import {
  ExistingInventoryIntakePayloadSchema,
  ExistingInventoryIntakeResponseSchema,
  type ExistingInventoryIntakePayload,
} from "@/lib/contracts/animals";
import {
  ANIMAL_SPECIES,
  getBreedsForSpecies,
  type AnimalSpecies,
} from "@/components/lookups/animalLookups";

// ---- Endpoint contracts ----
const EXISTING_INVENTORY_INTAKE_ENDPOINT = "/animal-intake/existing-inventory";

// Assumed upload endpoints (typical REST shape):
// NOTE: backend upload handlers for these routes are not implemented yet.
const ANIMAL_PHOTOS_UPLOAD_ENDPOINT = (animalId: string) => `/animals/${animalId}/photos`;
const ANIMAL_DOCUMENTS_UPLOAD_ENDPOINT = (animalId: string) => `/animals/${animalId}/documents`;

// ---- Lookups for media categories ----
type PhotoCategory = "profile" | "side" | "tag" | "group" | "misc";
const PHOTO_CATEGORIES: Array<{ value: PhotoCategory; label: string }> = [
  { value: "profile", label: "Profile" },
  { value: "group", label: "Group" },
  { value: "side", label: "Side" },
  { value: "tag", label: "Tag" },
  { value: "misc", label: "Misc" },
];

type DocumentCategory = "medical" | "insurance" | "registration" | "misc";
const DOCUMENT_CATEGORIES: Array<{ value: DocumentCategory; label: string }> = [
  { value: "medical", label: "Medical" },
  { value: "insurance", label: "Insurance" },
  { value: "registration", label: "Registration" },
  { value: "misc", label: "Misc" },
];

const SexEnum = z.enum(["female", "male", "neutered", "unknown"]);
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

const baseSchema = z.object({
  // NEW: nickname (optional)
  nickname: z.string().trim().max(100, "Nickname is too long").optional(),

  species: SpeciesSchema,
  breed: z.string().trim().min(1, "Breed is required"),
  sex: SexEnum,

  birthDate: z
    .string()
    .trim()
    .optional()
    .refine((val) => {
      if (!val) return true;
      return /^\d{4}-\d{2}-\d{2}$/.test(val);
    }, { message: "Birth date must be a valid date" }),

  // keep boolean strict to avoid resolver mismatch
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

const formSchema = baseSchema.superRefine((values, ctx) => {
  const options = getBreedsForSpecies(values.species);
  const valid = options.some((b) => b.value === values.breed);
  if (!valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["breed"],
      message: "Select a valid breed for the chosen species",
    });
  }
});

type FormValues = z.infer<typeof formSchema>;

const sexOptions: Array<{ value: FormValues["sex"]; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "neutered", label: "Neutered" },
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

function fileListToArray(list: FileList | null): File[] {
  if (!list) return [];
  return Array.from(list);
}

export default function AnimalIntakeExistingInventoryPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Media state (kept outside RHF on purpose: clearer and avoids RHF File edge cases)
  const [photoCategory, setPhotoCategory] = React.useState<PhotoCategory>("profile");
  const [photoFiles, setPhotoFiles] = React.useState<File[]>([]);

  const [documentCategory, setDocumentCategory] = React.useState<DocumentCategory>("medical");
  const [documentFiles, setDocumentFiles] = React.useState<File[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // NEW: nickname default
      nickname: "",

      species: "cattle",
      breed: getBreedsForSpecies("cattle")[0]?.value ?? "other",
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

  const species = form.watch("species");
  const birthDateValue = form.watch("birthDate");

  const breedOptions = React.useMemo(() => getBreedsForSpecies(species), [species]);

  React.useEffect(() => {
    const currentBreed = form.getValues("breed");
    const valid = breedOptions.some((b) => b.value === currentBreed);
    if (!valid) {
      const nextBreed = breedOptions[0]?.value ?? "other";
      form.setValue("breed", nextBreed, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, breedOptions]);

  async function uploadPhotos(animalId: string) {
    if (photoFiles.length === 0) return;

    const fd = new FormData();
    fd.append("category", photoCategory);
    for (const f of photoFiles) {
      // Most backends accept "files" as a multi field
      fd.append("files", f);
    }

    await apiPostForm(ANIMAL_PHOTOS_UPLOAD_ENDPOINT(animalId), fd);
  }

  async function uploadDocuments(animalId: string) {
    if (documentFiles.length === 0) return;

    const fd = new FormData();
    fd.append("category", documentCategory);
    for (const f of documentFiles) {
      fd.append("files", f);
    }

    await apiPostForm(ANIMAL_DOCUMENTS_UPLOAD_ENDPOINT(animalId), fd);
  }

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setIsSubmitting(true);

    try {
      // 1) Create animal via intake endpoint
      const payload: ExistingInventoryIntakePayload = {
        // NEW: nickname included
        nickname: values.nickname?.trim() ? values.nickname.trim() : null,

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

      const validatedPayload = ExistingInventoryIntakePayloadSchema.parse(payload);
      const createdRaw = await apiPost(EXISTING_INVENTORY_INTAKE_ENDPOINT, validatedPayload);
      const created = ExistingInventoryIntakeResponseSchema.parse(createdRaw);

      const animalId = created.animalId;
      if (!animalId) {
        // This is the only “hard dependency” for uploads.
        toast({
          title: "Animal saved, but media not uploaded",
          description:
            "Intake succeeded, but the response didn’t include an animalId. Update the intake endpoint response to return { animalId } (or adjust the frontend extractor).",
          variant: "destructive",
        });
      } else {
        // 2) Upload media (best-effort but still fails loudly if endpoints are wrong)
        // If you prefer partial success, we can catch each separately; for now fail fast.
        await uploadPhotos(animalId);
        await uploadDocuments(animalId);

        toast({
          title: "Animal added",
          description:
            photoFiles.length || documentFiles.length
              ? "Intake recorded and media uploaded successfully."
              : "Existing inventory intake was recorded successfully.",
        });
      }

      // 3) Reset for next animal
      const preservedSpecies = values.species;
      const preservedBreedDefault = getBreedsForSpecies(preservedSpecies)[0]?.value ?? "other";

      form.reset({
        // NEW: reset nickname
        nickname: "",

        species: preservedSpecies,
        breed: preservedBreedDefault,
        sex: "unknown",
        birthDate: "",
        isBirthDateEstimated: false,
        tagNumber: "",
        tagColor: values.tagColor,
        tagEar: values.tagEar,
        initialWeightLbs: "",
        notes: "",
      });

      // Reset media selections too
      setPhotoCategory("profile");
      setPhotoFiles([]);
      setDocumentCategory("medical");
      setDocumentFiles([]);

      setTimeout(() => {
        const el = document.getElementById("tagNumber") as HTMLInputElement | null;
        el?.focus();
      }, 0);
    } catch (err: unknown) {
      const e = err as { message?: string; response?: { data?: { message?: string } } };
      const message =
        e?.message ||
        e?.response?.data?.message ||
        "Failed to record intake. Check server logs and the Network tab for details.";

      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Animal Intake — Existing Inventory</CardTitle>
            <CardDescription>
              Add one animal at a time. Optional: attach photos and documents during intake.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Animal basics */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* NEW: Nickname */}
                <div className="md:col-span-3">
                  <label htmlFor="nickname" className="text-sm font-medium">
                    Nickname (optional)
                  </label>
                  <Input
                    id="nickname"
                    className="mt-1"
                    placeholder="e.g., Big Red"
                    {...form.register("nickname")}
                    disabled={isSubmitting}
                  />
                  {fieldErrorText(form.formState.errors.nickname?.message)}
                </div>

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
                  <Select
                    value={form.getValues("breed")}
                    onValueChange={(val: string) => form.setValue("breed", val, { shouldValidate: true })}
                  >
                    <SelectTrigger id="breed" className="mt-1" aria-label="Select breed">
                      <SelectValue placeholder="Select breed" />
                    </SelectTrigger>
                    <SelectContent>
                      {breedOptions.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

              {/* Birth date */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label htmlFor="birthDate" className="text-sm font-medium">
                    Birth date (optional)
                  </label>
                  <Input id="birthDate" type="date" className="mt-1" {...form.register("birthDate")} disabled={isSubmitting} />
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

              {/* Tag assignment */}
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
                      disabled={isSubmitting}
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

              {/* Optional initial weight */}
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
                    disabled={isSubmitting}
                  />
                  {fieldErrorText(form.formState.errors.initialWeightLbs?.message)}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="text-sm font-medium">
                  Notes (optional)
                </label>
                <Textarea
                  id="notes"
                  className="mt-1 min-h-[110px]"
                  placeholder="Anything worth noting about this animal…"
                  {...form.register("notes")}
                  disabled={isSubmitting}
                />
                {fieldErrorText(form.formState.errors.notes?.message)}
              </div>

              {/* Media uploads */}
              <div className="space-y-4 rounded-lg border p-4">
                <div className="text-sm font-semibold">Media (optional)</div>

                {/* Photos */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Photos</div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label htmlFor="photoCategory" className="text-sm font-medium">
                        Photo category
                      </label>
                      <Select value={photoCategory} onValueChange={(val: string) => setPhotoCategory(val as PhotoCategory)}>
                        <SelectTrigger id="photoCategory" className="mt-1" aria-label="Select photo category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {PHOTO_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="photos" className="text-sm font-medium">
                        Choose photo files
                      </label>
                      <Input
                        id="photos"
                        type="file"
                        accept="image/*"
                        multiple
                        className="mt-1"
                        onChange={(e) => setPhotoFiles(fileListToArray(e.target.files))}
                        disabled={isSubmitting}
                      />
                      {photoFiles.length > 0 ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Selected: {photoFiles.map((f) => f.name).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Documents */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Documents</div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label htmlFor="documentCategory" className="text-sm font-medium">
                        Document category
                      </label>
                      <Select
                        value={documentCategory}
                        onValueChange={(val: string) => setDocumentCategory(val as DocumentCategory)}
                      >
                        <SelectTrigger id="documentCategory" className="mt-1" aria-label="Select document category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="documents" className="text-sm font-medium">
                        Choose document files
                      </label>
                      <Input
                        id="documents"
                        type="file"
                        multiple
                        className="mt-1"
                        onChange={(e) => setDocumentFiles(fileListToArray(e.target.files))}
                        disabled={isSubmitting}
                      />
                      {documentFiles.length > 0 ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Selected: {documentFiles.map((f) => f.name).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => {
                    form.reset();
                    setPhotoFiles([]);
                    setDocumentFiles([]);
                    setPhotoCategory("profile");
                    setDocumentCategory("medical");
                  }}
                >
                  Clear
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : "Add animal"}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  Intake endpoint: <span className="font-mono">{EXISTING_INVENTORY_INTAKE_ENDPOINT}</span>
                </div>
                <div>
                  Photos upload: <span className="font-mono">{ANIMAL_PHOTOS_UPLOAD_ENDPOINT("{animalId}")}</span>
                </div>
                <div>
                  Documents upload: <span className="font-mono">{ANIMAL_DOCUMENTS_UPLOAD_ENDPOINT("{animalId}")}</span>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
