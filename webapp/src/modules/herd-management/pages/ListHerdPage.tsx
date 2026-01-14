import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/routes";
import { apiGet } from "@/lib/api";
import { auth } from "@/lib/firebase";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type HerdCounts = {
  male: number;
  female: number;
  baby: number;
};

type HerdListItem = {
  id: string;
  name: string;
  shortDescription: string | null;
  species: string | null;
  breed: string | null;

  maleDesc: string | null;
  femaleDesc: string | null;
  babyDesc: string | null;

  longDescription: string | null;

  // backend may or may not send this yet
  isSystem?: boolean;

  // placeholders until animals exist
  counts?: Partial<HerdCounts>;
};

async function deleteHerd(herdId: string) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(`http://localhost:3001/api/herds/${herdId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to delete herd");
  }
}

export default function ListHerdPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [herds, setHerds] = useState<HerdListItem[]>([]);

  const hasHerds = useMemo(() => herds.length > 0, [herds]);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // IMPORTANT: api.ts already has API_BASE = http://localhost:3001/api
      // so paths should look like "/herds", not "/api/herds"
      const data = await apiGet<HerdListItem[]>("/herds");
      setHerds(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const msg =
        typeof err?.message === "string" ? err.message : "Failed to load herds";
      setErrorMsg(msg);
      setHerds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEdit = (herdId: string) => {
    navigate(ROUTES.herd.create, { state: { herdId } });
  };

  const onDelete = async (herd: HerdListItem) => {
    const isTransfer =
      herd.isSystem === true || herd.name.trim().toLowerCase() === "transfer";
    if (isTransfer) return;

    const ok = window.confirm(
      `Delete herd "${herd.name}"?\n\nThis can only succeed if the herd has no current animals.`
    );
    if (!ok) return;

    try {
      setErrorMsg(null);
      await deleteHerd(herd.id);
      await load();
    } catch (err: any) {
      const msg =
        typeof err?.message === "string" ? err.message : "Failed to delete herd";
      setErrorMsg(msg);
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

        <Button onClick={() => navigate(ROUTES.herd.create)}>Create Herd</Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-stone-600">Loading herds…</div>
      ) : !hasHerds ? (
        <div className="rounded-xl border bg-white p-8">
          <div className="text-xl font-semibold">No herds found</div>
          <div className="text-stone-600 mt-1">
            Let’s add your first herd to get started.
          </div>
          <div className="mt-5">
            <Button onClick={() => navigate(ROUTES.herd.create)}>
              Create your first herd
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {herds.map((herd) => {
            const isTransfer =
              herd.isSystem === true ||
              herd.name.trim().toLowerCase() === "transfer";

            const maleLabel = herd.maleDesc || "Males";
            const femaleLabel = herd.femaleDesc || "Females";
            const babyLabel = herd.babyDesc || "Babies";

            return (
              <Card
                key={herd.id}
                // Optional change #1: subtle hover shadow
                className="relative group rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Kebab menu (always above overlay) */}
                <div className="absolute top-3 right-3 z-30">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white hover:bg-stone-50"
                        aria-label="Herd actions"
                      >
                        <MoreHorizontal className="h-5 w-5 text-stone-700" />
                      </button>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={8}
                        className="z-9999 min-w-40 rounded-md border bg-white p-1 shadow-md"
                      >
                        <DropdownMenu.Item
                          onSelect={() => onEdit(herd.id)}
                          className="cursor-pointer select-none rounded px-3 py-2 text-sm outline-none hover:bg-stone-100"
                        >
                          Edit
                        </DropdownMenu.Item>

                        {!isTransfer && (
                          <DropdownMenu.Item
                            onSelect={() => void onDelete(herd)}
                            className="cursor-pointer select-none rounded px-3 py-2 text-sm outline-none hover:bg-stone-100 text-red-700"
                          >
                            Delete
                          </DropdownMenu.Item>
                        )}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>

                {/* Card content */}
                <div className="space-y-3">
                  <div className="pr-12">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{herd.name}</h2>
                      {isTransfer && (
                        <span className="text-xs rounded-full border px-2 py-0.5 bg-stone-50 text-stone-700">
                          System
                        </span>
                      )}
                    </div>

                    {herd.shortDescription ? (
                      <div className="text-sm text-stone-600 mt-1">
                        {herd.shortDescription}
                      </div>
                    ) : (
                      <div className="text-sm text-stone-400 mt-1">
                        No short description
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-stone-700">
                    <span className="font-semibold">Animal Type:</span>{" "}
                    {[
                      herd.species || "Unknown species",
                      herd.breed || "Unknown breed",
                    ].join(" • ")}
                  </div>

                  {/* Placeholder counts until animals exist */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-semibold">
                        {herd.counts?.male ?? 0}
                      </div>
                      <div className="text-stone-500">{maleLabel}</div>
                    </div>

                    <div>
                      <div className="font-semibold">
                        {herd.counts?.female ?? 0}
                      </div>
                      <div className="text-stone-500">{femaleLabel}</div>
                    </div>

                    <div>
                      <div className="font-semibold">
                        {herd.counts?.baby ?? 0}
                      </div>
                      <div className="text-stone-500">{babyLabel}</div>
                    </div>
                  </div>
                </div>

                {/* Hover notes overlay (does NOT block kebab/menu) */}
                {herd.longDescription && (
                  <div
                    // Optional change #2: soft fade + blur
                    className="pointer-events-none absolute inset-0 rounded-xl bg-white/95 backdrop-blur-sm p-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    {/* leave space so the kebab area stays visually clear */}
                    <div className="pr-12 pointer-events-auto">
                      <div className="text-sm font-semibold">Notes</div>
                      <div className="text-sm text-stone-700 mt-2 whitespace-pre-wrap">
                        {herd.longDescription}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
