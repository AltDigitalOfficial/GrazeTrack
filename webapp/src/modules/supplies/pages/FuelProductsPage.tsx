import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiGet, apiPostForm, apiPutForm } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import {
  FuelProductDetailResponseSchema,
  FuelProductsResponseSchema,
  type FuelCategory,
  type FuelProductRow,
  type FuelUnitType,
} from "@/lib/contracts/fuel";

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
import {
  FeedPhotoUploader,
  type ExistingFeedPhoto,
  type LocalFeedPhoto,
} from "@/modules/supplies/components/FeedPhotoUploader";

type PhotoPurpose = "label" | "misc";
type ExistingPhotosByPurpose = Record<PhotoPurpose, ExistingFeedPhoto[]>;
type LocalPhotosByPurpose = Record<PhotoPurpose, LocalFeedPhoto[]>;

const FUEL_CATEGORIES: FuelCategory[] = [
  "GASOLINE",
  "DIESEL",
  "OIL_2_CYCLE",
  "MOTOR_OIL",
  "HYDRAULIC_FLUID",
  "GREASE_LUBRICANT",
  "DEF",
  "COOLANT",
  "OTHER",
];

function categoryForUi(value: string | null | undefined): FuelCategory {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (FUEL_CATEGORIES.includes(normalized as FuelCategory)) return normalized as FuelCategory;
  return "OTHER";
}

function unitTypeForUi(value: string | null | undefined): FuelUnitType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "VOLUME" || normalized === "COUNT") {
    return normalized;
  }
  return "COUNT";
}

