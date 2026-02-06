import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/routes";
import { apiDelete, apiGet } from "@/lib/api";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type HerdCounts = {
  male: number;
  male_neut: number;
  female: number;
  female_neut: number;
  baby: number;
};

type HerdListItem = {
  id: string;
  name: string;
  shortDescription: string | null;
  species: string | null;
  breed: string | null;
  longDescription: string | null;

  // backend may or may not send this yet
  isSystem?: boolean;

  counts?: Partial<HerdCounts>;
};

type RanchSettingsDTO = {
  species?: Array<{
    species: string;
    male_desc?: string | null;
    female_desc?: string | null;
    male_neut_desc?: string | null;
    female_neut_desc?: string | null;
    baby_desc?: string | null;
  }>;
};

type SpeciesTerms = {
  male_desc?: string;
  female_desc?: string;
  male_neut_desc?: string;
  female_neut_desc?: string;
  baby_desc?: string;
};

const MIXED_VALUE = "Mixed";

function isEmptyCounts(counts?: Partial<HerdCounts>) {
  const male = counts?.male ?? 0;
  const maleNeut = counts?.male_neut ?? 0;
  const female = counts?.female ?? 0;
  const femaleNeut = counts?.female_neut ?? 0;
  const baby = counts?.baby ?? 0;

  return male === 0 && maleNeut === 0 && female === 0 && femaleNeut === 0 && baby === 0;
}

export default function ListHerdPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [herds, setHerds] = useState<HerdListItem[]>([]);
  const [loadingRanchSettings, setLoadingRanchSettings] = useState(true);
  const [ranchTermsBySpecies, setRanchTermsBySpecies] = useState<Record<string, SpeciesTerms>>({});

  const loadHerds = async () => {
    const data = await apiGet<HerdListItem[]>("/herds");
    setHerds(Array.isArray(data) ? data : []);
  };

  const loadRanchSettings = async () => {
    setLoadingRanchSettings(true);
    try {
      const rs = await apiGet<RanchSettingsDTO>("/ranch-settings");

      const map: Record<string, SpeciesTerms> = {};
      const list = Array.isArray(rs?.species) ? rs.species : [];

      for (const s of list) {
        const key = (s?.species ?? "").trim();
        if (!key) continue;

        map[key] = {
          male_desc: (s.male_desc ?? "").trim() || undefined,
          female_desc: (s.female_desc ?? "").trim() || undefined,
          male_neut_desc: (s.male_neut_desc ?? "").trim() || undefined,
          female_neut_desc: (s.female_neut_desc ?? "").trim() || undefined,
          baby_desc: (s.baby_desc ?? "").trim() || undefined,
        };
      }

      setRanchTermsBySpecies(map);
    } catch {
      // Non-blocking: we can still show generic labels
      setRanchTermsBySpecies({});
    } finally {
      setLoadingRanchSettings(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      await Promise.all([loadHerds(), loadRanchSettings()]);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load herds");
      setHerds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const genericLabels = useMemo(() => {
    return {
      male: "Males",
      male_neut: "Neutered males",
      female: "Females",
      female_neut: "Neutered females",
      baby: "Babies",
    };
  }, []);

  const handleDelete = async (herd: HerdListItem) => {
    const empty = isEmptyCounts(herd.counts);
    if (!empty) return;

    const ok = window.confirm(
      `Delete herd "${herd.name}"?\n\nThis can’t be undone.`
    );
    if (!ok) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      await apiDelete<{ success: true }>(`/herds/${herd.id}`);
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to delete herd");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Herds</h1>
          <p className="text-sm text-stone-600">
            Create herds to group animals by type, pasture history, or workflow.
          </p>
        </div>

        <Button onClick={() => navigate(ROUTES.herd.create)} disabled={loading}>
          Create Herd
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {herds.map((herd) => {
          const isTransfer =
            herd.isSystem === true || herd.name.trim().toLowerCase() === "transfer";

          const speciesValue = (herd.species ?? "").trim();
          const isMixedSpecies = speciesValue === MIXED_VALUE || speciesValue.length === 0;

          const terms = !isMixedSpecies ? ranchTermsBySpecies[speciesValue] : undefined;

          const maleLabel = terms?.male_desc || genericLabels.male;
          const maleNeutLabel = terms?.male_neut_desc || genericLabels.male_neut;
          const femaleLabel = terms?.female_desc || genericLabels.female;
          const femaleNeutLabel = terms?.female_neut_desc || genericLabels.female_neut;
          const babyLabel = terms?.baby_desc || genericLabels.baby;

          const canDelete = !isTransfer && isEmptyCounts(herd.counts);

          return (
            <Card key={herd.id} className="rounded-xl border bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{herd.name}</h2>
                  {herd.shortDescription ? (
                    <p className="text-sm text-stone-600">{herd.shortDescription}</p>
                  ) : null}
                </div>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white hover:bg-stone-50"
                      aria-label="Open herd menu"
                      disabled={loading}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Content
                    align="end"
                    className="z-50 min-w-45 rounded-md border bg-white p-1 shadow-md"
                  >
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none hover:bg-stone-100"
                      onSelect={() => navigate(ROUTES.herd.edit, { state: { herdId: herd.id } })}
                    >
                      Edit herd
                    </DropdownMenu.Item>

                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none hover:bg-stone-100"
                      onSelect={() =>
                        navigate(ROUTES.herd.animals, { state: { herdId: herd.id } })
                      }
                    >
                      View animals
                    </DropdownMenu.Item>

                    {isTransfer ? (
                      <DropdownMenu.Item
                        className="cursor-not-allowed rounded px-2 py-1.5 text-sm text-stone-400 outline-none"
                        disabled
                      >
                        Transfer herd (system)
                      </DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item
                        className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none hover:bg-stone-100"
                        onSelect={() => {
                          // placeholder: transfer action can be wired later
                        }}
                      >
                        Transfer herd
                      </DropdownMenu.Item>
                    )}

                    <DropdownMenu.Separator className="my-1 h-px bg-stone-200" />

                    {canDelete ? (
                      <DropdownMenu.Item
                        className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none text-red-700 hover:bg-red-50"
                        onSelect={() => void handleDelete(herd)}
                      >
                        Delete herd
                      </DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item
                        className="cursor-not-allowed rounded px-2 py-1.5 text-sm text-stone-400 outline-none"
                        disabled
                      >
                        Delete herd (empty only)
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>

              <div className="mt-4 space-y-3">
                <div className="text-sm text-stone-500">
                  {herd.species ? `${herd.species}${herd.breed ? ` • ${herd.breed}` : ""}` : "—"}
                </div>

                <div className="grid grid-cols-5 gap-4 text-sm">
                  <div>
                    <div className="font-semibold">{herd.counts?.male ?? 0}</div>
                    <div className="text-stone-500">{maleLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">{herd.counts?.male_neut ?? 0}</div>
                    <div className="text-stone-500">{maleNeutLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">{herd.counts?.female ?? 0}</div>
                    <div className="text-stone-500">{femaleLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">{herd.counts?.female_neut ?? 0}</div>
                    <div className="text-stone-500">{femaleNeutLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">{herd.counts?.baby ?? 0}</div>
                    <div className="text-stone-500">{babyLabel}</div>
                  </div>
                </div>

                {loadingRanchSettings && !isMixedSpecies ? (
                  <div className="text-xs text-muted-foreground">Loading ranch vocabulary…</div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
