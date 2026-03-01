import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiGet, apiPostForm, apiPutForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import {
  FeedComponentDetailResponseSchema,
  FeedComponentsResponseSchema,
  FeedSpeciesOptionsResponseSchema,
  type FeedComponentRow,
} from "@/lib/contracts/feed";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FeedSpeciesSelector } from "@/modules/supplies/components/FeedSpeciesSelector";
import {
  FeedPhotoUploader,
  type ExistingFeedPhoto,
  type LocalFeedPhoto,
} from "@/modules/supplies/components/FeedPhotoUploader";

type PhotoPurpose = "packaging" | "misc";
type FeedUnitType = "WEIGHT" | "COUNT" | "VOLUME";

type ExistingPhotosByPurpose = Record<PhotoPurpose, ExistingFeedPhoto[]>;
type LocalPhotosByPurpose = Record<PhotoPurpose, LocalFeedPhoto[]>;

function unitTypeForUi(value: string | null | undefined): FeedUnitType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "COUNT" || normalized === "VOLUME") {
    return normalized as FeedUnitType;
  }
  return "COUNT";
}

function emptyExistingPhotos(): ExistingPhotosByPurpose {
  return { packaging: [], misc: [] };
}

function emptyLocalPhotos(): LocalPhotosByPurpose {
  return { packaging: [], misc: [] };
}

function mapPurpose(value: string | undefined): PhotoPurpose {
  return value === "misc" ? "misc" : "packaging";
}

function speciesLabel(row: FeedComponentRow): string {
  const values = row.eligibleSpecies ?? [];
  if (row.eligibleSpeciesIsAll || values.length === 0) return "All ranch species";
  return values.join(", ");
}

