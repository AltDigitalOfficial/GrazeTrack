import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiGet, apiPostForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import {
  FuelPurchaseDetailResponseSchema,
  FuelPurchasesResponseSchema,
  FuelProductsResponseSchema,
  type FuelProductRow,
  type FuelPurchaseItem,
  type FuelPurchaseListRow,
  type FuelUnitType,
} from "@/lib/contracts/fuel";

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

type PurchaseDetailState = {
  purchase: FuelPurchaseListRow;
  items: FuelPurchaseItem[];
};

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

function unitTypeForUi(value: string | null | undefined): FuelUnitType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "VOLUME" || normalized === "COUNT") return normalized;
  return "COUNT";
}

function normalizeVolumeUnit(unit: string | null | undefined): "gal" | "l" | "qt" | "pt" | "oz" | "ml" | null {
  const normalized = String(unit ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized.length) return null;
  if (normalized === "gal" || normalized === "gallon" || normalized === "gallons") return "gal";
  if (normalized === "l" || normalized === "liter" || normalized === "liters") return "l";
  if (normalized === "qt" || normalized === "quart" || normalized === "quarts") return "qt";
  if (normalized === "pt" || normalized === "pint" || normalized === "pints") return "pt";
  if (normalized === "oz" || normalized === "floz" || normalized === "fl_oz" || normalized === "fluidounce") return "oz";
  if (normalized === "ml" || normalized === "milliliter" || normalized === "milliliters") return "ml";
  return null;
}

function convertVolumeToGal(value: number, unit: string | null | undefined): number | null {
  const normalized = normalizeVolumeUnit(unit);
  if (!normalized) return null;
  if (normalized === "gal") return value;
  if (normalized === "l") return value * 0.2641720524;
  if (normalized === "qt") return value * 0.25;
  if (normalized === "pt") return value * 0.125;
  if (normalized === "oz") return value / 128;
  return value * 0.0002641720524;
}

