import { useEffect, useMemo, useState } from "react";

import { AlertBanner } from "@/components/ui/alert-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api";
import { PageShell } from "@/components/ui/page-shell";

type ZoneRow = {
  id: string;
  name: string;
};

type SubzoneRow = {
  id: string;
  name: string;
};

type SoilRow = {
  id: string;
  sampledAt: string;
  ph: string | null;
  moisturePct: string | null;
  notes: string | null;
};

type ForageRow = {
  id: string;
  sampledAt: string;
  biomassLbPerAcre: string | null;
  groundCoverPct: string | null;
  speciesObserved: string[] | null;
};

type WeatherRow = {
  id: string;
  weatherDate: string;
  rainInches: string | null;
  forecastRainInchesNext3d: string | null;
};

type ZoneStateRow = {
  id: string;
  stateDate: string;
  restDays: number | null;
  estimatedForageLbPerAcre: string | null;
  utilizationPct: string | null;
  moistureStressScore: number | null;
  recoveryStage: string | null;
  needsRest: boolean | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrUndefined(v: string): number | undefined {
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export default function SoilVegetationPage() {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [subzones, setSubzones] = useState<SubzoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [subzonesLoading, setSubzonesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [soilRows, setSoilRows] = useState<SoilRow[]>([]);
  const [forageRows, setForageRows] = useState<ForageRow[]>([]);
  const [weatherRows, setWeatherRows] = useState<WeatherRow[]>([]);
  const [stateRows, setStateRows] = useState<ZoneStateRow[]>([]);

  const [zoneId, setZoneId] = useState("");
  const [subzoneId, setSubzoneId] = useState("");

  const [soilDate, setSoilDate] = useState(todayIsoDate());
  const [soilPh, setSoilPh] = useState("");
  const [soilMoisturePct, setSoilMoisturePct] = useState("");
  const [soilNotes, setSoilNotes] = useState("");

  const [forageDate, setForageDate] = useState(todayIsoDate());
  const [forageSpeciesObserved, setForageSpeciesObserved] = useState("");
  const [forageBiomass, setForageBiomass] = useState("");
  const [forageGroundCoverPct, setForageGroundCoverPct] = useState("");
  const [forageCanopyInches, setForageCanopyInches] = useState("");
  const [forageNotes, setForageNotes] = useState("");

  const [weatherDate, setWeatherDate] = useState(todayIsoDate());
  const [weatherMinTemp, setWeatherMinTemp] = useState("");
  const [weatherMaxTemp, setWeatherMaxTemp] = useState("");
  const [weatherRain, setWeatherRain] = useState("");
  const [weatherRain3d, setWeatherRain3d] = useState("");
  const [weatherSource, setWeatherSource] = useState("manual");

  const [stateDate, setStateDate] = useState(todayIsoDate());
  const [stateRestDays, setStateRestDays] = useState("");
  const [stateForage, setStateForage] = useState("");
  const [stateUtilPct, setStateUtilPct] = useState("");
  const [stateMoistureStress, setStateMoistureStress] = useState("");
  const [stateRecoveryStage, setStateRecoveryStage] = useState<"" | "poor" | "early" | "mid" | "full">("");
  const [stateNeedsRest, setStateNeedsRest] = useState(false);
  const [stateNotes, setStateNotes] = useState("");

  const canSubmit = useMemo(() => !!zoneId && !saving, [zoneId, saving]);

  const loadSubzones = async (selectedZoneId: string) => {
    if (!selectedZoneId) {
      setSubzones([]);
      setSubzoneId("");
      return;
    }
    setSubzonesLoading(true);
    try {
      const res = await apiGet<{ subzones: SubzoneRow[] }>(`/land/subzones?zoneId=${encodeURIComponent(selectedZoneId)}`);
      setSubzones(res.subzones ?? []);
      setSubzoneId("");
    } finally {
      setSubzonesLoading(false);
    }
  };

  const loadRows = async (selectedZoneId: string) => {
    if (!selectedZoneId) {
      setSoilRows([]);
      setForageRows([]);
      setWeatherRows([]);
      setStateRows([]);
      return;
    }
    const [soilRes, forageRes, weatherRes, stateRes] = await Promise.all([
      apiGet<{ soilSamples: SoilRow[] }>(`/land/soil-samples?zoneId=${encodeURIComponent(selectedZoneId)}&limit=10`),
      apiGet<{ forageSamples: ForageRow[] }>(`/land/forage-samples?zoneId=${encodeURIComponent(selectedZoneId)}&limit=10`),
      apiGet<{ weatherDaily: WeatherRow[] }>(`/land/weather-daily?zoneId=${encodeURIComponent(selectedZoneId)}`),
      apiGet<{ zoneDailyStates: ZoneStateRow[] }>(`/land/zone-daily-states?zoneId=${encodeURIComponent(selectedZoneId)}&limit=10`),
    ]);
    setSoilRows(soilRes.soilSamples ?? []);
    setForageRows(forageRes.forageSamples ?? []);
    setWeatherRows((weatherRes.weatherDaily ?? []).slice(0, 10));
    setStateRows(stateRes.zoneDailyStates ?? []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const zoneRows = await apiGet<ZoneRow[]>("/zones");
        setZones(zoneRows ?? []);
        if (zoneRows.length > 0) setZoneId(zoneRows[0].id);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load land data");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    void loadSubzones(zoneId);
    void loadRows(zoneId);
  }, [zoneId]);

  const handleSaveSoil = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiPost("/land/soil-samples", {
        zoneId,
        subzoneId: subzoneId || undefined,
        sampledAt: soilDate,
        ph: toNumberOrUndefined(soilPh),
        moisturePct: toNumberOrUndefined(soilMoisturePct),
        notes: soilNotes.trim() || undefined,
      });
      setSuccessMsg("Soil sample saved.");
      await loadRows(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save soil sample");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveForage = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiPost("/land/forage-samples", {
        zoneId,
        subzoneId: subzoneId || undefined,
        sampledAt: forageDate,
        speciesObserved: forageSpeciesObserved
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        biomassLbPerAcre: toNumberOrUndefined(forageBiomass),
        groundCoverPct: toNumberOrUndefined(forageGroundCoverPct),
        avgCanopyInches: toNumberOrUndefined(forageCanopyInches),
        notes: forageNotes.trim() || undefined,
      });
      setSuccessMsg("Forage sample saved.");
      await loadRows(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save forage sample");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWeather = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiPost("/land/weather-daily", {
        zoneId,
        subzoneId: subzoneId || undefined,
        weatherDate,
        minTempF: toNumberOrUndefined(weatherMinTemp),
        maxTempF: toNumberOrUndefined(weatherMaxTemp),
        rainInches: toNumberOrUndefined(weatherRain),
        forecastRainInchesNext3d: toNumberOrUndefined(weatherRain3d),
        source: weatherSource.trim() || undefined,
      });
      setSuccessMsg("Weather row saved.");
      await loadRows(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save weather row");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveState = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiPost("/land/zone-daily-states", {
        zoneId,
        subzoneId: subzoneId || undefined,
        stateDate,
        restDays: toNumberOrUndefined(stateRestDays),
        estimatedForageLbPerAcre: toNumberOrUndefined(stateForage),
        utilizationPct: toNumberOrUndefined(stateUtilPct),
        moistureStressScore: toNumberOrUndefined(stateMoistureStress),
        recoveryStage: stateRecoveryStage || undefined,
        needsRest: stateNeedsRest,
        notes: stateNotes.trim() || undefined,
      });
      setSuccessMsg("Zone daily state saved.");
      await loadRows(zoneId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save zone daily state");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Soil & Vegetation" description="Capture soil, forage, weather, and zone state data.">
        <div className="text-sm text-stone-600">Loading land data...</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Soil & Vegetation" description="Capture soil, forage, weather, and zone state data.">
      {errorMsg && <AlertBanner variant="error">{errorMsg}</AlertBanner>}
      {successMsg && <AlertBanner variant="success">{successMsg}</AlertBanner>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Context</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="zoneSelect">Zone</Label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger id="zoneSelect">
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
            <Label htmlFor="subzoneSelect">Subzone (optional)</Label>
            <Select value={subzoneId} onValueChange={setSubzoneId} disabled={subzonesLoading}>
              <SelectTrigger id="subzoneSelect">
                <SelectValue placeholder={subzonesLoading ? "Loading subzones..." : "None"} />
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
            <CardTitle className="text-base">Soil Sample</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="soilDate">Sample date</Label>
                <Input id="soilDate" type="date" value={soilDate} onChange={(e) => setSoilDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="soilPh">pH</Label>
                <Input id="soilPh" value={soilPh} onChange={(e) => setSoilPh(e.target.value)} placeholder="6.4" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="soilMoisture">Moisture %</Label>
                <Input
                  id="soilMoisture"
                  value={soilMoisturePct}
                  onChange={(e) => setSoilMoisturePct(e.target.value)}
                  placeholder="22"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="soilNotes">Notes</Label>
              <Textarea id="soilNotes" rows={3} value={soilNotes} onChange={(e) => setSoilNotes(e.target.value)} />
            </div>
            <Button onClick={handleSaveSoil} disabled={!canSubmit}>
              Save Soil Sample
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forage Sample</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="forageDate">Sample date</Label>
                <Input id="forageDate" type="date" value={forageDate} onChange={(e) => setForageDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forageSpecies">Species observed (comma-separated)</Label>
                <Input
                  id="forageSpecies"
                  value={forageSpeciesObserved}
                  onChange={(e) => setForageSpeciesObserved(e.target.value)}
                  placeholder="ryegrass, clover"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forageBiomass">Biomass lb/acre</Label>
                <Input
                  id="forageBiomass"
                  value={forageBiomass}
                  onChange={(e) => setForageBiomass(e.target.value)}
                  placeholder="2100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forageCover">Ground cover %</Label>
                <Input
                  id="forageCover"
                  value={forageGroundCoverPct}
                  onChange={(e) => setForageGroundCoverPct(e.target.value)}
                  placeholder="78"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forageCanopy">Canopy inches</Label>
                <Input
                  id="forageCanopy"
                  value={forageCanopyInches}
                  onChange={(e) => setForageCanopyInches(e.target.value)}
                  placeholder="7.5"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forageNotes">Notes</Label>
              <Textarea id="forageNotes" rows={3} value={forageNotes} onChange={(e) => setForageNotes(e.target.value)} />
            </div>
            <Button onClick={handleSaveForage} disabled={!canSubmit}>
              Save Forage Sample
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weather (Daily)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="weatherDate">Date</Label>
                <Input
                  id="weatherDate"
                  type="date"
                  value={weatherDate}
                  onChange={(e) => setWeatherDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weatherMin">Min temp F</Label>
                <Input id="weatherMin" value={weatherMinTemp} onChange={(e) => setWeatherMinTemp(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weatherMax">Max temp F</Label>
                <Input id="weatherMax" value={weatherMaxTemp} onChange={(e) => setWeatherMaxTemp(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weatherRain">Rain inches</Label>
                <Input id="weatherRain" value={weatherRain} onChange={(e) => setWeatherRain(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weatherRain3d">Forecast rain next 3d</Label>
                <Input id="weatherRain3d" value={weatherRain3d} onChange={(e) => setWeatherRain3d(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weatherSource">Source</Label>
                <Input
                  id="weatherSource"
                  value={weatherSource}
                  onChange={(e) => setWeatherSource(e.target.value)}
                  placeholder="manual"
                />
              </div>
            </div>
            <Button onClick={handleSaveWeather} disabled={!canSubmit}>
              Save Weather
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zone Daily State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="stateDate">Date</Label>
                <Input id="stateDate" type="date" value={stateDate} onChange={(e) => setStateDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stateRest">Rest days</Label>
                <Input id="stateRest" value={stateRestDays} onChange={(e) => setStateRestDays(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stateForage">Estimated forage lb/acre</Label>
                <Input id="stateForage" value={stateForage} onChange={(e) => setStateForage(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stateUtil">Utilization %</Label>
                <Input id="stateUtil" value={stateUtilPct} onChange={(e) => setStateUtilPct(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stateStress">Moisture stress (0-10)</Label>
                <Input
                  id="stateStress"
                  value={stateMoistureStress}
                  onChange={(e) => setStateMoistureStress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stateRecovery">Recovery stage</Label>
                <Select value={stateRecoveryStage} onValueChange={(v) => setStateRecoveryStage(v as typeof stateRecoveryStage)}>
                  <SelectTrigger id="stateRecovery">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="poor">poor</SelectItem>
                    <SelectItem value="early">early</SelectItem>
                    <SelectItem value="mid">mid</SelectItem>
                    <SelectItem value="full">full</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="stateNeedsRest" checked={stateNeedsRest} onCheckedChange={(v) => setStateNeedsRest(Boolean(v))} />
              <Label htmlFor="stateNeedsRest">Needs rest</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stateNotes">Notes</Label>
              <Textarea id="stateNotes" rows={3} value={stateNotes} onChange={(e) => setStateNotes(e.target.value)} />
            </div>
            <Button onClick={handleSaveState} disabled={!canSubmit}>
              Save Zone State
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Data</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold">Soil samples</div>
            <div className="space-y-1 text-sm text-stone-700">
              {soilRows.length === 0 ? (
                <div className="text-stone-500">No rows yet.</div>
              ) : (
                soilRows.slice(0, 5).map((r) => (
                  <div key={r.id}>
                    {r.sampledAt}: pH {r.ph ?? "-"}, moisture {r.moisturePct ?? "-"}%
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">Forage samples</div>
            <div className="space-y-1 text-sm text-stone-700">
              {forageRows.length === 0 ? (
                <div className="text-stone-500">No rows yet.</div>
              ) : (
                forageRows.slice(0, 5).map((r) => (
                  <div key={r.id}>
                    {r.sampledAt}: biomass {r.biomassLbPerAcre ?? "-"} lb/acre, cover {r.groundCoverPct ?? "-"}%
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">Weather</div>
            <div className="space-y-1 text-sm text-stone-700">
              {weatherRows.length === 0 ? (
                <div className="text-stone-500">No rows yet.</div>
              ) : (
                weatherRows.slice(0, 5).map((r) => (
                  <div key={r.id}>
                    {r.weatherDate}: rain {r.rainInches ?? "-"} in, next3d {r.forecastRainInchesNext3d ?? "-"} in
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">Zone daily states</div>
            <div className="space-y-1 text-sm text-stone-700">
              {stateRows.length === 0 ? (
                <div className="text-stone-500">No rows yet.</div>
              ) : (
                stateRows.slice(0, 5).map((r) => (
                  <div key={r.id}>
                    {r.stateDate}: rest {r.restDays ?? "-"}d, forage {r.estimatedForageLbPerAcre ?? "-"}, util{" "}
                    {r.utilizationPct ?? "-"}%
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
