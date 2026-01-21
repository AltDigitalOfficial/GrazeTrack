import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { apiGet } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";
import { ROUTES } from "@/routes";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PurchaseRow = {
  id: string;
  standardMedicationId: string;
  supplierId: string | null;
  supplierName: string | null;
  purchaseDate: string;
  quantity: string;
  totalPrice: string | null;
  notes: string | null;
  createdAt: string;
};

function formatMaybeMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return `$${n.toFixed(2)}`;
}

export default function MedicationHistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { standardMedicationId } = useParams();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const medicationDisplayName = (location.state as any)?.medicationDisplayName as string | undefined;

  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canInteract = useMemo(
    () => !ranchLoading && !!activeRanchId && !!standardMedicationId,
    [ranchLoading, activeRanchId, standardMedicationId]
  );

  useEffect(() => {
    if (!activeRanchId || !standardMedicationId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<{ purchases: PurchaseRow[] }>(
          `/medication-purchases?standardMedicationId=${encodeURIComponent(standardMedicationId)}`
        );
        setPurchases(res.purchases ?? []);
      } catch (e: any) {
        setError(e?.message || "Failed to load medication history");
        setPurchases([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [activeRanchId, standardMedicationId]);

  const title = medicationDisplayName ? `History — ${medicationDisplayName}` : "Medication History";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">{title}</h1>
          <p className="text-sm text-stone-600 mt-1">
            Purchases are append-only. (Later we’ll show use/treatment events here too.)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button onClick={() => navigate(ROUTES.supplies.medicationsPurchasesCreate)} disabled={!canInteract}>
            Record Purchase
          </Button>
        </div>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to view medication history.</div>
        </Card>
      )}

      <Card title="Purchase History">
        <div className="space-y-3">
          {error && <div className="text-sm text-red-600">Error: {error}</div>}

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-50">
              <div className="col-span-3">Date</div>
              <div className="col-span-3">Supplier</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-2">Total</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            {loading ? (
              <div className="px-3 py-10 text-sm text-stone-500 text-center">Loading…</div>
            ) : purchases.length === 0 ? (
              <div className="px-3 py-10 text-sm text-stone-500 text-center">
                No purchases yet for this medication.
              </div>
            ) : (
              <div className="divide-y">
                {purchases.map((p) => (
                  <div key={p.id} className="grid grid-cols-12 gap-2 px-3 py-3 text-sm items-center">
                    <div className="col-span-3 text-stone-800">{p.purchaseDate}</div>
                    <div className="col-span-3 text-stone-700">{p.supplierName ?? "—"}</div>
                    <div className="col-span-2 text-stone-700">{p.quantity}</div>
                    <div className="col-span-2 text-stone-700">{formatMaybeMoney(p.totalPrice)}</div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/supplies/medications/purchases/${encodeURIComponent(p.id)}`)}
                      >
                        View
                      </Button>
                    </div>

                    {p.notes && (
                      <div className="col-span-12 text-xs text-stone-500 -mt-1">
                        Notes: {p.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-stone-500">
            Next: this page will also include “use/treatment” events once we add those tables/routes.
          </div>
        </div>
      </Card>
    </div>
  );
}
