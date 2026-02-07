// webapp/src/modules/herd-management/pages/AnimalInventoryListPage.tsx
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiGet } from "@/lib/api";
import { ROUTES } from "@/routes";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type AnimalRow = {
  animalId: string;
  species: string | null;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  birthDateIsEstimated: boolean;
  tagNumber: string | null;
  tagColor: string | null;
  tagEar: string | null;
  status: string | null;
  neutered: boolean;
  neuteredDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  herdId: string;
  herdName: string;
};

type AnimalsResponse = {
  ranchId: string;
  herdId: string | null;
  animals: AnimalRow[];
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function formatTag(a: AnimalRow) {
  if (!a.tagNumber) return "—";
  return a.tagColor ? `${a.tagNumber} (${a.tagColor})` : a.tagNumber;
}

function TagPill({ tagNumber, tagColor }: { tagNumber: string | null; tagColor: string | null }) {
  if (!tagNumber) return <span className="text-muted-foreground">—</span>;

  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  
  return <span className={`${base} bg-${tagColor}-100 text-${tagColor}-800`}>{tagNumber}</span>;
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;

  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

  switch (status) {
    case "active":
      return <span className={`${base} bg-green-100 text-green-800`}>Active</span>;
    case "sold":
      return <span className={`${base} bg-blue-100 text-blue-800`}>Sold</span>;
    case "deceased":
      return <span className={`${base} bg-red-100 text-red-800`}>Deceased</span>;
    case "transferred":
      return <span className={`${base} bg-yellow-100 text-yellow-800`}>Transferred</span>;
    default:
      return <span className={`${base} bg-gray-100 text-gray-800`}>{status}</span>;
  }
}

type SelectedDam = {
  animalId: string;
  display: string;
  species: string;
};

function makeDamDisplay(a: AnimalRow) {
  // Keep it simple & consistent: Tag + optional nickname later.
  const tag = a.tagNumber ? a.tagNumber : "No tag";
  const breed = a.breed ? ` • ${a.breed}` : "";
  const herd = a.herdName ? ` • ${a.herdName}` : a.herdId ? ` • ${a.herdId}` : "";
  return `${tag}${breed}${herd}`;
}

export default function AnimalInventoryListPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<AnimalRow[]>([]);

  // Filters
  const [searchTag, setSearchTag] = React.useState("");
  const [speciesFilter, setSpeciesFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Birth modal state
  const [birthModalOpen, setBirthModalOpen] = React.useState(false);
  const [birthSaving, setBirthSaving] = React.useState(false);

  const [birthJustGaveBirth, setBirthJustGaveBirth] = React.useState(true);
  const [birthDate, setBirthDate] = React.useState<string>("");
  const [birthTotalBabies, setBirthTotalBabies] = React.useState<number>(1);

  const [birthLockedSpecies, setBirthLockedSpecies] = React.useState<string | null>(null);
  const [birthSelectedDamIds, setBirthSelectedDamIds] = React.useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);

    try {
      // ✅ Correct API route (apiGet prefixes "/api")
      const res = await apiGet<AnimalsResponse>("/animals");
      setRows(res.animals ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load animals");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speciesOptions = React.useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.species).filter(Boolean) as string[])).sort();
  }, [rows]);

  const statusOptions = React.useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.status).filter(Boolean) as string[])).sort();
  }, [rows]);

  const filtered = React.useMemo(() => {
    const q = normalize(searchTag);
    return rows.filter((r) => {
      if (speciesFilter !== "all" && r.species !== speciesFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q.length > 0 && !normalize(r.tagNumber ?? "").includes(q)) return false;
      return true;
    });
  }, [rows, searchTag, speciesFilter, statusFilter]);

  const eligibleDams = React.useMemo(() => {
    // MVP: female + not neutered. (Later: alive only via death_date, stillborn, etc.)
    return rows.filter((r) => {
      if (r.sex !== "female") return false;
      if (r.neutered) return false;
      if (!r.species) return false;
      // optionally only "active" — leaving open for now
      return true;
    });
  }, [rows]);

  const eligibleDamsSorted = React.useMemo(() => {
    const list = [...eligibleDams];
    list.sort((a, b) => {
      const sa = (a.species ?? "").localeCompare(b.species ?? "");
      if (sa !== 0) return sa;
      const ta = (a.tagNumber ?? "").localeCompare(b.tagNumber ?? "");
      if (ta !== 0) return ta;
      return a.animalId.localeCompare(b.animalId);
    });
    return list;
  }, [eligibleDams]);

  const birthSelectedDams: SelectedDam[] = React.useMemo(() => {
    const out: SelectedDam[] = [];
    for (const r of eligibleDamsSorted) {
      if (birthSelectedDamIds.has(r.animalId)) {
        out.push({
          animalId: r.animalId,
          display: makeDamDisplay(r),
          species: r.species ?? "",
        });
      }
    }
    return out;
  }, [eligibleDamsSorted, birthSelectedDamIds]);

  function openBirthModal() {
    // Reset modal each time for now (keeps behavior predictable).
    setBirthModalOpen(true);
    setBirthSaving(false);
    setBirthJustGaveBirth(true);
    setBirthDate("");
    setBirthTotalBabies(1);
    setBirthLockedSpecies(null);
    setBirthSelectedDamIds(new Set());
  }

  function toggleDamSelection(r: AnimalRow) {
    if (!r.species) return;

    setBirthSelectedDamIds((prev) => {
      const next = new Set(prev);

      const currentlySelected = next.has(r.animalId);

      if (currentlySelected) {
        next.delete(r.animalId);
      } else {
        // If no species locked yet, lock it to this dam's species
        if (!birthLockedSpecies) {
          setBirthLockedSpecies(r.species);
        }
        next.add(r.animalId);
      }

      // If we removed the last selected dam, unlock species.
      if (next.size === 0) {
        setBirthLockedSpecies(null);
      } else {
        // Ensure locked species remains consistent with the remaining selection
        // (defensive: if user somehow had mixed species selected, keep the first one we find)
        const remaining = eligibleDamsSorted.find((x) => next.has(x.animalId));
        if (remaining?.species) {
          setBirthLockedSpecies(remaining.species);
        }
      }

      return next;
    });
  }

  const birthFormError = React.useMemo(() => {
    if (birthSelectedDamIds.size === 0) return "Select at least one dam.";
    if (!birthLockedSpecies) return "Species must be locked by selecting a dam.";
    if (!birthJustGaveBirth) return 'Check "Just gave birth" to record a birth event.';
    if (!birthDate) return "Choose the date the dam(s) gave birth.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return "Birth date must be a valid date.";
    if (birthTotalBabies < 1 || birthTotalBabies > 100) return "Total babies must be between 1 and 100.";
    return null;
  }, [birthSelectedDamIds, birthLockedSpecies, birthJustGaveBirth, birthDate, birthTotalBabies]);

  function onConfirmBirthModal() {
    if (birthFormError) return;

    setBirthSaving(true);

    // UI-only increment: navigate to batch page with state.
    navigate(ROUTES.herd.animalIntakeBirthBatch, {
      state: {
        species: birthLockedSpecies,
        gaveBirthDate: birthDate,
        totalBabies: birthTotalBabies,
        selectedDamIds: Array.from(birthSelectedDamIds),
        selectedDamsPreview: birthSelectedDams, // helpful display; backend will only need IDs
      },
    });

    // Close modal right away so it feels snappy.
    setBirthModalOpen(false);
    setBirthSaving(false);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Animal Inventory</h1>
          <p className="text-sm text-muted-foreground">Read-only for now. Intake and editing coming soon.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            Refresh
          </Button>

          <Button variant="secondary" aria-label="Start birth intake" onClick={openBirthModal}>
            Birth
          </Button>

          <Button asChild variant="secondary" aria-label="Start purchase intake">
            <Link to="/herd/animals/intake/purchase">Purchase</Link>
          </Button>

          <Button asChild variant="secondary" aria-label="Start existing animal intake">
            <Link to="/herd/animals/intake/existing">Existing Animal</Link>
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm font-medium">Search tag</div>
            <Input
              value={searchTag}
              onChange={(e) => setSearchTag(e.target.value)}
              placeholder="e.g. 304"
              aria-label="Search tag number"
            />
          </div>

          <div>
            <div className="text-sm font-medium">Species</div>
            <select
              className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
              aria-label="Species"
            >
              <option value="all">All</option>
              {speciesOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-sm font-medium">Status</div>
            <select
              className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Status"
            >
              <option value="all">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {error ? <div className="col-span-full text-sm text-red-600">{error}</div> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Animals <span className="text-muted-foreground font-normal">({filtered.length})</span>
          </CardTitle>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
        </CardHeader>

        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="py-2 text-left">Tag</th>
                <th className="py-2 text-left">Species</th>
                <th className="py-2 text-left">Breed</th>
                <th className="py-2 text-left">Sex</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Herd</th>
                <th className="py-2 text-left">Neutered</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.animalId} className="border-b last:border-b-0">
                  <td className="py-2 font-medium">
                    <TagPill tagNumber={a.tagNumber} tagColor={a.tagColor} />
                  </td>
                  <td className="py-2">{a.species ?? "—"}</td>
                  <td className="py-2">{a.breed ?? "—"}</td>
                  <td className="py-2">{a.sex ?? "—"}</td>
                  <td className="py-2">
                    <StatusPill status={a.status} />
                  </td>
                  <td className="py-2">{a.herdName ?? a.herdId}</td>
                  <td className="py-2">
                    {a.neutered ? (
                      <span className="text-green-700">Yes{a.neuteredDate ? ` (${a.neuteredDate})` : ""}</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/herd/animals/${a.animalId}`}>View</Link>
                    </Button>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No animals found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Birth modal */}
      <Dialog open={birthModalOpen} onOpenChange={setBirthModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Record Births</DialogTitle>
            <DialogDescription>
              Select one species at a time. Choose the dam(s), the date they gave birth, and how many babies you observed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Birth event</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Just gave birth</div>
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      checked={birthJustGaveBirth}
                      onCheckedChange={(v) => setBirthJustGaveBirth(Boolean(v))}
                      aria-label="Just gave birth"
                    />
                    <span className="text-sm text-muted-foreground">
                      When checked, we’ll record a productivity row for each selected dam.
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Gave birth date</div>
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    aria-label="Gave birth date"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Total babies</div>
                  <select
                    className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                    value={birthTotalBabies}
                    onChange={(e) => setBirthTotalBabies(Number(e.target.value))}
                    aria-label="Total babies"
                  >
                    {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <div className="text-sm text-muted-foreground">
                    Selected species:{" "}
                    <span className="font-medium text-foreground">{birthLockedSpecies ?? "— (select a dam to lock)"}</span>
                    {birthLockedSpecies ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Clear all dams to change species)
                      </span>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Select dams{" "}
                  <span className="text-muted-foreground font-normal">
                    (female • not neutered • species locked)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {birthSelectedDamIds.size} selected
                </div>

                <div className="max-h-[360px] overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3 text-left w-[60px]">Pick</th>
                        <th className="py-2 px-3 text-left">Dam</th>
                        <th className="py-2 px-3 text-left w-[160px]">Species</th>
                        <th className="py-2 px-3 text-left w-[120px]">Neutered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleDamsSorted.map((r) => {
                        const locked = birthLockedSpecies;
                        const isSelected = birthSelectedDamIds.has(r.animalId);
                        const isOtherSpecies =
                          locked && r.species && r.species !== locked && !isSelected;

                        return (
                          <tr
                            key={r.animalId}
                            className={`border-b last:border-b-0 ${isOtherSpecies ? "opacity-50" : ""}`}
                          >
                            <td className="py-2 px-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleDamSelection(r)}
                                disabled={Boolean(isOtherSpecies)}
                                aria-label={`Select dam ${r.tagNumber ?? r.animalId}`}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-medium">{r.tagNumber ?? "No tag"}</div>
                              <div className="text-xs text-muted-foreground">{makeDamDisplay(r)}</div>
                            </td>
                            <td className="py-2 px-3">{r.species ?? "—"}</td>
                            <td className="py-2 px-3">{r.neutered ? "Yes" : "No"}</td>
                          </tr>
                        );
                      })}

                      {eligibleDamsSorted.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-muted-foreground">
                            No eligible dams found (female + not neutered).
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {birthSelectedDams.length > 0 ? (
                  <div className="rounded-md bg-muted p-3">
                    <div className="text-sm font-medium">Selected dams</div>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      {birthSelectedDams.map((d) => (
                        <li key={d.animalId}>
                          <span className="text-foreground">{d.display}</span>{" "}
                          <span className="text-muted-foreground">({d.species})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {birthFormError ? <div className="text-sm text-red-600">{birthFormError}</div> : null}
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBirthModalOpen(false)} disabled={birthSaving}>
              Cancel
            </Button>
            <Button onClick={onConfirmBirthModal} disabled={Boolean(birthFormError) || birthSaving}>
              {birthSaving ? "Continuing…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
