import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alert-banner";
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from "@/components/ui/action-menu";
import { apiGet, apiDelete } from "@/lib/api";
import { ROUTES } from "@/routes";
import { ZonesListResponseSchema, type ZoneListItem } from "@/lib/contracts/zones";

function formatArea(areaAcres: string | null): string {
  if (!areaAcres) return "—";
  const acres = parseFloat(areaAcres);
  return `${acres.toFixed(2)} acres`;
}

export default function ListZonesPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<ZoneListItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasZones = zones.length > 0;

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => a.name.localeCompare(b.name));
  }, [zones]);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const dataRaw = await apiGet("/zones");
      const data = ZonesListResponseSchema.parse(dataRaw);
      setZones(data);
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.trim() ? err.message : "Failed to load zones";
      setErrorMsg(msg);
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (id: string) => {
    navigate(`/land/zones/edit/${id}`);
  };

  const onDelete = async (zone: ZoneListItem) => {
    if (!confirm(`Delete zone "${zone.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res: { success: boolean } = await apiDelete(`/zones/${zone.id}`);
      if (!res.success) throw new Error("Failed to delete zone");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.trim() ? err.message : "Failed to delete zone";
      alert(msg);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Grazing Zones</h1>
          <p className="text-stone-600 text-sm">
            Define and manage your pasture boundaries for grazing planning and
            tracking.
          </p>
        </div>

        <Button onClick={() => navigate(ROUTES.land.zonesCreate)}>
          Create Zone
        </Button>
      </div>

      {errorMsg && <AlertBanner variant="error">{errorMsg}</AlertBanner>}

      {loading ? (
        <div className="text-stone-600">Loading zones…</div>
      ) : !hasZones ? (
        <div className="rounded-xl border bg-white p-8">
          <div className="text-xl font-semibold">No zones found</div>
          <div className="text-stone-600 mt-1">
            Define your first grazing zone to get started with land management.
          </div>
          <Button
            className="mt-4"
            onClick={() => navigate(ROUTES.land.zonesCreate)}
          >
            Create your first zone
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedZones.map((zone) => {
            const hasDescription = (zone.description?.trim()?.length ?? 0) > 0;

            return (
              <div
                key={zone.id}
                className="relative group rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Kebab menu */}
                <div className="absolute top-3 right-3 z-30">
                  <ActionMenu>
                    <ActionMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white hover:bg-stone-50"
                        aria-label="Zone actions"
                      >
                        <EllipsisVertical className="h-4 w-4 text-stone-700" />
                      </button>
                    </ActionMenuTrigger>
                    <ActionMenuContent className="z-[9999] min-w-36">
                      <ActionMenuItem onSelect={() => onEdit(zone.id)}>Edit</ActionMenuItem>
                      <ActionMenuItem variant="destructive" onSelect={() => onDelete(zone)}>
                        Delete
                      </ActionMenuItem>
                    </ActionMenuContent>
                  </ActionMenu>
                </div>

                {/* Card content */}
                <div className="space-y-3 pr-12">
                  <div>
                    <h3 className="text-lg font-semibold truncate">
                      {zone.name}
                    </h3>
                    <div className="text-sm text-stone-600 mt-1">
                      {formatArea(zone.areaAcres)}
                    </div>
                  </div>

                  <div className="text-sm text-stone-700">
                    <span className="font-medium">Created:</span>{" "}
                    {new Date(zone.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Hover description overlay */}
                {hasDescription && (
                  <div className="pointer-events-none absolute inset-0 rounded-xl bg-white/95 backdrop-blur-sm p-5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <div className="pr-12 pointer-events-auto">
                      <div className="text-sm font-semibold">Description</div>
                      <div className="text-sm text-stone-700 mt-2 whitespace-pre-wrap">
                        {zone.description}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
