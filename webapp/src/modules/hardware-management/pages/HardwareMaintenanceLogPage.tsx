import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiGet, apiPostForm, apiPutForm } from "@/lib/api";
import {
  EquipmentAssetsResponseSchema,
  EquipmentAttachmentsResponseSchema,
  EquipmentMaintenanceEventResponseSchema,
  EquipmentMaintenanceLogResponseSchema,
  type EquipmentAssetRow,
  type EquipmentAssetType,
  type EquipmentMaintenanceEventType,
  type EquipmentMaintenanceLogRow,
  type EquipmentMeterType,
  type EquipmentPerformedBy,
} from "@/lib/contracts/equipment";
import { useRanch } from "@/lib/ranchContext";
import { ROUTES } from "@/routes";

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

type AssetTypeFilter = "ALL" | EquipmentAssetType;
type EventTypeFilter = "ALL" | EquipmentMaintenanceEventType;
type SortFilter = "DATE_DESC" | "DATE_ASC" | "ASSET_ASC" | "ASSET_DESC" | "UPDATED_DESC" | "CREATED_DESC";
type HasInvoiceState = "UNKNOWN" | "YES" | "NO";

type MaintenanceFormState = {
  assetId: string;
  eventDate: string;
  eventType: EquipmentMaintenanceEventType;
  title: string;
  description: string;
  provider: string;
  performedBy: "" | EquipmentPerformedBy;
  hasInvoice: HasInvoiceState;
  downtimeHours: string;
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
const EVENT_TYPES: EquipmentMaintenanceEventType[] = ["SERVICE", "REPAIR", "INSPECTION", "MODIFICATION", "WARRANTY", "OTHER"];
const PERFORMED_BY_OPTIONS: EquipmentPerformedBy[] = ["OWNER", "EMPLOYEE", "CONTRACTOR", "DEALER", "UNKNOWN"];
const METER_TYPES: EquipmentMeterType[] = ["NONE", "HOURS", "MILES", "OTHER"];
const DEFAULT_PAGE_SIZE = 25;

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

function maintenanceProviderLabel(row: EquipmentMaintenanceLogRow): string {
  const provider = typeof row.provider === "string" ? row.provider.trim() : "";
  if (provider.length > 0) return provider;
  if (row.performedBy === "OWNER" || row.performedBy === "EMPLOYEE" || row.isDiy) return "DIY";
  return "DIY";
}

function assetOptionLabel(asset: EquipmentAssetRow): string {
  const make = asset.make ? String(asset.make).trim() : "";
  const model = asset.model ? String(asset.model).trim() : "";
  const year = asset.modelYear == null ? "" : String(asset.modelYear);
  const suffix = [make, model, year].filter(Boolean).join(" ").trim();
  return suffix.length > 0 ? `${asset.name} (${suffix})` : asset.name;
}

function createMaintenanceFormState(defaultAssetId = ""): MaintenanceFormState {
  return {
    assetId: defaultAssetId,
    eventDate: todayIsoDate(),
    eventType: "SERVICE",
    title: "",
    description: "",
    provider: "",
    performedBy: "",
    hasInvoice: "UNKNOWN",
    downtimeHours: "",
    laborCost: "",
    partsCost: "",
    totalCost: "",
    meterReading: "",
    meterType: "NONE",
    nextDueDate: "",
    nextDueMeter: "",
  };
}

function appendIfPresent(fd: FormData, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed.length > 0) fd.append(key, trimmed);
}

