import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiGet, apiPostForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import {
  FeedBlendsResponseSchema,
  FeedComponentsResponseSchema,
  FeedPurchaseDetailResponseSchema,
  FeedPurchasesResponseSchema,
  type FeedBlendRow,
  type FeedComponentRow,
  type FeedPurchaseItem,
  type FeedPurchaseListRow,
} from "@/lib/contracts/feed";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  FeedPhotoUploader,
  type ExistingFeedPhoto,
  type LocalFeedPhoto,
} from "@/modules/supplies/components/FeedPhotoUploader";

type PurchaseEntityType = "COMPONENT" | "BLEND";
type PurchasePhotoPurpose = "receipt" | "packaging" | "misc";
type FeedUnitType = "WEIGHT" | "COUNT" | "VOLUME";
type LocalPhotosByPurpose = Record<PurchasePhotoPurpose, LocalFeedPhoto[]>;

type PurchaseDetailState = {
  purchase: FeedPurchaseListRow;
  items: FeedPurchaseItem[];
  photos: ExistingFeedPhoto[];
};

function emptyLocalPhotos(): LocalPhotosByPurpose {
  return { receipt: [], packaging: [], misc: [] };
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseNumeric(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function unitTypeForUi(value: string | null | undefined): FeedUnitType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "COUNT" || normalized === "VOLUME") {
    return normalized as FeedUnitType;
  }
  return "COUNT";
}

function normalizeWeightUnit(unit: string | null | undefined): "lb" | "kg" | "ton" | null {
  const normalized = String(unit ?? "").trim().toLowerCase();
  if (!normalized.length) return null;
  if (normalized === "lb" || normalized === "lbs" || normalized === "pound" || normalized === "pounds") return "lb";
  if (normalized === "kg" || normalized === "kgs" || normalized === "kilogram" || normalized === "kilograms") return "kg";
  if (normalized === "ton" || normalized === "tons") return "ton";
  return null;
}

function convertWeightToLb(value: number, unit: string | null | undefined): number | null {
  const normalized = normalizeWeightUnit(unit);
  if (!normalized) return null;
  if (normalized === "lb") return value;
  if (normalized === "kg") return value * 2.2046226218;
  return value * 2000;
}

function speciesLabel(item: FeedPurchaseItem): string {
  const values = item.eligibleSpecies ?? [];
  if (item.eligibleSpeciesIsAll || values.length === 0) return "All ranch species";
  return values.join(", ");
}

function entitySpeciesLabel(entityType: PurchaseEntityType, component: FeedComponentRow | null, blend: FeedBlendRow | null): string {
  if (entityType === "COMPONENT") {
    if (!component) return "-";
    const values = component.eligibleSpecies ?? [];
    if (component.eligibleSpeciesIsAll || values.length === 0) return "All ranch species";
    return values.join(", ");
  }
  if (!blend) return "-";
  const values = blend.eligibleSpecies ?? [];
  if (blend.eligibleSpeciesIsAll || values.length === 0) return "All ranch species";
  return values.join(", ");
}

