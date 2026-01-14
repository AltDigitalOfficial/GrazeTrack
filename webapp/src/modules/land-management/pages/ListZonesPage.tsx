import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiGet, apiDelete } from "@/lib/api";
import { ROUTES } from "@/routes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";

type ZoneListItem = {
  id: string;
  name: string;
  description: string | null;
  areaAcres: string | null;
  createdAt: string;
};

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

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const hasZones = zones.length > 0;

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => a.name.localeCompare(b.name));
  }, [zones]);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const data = await apiGet<ZoneListItem[]>("/zones");
      setZones(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load zones");
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
      if (!res.success) {
        throw new Error("Failed to delete zone");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to delete zone");
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
            Define and manage your pasture boundaries for grazing planning and tracking.
          </p>
        </div>

        <Button onClick={() => navigate(ROUTES.land.zonesCreate)}>
          Create Zone
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-stone-600">Loading zones…</div>
      ) : !hasZones ? (
        <div className="rounded-xl border bg-white p-8">
          <div className="text-xl font-semibold">No zones found</div>
          <div className="text-stone-600 mt-1">
            Define your first grazing zone to get started with land management.
          </div>
          <Button className="mt-4" onClick={() => navigate(ROUTES.land.zonesCreate)}>
            Create your first zone
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedZones.map((zone) => {
            const showNotes = hoveredId === zone.id && (zone.description?.trim()?.length ?? 0) > 0;

            return (
              <div
                key={zone.id}
                className="relative rounded-xl border bg-white p-5 shadow-sm"
                onMouseEnter={() => setHoveredId(zone.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold truncate">{zone.name}</h3>
                    <div className="text-sm text-stone-600 mt-1">
                      {formatArea(zone.areaAcres)}
                    </div>
                  </div>

                  {/* Ellipsis menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white hover:bg-stone-50"
                        aria-label="Zone actions"
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(zone.id)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(zone)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Details */}
                <div className="mt-4 text-sm">
                  <div className="text-stone-700">
                    <span className="font-medium">Created:</span>{" "}
                    {new Date(zone.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Hover notes overlay */}
                {showNotes && (
                  <div className="absolute inset-0 rounded-xl bg-white/95 p-5 pointer-events-none">
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