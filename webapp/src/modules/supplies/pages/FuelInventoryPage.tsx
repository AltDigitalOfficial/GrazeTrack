import { useEffect, useMemo, useState } from "react";

import { apiGet } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import {
  FuelInventoryResponseSchema,
  type FuelCategory,
  type FuelInventoryRow,
  type FuelUnitType,
} from "@/lib/contracts/fuel";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES: FuelCategory[] = [
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
  if (CATEGORIES.includes(normalized as FuelCategory)) return normalized as FuelCategory;
  return "OTHER";
}

function categoryLabel(value: FuelCategory): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function unitTypeForUi(value: string | null | undefined): FuelUnitType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "VOLUME" || normalized === "COUNT") return normalized;
  return "COUNT";
}

export default function FuelInventoryPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [rows, setRows] = useState<FuelInventoryRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | FuelCategory>("ALL");
  const [unitTypeFilter, setUnitTypeFilter] = useState<"ALL" | FuelUnitType>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter !== "ALL" && categoryForUi(row.productCategory) !== categoryFilter) return false;
      if (unitTypeFilter !== "ALL" && unitTypeForUi(row.unitType) !== unitTypeFilter) return false;
      if (!search.length) return true;
      const name = String(row.productName ?? "").toLowerCase();
      const unit = String(row.unit ?? "").toLowerCase();
      return name.includes(search) || unit.includes(search);
    });
  }, [categoryFilter, rows, searchTerm, unitTypeFilter]);

  async function loadInventory() {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiGet("/fuel/inventory");
      const parsed = FuelInventoryResponseSchema.parse(raw);
      setRows(parsed.inventory ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load fuel inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void loadInventory();
  }, [activeRanchId]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Fuel &amp; Fluids Inventory</h1>
        <p className="text-stone-600 mt-1">Inventory balances increase from purchase records.</p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to view fuel/fluid inventory.</div>
        </Card>
      )}

      <Card title="On-Hand Balances">
        <div className="space-y-3 p-4">
          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search inventory..."
              aria-label="Search fuel inventory"
            />

            <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as typeof categoryFilter)}>
              <SelectTrigger aria-label="Fuel inventory category filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {categoryLabel(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={unitTypeFilter} onValueChange={(value) => setUnitTypeFilter(value as typeof unitTypeFilter)}>
              <SelectTrigger aria-label="Fuel inventory unit type filter">
                <SelectValue placeholder="Unit type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All unit types</SelectItem>
                <SelectItem value="VOLUME">VOLUME</SelectItem>
                <SelectItem value="COUNT">COUNT</SelectItem>
                <SelectItem value="WEIGHT">WEIGHT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-4">Product</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">Unit Type</div>
              <div className="col-span-2">On Hand</div>
              <div className="col-span-2">Updated</div>
            </div>

            {loading ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : filteredRows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">
                {rows.length === 0
                  ? "No fuel/fluid inventory yet. Record purchases to populate balances."
                  : "No inventory rows match the current filters."}
              </div>
            ) : (
              <div className="divide-y">
                {filteredRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                    <div className="col-span-4 text-stone-800">{row.productName ?? "-"}</div>
                    <div className="col-span-2 text-stone-700">{categoryLabel(categoryForUi(row.productCategory))}</div>
                    <div className="col-span-2 text-stone-700">{unitTypeForUi(row.unitType)}</div>
                    <div className="col-span-2 text-stone-700">
                      <div>
                        {row.onHandQuantity} {row.unit}
                      </div>
                      {row.normalizedOnHandQuantity && row.normalizedUnit && (
                        <div className="text-xs text-stone-500">
                          Approx {row.normalizedOnHandQuantity} {row.normalizedUnit}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-stone-700">{String(row.updatedAt ?? "").slice(0, 10)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Notes">
        <div className="p-4 text-sm text-stone-700">
          Purchases are append-only for now, so balances only move upward until usage tracking is added.
        </div>
      </Card>
    </div>
  );
}