export default function FeedPurchasesPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [components, setComponents] = useState<FeedComponentRow[]>([]);
  const [blends, setBlends] = useState<FeedBlendRow[]>([]);
  const [purchases, setPurchases] = useState<FeedPurchaseListRow[]>([]);

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [entityType, setEntityType] = useState<PurchaseEntityType>("COMPONENT");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIsoDate());
  const [supplierName, setSupplierName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("lb");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [packageWeight, setPackageWeight] = useState("");
  const [packageWeightUnit, setPackageWeightUnit] = useState("lb");
  const [unitPrice, setUnitPrice] = useState("");
  const [lineTotal, setLineTotal] = useState("");
  const [notes, setNotes] = useState("");

  const [localPhotos, setLocalPhotos] = useState<LocalPhotosByPurpose>(emptyLocalPhotos());

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseDetailState | null>(null);

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId && !saving, [ranchLoading, activeRanchId, saving]);

  const selectedComponent = useMemo(
    () => (entityType === "COMPONENT" ? components.find((c) => c.id === selectedEntityId) ?? null : null),
    [components, entityType, selectedEntityId]
  );
  const selectedBlend = useMemo(
    () => (entityType === "BLEND" ? blends.find((b) => b.id === selectedEntityId) ?? null : null),
    [blends, entityType, selectedEntityId]
  );
  const selectedUnitType = useMemo<FeedUnitType>(() => {
    if (entityType === "COMPONENT") return unitTypeForUi(selectedComponent?.unitType);
    return unitTypeForUi(selectedBlend?.unitType);
  }, [entityType, selectedBlend?.unitType, selectedComponent?.unitType]);

  const selectedDefaultUnit = useMemo(() => {
    if (entityType === "COMPONENT") return selectedComponent?.defaultUnit ?? "lb";
    return selectedBlend?.defaultUnit ?? "lb";
  }, [entityType, selectedBlend?.defaultUnit, selectedComponent?.defaultUnit]);

  const selectedDefaultPackageWeight = useMemo(() => {
    if (entityType === "COMPONENT") return selectedComponent?.defaultPackageWeight ?? "";
    return selectedBlend?.defaultPackageWeight ?? "";
  }, [entityType, selectedBlend?.defaultPackageWeight, selectedComponent?.defaultPackageWeight]);

  const selectedDefaultPackageUnit = useMemo(() => {
    if (entityType === "COMPONENT") return selectedComponent?.defaultPackageUnit ?? "lb";
    return selectedBlend?.defaultPackageUnit ?? "lb";
  }, [entityType, selectedBlend?.defaultPackageUnit, selectedComponent?.defaultPackageUnit]);

  const computedNormalizedFromPackage = useMemo(() => {
    if (selectedUnitType !== "COUNT") return null;
    const qty = parseNumeric(quantity);
    const pkgWeight = parseNumeric(packageWeight);
    if (qty === null || qty <= 0 || pkgWeight === null || pkgWeight <= 0) return null;
    const totalWeight = qty * pkgWeight;
    const normalizedLb = convertWeightToLb(totalWeight, packageWeightUnit || "lb");
    if (normalizedLb === null) return null;
    return {
      quantity: String(normalizedLb),
      unit: "lb",
    };
  }, [packageWeight, packageWeightUnit, quantity, selectedUnitType]);

  function resetLocalPhotos() {
    for (const purpose of Object.keys(localPhotos) as PurchasePhotoPurpose[]) {
      for (const photo of localPhotos[purpose]) {
        URL.revokeObjectURL(photo.url);
      }
    }
    setLocalPhotos(emptyLocalPhotos());
  }

  function resetForm() {
    setEntityType("COMPONENT");
    setSelectedEntityId("");
    setPurchaseDate(todayIsoDate());
    setSupplierName("");
    setQuantity("");
    setUnit("lb");
    setShowAdvanced(false);
    setPackageWeight("");
    setPackageWeightUnit("lb");
    setUnitPrice("");
    setLineTotal("");
    setNotes("");
    resetLocalPhotos();
    setSaveError(null);
  }

  function addLocalPhotos(purpose: PurchasePhotoPurpose, files: FileList | null) {
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

  function removeLocalPhoto(purpose: PurchasePhotoPurpose, photoId: string) {
    setLocalPhotos((prev) => {
      const photo = prev[purpose].find((p) => p.id === photoId);
      if (photo) URL.revokeObjectURL(photo.url);
      return {
        ...prev,
        [purpose]: prev[purpose].filter((p) => p.id !== photoId),
      };
    });
  }

  async function loadOptions() {
    setLoadingOptions(true);
    try {
      const [componentsRaw, blendsRaw] = await Promise.all([
        apiGet("/feed/components"),
        apiGet("/feed/blends"),
      ]);
      const componentsParsed = FeedComponentsResponseSchema.parse(componentsRaw);
      const blendsParsed = FeedBlendsResponseSchema.parse(blendsRaw);
      setComponents(componentsParsed.components ?? []);
      setBlends(blendsParsed.blends ?? []);
    } catch {
      setComponents([]);
      setBlends([]);
    } finally {
      setLoadingOptions(false);
    }
  }

  async function loadPurchases() {
    setLoadingPurchases(true);
    setLoadError(null);
    try {
      const raw = await apiGet("/feed/purchases");
      const parsed = FeedPurchasesResponseSchema.parse(raw);
      setPurchases(parsed.purchases ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load feed purchases");
      setPurchases([]);
    } finally {
      setLoadingPurchases(false);
    }
  }

  async function loadPurchaseDetail(purchaseId: string) {
    setLoadingDetail(true);
    try {
      const [detailRaw, photosRaw] = await Promise.all([
        apiGet(`/feed/purchases/${encodeURIComponent(purchaseId)}`),
        apiGet(`/feed/purchases/${encodeURIComponent(purchaseId)}/photos`),
      ]);
      const detail = FeedPurchaseDetailResponseSchema.parse(detailRaw);
      const photos = (photosRaw as { photos?: Array<{ id: string; url?: string | null; originalFilename?: string | null }> })
        .photos ?? [];
      setPurchaseDetail({
        purchase: detail.purchase,
        items: detail.items,
        photos: photos.map((photo) => ({
          id: photo.id,
          url: photo.url ?? null,
          originalFilename: photo.originalFilename ?? null,
        })),
      });
      setSelectedPurchaseId(purchaseId);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load purchase details");
      setPurchaseDetail(null);
      setSelectedPurchaseId(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!activeRanchId || saving) return;

    if (!selectedEntityId) {
      setSaveError("Select a component or blend.");
      return;
    }

    const qty = parseNumeric(quantity);
    if (qty === null || qty <= 0) {
      setSaveError("Quantity must be a positive number.");
      return;
    }

    const parsedUnitPrice = parseNumeric(unitPrice);
    if (unitPrice.trim().length > 0 && parsedUnitPrice === null) {
      setSaveError("Unit price must be numeric.");
      return;
    }

    const parsedLineTotal = parseNumeric(lineTotal);
    if (lineTotal.trim().length > 0 && parsedLineTotal === null) {
      setSaveError("Line total must be numeric.");
      return;
    }

    if (entityType === "BLEND" && !selectedBlend?.currentVersion?.id) {
      setSaveError("Selected blend does not have a current version.");
      return;
    }

    const includeCountAdvanced =
      selectedUnitType === "COUNT" && showAdvanced && packageWeight.trim().length > 0;

    if (includeCountAdvanced) {
      const parsedPackageWeight = parseNumeric(packageWeight);
      if (parsedPackageWeight === null || parsedPackageWeight <= 0) {
        setSaveError("Weight per unit must be a positive number.");
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    try {
      const resolvedUnit = unit.trim() || selectedDefaultUnit || "lb";
      const payloadBase = {
        quantity: String(qty),
        unitType: selectedUnitType,
        unit: resolvedUnit,
        packageWeight: includeCountAdvanced ? packageWeight.trim() : null,
        packageWeightUnit: includeCountAdvanced ? (packageWeightUnit.trim() || "lb") : null,
        normalizedQuantity: includeCountAdvanced ? (computedNormalizedFromPackage?.quantity ?? null) : null,
        normalizedUnit: includeCountAdvanced ? (computedNormalizedFromPackage?.unit ?? null) : null,
        unitPrice: unitPrice.trim() ? unitPrice.trim() : null,
        lineTotal: lineTotal.trim() ? lineTotal.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      };

      const itemPayload =
        entityType === "COMPONENT"
          ? {
              entityType: "COMPONENT",
              feedComponentId: selectedEntityId,
              ...payloadBase,
            }
          : {
              entityType: "BLEND",
              feedBlendId: selectedEntityId,
              blendVersionId: selectedBlend?.currentVersion?.id,
              ...payloadBase,
            };

      const fd = new FormData();
      fd.append("purchaseDate", purchaseDate);
      if (supplierName.trim()) fd.append("supplierName", supplierName.trim());
      if (notes.trim()) fd.append("notes", notes.trim());
      fd.append("items", JSON.stringify([itemPayload]));

      for (const photo of localPhotos.receipt) {
        fd.append("receipt", photo.file, photo.originalName);
      }
      for (const photo of localPhotos.packaging) {
        fd.append("packaging", photo.file, photo.originalName);
      }
      for (const photo of localPhotos.misc) {
        fd.append("misc", photo.file, photo.originalName);
      }

      await apiPostForm("/feed/purchases", fd);
      await loadPurchases();
      resetForm();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to create purchase");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void Promise.all([loadOptions(), loadPurchases()]);
  }, [activeRanchId]);

  useEffect(() => {
    setUnit(selectedDefaultUnit);
    setPackageWeight(selectedDefaultPackageWeight);
    setPackageWeightUnit(selectedDefaultPackageUnit || "lb");
  }, [selectedDefaultPackageUnit, selectedDefaultPackageWeight, selectedDefaultUnit]);

  useEffect(() => {
    return () => {
      resetLocalPhotos();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Feed Purchases</h1>
        <p className="text-stone-600 mt-1">
          Record component or blend purchases. Inventory updates automatically.
        </p>
      </header>

      <Card title="Important">
        <div className="text-sm text-amber-700">
          Purchases cannot be edited/deleted yet.
        </div>
      </Card>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to record feed purchases.</div>
        </Card>
      )}

      <Card title="Create Purchase">
        <form onSubmit={submitForm} className="space-y-4 p-4">
          {saveError && <div className="text-sm text-red-600">{saveError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="feed-purchase-entity-type">Purchase Item Type</Label>
              <Select
                value={entityType}
                onValueChange={(value) => {
                  setEntityType(value as PurchaseEntityType);
                  setSelectedEntityId("");
                }}
                disabled={!canInteract}
              >
                <SelectTrigger id="feed-purchase-entity-type" aria-label="Purchase entity type">
                  <SelectValue placeholder="Select item type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPONENT">Feed Component</SelectItem>
                  <SelectItem value="BLEND">Feed Blend</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-purchase-entity">
                {entityType === "COMPONENT" ? "Feed Component" : "Feed Blend"}
              </Label>
              <Select
                value={selectedEntityId || "__none"}
                onValueChange={(value) => setSelectedEntityId(value === "__none" ? "" : value)}
                disabled={!canInteract || loadingOptions}
              >
                <SelectTrigger id="feed-purchase-entity" aria-label="Purchase entity selection">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select...</SelectItem>
                  {(entityType === "COMPONENT" ? components : blends).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-purchase-date">Purchase Date</Label>
              <Input
                id="feed-purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-purchase-supplier">Supplier (optional)</Label>
              <Input
                id="feed-purchase-supplier"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-purchase-quantity">Quantity</Label>
              <Input
                id="feed-purchase-quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-purchase-unit">Unit</Label>
              {selectedUnitType === "WEIGHT" ? (
                <Select value={unit || "lb"} onValueChange={setUnit} disabled={!canInteract}>
                  <SelectTrigger id="feed-purchase-unit" aria-label="Feed purchase unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lb">lb</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="ton">ton</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="feed-purchase-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={!canInteract}
                />
              )}
              <div className="text-xs text-muted-foreground">Unit type: {selectedUnitType}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-purchase-unit-price">Unit Price (optional)</Label>
              <Input
                id="feed-purchase-unit-price"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-purchase-line-total">Line Total (optional)</Label>
              <Input
                id="feed-purchase-line-total"
                value={lineTotal}
                onChange={(e) => setLineTotal(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="feed-purchase-notes">Notes (optional)</Label>
              <Textarea
                id="feed-purchase-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={!canInteract}
              />
            </div>
          </div>

          <div className="rounded-md border p-3 bg-stone-50 space-y-1">
            <div className="text-sm font-medium text-stone-800">
              Eligible Species (Read-only)
            </div>
            <div className="text-sm text-stone-700">
              {entitySpeciesLabel(entityType, selectedComponent, selectedBlend)}
            </div>
            <div className="text-xs text-stone-600">Unit type: {selectedUnitType}</div>
            {entityType === "BLEND" && selectedBlend?.currentVersion?.id && (
              <div className="text-xs text-stone-600">
                Blend version auto-selected: v{selectedBlend.currentVersion.versionNumber}
              </div>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-stone-800">Advanced (optional)</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAdvanced((prev) => !prev)}
                aria-label="Toggle advanced purchase fields"
                disabled={!canInteract}
              >
                {showAdvanced ? "Hide Advanced" : "Show Advanced"}
              </Button>
            </div>

            {showAdvanced && (
              <div className="space-y-3">
                {selectedUnitType === "COUNT" ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="feed-purchase-package-weight">Weight per unit (optional)</Label>
                        <Input
                          id="feed-purchase-package-weight"
                          value={packageWeight}
                          onChange={(e) => setPackageWeight(e.target.value)}
                          disabled={!canInteract}
                          placeholder="50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="feed-purchase-package-weight-unit">Weight unit</Label>
                        <Select
                          value={packageWeightUnit || "lb"}
                          onValueChange={setPackageWeightUnit}
                          disabled={!canInteract}
                        >
                          <SelectTrigger
                            id="feed-purchase-package-weight-unit"
                            aria-label="Feed purchase package weight unit"
                          >
                            <SelectValue placeholder="Select weight unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lb">lb</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="ton">ton</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {computedNormalizedFromPackage
                        ? `Normalized estimate: ${computedNormalizedFromPackage.quantity} ${computedNormalizedFromPackage.unit}`
                        : "Provide weight per unit to store optional normalized inventory weight."}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No additional advanced fields required for {selectedUnitType} items.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <FeedPhotoUploader
              id="feed-purchase-receipt"
              title="Receipt Photos"
              description="Upload receipt/invoice images."
              ariaLabel="Feed purchase receipt upload"
              existingPhotos={[]}
              markedForDelete={new Set()}
              localPhotos={localPhotos.receipt}
              disabled={!canInteract}
              onAddFiles={(files) => addLocalPhotos("receipt", files)}
              onRemoveLocal={(photoId) => removeLocalPhoto("receipt", photoId)}
              onToggleDeleteExisting={() => {}}
            />

            <FeedPhotoUploader
              id="feed-purchase-packaging"
              title="Packaging Photos"
              description="Upload package or label images."
              ariaLabel="Feed purchase packaging upload"
              existingPhotos={[]}
              markedForDelete={new Set()}
              localPhotos={localPhotos.packaging}
              disabled={!canInteract}
              onAddFiles={(files) => addLocalPhotos("packaging", files)}
              onRemoveLocal={(photoId) => removeLocalPhoto("packaging", photoId)}
              onToggleDeleteExisting={() => {}}
            />

            <FeedPhotoUploader
              id="feed-purchase-misc"
              title="Misc Photos"
              description="Optional supporting photos."
              ariaLabel="Feed purchase misc upload"
              existingPhotos={[]}
              markedForDelete={new Set()}
              localPhotos={localPhotos.misc}
              disabled={!canInteract}
              onAddFiles={(files) => addLocalPhotos("misc", files)}
              onRemoveLocal={(photoId) => removeLocalPhoto("misc", photoId)}
              onToggleDeleteExisting={() => {}}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={resetForm} disabled={!canInteract}>
              Reset
            </Button>
            <Button type="submit" disabled={!canInteract}>
              {saving ? "Saving..." : "Create Purchase"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Purchase History">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-3">Date</div>
              <div className="col-span-3">Supplier</div>
              <div className="col-span-2">Items</div>
              <div className="col-span-2">Created</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            {loadingPurchases ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : purchases.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">
                No feed purchases recorded yet.
              </div>
            ) : (
              <div className="divide-y">
                {purchases.map((purchase) => (
                  <div key={purchase.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center">
                    <div className="col-span-3 text-stone-800">{purchase.purchaseDate}</div>
                    <div className="col-span-3 text-stone-700">{purchase.supplierName ?? "-"}</div>
                    <div className="col-span-2 text-stone-700">{purchase.itemCount ?? 0}</div>
                    <div className="col-span-2 text-stone-700">
                      {String(purchase.createdAt).slice(0, 10)}
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant={selectedPurchaseId === purchase.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => loadPurchaseDetail(purchase.id)}
                        disabled={!canInteract}
                        aria-label={`View purchase ${purchase.id}`}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {loadingDetail && (
        <Card title="Purchase Detail">
          <div className="p-4 text-sm text-stone-500">Loading purchase detail...</div>
        </Card>
      )}

      {purchaseDetail && !loadingDetail && (
        <Card title="Purchase Detail">
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-stone-500">Purchase Date</div>
                <div className="text-stone-800">{purchaseDetail.purchase.purchaseDate}</div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Supplier</div>
                <div className="text-stone-800">{purchaseDetail.purchase.supplierName ?? "-"}</div>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
                <div className="col-span-3">Item</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Qty / Unit</div>
                <div className="col-span-2">Normalized</div>
                <div className="col-span-3">Eligible Species</div>
              </div>

              <div className="divide-y">
                {purchaseDetail.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                    <div className="col-span-3 text-stone-800">{item.displayName ?? "-"}</div>
                    <div className="col-span-2 text-stone-700">{item.entityType}</div>
                    <div className="col-span-2 text-stone-700">
                      <div>
                        {item.quantity} {item.unit}
                      </div>
                      {item.packageWeight && item.packageWeightUnit && (
                        <div className="text-xs text-stone-500">
                          {item.packageWeight} {item.packageWeightUnit} / unit
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-stone-700">
                      {item.normalizedQuantity && item.normalizedUnit
                        ? `${item.normalizedQuantity} ${item.normalizedUnit}`
                        : "-"}
                    </div>
                    <div className="col-span-3 text-stone-700">{speciesLabel(item)}</div>
                  </div>
                ))}
              </div>
            </div>

            {purchaseDetail.photos.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-stone-800">Photos</div>
                <div className="max-h-80 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {purchaseDetail.photos.map((photo) => (
                      <div key={photo.id} className="rounded-md border overflow-hidden bg-white">
                        <div className="aspect-square bg-stone-50 flex items-center justify-center">
                          {photo.url ? (
                            <img
                              src={photo.url}
                              alt={photo.originalFilename || "Purchase photo"}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-stone-500">No preview</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
