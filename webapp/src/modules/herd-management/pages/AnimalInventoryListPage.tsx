// webapp/src/modules/herd-management/pages/AnimalInventoryListPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";

import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export default function AnimalInventoryListPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<AnimalRow[]>([]);

  // Filters
  const [searchTag, setSearchTag] = React.useState("");
  const [speciesFilter, setSpeciesFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

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

          <Button asChild variant="secondary" aria-label="Start birth intake">
            <Link to="/herd/animals/intake/birth">Birth</Link>
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
                  <td className="py-2 font-medium">{formatTag(a)}</td>
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
    </div>
  );
}