export default function FuelPurchasesPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [products, setProducts] = useState<FuelProductRow[]>([]);
  const [purchases, setPurchases] = useState<FuelPurchaseListRow[]>([]);
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseDetailState | null>(null);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIsoDate());
  const [vendor, setVendor] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("gal");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [packageSize, setPackageSize] = useState("");
  const [packageUnit, setPackageUnit] = useState("oz");
  const [unitCost, setUnitCost] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [notes, setNotes] = useState("");

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId && !saving, [ranchLoading, activeRanchId, saving]);
  const selectedProduct = useMemo(
    () => products.find((row) => row.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );
  const selectedUnitType = useMemo<FuelUnitType>(() => unitTypeForUi(selectedProduct?.unitType), [selectedProduct?.unitType]);
  const selectedDefaultUnit = useMemo(() => selectedProduct?.defaultUnit ?? "gal", [selectedProduct?.defaultUnit]);

  const computedNormalizedFromPackage = useMemo(() => {
    if (selectedUnitType !== "COUNT") return null;
    const qty = parseNumeric(quantity);
    const pkg = parseNumeric(packageSize);
    if (qty === null || qty <= 0 || pkg === null || pkg <= 0) return null;
    const normalizedGal = convertVolumeToGal(qty * pkg, packageUnit || "oz");
    if (normalizedGal === null) return null;
    return { quantity: String(normalizedGal), unit: "gal" };
  }, [packageSize, packageUnit, quantity, selectedUnitType]);

  function resetForm() {
    setSelectedProductId("");
    setPurchaseDate(todayIsoDate());
    setVendor("");
    setInvoiceRef("");
    setQuantity("");
    setUnit("gal");
    setShowAdvanced(false);
    setPackageSize("");
    setPackageUnit("oz");
    setUnitCost("");
    setTotalCost("");
    setNotes("");
    setSaveError(null);
  }

  async function loadProducts() {
    setLoadingProducts(true);
    try {
      const raw = await apiGet("/fuel/products");
      const parsed = FuelProductsResponseSchema.parse(raw);
      setProducts(parsed.products ?? []);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadPurchases() {
    setLoadingPurchases(true);
    setLoadError(null);
    try {
      const raw = await apiGet("/fuel/purchases");
      const parsed = FuelPurchasesResponseSchema.parse(raw);
      setPurchases(parsed.purchases ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load fuel purchases");
      setPurchases([]);
    } finally {
      setLoadingPurchases(false);
    }
  }

  async function loadPurchaseDetail(purchaseId: string) {
    setLoadingDetail(true);
    try {
      const raw = await apiGet(`/fuel/purchases/${encodeURIComponent(purchaseId)}`);
      const detail = FuelPurchaseDetailResponseSchema.parse(raw);
      setPurchaseDetail({ purchase: detail.purchase, items: detail.items });
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
    if (!selectedProductId) return setSaveError("Select a product.");

    const qty = parseNumeric(quantity);
    if (qty === null || qty <= 0) return setSaveError("Quantity must be a positive number.");
    if (unitCost.trim() && parseNumeric(unitCost) === null) return setSaveError("Unit cost must be numeric.");
    if (totalCost.trim() && parseNumeric(totalCost) === null) return setSaveError("Total cost must be numeric.");

    const includeCountAdvanced = selectedUnitType === "COUNT" && showAdvanced && packageSize.trim().length > 0;
    if (includeCountAdvanced) {
      const parsedPackage = parseNumeric(packageSize);
      if (parsedPackage === null || parsedPackage <= 0) return setSaveError("Package size must be a positive number.");
    }

    setSaving(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.append("purchaseDate", purchaseDate);
      fd.append("vendor", vendor.trim());
      fd.append("invoiceRef", invoiceRef.trim());
      fd.append("notes", notes.trim());
      fd.append("items", JSON.stringify([{
        productId: selectedProductId,
        quantity: String(qty),
        unit: unit.trim() || selectedDefaultUnit || "gal",
        unitType: selectedUnitType,
        unitCost: unitCost.trim() || null,
        totalCost: totalCost.trim() || null,
        packageSize: includeCountAdvanced ? packageSize.trim() : null,
        packageUnit: includeCountAdvanced ? (packageUnit.trim() || "oz") : null,
        normalizedQuantity: includeCountAdvanced ? (computedNormalizedFromPackage?.quantity ?? null) : null,
        normalizedUnit: includeCountAdvanced ? (computedNormalizedFromPackage?.unit ?? null) : null,
      }]));

      await apiPostForm("/fuel/purchases", fd);
      await loadPurchases();
      resetForm();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to create fuel purchase");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void Promise.all([loadProducts(), loadPurchases()]);
  }, [activeRanchId]);

  useEffect(() => {
    setUnit(selectedDefaultUnit);
  }, [selectedDefaultUnit]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Fuel &amp; Fluids Purchases</h1>
        <p className="text-stone-600 mt-1">Record product purchases. Inventory updates automatically.</p>
      </header>

      <Card title="Important"><div className="text-sm text-amber-700">Purchases cannot be edited/deleted yet.</div></Card>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected"><div className="text-sm text-stone-700">Select a ranch to record fuel/fluid purchases.</div></Card>
      )}

      <Card title="Create Purchase">
        <form onSubmit={submitForm} className="space-y-4 p-4">
          {saveError && <div className="text-sm text-red-600">{saveError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fuel-purchase-product">Product</Label>
              <Select value={selectedProductId || "__none"} onValueChange={(v) => setSelectedProductId(v === "__none" ? "" : v)} disabled={!canInteract || loadingProducts}>
                <SelectTrigger id="fuel-purchase-product" aria-label="Fuel purchase product selection"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select product</SelectItem>
                  {products.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label htmlFor="fuel-purchase-date">Purchase Date</Label><Input id="fuel-purchase-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} disabled={!canInteract} /></div>
            <div className="space-y-2"><Label htmlFor="fuel-purchase-vendor">Vendor (optional)</Label><Input id="fuel-purchase-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={!canInteract} /></div>
            <div className="space-y-2"><Label htmlFor="fuel-purchase-invoice">Invoice/Ref (optional)</Label><Input id="fuel-purchase-invoice" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} disabled={!canInteract} /></div>
            <div className="space-y-2"><Label htmlFor="fuel-purchase-quantity">Quantity</Label><Input id="fuel-purchase-quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!canInteract} /></div>
            <div className="space-y-2">
              <Label htmlFor="fuel-purchase-unit">Unit</Label>
              {selectedUnitType === "VOLUME" ? (
                <Select value={unit || "gal"} onValueChange={setUnit} disabled={!canInteract}>
                  <SelectTrigger id="fuel-purchase-unit" aria-label="Fuel purchase unit"><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent><SelectItem value="gal">gal</SelectItem><SelectItem value="l">L</SelectItem><SelectItem value="qt">qt</SelectItem><SelectItem value="pt">pt</SelectItem><SelectItem value="oz">oz</SelectItem><SelectItem value="ml">ml</SelectItem></SelectContent>
                </Select>
              ) : (<Input id="fuel-purchase-unit" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={!canInteract} />)}
              <div className="text-xs text-muted-foreground">Unit type: {selectedUnitType}</div>
            </div>
            <div className="space-y-2"><Label htmlFor="fuel-purchase-unit-cost">Unit cost (optional)</Label><Input id="fuel-purchase-unit-cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} disabled={!canInteract} /></div>
            <div className="space-y-2"><Label htmlFor="fuel-purchase-total-cost">Total cost (optional)</Label><Input id="fuel-purchase-total-cost" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} disabled={!canInteract} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="fuel-purchase-notes">Notes (optional)</Label><Textarea id="fuel-purchase-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={!canInteract} /></div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-stone-800">Advanced (optional)</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAdvanced((prev) => !prev)} aria-label="Toggle advanced fuel purchase fields" disabled={!canInteract}>{showAdvanced ? "Hide Advanced" : "Show Advanced"}</Button>
            </div>
            {showAdvanced && selectedUnitType === "COUNT" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="fuel-purchase-package-size">Package size (optional)</Label><Input id="fuel-purchase-package-size" value={packageSize} onChange={(e) => setPackageSize(e.target.value)} disabled={!canInteract} placeholder="14" /></div>
                <div className="space-y-2"><Label htmlFor="fuel-purchase-package-unit">Package unit</Label><Input id="fuel-purchase-package-unit" value={packageUnit} onChange={(e) => setPackageUnit(e.target.value)} disabled={!canInteract} placeholder="oz" /></div>
              </div>
            )}
            {showAdvanced && <div className="text-xs text-muted-foreground">{computedNormalizedFromPackage ? `Normalized estimate: ${computedNormalizedFromPackage.quantity} ${computedNormalizedFromPackage.unit}` : "No normalized preview available."}</div>}
          </div>

          <div className="flex items-center justify-end gap-3"><Button type="button" variant="outline" onClick={resetForm} disabled={!canInteract}>Reset</Button><Button type="submit" disabled={!canInteract}>{saving ? "Saving..." : "Create Purchase"}</Button></div>
        </form>
      </Card>

      <Card title="Purchase History">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50"><div className="col-span-3">Date</div><div className="col-span-3">Vendor</div><div className="col-span-2">Items</div><div className="col-span-2">Total</div><div className="col-span-2 text-right">Action</div></div>
            {loadingPurchases ? <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div> : purchases.length === 0 ? <div className="px-3 py-8 text-sm text-stone-500 text-center">No fuel/fluid purchases recorded yet.</div> : (
              <div className="divide-y">
                {purchases.map((purchase) => (
                  <div key={purchase.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center">
                    <div className="col-span-3 text-stone-800">{purchase.purchaseDate}</div><div className="col-span-3 text-stone-700">{purchase.vendor ?? "-"}</div><div className="col-span-2 text-stone-700">{purchase.itemCount ?? 0}</div><div className="col-span-2 text-stone-700">{purchase.totalCost ?? "0"}</div>
                    <div className="col-span-2 flex justify-end"><Button type="button" variant={selectedPurchaseId === purchase.id ? "default" : "outline"} size="sm" onClick={() => loadPurchaseDetail(purchase.id)} disabled={!canInteract} aria-label={`View purchase ${purchase.id}`}>View</Button></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {loadingDetail && <Card title="Purchase Detail"><div className="p-4 text-sm text-stone-500">Loading purchase detail...</div></Card>}
      {purchaseDetail && !loadingDetail && (
        <Card title="Purchase Detail">
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-stone-500">Purchase Date</div><div className="text-stone-800">{purchaseDetail.purchase.purchaseDate}</div></div>
              <div><div className="text-xs text-stone-500">Vendor</div><div className="text-stone-800">{purchaseDetail.purchase.vendor ?? "-"}</div></div>
              <div><div className="text-xs text-stone-500">Invoice Ref</div><div className="text-stone-800">{purchaseDetail.purchase.invoiceRef ?? "-"}</div></div>
            </div>
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50"><div className="col-span-4">Product</div><div className="col-span-2">Unit Type</div><div className="col-span-2">Qty / Unit</div><div className="col-span-2">Normalized</div><div className="col-span-2">Cost</div></div>
              <div className="divide-y">
                {purchaseDetail.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                    <div className="col-span-4 text-stone-800">{item.productName ?? "-"}</div><div className="col-span-2 text-stone-700">{unitTypeForUi(item.unitType)}</div>
                    <div className="col-span-2 text-stone-700">{item.quantity} {item.unit}</div>
                    <div className="col-span-2 text-stone-700">{item.normalizedQuantity && item.normalizedUnit ? `${item.normalizedQuantity} ${item.normalizedUnit}` : "-"}</div>
                    <div className="col-span-2 text-stone-700">{item.totalCost ?? (item.unitCost ? `${item.unitCost} / unit` : "-")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
