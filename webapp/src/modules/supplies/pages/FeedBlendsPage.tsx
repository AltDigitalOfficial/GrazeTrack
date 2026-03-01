import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiGet, apiPostForm, apiPutForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import {
  FeedBlendDetailResponseSchema,
  FeedBlendsResponseSchema,
  FeedComponentsResponseSchema,
  FeedSpeciesOptionsResponseSchema,
  type FeedBlendRow,
  type FeedComponentRow,
} from "@/lib/contracts/feed";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type BlendItemDraft = {
  id: string;
  feedComponentId: string;
  percent: string;
};

function emptyExistingPhotos(): ExistingPhotosByPurpose {
  return { packaging: [], misc: [] };
}

function emptyLocalPhotos(): LocalPhotosByPurpose {
  return { packaging: [], misc: [] };
}

function newBlendItem(): BlendItemDraft {
  return { id: crypto.randomUUID(), feedComponentId: "", percent: "" };
}

function mapPurpose(value: string | undefined): PhotoPurpose {
  return value === "misc" ? "misc" : "packaging";
}

function unitTypeForUi(value: string | null | undefined): FeedUnitType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "COUNT" || normalized === "VOLUME") {
    return normalized as FeedUnitType;
  }
  return "COUNT";
}

function speciesLabel(row: FeedBlendRow): string {
  const values = row.eligibleSpecies ?? [];
  if (row.eligibleSpeciesIsAll || values.length === 0) return "All ranch species";
  return values.join(", ");
}