export default function HardwareMaintenanceLogPage() {
  const location = useLocation();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [events, setEvents] = useState<EquipmentMaintenanceLogRow[]>([]);
  const [assets, setAssets] = useState<EquipmentAssetRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventFiles, setEventFiles] = useState<File[]>([]);
  const [eventFileInputKey, setEventFileInputKey] = useState(0);
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assetType, setAssetType] = useState<AssetTypeFilter>("ALL");
  const [provider, setProvider] = useState("");
  const [eventType, setEventType] = useState<EventTypeFilter>("ALL");
  const [diyOnly, setDiyOnly] = useState(false);
  const [sort, setSort] = useState<SortFilter>("DATE_DESC");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const [form, setForm] = useState<MaintenanceFormState>(createMaintenanceFormState(""));

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId && !loadingEvents && !savingForm, [ranchLoading, activeRanchId, loadingEvents, savingForm]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  async function loadAssets() {
    if (!activeRanchId) {
      setAssets([]);
      return;
    }
    try {
      const raw = await apiGet("/equipment/assets?limit=200&sort=NAME_ASC");
      const parsed = EquipmentAssetsResponseSchema.parse(raw);
      setAssets(parsed.assets ?? []);
    } catch {
      setAssets([]);
    }
  }

  async function loadEvents() {
    if (!activeRanchId) {
      setEvents([]);
      setTotal(0);
      setLoadError(null);
      return;
    }
    setLoadingEvents(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sort", sort);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom.trim()) params.set("dateFrom", dateFrom.trim());
      if (dateTo.trim()) params.set("dateTo", dateTo.trim());
      if (assetType !== "ALL") params.set("assetType", assetType);
      if (provider.trim()) params.set("provider", provider.trim());
      if (eventType !== "ALL") params.set("eventType", eventType);
      if (diyOnly) params.set("diyOnly", "true");

      const raw = await apiGet(`/equipment/maintenance?${params.toString()}`);
      const parsed = EquipmentMaintenanceLogResponseSchema.parse(raw);
      setEvents(parsed.events ?? []);
      setTotal(parsed.pagination?.total ?? (parsed.events?.length ?? 0));
    } catch (err: unknown) {
      setEvents([]);
      setTotal(0);
      setLoadError(err instanceof Error ? err.message : "Failed to load maintenance log");
    } finally {
      setLoadingEvents(false);
    }
  }

  function openCreateDialog(seedAssetId = "") {
    setEditingEventId(null);
    setFormError(null);
    setEventFiles([]);
    setEventFileInputKey((prev) => prev + 1);
    setForm(createMaintenanceFormState(seedAssetId));
    setFormOpen(true);
  }

  function openEditDialog(event: EquipmentMaintenanceLogRow) {
    setEditingEventId(event.id);
    setFormError(null);
    setEventFiles([]);
    setEventFileInputKey((prev) => prev + 1);
    setForm({
      assetId: event.assetId,
      eventDate: event.eventDate ?? todayIsoDate(),
      eventType: (event.eventType as EquipmentMaintenanceEventType) ?? "OTHER",
      title: event.title ?? "",
      description: event.description ?? "",
      provider: event.provider ?? "",
      performedBy: (event.performedBy as EquipmentPerformedBy | "") ?? "",
      hasInvoice: event.hasInvoice === true ? "YES" : event.hasInvoice === false ? "NO" : "UNKNOWN",
      downtimeHours: toInputValue(event.downtimeHours),
      laborCost: toInputValue(event.laborCost),
      partsCost: toInputValue(event.partsCost),
      totalCost: toInputValue(event.totalCost),
      meterReading: toInputValue(event.meterReading),
      meterType: (event.meterType as EquipmentMeterType) ?? "NONE",
      nextDueDate: event.nextDueDate ?? "",
      nextDueMeter: toInputValue(event.nextDueMeter),
    });
    setFormOpen(true);
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!form.assetId || !form.title.trim() || savingForm) {
      if (!form.assetId) setFormError("Asset is required.");
      else if (!form.title.trim()) setFormError("Title is required.");
      return;
    }

    setSavingForm(true);
    setFormError(null);
    try {
      const fd = new FormData();
      appendIfPresent(fd, "eventDate", form.eventDate);
      fd.append("eventType", form.eventType);
      fd.append("title", form.title.trim());
      appendIfPresent(fd, "description", form.description);
      appendIfPresent(fd, "provider", form.provider);
      appendIfPresent(fd, "performedBy", form.performedBy);
      if (form.hasInvoice === "YES") fd.append("hasInvoice", "true");
      if (form.hasInvoice === "NO") fd.append("hasInvoice", "false");
      appendIfPresent(fd, "downtimeHours", form.downtimeHours);
      appendIfPresent(fd, "laborCost", form.laborCost);
      appendIfPresent(fd, "partsCost", form.partsCost);
      appendIfPresent(fd, "totalCost", form.totalCost);
      appendIfPresent(fd, "meterReading", form.meterReading);
      fd.append("meterType", form.meterType);
      appendIfPresent(fd, "nextDueDate", form.nextDueDate);
      appendIfPresent(fd, "nextDueMeter", form.nextDueMeter);
      for (const file of eventFiles) fd.append("file", file, file.name);

      if (editingEventId) {
        const raw = await apiPutForm(`/equipment/maintenance/${encodeURIComponent(editingEventId)}`, fd);
        EquipmentMaintenanceEventResponseSchema.parse(raw);
      } else {
        const raw = await apiPostForm(`/equipment/assets/${encodeURIComponent(form.assetId)}/maintenance`, fd);
        EquipmentMaintenanceEventResponseSchema.parse(raw);
      }
      setFormOpen(false);
      await loadEvents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save maintenance event");
    } finally {
      setSavingForm(false);
    }
  }

  async function uploadEventAttachments(eventId: string, files: FileList | null) {
    if (!files || files.length === 0 || uploadingEventId) return;
    setUploadingEventId(eventId);
    setLoadError(null);
    try {
      const fd = new FormData();
      fd.append("entityType", "EQUIPMENT_MAINTENANCE");
      fd.append("entityId", eventId);
      for (const file of Array.from(files)) fd.append("file", file, file.name);
      const raw = await apiPostForm("/equipment/attachments", fd);
      EquipmentAttachmentsResponseSchema.parse(raw);
      await loadEvents();
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to upload attachments");
    } finally {
      setUploadingEventId(null);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId]);

  useEffect(() => {
    if (!activeRanchId) return;
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId, page, limit, sort, search, dateFrom, dateTo, assetType, provider, eventType, diyOnly]);

  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, assetType, provider, eventType, diyOnly, sort, limit]);

  useEffect(() => {
    if (!assets.length) return;
    const params = new URLSearchParams(location.search);
    const openAdd = params.get("openAdd");
    const assetId = params.get("assetId") ?? "";
    if (openAdd === "1") {
      const seedAssetId = assets.some((asset) => asset.id === assetId) ? assetId : "";
      openCreateDialog(seedAssetId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, assets.length]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eventId = params.get("eventId");
    if (!eventId) return;
    const row = document.getElementById(`maintenance-event-${eventId}`);
    if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [location.search, events]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Hardware Maintenance Log</h1>
        <p className="text-stone-600 mt-1">Aggregate and manage maintenance records across all hard assets, including DIY work.</p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to view maintenance history.</div>
        </Card>
      )}

      <Card title="Filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="hardware-maintenance-search">Search</Label>
            <Input
              id="hardware-maintenance-search"
              aria-label="Maintenance search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!canInteract}
              placeholder="Title, description, provider"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-maintenance-date-from">Date From</Label>
            <Input
              id="hardware-maintenance-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={!canInteract}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-maintenance-date-to">Date To</Label>
            <Input
              id="hardware-maintenance-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={!canInteract}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-maintenance-asset-type">Asset Type</Label>
            <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetTypeFilter)} disabled={!canInteract}>
              <SelectTrigger id="hardware-maintenance-asset-type" aria-label="Maintenance asset type filter">
                <SelectValue placeholder="All asset types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All asset types</SelectItem>
                {ASSET_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {enumLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-maintenance-provider">Provider</Label>
            <Input
              id="hardware-maintenance-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={!canInteract}
              placeholder="Optional filter"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-maintenance-event-type">Event Type</Label>
            <Select value={eventType} onValueChange={(value) => setEventType(value as EventTypeFilter)} disabled={!canInteract}>
              <SelectTrigger id="hardware-maintenance-event-type" aria-label="Maintenance event type filter">
                <SelectValue placeholder="All event types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All event types</SelectItem>
                {EVENT_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {enumLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-maintenance-sort">Sort</Label>
            <Select value={sort} onValueChange={(value) => setSort(value as SortFilter)} disabled={!canInteract}>
              <SelectTrigger id="hardware-maintenance-sort" aria-label="Maintenance sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DATE_DESC">Date (Newest)</SelectItem>
                <SelectItem value="DATE_ASC">Date (Oldest)</SelectItem>
                <SelectItem value="ASSET_ASC">Asset (A-Z)</SelectItem>
                <SelectItem value="ASSET_DESC">Asset (Z-A)</SelectItem>
                <SelectItem value="UPDATED_DESC">Recently Updated</SelectItem>
                <SelectItem value="CREATED_DESC">Recently Added</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-maintenance-limit">Rows per page</Label>
            <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))} disabled={!canInteract}>
              <SelectTrigger id="hardware-maintenance-limit" aria-label="Maintenance page size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 flex items-end">
            <label htmlFor="hardware-maintenance-diy-only" className="h-10 flex items-center gap-2 rounded-md border px-3">
              <Checkbox
                id="hardware-maintenance-diy-only"
                checked={diyOnly}
                onCheckedChange={(value) => setDiyOnly(value === true)}
                disabled={!canInteract}
              />
              <span className="text-sm text-stone-700">DIY only</span>
            </label>
          </div>

          <div className="space-y-2 flex items-end md:justify-end">
            <Button type="button" onClick={() => openCreateDialog()} disabled={!canInteract}>
              Add Maintenance Event
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Maintenance Events">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-1">Date</div>
              <div className="col-span-2">Asset</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-2">Title</div>
              <div className="col-span-1">Meter</div>
              <div className="col-span-2">Costs</div>
              <div className="col-span-1">Provider</div>
              <div className="col-span-1">Attachments</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {loadingEvents ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : events.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">No maintenance events found for this filter.</div>
            ) : (
              <div className="divide-y">
                {events.map((event) => (
                  <div key={event.id} id={`maintenance-event-${event.id}`} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center">
                    <div className="col-span-1 text-stone-700">{event.eventDate}</div>
                    <div className="col-span-2">
                      <Link className="font-medium text-stone-800 hover:underline" to={`${ROUTES.supplies.equipmentAssets}?assetId=${event.assetId}`}>
                        {event.assetName}
                      </Link>
                      <div className="text-xs text-stone-500">{enumLabel(String(event.assetType ?? "OTHER"))}</div>
                    </div>
                    <div className="col-span-1 text-stone-700">{enumLabel(String(event.eventType ?? "OTHER"))}</div>
                    <div className="col-span-2">
                      <Link className="font-medium text-stone-800 hover:underline" to={`${ROUTES.hardware.maintenanceLog}?eventId=${event.id}`}>
                        {event.title}
                      </Link>
                      <div className="text-xs text-stone-500">{event.description ?? "-"}</div>
                    </div>
                    <div className="col-span-1 text-stone-700">
                      {event.meterReading == null || event.meterReading === "" ? "-" : `${event.meterReading} ${String(event.meterType ?? "").toLowerCase()}`}
                    </div>
                    <div className="col-span-2 text-stone-700 text-xs">
                      <div>Total: {formatCurrency(event.totalCost)}</div>
                      <div>Labor: {formatCurrency(event.laborCost)}</div>
                      <div>Parts: {formatCurrency(event.partsCost)}</div>
                    </div>
                    <div className="col-span-1 text-stone-700">{maintenanceProviderLabel(event)}</div>
                    <div className="col-span-1 text-stone-700">{event.attachmentCount ?? 0}</div>
                    <div className="col-span-1 flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(event)}>
                        Edit
                      </Button>
                      <label className="inline-flex">
                        <Input
                          type="file"
                          multiple
                          className="hidden"
                          disabled={!canInteract || uploadingEventId === event.id}
                          onChange={(e) => {
                            void uploadEventAttachments(event.id, e.target.files);
                            e.currentTarget.value = "";
                          }}
                        />
                        <span className="inline-flex items-center justify-center h-8 px-3 rounded-md border text-xs bg-white cursor-pointer">
                          {uploadingEventId === event.id ? "Uploading..." : "Upload"}
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-stone-600">
            <div>
              Page {page} of {totalPages} ({total} events)
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!canInteract || page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canInteract || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEventId ? "Edit Maintenance Event" : "Add Maintenance Event"}</DialogTitle>
            <DialogDescription>Record maintenance with optional provider, costs, and attachments. DIY events are fully supported.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submitForm} className="space-y-4">
            {formError && <div className="text-sm text-red-600">{formError}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="hardware-maintenance-form-asset">Asset</Label>
                <Select
                  value={form.assetId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, assetId: value }))}
                  disabled={!canInteract || Boolean(editingEventId)}
                >
                  <SelectTrigger id="hardware-maintenance-form-asset" aria-label="Maintenance asset">
                    <SelectValue placeholder="Select asset" />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        {assetOptionLabel(asset)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-date">Date</Label>
                <Input
                  id="hardware-maintenance-form-date"
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, eventDate: e.target.value }))}
                  disabled={!canInteract}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-type">Event Type</Label>
                <Select value={form.eventType} onValueChange={(value) => setForm((prev) => ({ ...prev, eventType: value as EquipmentMaintenanceEventType }))}>
                  <SelectTrigger id="hardware-maintenance-form-type" aria-label="Maintenance event type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {enumLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="hardware-maintenance-form-title">Title</Label>
                <Input
                  id="hardware-maintenance-form-title"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Changed oil and filters"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="hardware-maintenance-form-description">Description</Label>
                <Textarea
                  id="hardware-maintenance-form-description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional notes..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-provider">Provider</Label>
                <Input
                  id="hardware-maintenance-form-provider"
                  value={form.provider}
                  onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional (blank for DIY)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-performed-by">Performed By</Label>
                <Select
                  value={form.performedBy || "UNSET"}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      performedBy: value === "UNSET" ? "" : (value as EquipmentPerformedBy),
                    }))
                  }
                  disabled={!canInteract}
                >
                  <SelectTrigger id="hardware-maintenance-form-performed-by" aria-label="Maintenance performed by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSET">Not specified</SelectItem>
                    {PERFORMED_BY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {enumLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-has-invoice">Invoice</Label>
                <Select value={form.hasInvoice} onValueChange={(value) => setForm((prev) => ({ ...prev, hasInvoice: value as HasInvoiceState }))}>
                  <SelectTrigger id="hardware-maintenance-form-has-invoice" aria-label="Maintenance invoice status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNKNOWN">Unknown / Not set</SelectItem>
                    <SelectItem value="YES">Has invoice</SelectItem>
                    <SelectItem value="NO">No invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-downtime">Downtime hours</Label>
                <Input
                  id="hardware-maintenance-form-downtime"
                  value={form.downtimeHours}
                  onChange={(e) => setForm((prev) => ({ ...prev, downtimeHours: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-labor-cost">Labor Cost</Label>
                <Input
                  id="hardware-maintenance-form-labor-cost"
                  value={form.laborCost}
                  onChange={(e) => setForm((prev) => ({ ...prev, laborCost: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-parts-cost">Parts Cost</Label>
                <Input
                  id="hardware-maintenance-form-parts-cost"
                  value={form.partsCost}
                  onChange={(e) => setForm((prev) => ({ ...prev, partsCost: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-total-cost">Total Cost</Label>
                <Input
                  id="hardware-maintenance-form-total-cost"
                  value={form.totalCost}
                  onChange={(e) => setForm((prev) => ({ ...prev, totalCost: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional (auto-derived if blank)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-meter-reading">Meter Reading</Label>
                <Input
                  id="hardware-maintenance-form-meter-reading"
                  value={form.meterReading}
                  onChange={(e) => setForm((prev) => ({ ...prev, meterReading: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-meter-type">Meter Type</Label>
                <Select value={form.meterType} onValueChange={(value) => setForm((prev) => ({ ...prev, meterType: value as EquipmentMeterType }))}>
                  <SelectTrigger id="hardware-maintenance-form-meter-type" aria-label="Maintenance meter type">
                    <SelectValue />
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
                <Label htmlFor="hardware-maintenance-form-next-due-date">Next Due Date</Label>
                <Input
                  id="hardware-maintenance-form-next-due-date"
                  type="date"
                  value={form.nextDueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, nextDueDate: e.target.value }))}
                  disabled={!canInteract}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardware-maintenance-form-next-due-meter">Next Due Meter</Label>
                <Input
                  id="hardware-maintenance-form-next-due-meter"
                  value={form.nextDueMeter}
                  onChange={(e) => setForm((prev) => ({ ...prev, nextDueMeter: e.target.value }))}
                  disabled={!canInteract}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`hardware-maintenance-form-files-${eventFileInputKey}`}>Attachments</Label>
                <Input
                  id={`hardware-maintenance-form-files-${eventFileInputKey}`}
                  type="file"
                  multiple
                  onChange={(e) => setEventFiles(Array.from(e.target.files ?? []))}
                  disabled={!canInteract}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={!canInteract}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canInteract}>
                {savingForm ? "Saving..." : editingEventId ? "Save Event" : "Create Event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
