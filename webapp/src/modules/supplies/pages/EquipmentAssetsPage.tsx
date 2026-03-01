import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiDelete, apiGet, apiPost, apiPostForm, apiPut, apiPutForm } from "@/lib/api";
import {
  EquipmentAssetDetailResponseSchema,
  EquipmentAssetsResponseSchema,
  EquipmentAttachmentsResponseSchema,
  EquipmentMaintenanceEventResponseSchema,
  EquipmentMaintenanceEventsResponseSchema,
  type EquipmentAcquisitionType,
  type EquipmentAssetIdentifier,
  type EquipmentAssetIdentifierType,
  type EquipmentAssetRow,
  type EquipmentAssetStatus,
  type EquipmentAssetType,
  type EquipmentAttachment,
  type EquipmentMaintenanceEventType,
  type EquipmentMaintenanceEventWithAttachments,
  type EquipmentMeterType,
} from "@/lib/contracts/equipment";
import { useRanch } from "@/lib/ranchContext";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EquipmentAttachmentUploader } from "@/modules/supplies/components/EquipmentAttachmentUploader";

type AssetFilter = "ALL" | EquipmentAssetType;
type StatusFilter = "ALL" | EquipmentAssetStatus;

type IdentifierDraft = {
  id: string;
  identifierType: EquipmentAssetIdentifierType;
  identifierValue: string;
  notes: string;
};

type AssetDetail = {
  asset: EquipmentAssetRow;
  identifiers: EquipmentAssetIdentifier[];
  attachments: EquipmentAttachment[];
  maintenanceSummary: {
    eventCount: number;
    lastEventDate: string | null;
    nextDueDate: string | null;
    nextDueMeter: string | null;
  };
};

type MaintenanceFormState = {
  eventDate: string;
  eventType: EquipmentMaintenanceEventType;
  title: string;
  description: string;
  provider: string;
  laborCost: string;
  partsCost: string;
  totalCost: string;
  meterReading: string;
  meterType: EquipmentMeterType;
  nextDueDate: string;
  nextDueMeter: string;
};

const ASSET_TYPES: EquipmentAssetType[] = [
  "VEHICLE",
  "TRACTOR",
  "ATV_UTV",
  "TRAILER",
  "IMPLEMENT",
  "LIVESTOCK_HANDLING",
  "POWER_TOOL",
  "ELECTRONICS",
  "GENERATOR",
  "PUMP",
  "OTHER",
];
const ASSET_STATUSES: EquipmentAssetStatus[] = ["ACTIVE", "SOLD", "RETIRED", "LOST", "RENTED", "LEASED"];
const ACQUISITION_TYPES: EquipmentAcquisitionType[] = ["PURCHASED", "LEASED", "RENTED", "INHERITED", "OTHER"];
const METER_TYPES: EquipmentMeterType[] = ["NONE", "HOURS", "MILES", "OTHER"];
const IDENTIFIER_TYPES: EquipmentAssetIdentifierType[] = [
  "VIN",
  "PIN",
  "SERIAL",
  "ENGINE_SERIAL",
  "LICENSE_PLATE",
  "TAG",
  "OTHER",
];
const MAINTENANCE_EVENT_TYPES: EquipmentMaintenanceEventType[] = [
  "SERVICE",
  "REPAIR",
  "INSPECTION",
  "MODIFICATION",
  "WARRANTY",
  "OTHER",
];

function enumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shouldTrackMaintenanceByDefault(assetType: EquipmentAssetType): boolean {
  return ["VEHICLE", "TRACTOR", "ATV_UTV", "POWER_TOOL", "ELECTRONICS", "GENERATOR"].includes(assetType);
}

function createIdentifierDraft(seed?: Partial<IdentifierDraft>): IdentifierDraft {
  return {
    id: crypto.randomUUID(),
    identifierType: seed?.identifierType ?? "SERIAL",
    identifierValue: seed?.identifierValue ?? "",
    notes: seed?.notes ?? "",
  };
}

function normalizeMeterType(value: unknown): EquipmentMeterType {
  if (value === "NONE" || value === "HOURS" || value === "MILES" || value === "OTHER") return value;
  return "NONE";
}

function normalizeMaintenanceEventType(value: unknown): EquipmentMaintenanceEventType {
  if (value === "SERVICE" || value === "REPAIR" || value === "INSPECTION" || value === "MODIFICATION" || value === "WARRANTY") {
    return value;
  }
  return "OTHER";
}

function toInputValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatCurrency(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function createMaintenanceFormState(seedMeterType: EquipmentMeterType = "NONE"): MaintenanceFormState {
  return {
    eventDate: todayIsoDate(),
    eventType: "SERVICE",
    title: "",
    description: "",
    provider: "",
    laborCost: "",
    partsCost: "",
    totalCost: "",
    meterReading: "",
    meterType: seedMeterType,
    nextDueDate: "",
    nextDueMeter: "",
  };
}

function appendIfPresent(fd: FormData, key: string, value: string) {
  const next = value.trim();
  if (next.length > 0) fd.append(key, next);
}

export default function EquipmentAssetsPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [assets, setAssets] = useState<EquipmentAssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<EquipmentAssetType>("OTHER");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [status, setStatus] = useState<EquipmentAssetStatus>("ACTIVE");
  const [acquisitionType, setAcquisitionType] = useState<EquipmentAcquisitionType>("PURCHASED");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [currentValueEstimate, setCurrentValueEstimate] = useState("");
  const [trackMaintenance, setTrackMaintenance] = useState(false);
  const [meterType, setMeterType] = useState<EquipmentMeterType>("NONE");
  const [defaultMeterUnitLabel, setDefaultMeterUnitLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [identifiers, setIdentifiers] = useState<IdentifierDraft[]>([]);

  const [maintenanceEvents, setMaintenanceEvents] = useState<EquipmentMaintenanceEventWithAttachments[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceFormOpen, setMaintenanceFormOpen] = useState(false);
  const [maintenanceEditingId, setMaintenanceEditingId] = useState<string | null>(null);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceSaveError, setMaintenanceSaveError] = useState<string | null>(null);
  const [maintenanceUploadingEventId, setMaintenanceUploadingEventId] = useState<string | null>(null);
  const [maintenanceDeletingAttachmentId, setMaintenanceDeletingAttachmentId] = useState<string | null>(null);
  const [maintenanceFiles, setMaintenanceFiles] = useState<File[]>([]);
  const [maintenanceFileInputKey, setMaintenanceFileInputKey] = useState(0);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormState>(createMaintenanceFormState("NONE"));

  const canInteract = useMemo(
    () => !ranchLoading && !!activeRanchId && !saving && !uploadingAttachments && !detailLoading && !maintenanceSaving,
    [ranchLoading, activeRanchId, saving, uploadingAttachments, detailLoading, maintenanceSaving]
  );

  function resetForm() {
    setEditingId(null);
    setName("");
    setAssetType("OTHER");
    setMake("");
    setModel("");
    setModelYear("");
    setStatus("ACTIVE");
    setAcquisitionType("PURCHASED");
    setAcquisitionDate("");
    setPurchasePrice("");
    setCurrentValueEstimate("");
    setTrackMaintenance(false);
    setMeterType("NONE");
    setDefaultMeterUnitLabel("");
    setNotes("");
    setIdentifiers([]);
    setSaveError(null);
    setDetailError(null);
  }

  function resetMaintenanceFormForAsset(selected: AssetDetail | null) {
    const seedMeterType = selected ? normalizeMeterType(selected.asset.meterType) : "NONE";
    setMaintenanceForm(createMaintenanceFormState(seedMeterType));
    setMaintenanceEditingId(null);
    setMaintenanceSaveError(null);
    setMaintenanceFiles([]);
    setMaintenanceFileInputKey((prev) => prev + 1);
  }

  function populateFormFromDetail(nextDetail: AssetDetail) {
    const row = nextDetail.asset;
    setEditingId(row.id);
    setName(row.name ?? "");
    setAssetType((row.assetType as EquipmentAssetType) ?? "OTHER");
    setMake(row.make ?? "");
    setModel(row.model ?? "");
    setModelYear(row.modelYear ? String(row.modelYear) : "");
    setStatus((row.status as EquipmentAssetStatus) ?? "ACTIVE");
    setAcquisitionType((row.acquisitionType as EquipmentAcquisitionType) ?? "PURCHASED");
    setAcquisitionDate(row.acquisitionDate ?? "");
    setPurchasePrice(row.purchasePrice ?? "");
    setCurrentValueEstimate(row.currentValueEstimate ?? "");
    setTrackMaintenance(Boolean(row.trackMaintenance));
    setMeterType(normalizeMeterType(row.meterType));
    setDefaultMeterUnitLabel(row.defaultMeterUnitLabel ?? "");
    setNotes(row.notes ?? "");
    setIdentifiers(
      (nextDetail.identifiers ?? []).map((item) =>
        createIdentifierDraft({
          identifierType: (item.identifierType as EquipmentAssetIdentifierType) ?? "OTHER",
          identifierValue: item.identifierValue ?? "",
          notes: item.notes ?? "",
        })
      )
    );
  }

  function toIdentifierPayload() {
    const cleaned = identifiers
      .map((row) => ({
        identifierType: row.identifierType,
        identifierValue: row.identifierValue.trim(),
        notes: row.notes.trim(),
      }))
      .filter((row) => row.identifierValue.length > 0);

    return cleaned.map((row) => ({
      identifierType: row.identifierType,
      identifierValue: row.identifierValue,
      notes: row.notes.length > 0 ? row.notes : null,
    }));
  }

  function toAssetPayload() {
    return {
      name: name.trim(),
      assetType,
      make: make.trim() || null,
      model: model.trim() || null,
      modelYear: modelYear.trim() || null,
      status,
      acquisitionType,
      acquisitionDate: acquisitionDate.trim() || null,
      purchasePrice: purchasePrice.trim() || null,
      currentValueEstimate: currentValueEstimate.trim() || null,
      trackMaintenance,
      meterType: trackMaintenance ? meterType : "NONE",
      defaultMeterUnitLabel: defaultMeterUnitLabel.trim() || null,
      notes: notes.trim() || null,
      identifiers: toIdentifierPayload(),
    };
  }

  function toMaintenanceFormData(asset: EquipmentAssetRow): FormData {
    const fd = new FormData();
    appendIfPresent(fd, "eventDate", maintenanceForm.eventDate);
    fd.append("eventType", maintenanceForm.eventType);
    fd.append("title", maintenanceForm.title.trim());
    appendIfPresent(fd, "description", maintenanceForm.description);
    appendIfPresent(fd, "provider", maintenanceForm.provider);
    appendIfPresent(fd, "laborCost", maintenanceForm.laborCost);
    appendIfPresent(fd, "partsCost", maintenanceForm.partsCost);
    appendIfPresent(fd, "totalCost", maintenanceForm.totalCost);
    appendIfPresent(fd, "meterReading", maintenanceForm.meterReading);
    fd.append("meterType", normalizeMeterType(maintenanceForm.meterType || asset.meterType));
    appendIfPresent(fd, "nextDueDate", maintenanceForm.nextDueDate);
    appendIfPresent(fd, "nextDueMeter", maintenanceForm.nextDueMeter);
    for (const file of maintenanceFiles) {
      fd.append("file", file, file.name);
    }
    return fd;
  }

  async function loadAssets() {
    setLoadingAssets(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (assetTypeFilter !== "ALL") params.set("assetType", assetTypeFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim().length > 0) params.set("search", search.trim());
      const endpoint = params.toString() ? `/equipment/assets?${params.toString()}` : "/equipment/assets";
      const raw = await apiGet(endpoint);
      const parsed = EquipmentAssetsResponseSchema.parse(raw);
      setAssets(parsed.assets ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load equipment assets");
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }

  async function loadAssetDetail(assetId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const raw = await apiGet(`/equipment/assets/${encodeURIComponent(assetId)}`);
      const parsed = EquipmentAssetDetailResponseSchema.parse(raw);
      const nextDetail: AssetDetail = parsed;
      setDetail(nextDetail);
      return nextDetail;
    } catch (err: unknown) {
      setDetail(null);
      const message = err instanceof Error ? err.message : "Failed to load equipment asset details";
      setDetailError(message);
      throw err;
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadMaintenanceEvents(assetId: string) {
    setMaintenanceLoading(true);
    setMaintenanceError(null);
    try {
      const raw = await apiGet(`/equipment/assets/${encodeURIComponent(assetId)}/maintenance`);
      const parsed = EquipmentMaintenanceEventsResponseSchema.parse(raw);
      setMaintenanceEvents(parsed.events ?? []);
    } catch (err: unknown) {
      setMaintenanceEvents([]);
      setMaintenanceError(err instanceof Error ? err.message : "Failed to load maintenance events");
    } finally {
      setMaintenanceLoading(false);
    }
  }

  async function startEdit(assetId: string) {
    setSaveError(null);
    try {
      const loaded = await loadAssetDetail(assetId);
      populateFormFromDetail(loaded);
      if (loaded.asset.trackMaintenance) {
        await loadMaintenanceEvents(loaded.asset.id);
      } else {
        setMaintenanceEvents([]);
      }
      setMaintenanceFormOpen(false);
      resetMaintenanceFormForAsset(loaded);
    } catch {
      // loadAssetDetail already handles errors
    }
  }

  function startCreate() {
    resetForm();
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!activeRanchId || saving) return;
    if (!name.trim()) {
      setSaveError("Asset name is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload = toAssetPayload();
      const raw = editingId
        ? await apiPut(`/equipment/assets/${encodeURIComponent(editingId)}`, payload)
        : await apiPost("/equipment/assets", payload);
      const parsed = EquipmentAssetDetailResponseSchema.parse(raw);
      const nextDetail: AssetDetail = parsed;
      setDetail(nextDetail);
      populateFormFromDetail(nextDetail);
      if (nextDetail.asset.trackMaintenance) {
        await loadMaintenanceEvents(nextDetail.asset.id);
      } else {
        setMaintenanceEvents([]);
      }
      setMaintenanceFormOpen(false);
      resetMaintenanceFormForAsset(nextDetail);
      await loadAssets();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save equipment asset");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAssetAttachments(files: FileList | null) {
    if (!files || files.length === 0 || !detail?.asset.id) return;
    setUploadingAttachments(true);
    setDetailError(null);
    try {
      const fd = new FormData();
      fd.append("entityType", "EQUIPMENT_ASSET");
      fd.append("entityId", detail.asset.id);
      for (const file of Array.from(files)) {
        fd.append("file", file, file.name);
      }
      const raw = await apiPostForm("/equipment/attachments", fd);
      EquipmentAttachmentsResponseSchema.parse(raw);
      await loadAssetDetail(detail.asset.id);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to upload attachments");
    } finally {
      setUploadingAttachments(false);
    }
  }

  async function deleteAssetAttachment(attachmentId: string) {
    if (!detail?.asset.id || deletingAttachmentId) return;
    setDeletingAttachmentId(attachmentId);
    setDetailError(null);
    try {
      await apiDelete(`/equipment/attachments/${encodeURIComponent(attachmentId)}`);
      await loadAssetDetail(detail.asset.id);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to delete attachment");
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  function startCreateMaintenanceEvent() {
    if (!detail?.asset.trackMaintenance) return;
    resetMaintenanceFormForAsset(detail);
    setMaintenanceFormOpen(true);
  }

  function startEditMaintenanceEvent(event: EquipmentMaintenanceEventWithAttachments) {
    setMaintenanceEditingId(event.id);
    setMaintenanceSaveError(null);
    setMaintenanceFiles([]);
    setMaintenanceFileInputKey((prev) => prev + 1);
    setMaintenanceForm({
      eventDate: event.eventDate ?? todayIsoDate(),
      eventType: normalizeMaintenanceEventType(event.eventType),
      title: event.title ?? "",
      description: event.description ?? "",
      provider: event.provider ?? "",
      laborCost: toInputValue(event.laborCost),
      partsCost: toInputValue(event.partsCost),
      totalCost: toInputValue(event.totalCost),
      meterReading: toInputValue(event.meterReading),
      meterType: normalizeMeterType(event.meterType),
      nextDueDate: event.nextDueDate ?? "",
      nextDueMeter: toInputValue(event.nextDueMeter),
    });
    setMaintenanceFormOpen(true);
  }

  async function submitMaintenanceForm(e: FormEvent) {
    e.preventDefault();
    if (!detail?.asset.id || maintenanceSaving || !detail.asset.trackMaintenance) return;
    if (!maintenanceForm.title.trim()) {
      setMaintenanceSaveError("Maintenance event title is required.");
      return;
    }

    setMaintenanceSaving(true);
    setMaintenanceSaveError(null);
    setMaintenanceError(null);
    try {
      const formData = toMaintenanceFormData(detail.asset);
      const raw = maintenanceEditingId
        ? await apiPutForm(`/equipment/maintenance/${encodeURIComponent(maintenanceEditingId)}`, formData)
        : await apiPostForm(`/equipment/assets/${encodeURIComponent(detail.asset.id)}/maintenance`, formData);
      EquipmentMaintenanceEventResponseSchema.parse(raw);
      await Promise.all([loadMaintenanceEvents(detail.asset.id), loadAssetDetail(detail.asset.id)]);
      setMaintenanceFormOpen(false);
      resetMaintenanceFormForAsset(detail);
    } catch (err: unknown) {
      setMaintenanceSaveError(err instanceof Error ? err.message : "Failed to save maintenance event");
    } finally {
      setMaintenanceSaving(false);
    }
  }

  async function uploadMaintenanceEventAttachments(eventId: string, files: FileList | null) {
    if (!detail?.asset.id || !files || files.length === 0) return;
    setMaintenanceUploadingEventId(eventId);
    setMaintenanceError(null);
    try {
      const fd = new FormData();
      fd.append("entityType", "EQUIPMENT_MAINTENANCE");
      fd.append("entityId", eventId);
      for (const file of Array.from(files)) {
        fd.append("file", file, file.name);
      }
      const raw = await apiPostForm("/equipment/attachments", fd);
      EquipmentAttachmentsResponseSchema.parse(raw);
      await loadMaintenanceEvents(detail.asset.id);
    } catch (err: unknown) {
      setMaintenanceError(err instanceof Error ? err.message : "Failed to upload maintenance attachments");
    } finally {
      setMaintenanceUploadingEventId(null);
    }
  }

  async function deleteMaintenanceEventAttachment(attachmentId: string) {
    if (!detail?.asset.id || maintenanceDeletingAttachmentId) return;
    setMaintenanceDeletingAttachmentId(attachmentId);
    setMaintenanceError(null);
    try {
      await apiDelete(`/equipment/attachments/${encodeURIComponent(attachmentId)}`);
      await loadMaintenanceEvents(detail.asset.id);
    } catch (err: unknown) {
      setMaintenanceError(err instanceof Error ? err.message : "Failed to delete maintenance attachment");
    } finally {
      setMaintenanceDeletingAttachmentId(null);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId, assetTypeFilter, statusFilter, search]);

  useEffect(() => {
    if (!detail?.asset.id || !detail.asset.trackMaintenance) {
      setMaintenanceEvents([]);
      setMaintenanceError(null);
      setMaintenanceFormOpen(false);
      setMaintenanceEditingId(null);
      return;
    }
    void loadMaintenanceEvents(detail.asset.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.asset.id, detail?.asset.trackMaintenance]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Equipment Assets</h1>
        <p className="text-stone-600 mt-1">Track equipment assets, key identifiers, and supporting attachments.</p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to manage equipment assets.</div>
        </Card>
      )}

      <Card title={editingId ? "Edit Asset" : "Add Asset"}>
        <form onSubmit={submitForm} className="space-y-4 p-4">
          {saveError && <div className="text-sm text-red-600">{saveError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="equipment-asset-name">Asset name</Label>
              <Input
                id="equipment-asset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canInteract}
                placeholder="John Deere 6110M"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-type">Asset type</Label>
              <Select
                value={assetType}
                onValueChange={(value) => {
                  const nextType = value as EquipmentAssetType;
                  setAssetType(nextType);
                  if (!editingId) {
                    const nextTrackMaintenance = shouldTrackMaintenanceByDefault(nextType);
                    setTrackMaintenance(nextTrackMaintenance);
                    if (!nextTrackMaintenance) setMeterType("NONE");
                  }
                }}
                disabled={!canInteract}
              >
                <SelectTrigger id="equipment-asset-type" aria-label="Equipment asset type">
                  <SelectValue placeholder="Select asset type" />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-make">Make</Label>
              <Input
                id="equipment-asset-make"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                disabled={!canInteract}
                placeholder="John Deere"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-model">Model</Label>
              <Input
                id="equipment-asset-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!canInteract}
                placeholder="6110M"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-model-year">Model year</Label>
              <Input
                id="equipment-asset-model-year"
                value={modelYear}
                onChange={(e) => setModelYear(e.target.value)}
                disabled={!canInteract}
                placeholder="2020"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-status">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as EquipmentAssetStatus)} disabled={!canInteract}>
                <SelectTrigger id="equipment-asset-status" aria-label="Equipment asset status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-acquisition-type">Acquisition type</Label>
              <Select
                value={acquisitionType}
                onValueChange={(value) => setAcquisitionType(value as EquipmentAcquisitionType)}
                disabled={!canInteract}
              >
                <SelectTrigger id="equipment-asset-acquisition-type" aria-label="Equipment acquisition type">
                  <SelectValue placeholder="Select acquisition type" />
                </SelectTrigger>
                <SelectContent>
                  {ACQUISITION_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-acquisition-date">Acquisition date</Label>
              <Input
                id="equipment-asset-acquisition-date"
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-purchase-price">Purchase price</Label>
              <Input
                id="equipment-asset-purchase-price"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                disabled={!canInteract}
                placeholder="45000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-current-value">Current value estimate</Label>
              <Input
                id="equipment-asset-current-value"
                value={currentValueEstimate}
                onChange={(e) => setCurrentValueEstimate(e.target.value)}
                disabled={!canInteract}
                placeholder="39000"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="equipment-asset-track-maintenance" className="flex items-center gap-2 text-sm text-stone-800">
                <Checkbox
                  id="equipment-asset-track-maintenance"
                  checked={trackMaintenance}
                  onCheckedChange={(value) => {
                    const next = value === true;
                    setTrackMaintenance(next);
                    if (!next) setMeterType("NONE");
                  }}
                  disabled={!canInteract}
                />
                <span>Track maintenance</span>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-meter-type">Meter type</Label>
              <Select
                value={meterType}
                onValueChange={(value) => setMeterType(value as EquipmentMeterType)}
                disabled={!canInteract || !trackMaintenance}
              >
                <SelectTrigger id="equipment-asset-meter-type" aria-label="Equipment meter type">
                  <SelectValue placeholder="Select meter type" />
                </SelectTrigger>
                <SelectContent>
                  {METER_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-asset-meter-label">Default meter unit label</Label>
              <Input
                id="equipment-asset-meter-label"
                value={defaultMeterUnitLabel}
                onChange={(e) => setDefaultMeterUnitLabel(e.target.value)}
                disabled={!canInteract || !trackMaintenance}
                placeholder="hours"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="equipment-asset-notes">Notes</Label>
              <Textarea
                id="equipment-asset-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={!canInteract}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <div className="space-y-3 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-stone-800">Identifiers</div>
                <div className="text-xs text-stone-500">VIN, serials, tags, and license plate values for this asset.</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canInteract}
                onClick={() => setIdentifiers((prev) => [...prev, createIdentifierDraft()])}
              >
                Add Identifier
              </Button>
            </div>

            {identifiers.length === 0 ? (
              <div className="text-xs text-stone-500">No identifiers added.</div>
            ) : (
              <div className="space-y-3">
                {identifiers.map((row) => (
                  <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                    <div className="md:col-span-3 space-y-1">
                      <Label htmlFor={`identifier-type-${row.id}`}>Type</Label>
                      <Select
                        value={row.identifierType}
                        onValueChange={(value) =>
                          setIdentifiers((prev) =>
                            prev.map((item) =>
                              item.id === row.id ? { ...item, identifierType: value as EquipmentAssetIdentifierType } : item
                            )
                          )
                        }
                        disabled={!canInteract}
                      >
                        <SelectTrigger id={`identifier-type-${row.id}`} aria-label="Identifier type">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {IDENTIFIER_TYPES.map((option) => (
                            <SelectItem key={option} value={option}>
                              {enumLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-4 space-y-1">
                      <Label htmlFor={`identifier-value-${row.id}`}>Value</Label>
                      <Input
                        id={`identifier-value-${row.id}`}
                        value={row.identifierValue}
                        onChange={(e) =>
                          setIdentifiers((prev) =>
                            prev.map((item) => (item.id === row.id ? { ...item, identifierValue: e.target.value } : item))
                          )
                        }
                        disabled={!canInteract}
                        placeholder="Identifier value"
                      />
                    </div>

                    <div className="md:col-span-4 space-y-1">
                      <Label htmlFor={`identifier-notes-${row.id}`}>Notes</Label>
                      <Input
                        id={`identifier-notes-${row.id}`}
                        value={row.notes}
                        onChange={(e) =>
                          setIdentifiers((prev) =>
                            prev.map((item) => (item.id === row.id ? { ...item, notes: e.target.value } : item))
                          )
                        }
                        disabled={!canInteract}
                        placeholder="Optional notes"
                      />
                    </div>

                    <div className="md:col-span-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={!canInteract}
                        onClick={() => setIdentifiers((prev) => prev.filter((item) => item.id !== row.id))}
                        aria-label="Remove identifier row"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={!canInteract}>
                Cancel Edit
              </Button>
            )}
            <Button type="submit" disabled={!canInteract}>
              {saving ? "Saving..." : editingId ? "Save Asset" : "Add Asset"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Assets">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label htmlFor="equipment-assets-search">Search</Label>
              <Input
                id="equipment-assets-search"
                aria-label="Equipment assets search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, make, model"
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-assets-type-filter">Type</Label>
              <Select
                value={assetTypeFilter}
                onValueChange={(value) => setAssetTypeFilter(value as AssetFilter)}
                disabled={!canInteract}
              >
                <SelectTrigger id="equipment-assets-type-filter" aria-label="Equipment assets type filter">
                  <SelectValue placeholder="Type filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  {ASSET_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment-assets-status-filter">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                disabled={!canInteract}
              >
                <SelectTrigger id="equipment-assets-status-filter" aria-label="Equipment assets status filter">
                  <SelectValue placeholder="Status filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {ASSET_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {enumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 flex items-end">
              <Button type="button" variant="outline" onClick={startCreate} disabled={!canInteract}>
                New Asset
              </Button>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Maintenance</div>
              <div className="col-span-2">Acquired</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            {loadingAssets ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : assets.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">No equipment assets found for this filter.</div>
            ) : (
              <div className="divide-y">
                {assets.map((row) => (
                  <div
                    key={row.id}
                    className={`grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center ${
                      detail?.asset.id === row.id ? "bg-emerald-50/50" : ""
                    }`}
                  >
                    <div className="col-span-3">
                      <div className="font-medium text-stone-800">{row.name}</div>
                      <div className="text-xs text-stone-500">{[row.make, row.model].filter(Boolean).join(" ")}</div>
                    </div>
                    <div className="col-span-2 text-stone-700">{enumLabel(String(row.assetType ?? "OTHER"))}</div>
                    <div className="col-span-2 text-stone-700">{enumLabel(String(row.status ?? "ACTIVE"))}</div>
                    <div className="col-span-2 text-stone-700">{row.trackMaintenance ? "Enabled" : "Off"}</div>
                    <div className="col-span-2 text-stone-700">{row.acquisitionDate ?? "-"}</div>
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

      <Card title="Asset Detail">
        <div className="space-y-4 p-4">
          {detailError && <div className="text-sm text-red-600">{detailError}</div>}

          {!detail ? (
            <div className="text-sm text-stone-600">Select an asset to view identifiers, attachments, and maintenance status.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border bg-stone-50 p-3">
                  <div className="text-xs text-stone-500">Asset</div>
                  <div className="font-medium text-stone-800">{detail.asset.name}</div>
                </div>
                <div className="rounded-md border bg-stone-50 p-3">
                  <div className="text-xs text-stone-500">Type / Status</div>
                  <div className="font-medium text-stone-800">
                    {enumLabel(String(detail.asset.assetType))} | {enumLabel(String(detail.asset.status))}
                  </div>
                </div>
                <div className="rounded-md border bg-stone-50 p-3">
                  <div className="text-xs text-stone-500">Maintenance Events</div>
                  <div className="font-medium text-stone-800">{detail.maintenanceSummary.eventCount}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-medium text-stone-800">Identifiers</div>
                {detail.identifiers.length === 0 ? (
                  <div className="text-xs text-stone-500">No identifiers saved for this asset.</div>
                ) : (
                  <div className="space-y-2">
                    {detail.identifiers.map((identifier) => (
                      <div
                        key={identifier.id}
                        className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 rounded-md border bg-white px-3 py-2"
                      >
                        <div className="text-xs md:text-sm text-stone-600">{enumLabel(String(identifier.identifierType))}</div>
                        <div className="text-sm text-stone-800">
                          {identifier.identifierValue}
                          {identifier.notes ? <span className="text-xs text-stone-500"> | {identifier.notes}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <EquipmentAttachmentUploader
                id="equipment-asset-attachment-upload"
                title="Attachments"
                description="Upload photos or PDFs (manuals, warranties, receipts, serial plate photos)."
                attachments={detail.attachments}
                disabled={!canInteract}
                uploading={uploadingAttachments}
                deletingId={deletingAttachmentId}
                onUploadFiles={uploadAssetAttachments}
                onDeleteAttachment={deleteAssetAttachment}
              />

              {!detail.asset.trackMaintenance ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Maintenance tracking is off for this asset (enable in Edit).
                </div>
              ) : (
                <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-emerald-900">Maintenance Timeline</div>
                      <div className="text-xs text-emerald-800">
                        Log service, repairs, and inspections for this asset. Add receipts/photos as event attachments.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canInteract || maintenanceLoading}
                        onClick={() => void loadMaintenanceEvents(detail.asset.id)}
                      >
                        {maintenanceLoading ? "Refreshing..." : "Refresh"}
                      </Button>
                      <Button type="button" size="sm" disabled={!canInteract} onClick={startCreateMaintenanceEvent}>
                        Add Event
                      </Button>
                    </div>
                  </div>

                  {maintenanceError && <div className="text-sm text-red-600">{maintenanceError}</div>}

                  {maintenanceFormOpen && (
                    <form onSubmit={submitMaintenanceForm} className="rounded-md border bg-white p-3 space-y-3">
                      <div className="font-medium text-stone-800">
                        {maintenanceEditingId ? "Edit Maintenance Event" : "Add Maintenance Event"}
                      </div>
                      {maintenanceSaveError && <div className="text-sm text-red-600">{maintenanceSaveError}</div>}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="maintenance-event-date">Event date</Label>
                          <Input
                            id="maintenance-event-date"
                            type="date"
                            value={maintenanceForm.eventDate}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, eventDate: e.target.value }))}
                            disabled={!canInteract}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="maintenance-event-type">Event type</Label>
                          <Select
                            value={maintenanceForm.eventType}
                            onValueChange={(value) =>
                              setMaintenanceForm((prev) => ({ ...prev, eventType: value as EquipmentMaintenanceEventType }))
                            }
                            disabled={!canInteract}
                          >
                            <SelectTrigger id="maintenance-event-type" aria-label="Maintenance event type">
                              <SelectValue placeholder="Select maintenance event type" />
                            </SelectTrigger>
                            <SelectContent>
                              {MAINTENANCE_EVENT_TYPES.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {enumLabel(option)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="maintenance-title">Title</Label>
                          <Input
                            id="maintenance-title"
                            value={maintenanceForm.title}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, title: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="Oil and filter change"
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="maintenance-description">Description</Label>
                          <Textarea
                            id="maintenance-description"
                            rows={2}
                            value={maintenanceForm.description}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, description: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="Optional notes..."
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="maintenance-provider">Provider</Label>
                          <Input
                            id="maintenance-provider"
                            value={maintenanceForm.provider}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, provider: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="Shop or mechanic"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="maintenance-meter-reading">Meter reading</Label>
                          <Input
                            id="maintenance-meter-reading"
                            value={maintenanceForm.meterReading}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, meterReading: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="1450"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="maintenance-meter-type">Meter type</Label>
                          <Select
                            value={maintenanceForm.meterType}
                            onValueChange={(value) =>
                              setMaintenanceForm((prev) => ({ ...prev, meterType: value as EquipmentMeterType }))
                            }
                            disabled={!canInteract}
                          >
                            <SelectTrigger id="maintenance-meter-type" aria-label="Maintenance meter type">
                              <SelectValue placeholder="Select meter type" />
                            </SelectTrigger>
                            <SelectContent>
                              {METER_TYPES.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {enumLabel(option)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="maintenance-next-due-meter">Next due meter</Label>
                          <Input
                            id="maintenance-next-due-meter"
                            value={maintenanceForm.nextDueMeter}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, nextDueMeter: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="1550"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="maintenance-labor-cost">Labor cost</Label>
                          <Input
                            id="maintenance-labor-cost"
                            value={maintenanceForm.laborCost}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, laborCost: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="120.00"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="maintenance-parts-cost">Parts cost</Label>
                          <Input
                            id="maintenance-parts-cost"
                            value={maintenanceForm.partsCost}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, partsCost: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="65.50"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="maintenance-total-cost">Total cost</Label>
                          <Input
                            id="maintenance-total-cost"
                            value={maintenanceForm.totalCost}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, totalCost: e.target.value }))}
                            disabled={!canInteract}
                            placeholder="185.50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="maintenance-next-due-date">Next due date</Label>
                          <Input
                            id="maintenance-next-due-date"
                            type="date"
                            value={maintenanceForm.nextDueDate}
                            onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, nextDueDate: e.target.value }))}
                            disabled={!canInteract}
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="maintenance-files">Attachments</Label>
                          <Input
                            key={maintenanceFileInputKey}
                            id="maintenance-files"
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            multiple
                            onChange={(e) => setMaintenanceFiles(Array.from(e.target.files ?? []))}
                            disabled={!canInteract}
                          />
                          <div className="text-xs text-stone-500">
                            {maintenanceFiles.length > 0
                              ? `${maintenanceFiles.length} file(s) selected.`
                              : "Optional: upload receipts, work orders, and photos."}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canInteract}
                          onClick={() => {
                            setMaintenanceFormOpen(false);
                            resetMaintenanceFormForAsset(detail);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={!canInteract}>
                          {maintenanceSaving ? "Saving..." : maintenanceEditingId ? "Save Event" : "Add Event"}
                        </Button>
                      </div>
                    </form>
                  )}

                  {maintenanceLoading ? (
                    <div className="text-sm text-stone-600">Loading maintenance events...</div>
                  ) : maintenanceEvents.length === 0 ? (
                    <div className="text-sm text-stone-600">No maintenance events yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {maintenanceEvents.map((event) => (
                        <div key={event.id} className="rounded-md border bg-white p-3 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-stone-800">{event.title}</div>
                              <div className="text-xs text-stone-500">
                                {event.eventDate ?? "-"} | {enumLabel(String(event.eventType ?? "OTHER"))}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canInteract}
                              onClick={() => startEditMaintenanceEvent(event)}
                            >
                              Edit
                            </Button>
                          </div>

                          {event.description ? <div className="text-sm text-stone-700">{event.description}</div> : null}

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-stone-700">
                            <div>
                              <span className="text-stone-500">Provider:</span> {event.provider ?? "-"}
                            </div>
                            <div>
                              <span className="text-stone-500">Meter:</span>{" "}
                              {event.meterReading ? `${event.meterReading} ${enumLabel(String(event.meterType ?? "NONE"))}` : "-"}
                            </div>
                            <div>
                              <span className="text-stone-500">Total cost:</span> {formatCurrency(event.totalCost)}
                            </div>
                            <div>
                              <span className="text-stone-500">Labor:</span> {formatCurrency(event.laborCost)}
                            </div>
                            <div>
                              <span className="text-stone-500">Parts:</span> {formatCurrency(event.partsCost)}
                            </div>
                            <div>
                              <span className="text-stone-500">Next due:</span>{" "}
                              {event.nextDueDate
                                ? `${event.nextDueDate}${event.nextDueMeter ? ` or ${event.nextDueMeter}` : ""}`
                                : event.nextDueMeter ?? "-"}
                            </div>
                          </div>

                          <EquipmentAttachmentUploader
                            id={`equipment-maintenance-attachments-${event.id}`}
                            title="Event Attachments"
                            description="Upload related photos/PDFs (receipts, work orders, inspection sheets)."
                            attachments={event.attachments ?? []}
                            disabled={!canInteract}
                            uploading={maintenanceUploadingEventId === event.id}
                            deletingId={maintenanceDeletingAttachmentId}
                            onUploadFiles={(files) => void uploadMaintenanceEventAttachments(event.id, files)}
                            onDeleteAttachment={(attachmentId) => void deleteMaintenanceEventAttachment(attachmentId)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