function percentTotal(items: BlendItemDraft[]): number {
  return items.reduce((sum, item) => {
    const n = Number(item.percent);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

export default function FeedBlendsPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [blends, setBlends] = useState<FeedBlendRow[]>([]);
  const [components, setComponents] = useState<FeedComponentRow[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<string[]>([]);

  const [loadingBlends, setLoadingBlends] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
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
  const [versionNotes, setVersionNotes] = useState("");
  const [eligibleSpecies, setEligibleSpecies] = useState<string[]>([]);
  const [items, setItems] = useState<BlendItemDraft[]>([newBlendItem()]);

  const [existingPhotos, setExistingPhotos] = useState<ExistingPhotosByPurpose>(emptyExistingPhotos());
  const [localPhotos, setLocalPhotos] = useState<LocalPhotosByPurpose>(emptyLocalPhotos());
  const [removePhotoIds, setRemovePhotoIds] = useState<Set<string>>(new Set());

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId && !saving, [ranchLoading, activeRanchId, saving]);
  const totalPercent = useMemo(() => percentTotal(items), [items]);

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
    setVersionNotes("");
    setEligibleSpecies([]);
    setItems([newBlendItem()]);
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

  function addItemRow() {
    setItems((prev) => [...prev, newBlendItem()]);
  }

  function removeItemRow(rowId: string) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
  }

  function updateItem(rowId: string, patch: Partial<BlendItemDraft>) {
    setItems((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  async function loadOptions() {
    setLoadingOptions(true);
    try {
      const [componentsRaw, speciesRaw] = await Promise.all([
        apiGet("/feed/components"),
        apiGet("/feed/species-options"),
      ]);
      const componentsParsed = FeedComponentsResponseSchema.parse(componentsRaw);
      const speciesParsed = FeedSpeciesOptionsResponseSchema.parse(speciesRaw);
      setComponents(componentsParsed.components ?? []);
      setSpeciesOptions(speciesParsed.species ?? []);
    } catch {
      setComponents([]);
      setSpeciesOptions([]);
    } finally {
      setLoadingOptions(false);
    }
  }

  async function loadBlends() {
    setLoadingBlends(true);
    setLoadError(null);
    try {
      const raw = await apiGet("/feed/blends");
      const parsed = FeedBlendsResponseSchema.parse(raw);
      setBlends(parsed.blends ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load feed blends");
      setBlends([]);
    } finally {
      setLoadingBlends(false);
    }
  }

  async function startEdit(blendId: string) {
    setSaveError(null);
    try {
      const raw = await apiGet(`/feed/blends/${encodeURIComponent(blendId)}`);
      const parsed = FeedBlendDetailResponseSchema.parse(raw);
      const blend = parsed.blend;
      const currentVersion =
        blend.versions.find((v) => v.isCurrent) ??
        (blend.versions.length > 0 ? blend.versions[0] : null);

      setEditingId(blend.id);
      setName(blend.name ?? "");
      setManufacturerName(blend.manufacturerName ?? "");
      setUnitType(unitTypeForUi(blend.unitType));
      setDefaultUnit(blend.defaultUnit ?? "lb");
      setDefaultPackageWeight(blend.defaultPackageWeight ?? "");
      setDefaultPackageUnit(blend.defaultPackageUnit ?? "lb");
      setIsBulkCommodity(Boolean(blend.isBulkCommodity));
      setNotes(blend.notes ?? "");
      setVersionNotes("");
      setEligibleSpecies(blend.eligibleSpecies ?? []);
      setItems(
        currentVersion && currentVersion.items.length > 0
          ? currentVersion.items.map((item) => ({
              id: crypto.randomUUID(),
              feedComponentId: item.feedComponentId,
              percent: item.percent,
            }))
          : [newBlendItem()]
      );
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
      setSaveError(err instanceof Error ? err.message : "Failed to load blend detail");
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!activeRanchId || saving) return;
    if (!name.trim()) {
      setSaveError("Blend name is required.");
      return;
    }

    const cleanedItems = items
      .map((item) => ({
        feedComponentId: item.feedComponentId,
        percent: item.percent.trim(),
      }))
      .filter((item) => item.feedComponentId && item.percent.length > 0);

    if (cleanedItems.length === 0) {
      setSaveError("Add at least one component to the blend.");
      return;
    }

    const itemIds = cleanedItems.map((item) => item.feedComponentId);
    if (new Set(itemIds).size !== itemIds.length) {
      setSaveError("Each component can only appear once in a blend.");
      return;
    }

    const total = cleanedItems.reduce((sum, item) => sum + Number(item.percent), 0);
    if (!Number.isFinite(total) || Math.abs(total - 100) > 0.01) {
      setSaveError("Blend percentages must total 100 (plus/minus 0.01).");
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
      if (versionNotes.trim()) fd.append("versionNotes", versionNotes.trim());
      fd.append("eligibleSpecies", JSON.stringify(eligibleSpecies));
      fd.append("items", JSON.stringify(cleanedItems));

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
        await apiPutForm(`/feed/blends/${encodeURIComponent(editingId)}`, fd);
      } else {
        await apiPostForm("/feed/blends", fd);
      }

      await loadBlends();
      resetForm();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save blend");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void Promise.all([loadBlends(), loadOptions()]);
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
        <h1 className="text-3xl font-bold text-stone-800">Feed Blends</h1>
        <p className="text-stone-600 mt-1">
          Create versioned blend formulas and keep packaging references for future automation.
        </p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to manage feed blends.</div>
        </Card>
      )}

      <Card title={editingId ? "Edit Feed Blend" : "Create Feed Blend"}>
        <form onSubmit={submitForm} className="space-y-4 p-4">
          {saveError && <div className="text-sm text-red-600">{saveError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="feed-blend-name">Blend name</Label>
              <Input
                id="feed-blend-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-blend-manufacturer">Manufacturer (optional)</Label>
              <Input
                id="feed-blend-manufacturer"
                value={manufacturerName}
                onChange={(e) => setManufacturerName(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-blend-unit-type">Unit Type</Label>
              <Select value={unitType} onValueChange={(value) => setUnitType(value as FeedUnitType)} disabled={!canInteract}>
                <SelectTrigger id="feed-blend-unit-type" aria-label="Feed blend unit type">
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
              <Label htmlFor="feed-blend-unit">Default unit</Label>
              <Input
                id="feed-blend-unit"
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-blend-package-weight">Default weight per count unit (optional)</Label>
              <Input
                id="feed-blend-package-weight"
                value={defaultPackageWeight}
                onChange={(e) => setDefaultPackageWeight(e.target.value)}
                disabled={!canInteract}
                placeholder="50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-blend-package-unit">Weight unit (optional)</Label>
              <Input
                id="feed-blend-package-unit"
                value={defaultPackageUnit}
                onChange={(e) => setDefaultPackageUnit(e.target.value)}
                disabled={!canInteract}
                placeholder="lb"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="feed-blend-bulk" className="flex items-center gap-2 text-sm text-stone-800">
                <Checkbox
                  id="feed-blend-bulk"
                  checked={isBulkCommodity}
                  onCheckedChange={(value) => setIsBulkCommodity(value === true)}
                  disabled={!canInteract}
                />
                <span>Bulk commodity</span>
              </label>
              <div className="text-xs text-muted-foreground">
                Use this for blends delivered in bulk (for example by ton).
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="feed-blend-notes">Notes (optional)</Label>
              <Textarea
                id="feed-blend-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Eligible Species</Label>
              <FeedSpeciesSelector
                options={speciesOptions}
                selected={eligibleSpecies}
                loading={loadingOptions}
                disabled={!canInteract}
                onToggle={toggleSpecies}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Blend Composition (Versioned)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItemRow} disabled={!canInteract}>
                Add Component
              </Button>
            </div>

            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-7">
                    <Label htmlFor={`blend-component-${item.id}`}>Component</Label>
                    <Select
                      value={item.feedComponentId || "__none"}
                      onValueChange={(value) =>
                        updateItem(item.id, { feedComponentId: value === "__none" ? "" : value })
                      }
                      disabled={!canInteract}
                    >
                      <SelectTrigger id={`blend-component-${item.id}`} aria-label="Blend component">
                        <SelectValue placeholder="Select component..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Select component...</SelectItem>
                        {components.map((component) => (
                          <SelectItem key={component.id} value={component.id}>
                            {component.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-3">
                    <Label htmlFor={`blend-percent-${item.id}`}>Percent</Label>
                    <Input
                      id={`blend-percent-${item.id}`}
                      value={item.percent}
                      onChange={(e) => updateItem(item.id, { percent: e.target.value })}
                      disabled={!canInteract}
                    />
                  </div>

                  <div className="col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => removeItemRow(item.id)}
                      disabled={!canInteract || items.length === 1}
                      aria-label="Remove blend item"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div
              className={`text-sm ${Math.abs(totalPercent - 100) <= 0.01 ? "text-green-700" : "text-red-600"}`}
            >
              Percent total: {totalPercent.toFixed(2)}%
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-blend-version-notes">Version notes (optional)</Label>
              <Input
                id="feed-blend-version-notes"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                disabled={!canInteract}
              />
            </div>
          </div>

          <div className="space-y-6">
            <FeedPhotoUploader
              id="feed-blend-packaging"
              title="Packaging Photos"
              description="Upload blend bag/label photos."
              ariaLabel="Feed blend packaging photo upload"
              existingPhotos={existingPhotos.packaging}
              markedForDelete={removePhotoIds}
              localPhotos={localPhotos.packaging}
              disabled={!canInteract}
              onAddFiles={(files) => addLocalPhotos("packaging", files)}
              onRemoveLocal={(photoId) => removeLocalPhoto("packaging", photoId)}
              onToggleDeleteExisting={toggleExistingPhoto}
            />

            <FeedPhotoUploader
              id="feed-blend-misc"
              title="Misc Photos"
              description="Any supporting images for blend reference."
              ariaLabel="Feed blend misc photo upload"
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
              {saving ? "Saving..." : editingId ? "Save Blend" : "Create Blend"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Blend List">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-4">Blend</div>
              <div className="col-span-3">Eligible Species</div>
              <div className="col-span-2">Current Version</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>

            {loadingBlends ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : blends.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">
                No feed blends yet.
              </div>
            ) : (
              <div className="divide-y">
                {blends.map((blend) => (
                  <div key={blend.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center">
                    <div className="col-span-4">
                      <div className="font-medium text-stone-800">{blend.name}</div>
                      {blend.manufacturerName && (
                        <div className="text-xs text-stone-500">{blend.manufacturerName}</div>
                      )}
                      <div className="text-xs text-stone-500">
                        {unitTypeForUi(blend.unitType)} | default: {blend.defaultUnit ?? "lb"}
                      </div>
                    </div>
                    <div className="col-span-3 text-stone-700">{speciesLabel(blend)}</div>
                    <div className="col-span-2 text-stone-700">
                      {blend.currentVersion ? (
                        <span>
                          v{blend.currentVersion.versionNumber} ({blend.currentVersion.percentTotal}%)
                        </span>
                      ) : (
                        "No version"
                      )}
                    </div>
                    <div className="col-span-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(blend.id)}
                        disabled={!canInteract}
                        aria-label={`Edit ${blend.name}`}
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
