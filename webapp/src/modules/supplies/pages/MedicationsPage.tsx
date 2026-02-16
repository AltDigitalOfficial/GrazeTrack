import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes";
import { apiGet, apiPost } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import {
  MedicationInventoryResponseSchema,
  MedicationStandardsResponseSchema,
  type MedicationInventoryRow,
  type MedicationStandardRow,
} from "@/lib/contracts/medications";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

function toNumberSafe(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export default function MedicationsPage() {
  const navigate = useNavigate();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [showRetired, setShowRetired] = useState(false);

  const [inventory, setInventory] = useState<MedicationInventoryRow[]>([]);
  const [standards, setStandards] = useState<MedicationStandardRow[]>([]);

  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingStandards, setLoadingStandards] = useState(false);

  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [standardsError, setStandardsError] = useState<string | null>(null);

  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [retireError, setRetireError] = useState<string | null>(null);

  const goToStandardsCreate = () => navigate(ROUTES.supplies.medicationsStandardsCreate);
  const goToPurchasesCreate = () => navigate(ROUTES.supplies.medicationsPurchasesCreate);

  const goToMedicationHistory = (standardMedicationId: string, displayName?: string) => {
    const path = ROUTES.supplies.medicationsHistory.replace(
      ":standardMedicationId",
      encodeURIComponent(standardMedicationId)
    );
    navigate(path, {
      state: { medicationDisplayName: displayName ?? null },
    });
  };

  const canInteract = useMemo(
    () => !ranchLoading && !!activeRanchId,
    [ranchLoading, activeRanchId]
  );

  async function loadInventory() {
    setLoadingInventory(true);
    setInventoryError(null);
    try {
      const resRaw = await apiGet(`/medications/inventory`);
      const res = MedicationInventoryResponseSchema.parse(resRaw);
      setInventory(res.inventory ?? []);
    } catch (err: unknown) {
      setInventoryError(getErrorMessage(err, "Failed to load inventory"));
    } finally {
      setLoadingInventory(false);
    }
  }

  async function loadStandards(includeRetired: boolean) {
    setLoadingStandards(true);
    setStandardsError(null);
    try {
      const resRaw = await apiGet(
        `/ranch-medication-standards?includeRetired=${includeRetired ? "true" : "false"}`
      );
      const res = MedicationStandardsResponseSchema.parse(resRaw);
      setStandards(res.standards ?? []);
    } catch (err: unknown) {
      setStandardsError(getErrorMessage(err, "Failed to load medication standards"));
    } finally {
      setLoadingStandards(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) return;
    void loadInventory();
  }, [activeRanchId]);

  useEffect(() => {
    if (!activeRanchId) return;
    void loadStandards(showRetired);
  }, [activeRanchId, showRetired]);

  async function retireStandard(standardId: string) {
    if (!activeRanchId) return;

    setRetireError(null);
    setRetiringId(standardId);

    try {
      await apiPost(`/ranch-medication-standards/${standardId}/retire`, {
        ranchId: activeRanchId,
      });

      await loadStandards(showRetired);
    } catch (err: unknown) {
      setRetireError(getErrorMessage(err, "Failed to retire standard"));
    } finally {
      setRetiringId(null);
    }
  }

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

      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={goToPurchasesCreate} disabled={!canInteract}>
          Record Purchase
        </Button>
        <Button variant="outline" onClick={goToStandardsCreate} disabled={!canInteract}>
          Define Standard
        </Button>
      </div>

      <Card title="Medication Inventory">
        <div className="space-y-3">
          <p className="text-stone-600">
            Inventory totals come from purchase records. Units are set automatically based on medication format.
          </p>

          {inventoryError && <div className="text-sm text-red-600">Error: {inventoryError}</div>}

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
                {inventory.map((row) => {
                  const qtyNum = toNumberSafe(row.quantity);
                  return (
                    <div key={row.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                      <div className="col-span-6 min-w-0">
                        <button
                          type="button"
                          className="font-medium text-stone-800 hover:underline underline-offset-4 text-left"
                          onClick={() => goToMedicationHistory(row.id, row.displayName)}
                          title="View history"
                        >
                          {row.displayName}
                        </button>
                      </div>

                      <div className="col-span-3 text-stone-700">
                        {qtyNum <= 0 ? (
                          <span className="text-stone-500">—</span>
                        ) : (
                          <span>
                            {row.quantity} {row.unit}
                          </span>
                        )}
                      </div>

                      <div className="col-span-3 text-stone-700">
                        {row.lastPurchaseDate ?? <span className="text-stone-500">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Medication Standards">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-stone-600">
              Standards control the medication list shown during purchase entry. Older standards are hidden from new purchases.
            </p>

            <div className="flex items-center gap-2">
              <Checkbox checked={showRetired} onCheckedChange={(v) => setShowRetired(Boolean(v))} />
              <span className="text-sm text-stone-700">Show retired</span>
            </div>
          </div>

          {standardsError && <div className="text-sm text-red-600">Error: {standardsError}</div>}
          {retireError && <div className="text-sm text-red-600">Error: {retireError}</div>}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-4">Medication</div>
              <div className="col-span-4">Ranch Standard</div>
              <div className="col-span-2">Start</div>
              <div className="col-span-2 text-right">Actions</div>
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
                {standards.map((s) => {
                  const isRetired = !!s.endDate;
                  const isRetiring = retiringId === s.id;

                  return (
                    <div key={s.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm">
                      <div className="col-span-4 font-medium text-stone-800">
                        {s.medicationDisplayName}
                        {isRetired && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                            Retired
                          </span>
                        )}
                      </div>

                      <div className="col-span-4 text-stone-700">
                        <div className="line-clamp-2">{s.standardDoseText}</div>
                        {s.usesOffLabel && (
                          <div className="text-xs text-stone-500 mt-1">Off-label practice</div>
                        )}
                        {isRetired && (
                          <div className="text-xs text-stone-500 mt-1">End: {s.endDate}</div>
                        )}
                      </div>

                      <div className="col-span-2 text-stone-700">{s.startDate}</div>

                      <div className="col-span-2 flex justify-end gap-2">
                        {!isRetired ? (
                          <Button
                            variant="outline"
                            disabled={!canInteract || isRetiring}
                            onClick={() => retireStandard(s.id)}
                          >
                            {isRetiring ? "Retiring…" : "Retire"}
                          </Button>
                        ) : (
                          <span className="text-xs text-stone-500 self-center">—</span>
                        )}
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
