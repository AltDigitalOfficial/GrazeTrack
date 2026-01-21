import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiGet } from "@/lib/api";
import { useRanch } from "@/lib/ranchContext";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PurchaseDetail = {
  id: string;
  ranchId: string;
  standardMedicationId: string;
  supplierId: string | null;
  supplierName: string | null;
  purchaseDate: string;
  quantity: string;
  totalPrice: string | null;
  notes: string | null;
  createdAt: string;

  chemicalName: string;
  format: string;
  concentrationValue: string | null;
  concentrationUnit: string | null;
  manufacturerName: string;
  brandName: string;
};

type PurchaseImage = {
  id: string;
  purpose: "receipt" | "label" | "packaging" | "misc" | string;
  url: string;
  storedFilename: string;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

function bytesToNiceSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatMaybeMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return `$${n.toFixed(2)}`;
}

function buildMedicationTitle(p: PurchaseDetail): string {
  const conc = p.concentrationValue && p.concentrationUnit ? ` ${p.concentrationValue}${p.concentrationUnit}` : "";
  return `${p.brandName} — ${p.chemicalName}${conc} (${p.format})`;
}

function nicePurposeLabel(purpose: string): string {
  switch (purpose) {
    case "receipt":
      return "Receipt";
    case "label":
      return "Label";
    case "packaging":
      return "Packaging";
    case "misc":
      return "Misc";
    default:
      return "Photos";
  }
}

function ImageCarousel({
  title,
  images,
}: {
  title: string;
  images: PurchaseImage[];
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [images?.length]);

  if (!images || images.length === 0) {
    return <div className="text-sm text-muted-foreground">No photos.</div>;
  }

  const safeIdx = Math.min(Math.max(idx, 0), images.length - 1);
  const active = images[safeIdx];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {images.length} photo{images.length === 1 ? "" : "s"}
            {active?.sizeBytes ? ` • ${bytesToNiceSize(active.sizeBytes)}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIdx((p) => Math.max(p - 1, 0))}
            disabled={safeIdx <= 0}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIdx((p) => Math.min(p + 1, images.length - 1))}
            disabled={safeIdx >= images.length - 1}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}
          >
            Open
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="w-full aspect-video bg-stone-50 flex items-center justify-center">
          <img
            src={active.url}
            alt={active.originalFilename || `${title} photo`}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <div className="border-t p-2 overflow-x-auto">
          <div className="flex gap-2">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setIdx(i)}
                className={[
                  "h-14 w-14 rounded-md overflow-hidden border",
                  i === safeIdx ? "ring-2 ring-stone-400" : "hover:border-stone-400",
                ].join(" ")}
                title={img.originalFilename || img.storedFilename}
              >
                <img
                  src={img.url}
                  alt={img.originalFilename || "thumb"}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MedicationPurchaseDetailPage() {
  const navigate = useNavigate();
  const { purchaseId } = useParams();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [images, setImages] = useState<PurchaseImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);

  const canLoad = useMemo(
    () => !ranchLoading && !!activeRanchId && !!purchaseId,
    [ranchLoading, activeRanchId, purchaseId]
  );

  useEffect(() => {
    if (!canLoad) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<{ purchase: PurchaseDetail }>(
          `/medication-purchases/${encodeURIComponent(purchaseId!)}`
        );
        setPurchase(res.purchase);
      } catch (e: any) {
        setError(e?.message || "Failed to load purchase");
        setPurchase(null);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [canLoad, purchaseId]);

  useEffect(() => {
    if (!canLoad) return;

    const run = async () => {
      setLoadingImages(true);
      setImagesError(null);
      try {
        const res = await apiGet<{ images: PurchaseImage[] }>(
          `/medication-purchases/${encodeURIComponent(purchaseId!)}/images`
        );
        setImages(res.images ?? []);
      } catch (e: any) {
        setImagesError(e?.message || "Failed to load purchase images");
        setImages([]);
      } finally {
        setLoadingImages(false);
      }
    };

    run();
  }, [canLoad, purchaseId]);

  const grouped = useMemo(() => {
    const g: Record<string, PurchaseImage[]> = {};
    for (const img of images) {
      const key = img.purpose || "misc";
      if (!g[key]) g[key] = [];
      g[key].push(img);
    }
    return g;
  }, [images]);

  const headerTitle = purchase ? buildMedicationTitle(purchase) : "Medication Purchase";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">{headerTitle}</h1>
          <p className="text-sm text-stone-600 mt-1">
            Read-only purchase record
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>
      </header>

      {!ranchLoading && !activeRanchId && (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to view this purchase.</div>
        </Card>
      )}

      {error && (
        <Card title="Error">
          <div className="text-sm text-red-600">{error}</div>
        </Card>
      )}

      {loading && !purchase && (
        <Card title="Loading">
          <div className="text-sm text-stone-500">Loading purchase…</div>
        </Card>
      )}

      {purchase && (
        <Card title="Purchase Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-stone-500">Purchase date</div>
              <div className="text-sm text-stone-800 font-medium">{purchase.purchaseDate}</div>
            </div>

            <div>
              <div className="text-xs text-stone-500">Supplier</div>
              <div className="text-sm text-stone-800 font-medium">{purchase.supplierName ?? "—"}</div>
            </div>

            <div>
              <div className="text-xs text-stone-500">Quantity</div>
              <div className="text-sm text-stone-800 font-medium">{purchase.quantity}</div>
            </div>

            <div>
              <div className="text-xs text-stone-500">Total price</div>
              <div className="text-sm text-stone-800 font-medium">{formatMaybeMoney(purchase.totalPrice)}</div>
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-stone-500">Notes</div>
              <div className="text-sm text-stone-800">{purchase.notes?.trim() ? purchase.notes : "—"}</div>
            </div>
          </div>
        </Card>
      )}

      <Card title="Purchase Photos">
        <div className="space-y-6">
          {loadingImages && <div className="text-sm text-stone-500">Loading photos…</div>}
          {imagesError && <div className="text-sm text-red-600">{imagesError}</div>}

          {!loadingImages && !imagesError && images.length === 0 && (
            <div className="text-sm text-muted-foreground">No photos saved for this purchase.</div>
          )}

          {!loadingImages && !imagesError && images.length > 0 && (
            <div className="space-y-8">
              {(["receipt", "label", "packaging", "misc"] as const).map((purpose) => (
                <div key={purpose} className="space-y-3">
                  <div className="font-medium text-stone-800">{nicePurposeLabel(purpose)}</div>
                  <ImageCarousel title={`${nicePurposeLabel(purpose)} photos`} images={grouped[purpose] ?? []} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
