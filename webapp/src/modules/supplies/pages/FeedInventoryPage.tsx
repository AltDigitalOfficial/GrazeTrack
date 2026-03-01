import { useEffect, useMemo, useState } from "react";

import { apiGet } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import { FeedInventoryResponseSchema, type FeedInventoryRow } from "@/lib/contracts/feed";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function unitTypeForUi(value: string | null | undefined): "WEIGHT" | "COUNT" | "VOLUME" {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "COUNT" || normalized === "VOLUME") {
    return normalized;
  }
  return "COUNT";
}

export default function FeedInventoryPage() {
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [rows, setRows] = useState<FeedInventoryRow[]>([]);
  const [entityTypeFilter, setEntityTypeFilter] = useState<"ALL" | "COMPONENT" | "BLEND">("ALL");
  const [unitTypeFilter, setUnitTypeFilter] = useState<"ALL" | "WEIGHT" | "COUNT" | "VOLUME">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (entityTypeFilter !== "ALL" && row.entityType !== entityTypeFilter) return false;
      if (unitTypeFilter !== "ALL" && unitTypeForUi(row.unitType) !== unitTypeFilter) return false;
      if (!search.length) return true;
      const name = String(row.displayName ?? "").toLowerCase();
      const unit = String(row.unit ?? "").toLowerCase();
      return name.includes(search) || unit.includes(search);
    });
  }, [entityTypeFilter, rows, searchTerm, unitTypeFilter]);

  async function loadInventory() {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiGet("/feed/inventory");
      const parsed = FeedInventoryResponseSchema.parse(raw);
      setRows(parsed.inventory ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load feed inventory");
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
        <h1 className="text-3xl font-bold text-stone-800">Feed Inventory</h1>
        <p className="text-stone-600 mt-1">
          Inventory is incremented by feed purchase records.
        </p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to view feed inventory.</div>
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
              aria-label="Search feed inventory"
            />
            <Select value={entityTypeFilter} onValueChange={(value) => setEntityTypeFilter(value as typeof entityTypeFilter)}>
              <SelectTrigger aria-label="Inventory type filter">
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                <SelectItem value="COMPONENT">Components</SelectItem>
                <SelectItem value="BLEND">Blends</SelectItem>
              </SelectContent>
            </Select>
            <Select value={unitTypeFilter} onValueChange={(value) => setUnitTypeFilter(value as typeof unitTypeFilter)}>
              <SelectTrigger aria-label="Inventory unit type filter">
                <SelectValue placeholder="Filter unit type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All unit types</SelectItem>
                <SelectItem value="WEIGHT">WEIGHT</SelectItem>
                <SelectItem value="COUNT">COUNT</SelectItem>
                <SelectItem value="VOLUME">VOLUME</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-4">Item</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Unit Type</div>
              <div className="col-span-2">Quantity</div>
              <div className="col-span-2">Updated</div>
            </div>

            {loading ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">Loading...</div>
            ) : filteredRows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-stone-500 text-center">
                {rows.length === 0
                  ? "No feed inventory yet. Record purchases to populate balances."
                  : "No inventory rows match the current filters."}
              </div>
            ) : (
              <div className="divide-y">
                {filteredRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                    <div className="col-span-4 text-stone-800">{row.displayName ?? "-"}</div>
                    <div className="col-span-2 text-stone-700">{row.entityType}</div>
                    <div className="col-span-2 text-stone-700">{unitTypeForUi(row.unitType)}</div>
                    <div className="col-span-2 text-stone-700">
                      <div>
                        {row.quantityOnHand} {row.unit}
                      </div>
                      {row.normalizedOnHandQuantity && row.normalizedUnit && (
                        <div className="text-xs text-stone-500">
                          Approx {row.normalizedOnHandQuantity} {row.normalizedUnit}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-stone-700">{String(row.updatedAt).slice(0, 10)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Notes">
        <div className="p-4 text-sm text-stone-700">
          Purchases are append-only right now, so balances only move upward until usage tracking is added.
        </div>
      </Card>
    </div>
  );
}
