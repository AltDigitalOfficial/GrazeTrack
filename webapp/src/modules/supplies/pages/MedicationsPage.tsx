import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes";
import { apiGet } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type InventoryRow = {
  id: string;
  displayName: string;
  units: Array<{ unit: string; quantity: string }>;
  lastPurchaseDate: string | null;
};

type StandardRow = {
  id: string;
  standardMedicationId: string;
  medicationDisplayName: string;
  usesOffLabel: boolean;
  standardDoseText: string;
  startDate: string;
  endDate: string | null;
  createdAt: string | Date;
};

export default function MedicationsPage() {
  const navigate = useNavigate();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [showRetired, setShowRetired] = useState(false);

  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [standards, setStandards] = useState<StandardRow[]>([]);

  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingStandards, setLoadingStandards] = useState(false);

  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [standardsError, setStandardsError] = useState<string | null>(null);

  const goToStandardsCreate = () => navigate(ROUTES.supplies.medicationsStandardsCreate);
  const goToPurchasesCreate = () => navigate(ROUTES.supplies.medicationsPurchasesCreate);

  // Load inventory
  useEffect(() => {
    if (!activeRanchId) return;

    const run = async () => {
      setLoadingInventory(true);
      setInventoryError(null);
      try {
        const res = await apiGet<{ inventory: InventoryRow[] }>(
          `/medications/inventory?ranchId=${encodeURIComponent(activeRanchId)}`
        );
        setInventory(res.inventory ?? []);
      } catch (e: any) {
        setInventoryError(e?.message || "Failed to load inventory");
      } finally {
        setLoadingInventory(false);
      }
    };

    run();
  }, [activeRanchId]);

  // Load standards (depends on showRetired toggle)
  useEffect(() => {
    if (!activeRanchId) return;

    const run = async () => {
      setLoadingStandards(true);
      setStandardsError(null);
      try {
        const res = await apiGet<{ standards: StandardRow[] }>(
          `/ranch-medication-standards?ranchId=${encodeURIComponent(
            activeRanchId
          )}&includeRetired=${showRetired ? "true" : "false"}`
        );
        setStandards(res.standards ?? []);
      } catch (e: any) {
        setStandardsError(e?.message || "Failed to load medication standards");
      } finally {
        setLoadingStandards(false);
      }
    };

    run();
  }, [activeRanchId, showRetired]);

  const canInteract = useMemo(() => !ranchLoading && !!activeRanchId, [ranchLoading, activeRanchId]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Medications</h1>
        <p className="text-stone-600 mt-1">
          Track veterinary medications, purchases, and ranch dosing standards.
        </p>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">
            Select a ranch to view inventory and standards.
          </div>
        </Card>
      )}

      {/* Top actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={goToPurchasesCreate} disabled={!canInteract}>
          Record Purchase
        </Button>
        <Button variant="outline" onClick={goToStandardsCreate} disabled={!canInteract}>
          Define Standard
        </Button>
      </div>

      {/* Inventory */}
      <Card title="Medication Inventory">
        <div className="space-y-3">
          <p className="text-stone-600">
            Inventory is derived from purchases. This view shows current on-hand quantities grouped
            by unit.
          </p>

          {inventoryError && (
            <div className="text-sm text-red-600">Error: {inventoryError}</div>
          )}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-6">Medication</div>
              <div className="col-span-3">On Hand</div>
              <div className="col-span-3">Last Purchase</div>
            </div>

            {loadingInventory ? (
              <div className="px-3 py-10 text-sm text-stone-500 text-center">Loading…</div>
            ) : inventory.length === 0 ? (
              <div className="px-3 py-10 text-sm text-stone-500 text-center">
                No inventory yet. Record your first purchase to begin tracking.
              </div>
            ) : (
              <div className="divide-y">
                {inventory.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                    <div className="col-span-6 font-medium text-stone-800">
                      {row.displayName}
                    </div>

                    <div className="col-span-3 text-stone-700">
                      {row.units.length === 0 ? (
                        <span className="text-stone-500">—</span>
                      ) : (
                        <div className="space-y-1">
                          {row.units.map((u, idx) => (
                            <div key={`${u.unit}-${idx}`}>
                              {u.quantity} {u.unit}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="col-span-3 text-stone-700">
                      {row.lastPurchaseDate ?? <span className="text-stone-500">—</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Standards */}
      <Card title="Medication Standards">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-stone-600">
              Standards power the medication dropdown for purchases. Retired standards won’t appear
              in purchase selection.
            </p>

            <div className="flex items-center gap-2">
              <Checkbox checked={showRetired} onCheckedChange={(v) => setShowRetired(Boolean(v))} />
              <span className="text-sm text-stone-700">Show retired</span>
            </div>
          </div>

          {standardsError && (
            <div className="text-sm text-red-600">Error: {standardsError}</div>
          )}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-4">Medication</div>
              <div className="col-span-4">Ranch Standard</div>
              <div className="col-span-2">Start</div>
              <div className="col-span-2 text-right">Status</div>
            </div>

            {loadingStandards ? (
              <div className="px-3 py-10 text-sm text-stone-500 text-center">Loading…</div>
            ) : standards.length === 0 ? (
              <div className="px-3 py-10 text-sm text-stone-500 text-center space-y-3">
                <div>No standards yet.</div>
                <div>
                  <Button onClick={goToStandardsCreate} disabled={!canInteract}>
                    Define your first standard
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {standards.map((s) => (
                  <div key={s.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                    <div className="col-span-4 font-medium text-stone-800">
                      {s.medicationDisplayName}
                    </div>

                    <div className="col-span-4 text-stone-700">
                      <div className="line-clamp-2">{s.standardDoseText}</div>
                      {s.usesOffLabel && (
                        <div className="text-xs text-stone-500 mt-1">Off-label practice</div>
                      )}
                    </div>

                    <div className="col-span-2 text-stone-700">{s.startDate}</div>

                    <div className="col-span-2 text-right">
                      {s.endDate ? (
                        <span className="text-xs px-2 py-1 rounded bg-stone-100 text-stone-700">
                          Retired
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-800">
                          Active
                        </span>
                      )}
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
