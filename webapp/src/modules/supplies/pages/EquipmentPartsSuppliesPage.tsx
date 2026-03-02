import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiDelete, apiGet, apiPost, apiPostForm, apiPut } from "@/lib/api";
import {
  EquipmentAssetsResponseSchema,
  EquipmentAttachmentsResponseSchema,
  EquipmentPartDetailResponseSchema,
  EquipmentPartEventCreateResponseSchema,
  EquipmentPartsResponseSchema,
  type EquipmentAttachment,
  type EquipmentAssetRow,
  type EquipmentPartCategory,
  type EquipmentPartEventType,
  type EquipmentPartInventoryEventWithAttachments,
  type EquipmentPartRow,
  type EquipmentPartUnitType,
} from "@/lib/contracts/equipment";
import { useRanch } from "@/lib/ranchContext";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EquipmentAttachmentUploader } from "@/modules/supplies/components/EquipmentAttachmentUploader";

type CategoryFilter = "ALL" | EquipmentPartCategory;

type PartDetail = {
  part: EquipmentPartRow;
  attachments: EquipmentAttachment[];
  recentEvents: EquipmentPartInventoryEventWithAttachments[];
};

type EventFormState = {
  eventDate: string;
  eventType: EquipmentPartEventType;
  quantityDelta: string;
  unit: string;
  unitCost: string;
  vendor: string;
  notes: string;
};

const PART_CATEGORIES: EquipmentPartCategory[] = [
  "FENCING",
  "HARDWARE",
  "PLUMBING",
  "ELECTRICAL",
  "LIVESTOCK_HANDLING",
  "IMPLEMENT_PART",
  "VEHICLE_PART",
  "IDENTIFICATION",
  "MED_SUPPLIES",
  "OTHER",
];

const PART_UNIT_TYPES: EquipmentPartUnitType[] = ["COUNT", "LENGTH", "WEIGHT"];
const PART_EVENT_TYPES: EquipmentPartEventType[] = ["PURCHASE", "ADJUSTMENT", "USE", "OTHER"];

function enumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function formatQuantity(value: unknown): string {
  const n = numericOrNull(value);
  if (n === null) return "-";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatCurrency(value: unknown): string {
  const n = numericOrNull(value);
  if (n === null) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function lowStock(part: EquipmentPartRow): boolean {
  const onHand = numericOrNull(part.onHandQuantity);
  const threshold = numericOrNull(part.reorderThreshold);
  if (onHand === null || threshold === null) return false;
  return onHand <= threshold;
}

function normalizeUsedForValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const next = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  return Array.from(new Set(next));
}

function buildAssetOptionLabel(asset: EquipmentAssetRow): string | null {
  const make = typeof asset.make === "string" ? asset.make.trim() : "";
  const model = typeof asset.model === "string" ? asset.model.trim() : "";
  const modelYear = asset.modelYear == null ? "" : String(asset.modelYear).trim();
  const makeModelYear = [make, model, modelYear].filter(Boolean).join(" ").trim();
  if (makeModelYear.length > 0) return makeModelYear;
  const fallback = typeof asset.name === "string" ? asset.name.trim() : "";
  return fallback.length > 0 ? fallback : null;
}

function buildUsedForOptions(assets: EquipmentAssetRow[]): string[] {
  const labels = assets
    .map((asset) => buildAssetOptionLabel(asset))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
}

function toDomIdFragment(value: string): string {
  const fragment = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return fragment || "asset";
}

function createEventForm(seedUnit = "each"): EventFormState {
  return {
    eventDate: todayIsoDate(),
    eventType: "PURCHASE",
    quantityDelta: "",
    unit: seedUnit,
    unitCost: "",
    vendor: "",
    notes: "",
  };
}

export default function EquipmentPartsSuppliesPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [parts, setParts] = useState<EquipmentPartRow[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usedForOptions, setUsedForOptions] = useState<string[]>([]);
  const [usedForOptionsError, setUsedForOptionsError] = useState<string | null>(null);

  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [savingPart, setSavingPart] = useState(false);
  const [savePartError, setSavePartError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [uploadingPartAttachment, setUploadingPartAttachment] = useState(false);
  const [deletingPartAttachmentId, setDeletingPartAttachmentId] = useState<string | null>(null);

  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [deletingEventAttachmentId, setDeletingEventAttachmentId] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [category, setCategory] = useState<EquipmentPartCategory>("OTHER");
  const [description, setDescription] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [usedForAssetTypes, setUsedForAssetTypes] = useState<string[]>([]);
  const [unitType, setUnitType] = useState<EquipmentPartUnitType>("COUNT");
  const [defaultUnit, setDefaultUnit] = useState("each");
  const [onHandQuantity, setOnHandQuantity] = useState("0");
  const [reorderThreshold, setReorderThreshold] = useState("");
  const [reorderTarget, setReorderTarget] = useState("");
  const [vendor, setVendor] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(createEventForm("each"));
  const [eventFiles, setEventFiles] = useState<File[]>([]);
  const [eventFileInputKey, setEventFileInputKey] = useState(0);

  const canInteract = useMemo(
    () =>
      !ranchLoading &&
      !!activeRanchId &&
      !loadingParts &&
      !savingPart &&
      !detailLoading &&
      !eventSaving &&
      !uploadingPartAttachment,
    [ranchLoading, activeRanchId, loadingParts, savingPart, detailLoading, eventSaving, uploadingPartAttachment]
  );

  function resetPartForm() {
    setEditingId(null);
    setName("");
    setCategory("OTHER");
    setDescription("");
    setManufacturer("");
    setPartNumber("");
    setUsedForAssetTypes([]);
    setUnitType("COUNT");
    setDefaultUnit("each");
    setOnHandQuantity("0");
    setReorderThreshold("");
    setReorderTarget("");
    setVendor("");
    setCostPerUnit("");
    setStorageLocation("");
    setIsActive(true);
    setSavePartError(null);
  }

  function populatePartForm(row: EquipmentPartRow) {
    setEditingId(row.id);
    setName(row.name ?? "");
    setCategory((row.category as EquipmentPartCategory) ?? "OTHER");
    setDescription(row.description ?? "");
    setManufacturer(row.manufacturer ?? "");
    setPartNumber(row.partNumber ?? "");
    setUsedForAssetTypes(normalizeUsedForValues(row.usedForAssetTypes));
    setUnitType((row.unitType as EquipmentPartUnitType) ?? "COUNT");
    setDefaultUnit(row.defaultUnit ?? "each");
    setOnHandQuantity(String(row.onHandQuantity ?? "0"));
    setReorderThreshold(row.reorderThreshold == null ? "" : String(row.reorderThreshold));
    setReorderTarget(row.reorderTarget == null ? "" : String(row.reorderTarget));
    setVendor(row.vendor ?? "");
    setCostPerUnit(row.costPerUnit == null ? "" : String(row.costPerUnit));
    setStorageLocation(row.storageLocation ?? "");
    setIsActive(Boolean(row.isActive));
  }

  function resetEventForm(seedUnit: string) {
    setEventForm(createEventForm(seedUnit || "each"));
    setEventFiles([]);
    setEventFileInputKey((prev) => prev + 1);
    setEventError(null);
  }

  function toggleUsedForAssetType(option: string, checked: boolean) {
    setUsedForAssetTypes((prev) => {
      if (checked) return prev.includes(option) ? prev : [...prev, option];
      return prev.filter((value) => value !== option);
    });
  }

  async function loadUsedForOptions() {
    if (!activeRanchId) {
      setUsedForOptions([]);
      setUsedForOptionsError(null);
      return;
    }
    setUsedForOptionsError(null);
    try {
      const raw = await apiGet("/equipment/assets");
      const parsed = EquipmentAssetsResponseSchema.parse(raw);
      setUsedForOptions(buildUsedForOptions(parsed.assets ?? []));
    } catch (err: unknown) {
      setUsedForOptions([]);
      setUsedForOptionsError(err instanceof Error ? err.message : "Failed to load equipment assets for part compatibility.");
    }
  }

  async function loadParts() {
    setLoadingParts(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      if (includeInactive) params.set("includeInactive", "true");
      if (search.trim().length > 0) params.set("search", search.trim());
      const endpoint = params.toString() ? `/equipment/parts?${params.toString()}` : "/equipment/parts";
      const raw = await apiGet(endpoint);
      const parsed = EquipmentPartsResponseSchema.parse(raw);
      setParts(parsed.parts ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load equipment parts");
      setParts([]);
    } finally {
      setLoadingParts(false);
    }
  }

  async function loadPartDetail(partId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const raw = await apiGet(`/equipment/parts/${encodeURIComponent(partId)}`);
      const parsed = EquipmentPartDetailResponseSchema.parse(raw);
      const nextDetail: PartDetail = parsed;
      setDetail(nextDetail);
      return nextDetail;
    } catch (err: unknown) {
      setDetail(null);
      setDetailError(err instanceof Error ? err.message : "Failed to load equipment part detail");
      throw err;
    } finally {
      setDetailLoading(false);
    }
  }

  async function startEdit(partId: string) {
    setSavePartError(null);
    try {
      const nextDetail = await loadPartDetail(partId);
      populatePartForm(nextDetail.part);
      setEventDialogOpen(false);
      resetEventForm(nextDetail.part.defaultUnit ?? "each");
    } catch {
      // loadPartDetail already sets error state
    }
  }

  function startCreate() {
    resetPartForm();
  }

  async function submitPartForm(e: FormEvent) {
    e.preventDefault();
    if (!activeRanchId || savingPart) return;
    if (!name.trim()) {
      setSavePartError("Part name is required.");
      return;
    }

    setSavingPart(true);
    setSavePartError(null);
    try {
      const payload = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        manufacturer: manufacturer.trim() || null,
        partNumber: partNumber.trim() || null,
        usedForAssetTypes,
        unitType,
        defaultUnit: defaultUnit.trim() || "each",
        onHandQuantity: onHandQuantity.trim() || "0",
        reorderThreshold: reorderThreshold.trim() || null,
        reorderTarget: reorderTarget.trim() || null,
        vendor: vendor.trim() || null,
        costPerUnit: costPerUnit.trim() || null,
        storageLocation: storageLocation.trim() || null,
        isActive,
      };

      const raw = editingId
        ? await apiPut(`/equipment/parts/${encodeURIComponent(editingId)}`, payload)
        : await apiPost("/equipment/parts", payload);
      const parsed = EquipmentPartDetailResponseSchema.parse(raw);
      const nextDetail: PartDetail = parsed;
      setDetail(nextDetail);
      populatePartForm(nextDetail.part);
      await loadParts();
    } catch (err: unknown) {
      setSavePartError(err instanceof Error ? err.message : "Failed to save part");
    } finally {
      setSavingPart(false);
    }
  }

  async function uploadPartAttachments(files: FileList | null) {
    if (!detail?.part.id || !files || files.length === 0) return;
    setUploadingPartAttachment(true);
    setDetailError(null);
    try {
      const fd = new FormData();
      fd.append("entityType", "EQUIPMENT_PART");
      fd.append("entityId", detail.part.id);
      for (const file of Array.from(files)) {
        fd.append("file", file, file.name);
      }
      const raw = await apiPostForm("/equipment/attachments", fd);
      EquipmentAttachmentsResponseSchema.parse(raw);
      await loadPartDetail(detail.part.id);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to upload part attachments");
    } finally {
      setUploadingPartAttachment(false);
    }
  }

  async function deletePartAttachment(attachmentId: string) {
    if (!detail?.part.id || deletingPartAttachmentId) return;
    setDeletingPartAttachmentId(attachmentId);
    setDetailError(null);
    try {
      await apiDelete(`/equipment/attachments/${encodeURIComponent(attachmentId)}`);
      await loadPartDetail(detail.part.id);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to delete part attachment");
    } finally {
      setDeletingPartAttachmentId(null);
    }
  }

  async function submitEventForm(e: FormEvent) {
    e.preventDefault();
    if (!detail?.part.id || eventSaving) return;
    if (!eventForm.quantityDelta.trim()) {
      setEventError("Quantity delta is required.");
      return;
    }

    setEventSaving(true);
    setEventError(null);
    try {
      const fd = new FormData();
      fd.append("eventDate", eventForm.eventDate.trim() || todayIsoDate());
      fd.append("eventType", eventForm.eventType);
      fd.append("quantityDelta", eventForm.quantityDelta.trim());
      fd.append("unit", eventForm.unit.trim() || detail.part.defaultUnit || "each");
      fd.append("unitCost", eventForm.unitCost.trim());
      fd.append("vendor", eventForm.vendor.trim());
      fd.append("notes", eventForm.notes.trim());
      for (const file of eventFiles) {
        fd.append("file", file, file.name);
      }

      const raw = await apiPostForm(`/equipment/parts/${encodeURIComponent(detail.part.id)}/events`, fd);
      EquipmentPartEventCreateResponseSchema.parse(raw);
      await Promise.all([loadPartDetail(detail.part.id), loadParts()]);
      setEventDialogOpen(false);
      resetEventForm(detail.part.defaultUnit || "each");
    } catch (err: unknown) {
      setEventError(err instanceof Error ? err.message : "Failed to create inventory event");
    } finally {
      setEventSaving(false);
    }
  }

  async function uploadEventAttachments(eventId: string, files: FileList | null) {
    if (!detail?.part.id || !files || files.length === 0) return;
    setUploadingEventId(eventId);
    setDetailError(null);
    try {
      const fd = new FormData();
      fd.append("entityType", "EQUIPMENT_PART_EVENT");
      fd.append("entityId", eventId);
      for (const file of Array.from(files)) {
        fd.append("file", file, file.name);
      }
      const raw = await apiPostForm("/equipment/attachments", fd);
      EquipmentAttachmentsResponseSchema.parse(raw);
      await loadPartDetail(detail.part.id);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to upload event attachments");
    } finally {
      setUploadingEventId(null);
    }
  }

  async function deleteEventAttachment(attachmentId: string) {
    if (!detail?.part.id || deletingEventAttachmentId) return;
    setDeletingEventAttachmentId(attachmentId);
    setDetailError(null);
    try {
      await apiDelete(`/equipment/attachments/${encodeURIComponent(attachmentId)}`);
      await loadPartDetail(detail.part.id);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to delete event attachment");
    } finally {
      setDeletingEventAttachmentId(null);
    }
  }

  useEffect(() => {
    void loadUsedForOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId]);

  useEffect(() => {
    if (!activeRanchId) return;
    void loadParts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId, categoryFilter, includeInactive, search]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Equipment Parts &amp; Supplies</h1>
        <p className="text-stone-600 mt-1">
          Track inventory-facing parts/supplies, reorder levels, supporting attachments, and quantity adjustments.
        </p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to manage equipment parts and supplies.</div>
        </Card>
      )}

      <Card title={editingId ? "Edit Part" : "Add Part"}>
        <form onSubmit={submitPartForm} className="space-y-4 p-4">
          {savePartError && <div className="text-sm text-red-600">{savePartError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="equipment-part-name">Part/supply name</Label>
              <Input
                id="equipment-part-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canInteract}
                placeholder="T-post 6.5 ft"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-category">Category</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as EquipmentPartCategory)}
                disabled={!canInteract}
              >
                <SelectTrigger id="equipment-part-category" aria-label="Equipment part category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {PART_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium text-stone-800">Used for...</div>
              <div className="text-xs text-stone-500">Select matching assets by Make Model Year (optional).</div>
              {usedForOptionsError && <div className="text-xs text-red-600">{usedForOptionsError}</div>}
              {usedForOptions.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-stone-500">
                  No assets defined yet. Add assets first to select compatibility.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-md border p-3">
                  {usedForOptions.map((option, index) => {
                    const checkboxId = `equipment-part-used-for-${toDomIdFragment(option)}-${index}`;
                    return (
                      <label key={option} htmlFor={checkboxId} className="flex items-center gap-2 text-sm text-stone-800">
                        <Checkbox
                          id={checkboxId}
                          checked={usedForAssetTypes.includes(option)}
                          onCheckedChange={(value) => toggleUsedForAssetType(option, value === true)}
                          disabled={!canInteract}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-unit-type">Unit type</Label>
              <Select
                value={unitType}
                onValueChange={(value) => setUnitType(value as EquipmentPartUnitType)}
                disabled={!canInteract}
              >
                <SelectTrigger id="equipment-part-unit-type" aria-label="Equipment part unit type">
                  <SelectValue placeholder="Select unit type" />
                </SelectTrigger>
                <SelectContent>
                  {PART_UNIT_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-default-unit">Default unit</Label>
              <Input
                id="equipment-part-default-unit"
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                disabled={!canInteract}
                placeholder="each"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-on-hand">On hand</Label>
              <Input
                id="equipment-part-on-hand"
                value={onHandQuantity}
                onChange={(e) => setOnHandQuantity(e.target.value)}
                disabled={!canInteract}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-reorder-threshold">Reorder threshold</Label>
              <Input
                id="equipment-part-reorder-threshold"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                disabled={!canInteract}
                placeholder="20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-reorder-target">Reorder target</Label>
              <Input
                id="equipment-part-reorder-target"
                value={reorderTarget}
                onChange={(e) => setReorderTarget(e.target.value)}
                disabled={!canInteract}
                placeholder="80"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-cost-per-unit">Cost per unit</Label>
              <Input
                id="equipment-part-cost-per-unit"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                disabled={!canInteract}
                placeholder="5.50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-manufacturer">Manufacturer</Label>
              <Input
                id="equipment-part-manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                disabled={!canInteract}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-number">Part number</Label>
              <Input
                id="equipment-part-number"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                disabled={!canInteract}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-vendor">Vendor</Label>
              <Input
                id="equipment-part-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                disabled={!canInteract}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-part-location">Storage location</Label>
              <Input
                id="equipment-part-location"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                disabled={!canInteract}
                placeholder="Barn shelf A2"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="equipment-part-active" className="flex items-center gap-2 text-sm text-stone-800">
                <Checkbox
                  id="equipment-part-active"
                  checked={isActive}
                  onCheckedChange={(value) => setIsActive(value === true)}
                  disabled={!canInteract}
                />
                <span>Active</span>
              </label>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="equipment-part-description">Description</Label>
              <Textarea
                id="equipment-part-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canInteract}
                placeholder="Optional details..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetPartForm} disabled={!canInteract}>
                Cancel Edit
              </Button>
            )}
            <Button type="submit" disabled={!canInteract}>
              {savingPart ? "Saving..." : editingId ? "Save Part" : "Add Part"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Parts & Supplies">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label htmlFor="equipment-parts-search">Search</Label>
              <Input
                id="equipment-parts-search"
                aria-label="Equipment parts search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!canInteract}
                placeholder="Name, part number, location"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-parts-category-filter">Category</Label>
              <Select
                value={categoryFilter}
                onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}
                disabled={!canInteract}
              >
                <SelectTrigger id="equipment-parts-category-filter" aria-label="Equipment parts category filter">
                  <SelectValue placeholder="Category filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {PART_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-parts-include-inactive" className="text-sm">
                Include inactive
              </Label>
              <label htmlFor="equipment-parts-include-inactive" className="h-10 flex items-center gap-2 rounded-md border px-3">
                <Checkbox
                  id="equipment-parts-include-inactive"
                  checked={includeInactive}
                  onCheckedChange={(value) => setIncludeInactive(value === true)}
                  disabled={!canInteract}
                />
                <span className="text-sm text-stone-700">Show inactive rows</span>
              </label>
            </div>

            <div className="space-y-2 flex items-end">
              <Button type="button" variant="outline" onClick={startCreate} disabled={!canInteract}>
                New Part
              </Button>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">On Hand</div>
              <div className="col-span-2">Reorder</div>
              <div className="col-span-2">Location</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            {loadingParts ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : parts.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">No parts or supplies found for this filter.</div>
            ) : (
              <div className="divide-y">
                {parts.map((row) => (
                  <div key={row.id} className={`grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center`}>
                    <div className="col-span-3">
                      <div className="font-medium text-stone-800">{row.name}</div>
                      {!row.isActive && <div className="text-xs text-stone-500">Inactive</div>}
                    </div>
                    <div className="col-span-2 text-stone-700">{enumLabel(String(row.category ?? "OTHER"))}</div>
                    <div className="col-span-2 text-stone-700">
                      {formatQuantity(row.onHandQuantity)} {row.defaultUnit || "each"}
                    </div>
                    <div className="col-span-2">
                      {row.reorderThreshold == null ? (
                        <span className="text-stone-500">-</span>
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                            lowStock(row) ? "bg-red-100 text-red-800 border-red-200" : "bg-stone-100 text-stone-700 border-stone-200"
                          }`}
                        >
                          {formatQuantity(row.reorderThreshold)}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-stone-700">{row.storageLocation ?? "-"}</div>
                    <div className="col-span-1 flex justify-end">
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

      <Card title="Part Detail">
        <div className="space-y-4 p-4">
          {detailError && <div className="text-sm text-red-600">{detailError}</div>}

          {!detail ? (
            <div className="text-sm text-stone-600">Select a part to view attachments and inventory events.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-md border bg-stone-50 p-3">
                  <div className="text-xs text-stone-500">Part</div>
                  <div className="font-medium text-stone-800">{detail.part.name}</div>
                </div>
                <div className="rounded-md border bg-stone-50 p-3">
                  <div className="text-xs text-stone-500">On Hand</div>
                  <div className="font-medium text-stone-800">
                    {formatQuantity(detail.part.onHandQuantity)} {detail.part.defaultUnit || "each"}
                  </div>
                </div>
                <div className="rounded-md border bg-stone-50 p-3">
                  <div className="text-xs text-stone-500">Reorder Threshold</div>
                  <div className="font-medium text-stone-800">
                    {detail.part.reorderThreshold == null ? "-" : formatQuantity(detail.part.reorderThreshold)}
                  </div>
                </div>
                <div className="rounded-md border bg-stone-50 p-3">
                  <div className="text-xs text-stone-500">Reorder Target</div>
                  <div className="font-medium text-stone-800">
                    {detail.part.reorderTarget == null ? "-" : formatQuantity(detail.part.reorderTarget)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-medium text-stone-800">Used for assets</div>
                {normalizeUsedForValues(detail.part.usedForAssetTypes).length === 0 ? (
                  <div className="text-xs text-stone-500">No assets selected.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {normalizeUsedForValues(detail.part.usedForAssetTypes).map((assetLabel) => (
                      <span
                        key={assetLabel}
                        className="inline-flex rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
                      >
                        {assetLabel}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <EquipmentAttachmentUploader
                id="equipment-part-attachment-upload"
                title="Attachments"
                description="Upload photos or PDFs (product photos, spec sheets, manuals, receipts)."
                attachments={detail.attachments}
                disabled={!canInteract}
                uploading={uploadingPartAttachment}
                deletingId={deletingPartAttachmentId}
                onUploadFiles={uploadPartAttachments}
                onDeleteAttachment={deletePartAttachment}
              />

              <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-emerald-900">Inventory Events</div>
                    <div className="text-xs text-emerald-800">Record purchases and adjustments that update on-hand quantity.</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canInteract}
                    onClick={() => {
                      resetEventForm(detail.part.defaultUnit || "each");
                      setEventDialogOpen(true);
                    }}
                  >
                    Add Purchase / Adjustment
                  </Button>
                </div>

                {detail.recentEvents.length === 0 ? (
                  <div className="text-sm text-stone-600">No inventory events yet.</div>
                ) : (
                  <div className="space-y-3">
                    {detail.recentEvents.map((event) => (
                      <div key={event.id} className="rounded-md border bg-white p-3 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-stone-800">{enumLabel(String(event.eventType ?? "OTHER"))}</div>
                            <div className="text-xs text-stone-500">{event.eventDate ?? "-"}</div>
                          </div>
                          <div className="text-sm text-stone-800">
                            {formatQuantity(event.quantityDelta)} {event.unit}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-stone-700">
                          <div>
                            <span className="text-stone-500">Unit cost:</span> {formatCurrency(event.unitCost)}
                          </div>
                          <div>
                            <span className="text-stone-500">Vendor:</span> {event.vendor ?? "-"}
                          </div>
                          <div>
                            <span className="text-stone-500">Notes:</span> {event.notes ?? "-"}
                          </div>
                        </div>

                        <EquipmentAttachmentUploader
                          id={`equipment-part-event-attachments-${event.id}`}
                          title="Event Attachments"
                          description="Upload receipts or event photos."
                          attachments={event.attachments ?? []}
                          disabled={!canInteract}
                          uploading={uploadingEventId === event.id}
                          deletingId={deletingEventAttachmentId}
                          onUploadFiles={(files) => void uploadEventAttachments(event.id, files)}
                          onDeleteAttachment={(attachmentId) => void deleteEventAttachment(attachmentId)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Inventory Event</DialogTitle>
            <DialogDescription>Create a purchase or adjustment event for the selected part.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submitEventForm} className="space-y-4">
            {eventError && <div className="text-sm text-red-600">{eventError}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="equipment-part-event-date">Event date</Label>
                <Input
                  id="equipment-part-event-date"
                  type="date"
                  value={eventForm.eventDate}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, eventDate: e.target.value }))}
                  disabled={eventSaving}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="equipment-part-event-type">Event type</Label>
                <Select
                  value={eventForm.eventType}
                  onValueChange={(value) => setEventForm((prev) => ({ ...prev, eventType: value as EquipmentPartEventType }))}
                  disabled={eventSaving}
                >
                  <SelectTrigger id="equipment-part-event-type" aria-label="Equipment part event type">
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PART_EVENT_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {enumLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="equipment-part-event-quantity">Quantity delta</Label>
                <Input
                  id="equipment-part-event-quantity"
                  value={eventForm.quantityDelta}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, quantityDelta: e.target.value }))}
                  disabled={eventSaving}
                  placeholder="25 (use -5 for a negative adjustment)"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="equipment-part-event-unit">Unit</Label>
                <Input
                  id="equipment-part-event-unit"
                  value={eventForm.unit}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, unit: e.target.value }))}
                  disabled={eventSaving}
                  placeholder="each"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="equipment-part-event-unit-cost">Unit cost (optional)</Label>
                <Input
                  id="equipment-part-event-unit-cost"
                  value={eventForm.unitCost}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, unitCost: e.target.value }))}
                  disabled={eventSaving}
                  placeholder="5.50"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="equipment-part-event-vendor">Vendor (optional)</Label>
                <Input
                  id="equipment-part-event-vendor"
                  value={eventForm.vendor}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, vendor: e.target.value }))}
                  disabled={eventSaving}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="equipment-part-event-notes">Notes</Label>
                <Textarea
                  id="equipment-part-event-notes"
                  rows={2}
                  value={eventForm.notes}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={eventSaving}
                  placeholder="Optional details..."
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="equipment-part-event-files">Attachments</Label>
                <Input
                  key={eventFileInputKey}
                  id="equipment-part-event-files"
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  multiple
                  onChange={(e) => setEventFiles(Array.from(e.target.files ?? []))}
                  disabled={eventSaving}
                />
                <div className="text-xs text-stone-500">
                  {eventFiles.length > 0 ? `${eventFiles.length} file(s) selected.` : "Optional: receipts or photos."}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={eventSaving}
                onClick={() => {
                  setEventDialogOpen(false);
                  resetEventForm(detail?.part.defaultUnit || "each");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={eventSaving}>
                {eventSaving ? "Saving..." : "Save Event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