export default function FeedComponentsPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [components, setComponents] = useState<FeedComponentRow[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<string[]>([]);

  const [loadingComponents, setLoadingComponents] = useState(false);
  const [loadingSpecies, setLoadingSpecies] = useState(false);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [unitType, setUnitType] = useState<FeedUnitType>("WEIGHT");
  const [defaultUnit, setDefaultUnit] = useState("lb");
  const [defaultPackageWeight, setDefaultPackageWeight] = useState("");
  const [defaultPackageUnit, setDefaultPackageUnit] = useState("lb");
  const [isBulkCommodity, setIsBulkCommodity] = useState(false);
  const [notes, setNotes] = useState("");
  const [eligibleSpecies, setEligibleSpecies] = useState<string[]>([]);

  const [existingPhotos, setExistingPhotos] = useState<ExistingPhotosByPurpose>(emptyExistingPhotos());
  const [localPhotos, setLocalPhotos] = useState<LocalPhotosByPurpose>(emptyLocalPhotos());
  const [removePhotoIds, setRemovePhotoIds] = useState<Set<string>>(new Set());

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId && !saving, [ranchLoading, activeRanchId, saving]);

  function resetLocalPhotos() {
    for (const purpose of Object.keys(localPhotos) as PhotoPurpose[]) {
      for (const photo of localPhotos[purpose]) {
        URL.revokeObjectURL(photo.url);
      }
    }
    setLocalPhotos(emptyLocalPhotos());
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setManufacturerName("");
    setUnitType("WEIGHT");
    setDefaultUnit("lb");
    setDefaultPackageWeight("");
    setDefaultPackageUnit("lb");
    setIsBulkCommodity(false);
    setNotes("");
    setEligibleSpecies([]);
    setExistingPhotos(emptyExistingPhotos());
    setRemovePhotoIds(new Set());
    resetLocalPhotos();
    setSaveError(null);
  }

  function addLocalPhotos(purpose: PhotoPurpose, files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: LocalFeedPhoto[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      originalName: file.name,
    }));
    setLocalPhotos((prev) => ({
      ...prev,
      [purpose]: [...prev[purpose], ...next],
    }));
  }

  function removeLocalPhoto(purpose: PhotoPurpose, photoId: string) {
    setLocalPhotos((prev) => {
      const photo = prev[purpose].find((p) => p.id === photoId);
      if (photo) URL.revokeObjectURL(photo.url);
      return {
        ...prev,
        [purpose]: prev[purpose].filter((p) => p.id !== photoId),
      };
    });
  }

  function toggleExistingPhoto(photoId: string, marked: boolean) {
    setRemovePhotoIds((prev) => {
      const next = new Set(prev);
      if (marked) next.add(photoId);
      else next.delete(photoId);
      return next;
    });
  }

  function toggleSpecies(species: string, checked: boolean) {
    setEligibleSpecies((prev) => {
      const next = new Set(prev);
      if (checked) next.add(species);
      else next.delete(species);
      return Array.from(next);
    });
  }

  async function loadComponents() {
    setLoadingComponents(true);
    setLoadError(null);
    try {
      const raw = await apiGet("/feed/components");
      const parsed = FeedComponentsResponseSchema.parse(raw);
      setComponents(parsed.components ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load feed components");
      setComponents([]);
    } finally {
      setLoadingComponents(false);
    }
  }

  async function loadSpecies() {
    setLoadingSpecies(true);
    try {
      const raw = await apiGet("/feed/species-options");
      const parsed = FeedSpeciesOptionsResponseSchema.parse(raw);
      setSpeciesOptions(parsed.species ?? []);
    } catch {
      setSpeciesOptions([]);
    } finally {
      setLoadingSpecies(false);
    }
  }

  async function startEdit(componentId: string) {
    setSaveError(null);
    try {
      const raw = await apiGet(`/feed/components/${encodeURIComponent(componentId)}`);
      const parsed = FeedComponentDetailResponseSchema.parse(raw);
      const component = parsed.component;
      setEditingId(component.id);
      setName(component.name ?? "");
      setManufacturerName(component.manufacturerName ?? "");
      setUnitType(unitTypeForUi(component.unitType));
      setDefaultUnit(component.defaultUnit ?? "lb");
      setDefaultPackageWeight(component.defaultPackageWeight ?? "");
      setDefaultPackageUnit(component.defaultPackageUnit ?? "lb");
      setIsBulkCommodity(Boolean(component.isBulkCommodity));
      setNotes(component.notes ?? "");
      setEligibleSpecies(component.eligibleSpecies ?? []);
      setRemovePhotoIds(new Set());
      resetLocalPhotos();

      const nextExisting = emptyExistingPhotos();
      for (const photo of parsed.photos ?? []) {
        const purpose = mapPurpose(photo.purpose);
        nextExisting[purpose].push({
          id: photo.id,
          url: photo.url ?? null,
          originalFilename: photo.originalFilename ?? null,
        });
      }
      setExistingPhotos(nextExisting);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to load component details");
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!activeRanchId || saving) return;
    if (!name.trim()) {
      setSaveError("Component name is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (manufacturerName.trim()) fd.append("manufacturerName", manufacturerName.trim());
      fd.append("unitType", unitType);
      if (defaultUnit.trim()) fd.append("defaultUnit", defaultUnit.trim());
      fd.append("defaultPackageWeight", defaultPackageWeight.trim());
      fd.append("defaultPackageUnit", defaultPackageUnit.trim());
      fd.append("isBulkCommodity", isBulkCommodity ? "true" : "false");
      if (notes.trim()) fd.append("notes", notes.trim());
      fd.append("eligibleSpecies", JSON.stringify(eligibleSpecies));

      if (removePhotoIds.size > 0) {
        fd.append("removePhotoIds", JSON.stringify(Array.from(removePhotoIds)));
      }

      for (const photo of localPhotos.packaging) {
        fd.append("packaging", photo.file, photo.originalName);
      }
      for (const photo of localPhotos.misc) {
        fd.append("misc", photo.file, photo.originalName);
      }

      if (editingId) {
        await apiPutForm(`/feed/components/${encodeURIComponent(editingId)}`, fd);
      } else {
        await apiPostForm("/feed/components", fd);
      }

      await loadComponents();
      resetForm();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save component");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void Promise.all([loadComponents(), loadSpecies()]);
  }, [activeRanchId]);

  useEffect(() => {
    return () => {
      resetLocalPhotos();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Feed Components</h1>
        <p className="text-stone-600 mt-1">
          Define feed ingredients and attach packaging photos for future OCR/CV workflows.
        </p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to manage feed components.</div>
        </Card>
      )}

      <Card title={editingId ? "Edit Feed Component" : "Create Feed Component"}>
        <form onSubmit={submitForm} className="space-y-4 p-4">
          {saveError && <div className="text-sm text-red-600">{saveError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="feed-component-name">Component name</Label>
              <Input
                id="feed-component-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-component-manufacturer">Manufacturer (optional)</Label>
              <Input
                id="feed-component-manufacturer"
                value={manufacturerName}
                onChange={(e) => setManufacturerName(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-component-unit-type">Unit Type</Label>
              <Select value={unitType} onValueChange={(value) => setUnitType(value as FeedUnitType)} disabled={!canInteract}>
                <SelectTrigger id="feed-component-unit-type" aria-label="Feed component unit type">
                  <SelectValue placeholder="Select unit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEIGHT">WEIGHT</SelectItem>
                  <SelectItem value="COUNT">COUNT</SelectItem>
                  <SelectItem value="VOLUME">VOLUME</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-component-unit">Default unit</Label>
              <Input
                id="feed-component-unit"
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-component-package-weight">Default weight per count unit (optional)</Label>
              <Input
                id="feed-component-package-weight"
                value={defaultPackageWeight}
                onChange={(e) => setDefaultPackageWeight(e.target.value)}
                disabled={!canInteract}
                placeholder="50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-component-package-unit">Weight unit (optional)</Label>
              <Input
                id="feed-component-package-unit"
                value={defaultPackageUnit}
                onChange={(e) => setDefaultPackageUnit(e.target.value)}
                disabled={!canInteract}
                placeholder="lb"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="feed-component-bulk" className="flex items-center gap-2 text-sm text-stone-800">
                <Checkbox
                  id="feed-component-bulk"
                  checked={isBulkCommodity}
                  onCheckedChange={(value) => setIsBulkCommodity(value === true)}
                  disabled={!canInteract}
                />
                <span>Bulk commodity</span>
              </label>
              <div className="text-xs text-muted-foreground">
                Use this for commodities delivered in bulk (for example by ton).
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="feed-component-notes">Notes (optional)</Label>
              <Textarea
                id="feed-component-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Eligible Species</Label>
              <FeedSpeciesSelector
                options={speciesOptions}
                selected={eligibleSpecies}
                loading={loadingSpecies}
                disabled={!canInteract}
                onToggle={toggleSpecies}
              />
            </div>
          </div>

          <div className="space-y-6">
            <FeedPhotoUploader
              id="feed-component-packaging"
              title="Packaging Photos"
              description="Upload bag or label photos."
              ariaLabel="Feed component packaging photo upload"
              existingPhotos={existingPhotos.packaging}
              markedForDelete={removePhotoIds}
              localPhotos={localPhotos.packaging}
              disabled={!canInteract}
              onAddFiles={(files) => addLocalPhotos("packaging", files)}
              onRemoveLocal={(photoId) => removeLocalPhoto("packaging", photoId)}
              onToggleDeleteExisting={toggleExistingPhoto}
            />

            <FeedPhotoUploader
              id="feed-component-misc"
              title="Misc Photos"
              description="Optional extra images for operator reference."
              ariaLabel="Feed component misc photo upload"
              existingPhotos={existingPhotos.misc}
              markedForDelete={removePhotoIds}
              localPhotos={localPhotos.misc}
              disabled={!canInteract}
              onAddFiles={(files) => addLocalPhotos("misc", files)}
              onRemoveLocal={(photoId) => removeLocalPhoto("misc", photoId)}
              onToggleDeleteExisting={toggleExistingPhoto}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={!canInteract}>
                Cancel Edit
              </Button>
            )}
            <Button type="submit" disabled={!canInteract}>
              {saving ? "Saving..." : editingId ? "Save Component" : "Create Component"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Component List">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-4">Component</div>
              <div className="col-span-3">Eligible Species</div>
              <div className="col-span-2">On Hand</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>

            {loadingComponents ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : components.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">
                No feed components yet.
              </div>
            ) : (
              <div className="divide-y">
                {components.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center">
                    <div className="col-span-4">
                      <div className="font-medium text-stone-800">{row.name}</div>
                      {row.manufacturerName && (
                        <div className="text-xs text-stone-500">{row.manufacturerName}</div>
                      )}
                      <div className="text-xs text-stone-500">
                        {unitTypeForUi(row.unitType)} | default: {row.defaultUnit}
                      </div>
                    </div>
                    <div className="col-span-3 text-stone-700">{speciesLabel(row)}</div>
                    <div className="col-span-2 text-stone-700">
                      {row.quantityOnHand ?? "0"} {row.defaultUnit}
                    </div>
                    <div className="col-span-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(row.id)}
                        disabled={!canInteract}
                        aria-label={`Edit ${row.name}`}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
