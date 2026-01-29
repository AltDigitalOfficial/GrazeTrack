import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/routes";
import { apiGet } from "@/lib/api";

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

  maleDesc: string | null;
  male_neut_desc?: string | null;
  femaleDesc: string | null;
  female_neut_desc?: string | null;
  babyDesc: string | null;

  longDescription: string | null;

  // backend may or may not send this yet
  isSystem?: boolean;

  counts?: Partial<HerdCounts>;
};

export default function ListHerdPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [herds, setHerds] = useState<HerdListItem[]>([]);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiGet<HerdListItem[]>("/herds");
      setHerds(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load herds");
      setHerds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Herds</h1>
          <p className="text-sm text-stone-600">
            Create herds to group animals by type, pasture history, or workflow.
          </p>
        </div>

        <Button onClick={() => navigate(ROUTES.herd.create)}>Create Herd</Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {herds.map((herd) => {
          const isTransfer =
            herd.isSystem === true ||
            herd.name.trim().toLowerCase() === "transfer";

          const maleLabel = herd.maleDesc || "Males";
          const maleNeutLabel = herd.male_neut_desc || "Neutered males";
          const femaleLabel = herd.femaleDesc || "Females";
          const femaleNeutLabel = herd.female_neut_desc || "Neutered females";
          const babyLabel = herd.babyDesc || "Babies";

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
                      onSelect={() => navigate(ROUTES.herd.animals, { state: { herdId: herd.id } })}
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
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>

              <div className="mt-4 space-y-3">
                <div className="text-sm text-stone-500">
                  {herd.species ? `${herd.species}${herd.breed ? ` • ${herd.breed}` : ""}` : "—"}
                </div>

                {/* counts may not exist until animals exist */}
                <div className="grid grid-cols-5 gap-4 text-sm">
                  <div>
                    <div className="font-semibold">
                      {herd.counts?.male ?? 0}
                    </div>
                    <div className="text-stone-500">{maleLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">
                      {herd.counts?.male_neut ?? 0}
                    </div>
                    <div className="text-stone-500">{maleNeutLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">
                      {herd.counts?.female ?? 0}
                    </div>
                    <div className="text-stone-500">{femaleLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">
                      {herd.counts?.female_neut ?? 0}
                    </div>
                    <div className="text-stone-500">{femaleNeutLabel}</div>
                  </div>

                  <div>
                    <div className="font-semibold">
                      {herd.counts?.baby ?? 0}
                    </div>
                    <div className="text-stone-500">{babyLabel}</div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
