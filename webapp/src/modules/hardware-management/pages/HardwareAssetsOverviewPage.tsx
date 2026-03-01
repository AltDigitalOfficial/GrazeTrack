import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiGet, apiPut } from "@/lib/api";
import {
  EquipmentAssetsResponseSchema,
  type EquipmentAcquisitionType,
  type EquipmentAssetRow,
  type EquipmentAssetStatus,
  type EquipmentAssetType,
} from "@/lib/contracts/equipment";
import { useRanch } from "@/lib/ranchContext";
import { ROUTES } from "@/routes";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

type AssetTypeFilter = "ALL" | EquipmentAssetType;
type StatusFilter = "ALL" | EquipmentAssetStatus;
type AcquisitionTypeFilter = "ALL" | EquipmentAcquisitionType;
type TrackMaintenanceFilter = "ALL" | "ENABLED" | "DISABLED";
type SortFilter = "NAME_ASC" | "NAME_DESC" | "ACQUIRED_DATE_DESC" | "ACQUIRED_DATE_ASC" | "UPDATED_DESC" | "CREATED_DESC";

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
const ASSET_STATUSES: EquipmentAssetStatus[] = ["ACTIVE", "DISABLED", "SOLD", "RETIRED", "LOST", "RENTED", "LEASED"];
const ACQUISITION_TYPES: EquipmentAcquisitionType[] = ["PURCHASED", "LEASED", "RENTED", "INHERITED", "OTHER"];
const DEFAULT_PAGE_SIZE = 25;

function enumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: unknown): string {
  if (!value) return "-";
  return String(value);
}

function formatCurrency(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function makeModelYearLabel(asset: EquipmentAssetRow): string {
  const values = [asset.make, asset.model, asset.modelYear == null ? null : String(asset.modelYear)]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);
  if (!values.length) return "-";
  return values.join(" ");
}

function buildDisabledNoteLine(comment: string): string {
  const stamp = new Date().toISOString();
  const reason = comment.trim();
  return reason.length > 0 ? `[${stamp}] Disabled: ${reason}` : `[${stamp}] Disabled`;
}

function mergeNotes(existing: unknown, nextLine: string): string {
  const existingText = typeof existing === "string" ? existing.trim() : "";
  if (!existingText.length) return nextLine;
  return `${existingText}\n\n${nextLine}`;
}

export default function HardwareAssetsOverviewPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [assets, setAssets] = useState<EquipmentAssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [assetType, setAssetType] = useState<AssetTypeFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionTypeFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [trackMaintenance, setTrackMaintenance] = useState<TrackMaintenanceFilter>("ALL");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [sort, setSort] = useState<SortFilter>("NAME_ASC");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [disableAsset, setDisableAsset] = useState<EquipmentAssetRow | null>(null);
  const [disableComment, setDisableComment] = useState("");
  const [disableSaving, setDisableSaving] = useState(false);

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId && !loadingAssets, [ranchLoading, activeRanchId, loadingAssets]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  async function loadAssets() {
    if (!activeRanchId) {
      setAssets([]);
      setTotal(0);
      setLoadError(null);
      return;
    }
    setLoadingAssets(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sort", sort);
      if (search.trim()) params.set("search", search.trim());
      if (assetType !== "ALL") params.set("assetType", assetType);
      if (status !== "ALL") params.set("status", status);
      if (acquisitionType !== "ALL") params.set("acquisitionType", acquisitionType);
      if (dateFrom.trim()) params.set("dateFrom", dateFrom.trim());
      if (dateTo.trim()) params.set("dateTo", dateTo.trim());
      if (trackMaintenance === "ENABLED") params.set("trackMaintenance", "true");
      if (trackMaintenance === "DISABLED") params.set("trackMaintenance", "false");
      if (make.trim()) params.set("make", make.trim());
      if (model.trim()) params.set("model", model.trim());

      const raw = await apiGet(`/equipment/assets?${params.toString()}`);
      const parsed = EquipmentAssetsResponseSchema.parse(raw);
      setAssets(parsed.assets ?? []);
      setTotal(parsed.pagination?.total ?? (parsed.assets?.length ?? 0));
    } catch (err: unknown) {
      setAssets([]);
      setTotal(0);
      setLoadError(err instanceof Error ? err.message : "Failed to load hardware assets");
    } finally {
      setLoadingAssets(false);
    }
  }

  function openAssetDetail(assetId: string) {
    navigate(`${ROUTES.supplies.equipmentAssets}?assetId=${encodeURIComponent(assetId)}`);
  }

  function openAddMaintenance(assetId: string) {
    navigate(`${ROUTES.hardware.maintenanceLog}?assetId=${encodeURIComponent(assetId)}&openAdd=1`);
  }

  function openDisablePrompt(asset: EquipmentAssetRow) {
    if (String(asset.status ?? "").toUpperCase() === "DISABLED") return;
    setDisableAsset(asset);
    setDisableComment("");
  }

  function closeDisablePrompt() {
    if (disableSaving) return;
    setDisableAsset(null);
    setDisableComment("");
  }

  async function submitDisable() {
    if (!disableAsset) return;
    setDisableSaving(true);
    try {
      const notes = mergeNotes(disableAsset.notes, buildDisabledNoteLine(disableComment));
      await apiPut(`/equipment/assets/${encodeURIComponent(disableAsset.id)}`, {
        status: "DISABLED",
        notes,
      });
      toast({
        title: "Asset disabled",
        description: `${disableAsset.name} is now unavailable for use.`,
      });
      setDisableAsset(null);
      setDisableComment("");
      await loadAssets();
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Disable failed",
        description: err instanceof Error ? err.message : "Failed to disable asset",
      });
    } finally {
      setDisableSaving(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId, page, limit, sort, search, assetType, status, acquisitionType, dateFrom, dateTo, trackMaintenance, make, model]);

  useEffect(() => {
    setPage(1);
  }, [search, assetType, status, acquisitionType, dateFrom, dateTo, trackMaintenance, make, model, sort, limit]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Hardware Assets Overview</h1>
        <p className="text-stone-600 mt-1">Review all hard assets, acquisition context, maintenance cadence, and supporting docs.</p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to view hardware assets.</div>
        </Card>
      )}

      <Card title="Filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="hardware-assets-search">Search</Label>
            <Input
              id="hardware-assets-search"
              aria-label="Hardware assets search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!canInteract}
              placeholder="Name, make, model"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-type">Asset Type</Label>
            <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetTypeFilter)} disabled={!canInteract}>
              <SelectTrigger id="hardware-assets-type" aria-label="Hardware asset type filter">
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
            <Label htmlFor="hardware-assets-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)} disabled={!canInteract}>
              <SelectTrigger id="hardware-assets-status" aria-label="Hardware asset status filter">
                <SelectValue placeholder="All statuses" />
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

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-acquisition">Acquisition Type</Label>
            <Select
              value={acquisitionType}
              onValueChange={(value) => setAcquisitionType(value as AcquisitionTypeFilter)}
              disabled={!canInteract}
            >
              <SelectTrigger id="hardware-assets-acquisition" aria-label="Hardware acquisition type filter">
                <SelectValue placeholder="All acquisition types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All acquisition types</SelectItem>
                {ACQUISITION_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {enumLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-date-from">Acquired Date From</Label>
            <Input
              id="hardware-assets-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={!canInteract}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-date-to">Acquired Date To</Label>
            <Input
              id="hardware-assets-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={!canInteract}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-track-maintenance">Maintenance Tracking</Label>
            <Select
              value={trackMaintenance}
              onValueChange={(value) => setTrackMaintenance(value as TrackMaintenanceFilter)}
              disabled={!canInteract}
            >
              <SelectTrigger id="hardware-assets-track-maintenance" aria-label="Hardware maintenance tracking filter">
                <SelectValue placeholder="All assets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All assets</SelectItem>
                <SelectItem value="ENABLED">Enabled</SelectItem>
                <SelectItem value="DISABLED">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-sort">Sort</Label>
            <Select value={sort} onValueChange={(value) => setSort(value as SortFilter)} disabled={!canInteract}>
              <SelectTrigger id="hardware-assets-sort" aria-label="Hardware assets sort">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NAME_ASC">Name (A-Z)</SelectItem>
                <SelectItem value="NAME_DESC">Name (Z-A)</SelectItem>
                <SelectItem value="ACQUIRED_DATE_DESC">Acquired (Newest)</SelectItem>
                <SelectItem value="ACQUIRED_DATE_ASC">Acquired (Oldest)</SelectItem>
                <SelectItem value="UPDATED_DESC">Recently Updated</SelectItem>
                <SelectItem value="CREATED_DESC">Recently Added</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-make">Make</Label>
            <Input
              id="hardware-assets-make"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              disabled={!canInteract}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-model">Model</Label>
            <Input
              id="hardware-assets-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!canInteract}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hardware-assets-limit">Rows per page</Label>
            <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))} disabled={!canInteract}>
              <SelectTrigger id="hardware-assets-limit" aria-label="Hardware assets page size">
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
        </div>
      </Card>

      <Card title="Assets">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-2">Name</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-2">Make / Model / Year</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Acquired</div>
              <div className="col-span-1">Purchase</div>
              <div className="col-span-1">Current Value</div>
              <div className="col-span-2">Maintenance</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {loadingAssets ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : assets.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">No hardware assets found for this filter.</div>
            ) : (
              <div className="divide-y">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center cursor-pointer hover:bg-stone-50"
                    onClick={() => openAssetDetail(asset.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openAssetDetail(asset.id);
                      }
                    }}
                  >
                    <div className="col-span-2">
                      <div className="font-medium text-stone-800">{asset.name}</div>
                      <div className="text-xs text-stone-500">
                        Docs: {asset.attachmentCount ?? 0} | Events: {asset.maintenanceEventCount ?? 0}
                      </div>
                    </div>
                    <div className="col-span-1 text-stone-700">{enumLabel(String(asset.assetType ?? "OTHER"))}</div>
                    <div className="col-span-2 text-stone-700">{makeModelYearLabel(asset)}</div>
                    <div className="col-span-1 text-stone-700">{enumLabel(String(asset.status ?? "ACTIVE"))}</div>
                    <div className="col-span-1 text-stone-700">{formatDate(asset.acquisitionDate)}</div>
                    <div className="col-span-1 text-stone-700">{formatCurrency(asset.purchasePrice)}</div>
                    <div className="col-span-1 text-stone-700">{formatCurrency(asset.currentValueEstimate)}</div>
                    <div className="col-span-2 text-xs text-stone-700">
                      <div>Last: {formatDate(asset.lastEventDate)}</div>
                      <div>
                        Next: {formatDate(asset.nextDueDate)}
                        {asset.nextDueMeter != null && asset.nextDueMeter !== "" ? ` (${asset.nextDueMeter})` : ""}
                      </div>
                      <div className="mt-1">
                        <label className="inline-flex items-center gap-1 text-stone-600" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={Boolean(asset.trackMaintenance)} disabled />
                          <span>Tracking</span>
                        </label>
                      </div>
                    </div>
                    <div className="col-span-1 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button type="button" size="sm" variant="outline" onClick={() => openAssetDetail(asset.id)}>
                        Open
                      </Button>
                      <Button type="button" size="sm" onClick={() => openAddMaintenance(asset.id)}>
                        Add Log
                      </Button>
                      {String(asset.status ?? "").toUpperCase() !== "DISABLED" && (
                        <Button type="button" size="sm" variant="outline" onClick={() => openDisablePrompt(asset)}>
                          Disable
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-stone-600">
            <div>
              Page {page} of {totalPages} ({total} assets)
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

      {disableAsset && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-amber-300 bg-white shadow-xl">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm font-semibold text-stone-800">Disable Asset</div>
            <div className="text-xs text-stone-700 mt-1">
              Mark <span className="font-medium">{disableAsset.name}</span> as unavailable and capture why.
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="hardware-disable-comment">Comment (optional)</Label>
              <Textarea
                id="hardware-disable-comment"
                aria-label="Reason for disabling asset"
                value={disableComment}
                onChange={(e) => setDisableComment(e.target.value)}
                placeholder="Describe what is broken or why this asset is unavailable."
                rows={4}
                disabled={disableSaving}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDisablePrompt} disabled={disableSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitDisable()} disabled={disableSaving}>
                {disableSaving ? "Disabling..." : "Disable Asset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
