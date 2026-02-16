import { useEffect, useMemo, useState } from "react";

import { AlertBanner } from "@/components/ui/alert-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { PageShell } from "@/components/ui/page-shell";

type ZoneRow = {
  id: string;
  name: string;
};

type HerdRow = {
  id: string;
  name: string;
};

type SubzoneRow = {
  id: string;
  name: string;
  status: string;
};

type GrazingSessionRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  headCount: number | null;
  herdId: string | null;
  subzoneId: string | null;
};

type RecommendationRow = {
  id: string;
  recommendationDate: string;
  recommendationType: string;
  priority: string;
  title: string;
  rationale: string;
  status: "open" | "accepted" | "dismissed" | "completed";
  actionByDate: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrUndefined(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export default function GrazingPlansPage() {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [herds, setHerds] = useState<HerdRow[]>([]);
  const [subzones, setSubzones] = useState<SubzoneRow[]>([]);
  const [sessions, setSessions] = useState<GrazingSessionRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [zoneId, setZoneId] = useState("");
  const [subzoneId, setSubzoneId] = useState("");

  const [newSubzoneName, setNewSubzoneName] = useState("");
  const [newSubzoneDesc, setNewSubzoneDesc] = useState("");
  const [newSubzoneRestDays, setNewSubzoneRestDays] = useState("");

  const [sessionHerdId, setSessionHerdId] = useState("");
  const [sessionHeadCount, setSessionHeadCount] = useState("");
  const [sessionDensity, setSessionDensity] = useState("");
  const [sessionStartedAt, setSessionStartedAt] = useState(`${todayIsoDate()}T08:00`);
  const [sessionEndedAt, setSessionEndedAt] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");

  const [recDate, setRecDate] = useState(todayIsoDate());
  const [recPersist, setRecPersist] = useState(true);

  const canSubmit = useMemo(() => !!zoneId && !saving, [zoneId, saving]);

  const loadSubzones = async (selectedZoneId: string) => {
    if (!selectedZoneId) {
      setSubzones([]);
      setSubzoneId("");
      return;
    }
    const res = await apiGet<{ subzones: SubzoneRow[] }>(`/land/subzones?zoneId=${encodeURIComponent(selectedZoneId)}`);
    setSubzones(res.subzones ?? []);
    setSubzoneId("");
  };

  const loadSessions = async (selectedZoneId: string) => {
    if (!selectedZoneId) {
      setSessions([]);
      return;
    }
    const res = await apiGet<{ sessions: GrazingSessionRow[] }>(
      `/land/grazing-sessions?zoneId=${encodeURIComponent(selectedZoneId)}`
    );
    setSessions(res.sessions ?? []);
  };

  const loadRecommendations = async (selectedZoneId: string) => {
    if (!selectedZoneId) {
      setRecommendations([]);
      return;
    }
    const res = await apiGet<{ recommendations: RecommendationRow[] }>(
      `/land/recommendations?zoneId=${encodeURIComponent(selectedZoneId)}`
    );
    setRecommendations(res.recommendations ?? []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [zoneRows, herdRows] = await Promise.all([apiGet<ZoneRow[]>("/zones"), apiGet<HerdRow[]>("/herds")]);
        setZones(zoneRows ?? []);
        setHerds(herdRows ?? []);
        if (zoneRows.length > 0) setZoneId(zoneRows[0].id);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load planning data");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    void loadSubzones(zoneId);
    void loadSessions(zoneId);
    void loadRecommendations(zoneId);
  }, [zoneId]);

  const createSubzone = async () => {
    if (!canSubmit || !newSubzoneName.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiPost("/land/subzones", {
        zoneId,
        name: newSubzoneName.trim(),
        description: newSubzoneDesc.trim() || undefined,
        targetRestDays: toNumberOrUndefined(newSubzoneRestDays),
      });
      setNewSubzoneName("");
      setNewSubzoneDesc("");
      setNewSubzoneRestDays("");
      setSuccessMsg("Subzone created.");
      await loadSubzones(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create subzone");
    } finally {
      setSaving(false);
    }
  };

  const createSession = async () => {
    if (!canSubmit || !sessionStartedAt) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiPost("/land/grazing-sessions", {
        zoneId,
        subzoneId: subzoneId || undefined,
        herdId: sessionHerdId || undefined,
        headCount: toNumberOrUndefined(sessionHeadCount),
        stockDensityAuPerAcre: toNumberOrUndefined(sessionDensity),
        startedAt: new Date(sessionStartedAt).toISOString(),
        endedAt: sessionEndedAt ? new Date(sessionEndedAt).toISOString() : undefined,
        notes: sessionNotes.trim() || undefined,
      });
      setSuccessMsg("Grazing session recorded.");
      setSessionHeadCount("");
      setSessionDensity("");
      setSessionNotes("");
      await loadSessions(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to record grazing session");
    } finally {
      setSaving(false);
    }
  };

  const generateRecommendations = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiPost("/land/recommendations/generate", {
        zoneId,
        subzoneId: subzoneId || undefined,
        recommendationDate: recDate,
        persist: recPersist,
      });
      setSuccessMsg(recPersist ? "Recommendations generated and saved." : "Recommendations preview generated.");
      await loadRecommendations(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate recommendations");
    } finally {
      setSaving(false);
    }
  };

  const updateRecommendationStatus = async (
    recommendationId: string,
    status: "open" | "accepted" | "dismissed" | "completed"
  ) => {
    setErrorMsg(null);
    try {
      await apiPut(`/land/recommendations/${recommendationId}/status`, { status });
      await loadRecommendations(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update recommendation");
    }
  };

  if (loading) {
    return (
      <PageShell title="Grazing Plans" description="Plan rotations, sessions, and actionable recommendations.">
        <div className="text-sm text-stone-600">Loading planning data...</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Grazing Plans" description="Plan rotations, sessions, and actionable recommendations.">
      {errorMsg && <AlertBanner variant="error">{errorMsg}</AlertBanner>}
      {successMsg && <AlertBanner variant="success">{successMsg}</AlertBanner>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planning Context</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="planZone">Zone</Label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger id="planZone">
                <SelectValue placeholder="Select zone" />
              </SelectTrigger>
              <SelectContent>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="planSubzone">Subzone (optional)</Label>
            <Select value={subzoneId} onValueChange={setSubzoneId}>
              <SelectTrigger id="planSubzone">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {subzones.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Subzone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="subzoneName">Name</Label>
              <Input id="subzoneName" value={newSubzoneName} onChange={(e) => setNewSubzoneName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subzoneRest">Target rest days</Label>
              <Input
                id="subzoneRest"
                value={newSubzoneRestDays}
                onChange={(e) => setNewSubzoneRestDays(e.target.value)}
                placeholder="21"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subzoneDesc">Description</Label>
              <Textarea id="subzoneDesc" rows={3} value={newSubzoneDesc} onChange={(e) => setNewSubzoneDesc(e.target.value)} />
            </div>
            <Button onClick={createSubzone} disabled={!canSubmit || !newSubzoneName.trim()}>
              Save Subzone
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record Grazing Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sessionHerd">Herd (optional)</Label>
                <Select value={sessionHerdId} onValueChange={setSessionHerdId}>
                  <SelectTrigger id="sessionHerd">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {herds.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionHead">Head count</Label>
                <Input
                  id="sessionHead"
                  value={sessionHeadCount}
                  onChange={(e) => setSessionHeadCount(e.target.value)}
                  placeholder="75"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionDensity">Stock density AU/acre</Label>
                <Input
                  id="sessionDensity"
                  value={sessionDensity}
                  onChange={(e) => setSessionDensity(e.target.value)}
                  placeholder="1.9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionStart">Start</Label>
                <Input
                  id="sessionStart"
                  type="datetime-local"
                  value={sessionStartedAt}
                  onChange={(e) => setSessionStartedAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionEnd">End (optional)</Label>
                <Input
                  id="sessionEnd"
                  type="datetime-local"
                  value={sessionEndedAt}
                  onChange={(e) => setSessionEndedAt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sessionNotes">Notes</Label>
              <Textarea id="sessionNotes" rows={3} value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />
            </div>
            <Button onClick={createSession} disabled={!canSubmit || !sessionStartedAt}>
              Save Session
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Generate Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="recDate">Recommendation date</Label>
                <Input id="recDate" type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-8">
                <Checkbox
                  id="persistRecs"
                  checked={recPersist}
                  onCheckedChange={(v) => setRecPersist(Boolean(v))}
                />
                <Label htmlFor="persistRecs">Persist generated recommendations</Label>
              </div>
              <div className="pt-7">
                <Button onClick={generateRecommendations} disabled={!canSubmit}>
                  Generate
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {recommendations.length === 0 ? (
                <div className="text-sm text-stone-500">No recommendations yet for this zone.</div>
              ) : (
                recommendations.slice(0, 20).map((r) => (
                  <div key={r.id} className="rounded-md border bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{r.title}</div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-stone-100 px-2 py-1">{r.recommendationType}</span>
                        <span className="rounded bg-stone-100 px-2 py-1">{r.priority}</span>
                        <span className="rounded bg-stone-100 px-2 py-1">{r.status}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-stone-700">{r.rationale}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => updateRecommendationStatus(r.id, "accepted")}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateRecommendationStatus(r.id, "dismissed")}>
                        Dismiss
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateRecommendationStatus(r.id, "completed")}>
                        Complete
                      </Button>
                      <div className="text-xs text-stone-500">
                        Date: {r.recommendationDate}
                        {r.actionByDate ? ` • Action by ${r.actionByDate}` : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Grazing Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-sm text-stone-500">No sessions yet.</div>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 10).map((s) => (
                <div key={s.id} className="text-sm text-stone-700">
                  {new Date(s.startedAt).toLocaleString()} -{" "}
                  {s.endedAt ? new Date(s.endedAt).toLocaleString() : "ongoing"} • head {s.headCount ?? "-"}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
