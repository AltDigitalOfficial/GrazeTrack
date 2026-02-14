import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiGet, apiDelete } from "@/lib/api";
import { ROUTES } from "@/routes";
import { ZonesListResponseSchema, type ZoneListItem } from "@/lib/contracts/zones";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

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
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white hover:bg-stone-50"
                        aria-label="Zone actions"
                      >
                        <EllipsisVertical className="h-4 w-4 text-stone-700" />
                      </button>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={8}
                        // Key changes: explicit text color + high z-index + consistent padding/border/bg/shadow
                        className="z-9999 min-w-36 rounded-md border bg-white p-1 text-sm text-stone-900 shadow-md"
                      >
                        <DropdownMenu.Item
                          onSelect={() => onEdit(zone.id)}
                          // Key changes: use Radix highlighted state (not only :hover)
                          className="cursor-pointer select-none rounded px-3 py-2 outline-none text-stone-900 data-highlighted:bg-stone-100 data-highlighted:text-stone-900"
                        >
                          Edit
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                          onSelect={() => onDelete(zone)}
                          className="cursor-pointer select-none rounded px-3 py-2 outline-none text-red-700 data-highlighted:bg-stone-100 data-highlighted:text-red-700"
                        >
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
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