function categoryLabel(value: FuelCategory): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function badgeClasses(category: FuelCategory): string {
  if (category === "GASOLINE" || category === "DIESEL" || category === "DEF") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (category === "MOTOR_OIL" || category === "OIL_2_CYCLE" || category === "HYDRAULIC_FLUID") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  if (category === "GREASE_LUBRICANT") {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  return "bg-stone-100 text-stone-700 border-stone-200";
}

function emptyExistingPhotos(): ExistingPhotosByPurpose {
  return { label: [], misc: [] };
}

function emptyLocalPhotos(): LocalPhotosByPurpose {
  return { label: [], misc: [] };
}

function mapPurpose(value: string | undefined): PhotoPurpose {
  return value === "misc" ? "misc" : "label";
}

function packageLabel(row: FuelProductRow): string {
  if (row.defaultPackageSize && row.defaultPackageUnit) {
    return `${row.defaultPackageSize} ${row.defaultPackageUnit}`;
  }
  if (row.defaultPackageSize) {
    return row.defaultPackageSize;
  }
  return "-";
}

export default function FuelProductsPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [products, setProducts] = useState<FuelProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | FuelCategory>("ALL");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<FuelCategory>("OTHER");
  const [defaultUnit, setDefaultUnit] = useState("gal");
  const [unitType, setUnitType] = useState<FuelUnitType>("VOLUME");
  const [defaultPackageSize, setDefaultPackageSize] = useState("");
  const [defaultPackageUnit, setDefaultPackageUnit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

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
    setCategory("OTHER");
    setDefaultUnit("gal");
    setUnitType("VOLUME");
    setDefaultPackageSize("");
    setDefaultPackageUnit("");
    setIsActive(true);
    setNotes("");
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

  async function loadProducts() {
    setLoadingProducts(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      if (includeInactive) params.set("includeInactive", "true");
      const endpoint = params.toString() ? `/fuel/products?${params.toString()}` : "/fuel/products";
      const raw = await apiGet(endpoint);
      const parsed = FuelProductsResponseSchema.parse(raw);
      setProducts(parsed.products ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load fuel products");
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function startEdit(productId: string) {
    setSaveError(null);
    try {
      const raw = await apiGet(`/fuel/products/${encodeURIComponent(productId)}`);
      const parsed = FuelProductDetailResponseSchema.parse(raw);
      const product = parsed.product;
      setEditingId(product.id);
      setName(product.name ?? "");
      setCategory(categoryForUi(product.category));
      setDefaultUnit(product.defaultUnit ?? "gal");
      setUnitType(unitTypeForUi(product.unitType));
      setDefaultPackageSize(product.defaultPackageSize ?? "");
      setDefaultPackageUnit(product.defaultPackageUnit ?? "");
      setIsActive(Boolean(product.isActive));
      setNotes(product.notes ?? "");
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
      setSaveError(err instanceof Error ? err.message : "Failed to load fuel product details");
    }
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!activeRanchId || saving) return;
    if (!name.trim()) {
      setSaveError("Product name is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("category", category);
      fd.append("defaultUnit", defaultUnit.trim() || "gal");
      fd.append("unitType", unitType);
      fd.append("defaultPackageSize", defaultPackageSize.trim());
      fd.append("defaultPackageUnit", defaultPackageUnit.trim());
      fd.append("isActive", isActive ? "true" : "false");
      fd.append("notes", notes.trim());

      if (removePhotoIds.size > 0) {
        fd.append("removePhotoIds", JSON.stringify(Array.from(removePhotoIds)));
      }

      for (const photo of localPhotos.label) {
        fd.append("label", photo.file, photo.originalName);
      }
      for (const photo of localPhotos.misc) {
        fd.append("misc", photo.file, photo.originalName);
      }

      if (editingId) {
        await apiPutForm(`/fuel/products/${encodeURIComponent(editingId)}`, fd);
      } else {
        await apiPostForm("/fuel/products", fd);
      }

      await loadProducts();
      resetForm();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save fuel product");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId, categoryFilter, includeInactive]);

  useEffect(() => {
    return () => {
      resetLocalPhotos();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Fuel &amp; Fluids Products</h1>
        <p className="text-stone-600 mt-1">
          Define fluid products and packaging defaults for purchase entry and inventory tracking.
        </p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to manage fuel and fluid products.</div>
        </Card>
      )}

      <Card title={editingId ? "Edit Product" : "Add Product"}>
        <form onSubmit={submitForm} className="space-y-4 p-4">
          {saveError && <div className="text-sm text-red-600">{saveError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fuel-product-name">Product name</Label>
              <Input
                id="fuel-product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canInteract}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel-product-category">Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as FuelCategory)} disabled={!canInteract}>
                <SelectTrigger id="fuel-product-category" aria-label="Fuel product category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {categoryLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel-product-unit-type">Unit type</Label>
              <Select value={unitType} onValueChange={(value) => setUnitType(value as FuelUnitType)} disabled={!canInteract}>
                <SelectTrigger id="fuel-product-unit-type" aria-label="Fuel product unit type">
                  <SelectValue placeholder="Select unit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VOLUME">VOLUME</SelectItem>
                  <SelectItem value="COUNT">COUNT</SelectItem>
                  <SelectItem value="WEIGHT">WEIGHT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel-product-default-unit">Default unit</Label>
              <Input
                id="fuel-product-default-unit"
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                disabled={!canInteract}
                placeholder="gal"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel-product-package-size">Default package size (optional)</Label>
              <Input
                id="fuel-product-package-size"
                value={defaultPackageSize}
                onChange={(e) => setDefaultPackageSize(e.target.value)}
                disabled={!canInteract}
                placeholder="14"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel-product-package-unit">Package unit (optional)</Label>
              <Input
                id="fuel-product-package-unit"
                value={defaultPackageUnit}
                onChange={(e) => setDefaultPackageUnit(e.target.value)}
                disabled={!canInteract}
                placeholder="oz"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="fuel-product-active" className="flex items-center gap-2 text-sm text-stone-800">
                <Checkbox
                  id="fuel-product-active"
                  checked={isActive}
                  onCheckedChange={(value) => setIsActive(value === true)}
                  disabled={!canInteract}
                />
                <span>Active</span>
              </label>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fuel-product-notes">Notes (optional)</Label>
              <Textarea
                id="fuel-product-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={!canInteract}
              />
            </div>
          </div>

          <div className="space-y-6">
            <FeedPhotoUploader
              id="fuel-product-label-photos"
              title="Label Photos"
              description="Upload product label or packaging photos."
              ariaLabel="Fuel product label photo upload"
              existingPhotos={existingPhotos.label}
              markedForDelete={removePhotoIds}
              localPhotos={localPhotos.label}
              disabled={!canInteract}
              onAddFiles={(files) => addLocalPhotos("label", files)}
              onRemoveLocal={(photoId) => removeLocalPhoto("label", photoId)}
              onToggleDeleteExisting={toggleExistingPhoto}
            />

            <FeedPhotoUploader
              id="fuel-product-misc-photos"
              title="Misc Photos"
              description="Optional supporting images."
              ariaLabel="Fuel product misc photo upload"
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
              {saving ? "Saving..." : editingId ? "Save Product" : "Add Product"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Products">
        <div className="space-y-3 p-4">
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fuel-product-category-filter">Category Filter</Label>
              <Select
                value={categoryFilter}
                onValueChange={(value) => setCategoryFilter(value as typeof categoryFilter)}
                disabled={!canInteract}
              >
                <SelectTrigger id="fuel-product-category-filter" aria-label="Fuel product category filter">
                  <SelectValue placeholder="Category filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {FUEL_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {categoryLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fuel-product-include-inactive" className="text-sm">
                Include inactive products
              </Label>
              <label htmlFor="fuel-product-include-inactive" className="h-10 flex items-center gap-2 rounded-md border px-3">
                <Checkbox
                  id="fuel-product-include-inactive"
                  checked={includeInactive}
                  onCheckedChange={(value) => setIncludeInactive(value === true)}
                  disabled={!canInteract}
                />
                <span className="text-sm text-stone-700">Show inactive rows in product list</span>
              </label>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-3">Product</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">Unit Type</div>
              <div className="col-span-2">Default Unit</div>
              <div className="col-span-2">Package</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            {loadingProducts ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : products.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">
                No fuel/fluid products found for the current filter.
              </div>
            ) : (
              <div className="divide-y">
                {products.map((row) => {
                  const rowCategory = categoryForUi(row.category);
                  return (
                    <div key={row.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center">
                      <div className="col-span-3">
                        <div className="font-medium text-stone-800">{row.name}</div>
                        {!row.isActive && (
                          <div className="text-xs text-stone-500">Inactive</div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${badgeClasses(rowCategory)}`}>
                          {categoryLabel(rowCategory)}
                        </span>
                      </div>
                      <div className="col-span-2 text-stone-700">{unitTypeForUi(row.unitType)}</div>
                      <div className="col-span-2 text-stone-700">{row.defaultUnit}</div>
                      <div className="col-span-2 text-stone-700">{packageLabel(row)}</div>
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
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
