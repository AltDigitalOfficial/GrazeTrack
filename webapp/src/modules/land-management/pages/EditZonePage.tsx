import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut } from "@/lib/api";
import { ROUTES } from "@/routes";

// Fix Leaflet default marker paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][]; // [ [ [lng, lat], ... ] ]
};

type ZoneData = {
  id: string;
  ranchId: string;
  name: string;
  description: string | null;
  areaAcres: string | number | null;
  geom: string | null; // GeoJSON string
};

type ZoneFormData = {
  name: string;
  description: string;
  geom: string | null;
  areaAcres: number;
};

function safeParseGeoJSON(input: string): GeoJsonPolygon | null {
  try {
    const obj = JSON.parse(input);
    if (obj?.type === "Polygon" && Array.isArray(obj.coordinates)) return obj as GeoJsonPolygon;
    return null;
  } catch {
    return null;
  }
}

function geoJsonToLatLngs(geom: GeoJsonPolygon): L.LatLng[] {
  const ring0 = geom.coordinates?.[0] ?? [];
  const pts = ring0.map((c) => L.latLng(c[1], c[0]));

  // Drop duplicated closing point if present
  if (pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a.lat === b.lat && a.lng === b.lng) return pts.slice(0, -1);
  }
  return pts;
}

function latLngsToGeoJson(points: L.LatLng[]): GeoJsonPolygon {
  const coords = points.map((p) => [p.lng, p.lat]);
  if (coords.length > 0) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function computeAreaAcres(points: L.LatLng[]): number {
  if (points.length < 3) return 0;

  const earthRadius = 6371000; // meters
  const pts = points.map((p) => ({
    x: earthRadius * Math.cos((p.lat * Math.PI) / 180) * ((p.lng * Math.PI) / 180),
    y: earthRadius * ((p.lat * Math.PI) / 180),
  }));

  let areaSqMeters = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    areaSqMeters += pts[i].x * pts[j].y;
    areaSqMeters -= pts[j].x * pts[i].y;
  }
  areaSqMeters = Math.abs(areaSqMeters) / 2;

  return areaSqMeters / 4046.86;
}

/**
 * Robust cursor setter (Leaflet sometimes stomps inline cursor changes)
 */
function setLeafletCursor(map: L.Map | null, cursor: string | null) {
  if (!map) return;
  const container = map.getContainer();
  if (cursor) {
    container.style.cursor = cursor;
    container.classList.add("gt-force-cursor");
  } else {
    container.style.cursor = "";
    container.classList.remove("gt-force-cursor");
  }

  // Also apply to common child panes that Leaflet may use
  const panes = container.querySelectorAll<HTMLElement>(
    ".leaflet-pane, .leaflet-map-pane, .leaflet-overlay-pane, .leaflet-marker-pane, .leaflet-tile-pane"
  );
  panes.forEach((el) => {
    el.style.cursor = cursor ?? "";
  });
}

export default function EditZonePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Single polygon layer shown on map (whatever we’re currently showing)
  const polygonRef = useRef<L.Polygon | null>(null);

  // Drawing mode state + ref (so Leaflet click handler never has stale closure)
  const isDrawingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<L.LatLng[]>([]);

  // purely a “did the new file load?” indicator
  const [pageBuildTag] = useState("EDIT_ZONE_BUILD_2026_01_14_C");

  const [formData, setFormData] = useState<ZoneFormData>({
    name: "",
    description: "",
    geom: null,
    areaAcres: 0,
  });

  const canSave = useMemo(() => {
    return Boolean(formData.name.trim()) && Boolean(formData.geom) && !saving && !loading;
  }, [formData.name, formData.geom, saving, loading]);

  const removePolygonFromMapOnly = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polygonRef.current) {
      map.removeLayer(polygonRef.current);
      polygonRef.current = null;
    }
  }, []);

  const drawPolygon = useCallback(
    (polyPoints: L.LatLng[], zoom: boolean) => {
      const map = mapRef.current;
      if (!map) return;

      removePolygonFromMapOnly();

      if (polyPoints.length < 3) return;

      const poly = L.polygon(polyPoints, {
        color: "#22c55e",
        weight: 2,
        fillColor: "#22c55e",
        fillOpacity: 0.2,
      }).addTo(map);

      polygonRef.current = poly;

      if (zoom) {
        const bounds = poly.getBounds();
        if (bounds?.isValid()) {
          map.whenReady(() => {
            requestAnimationFrame(() => {
              map.invalidateSize();
              map.fitBounds(bounds, { padding: [24, 24] });
            });
          });
        }
      }
    },
    [removePolygonFromMapOnly]
  );

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current) return;

      setPoints((prev) => {
        const next = [...prev, e.latlng];

        if (next.length >= 3) {
          drawPolygon(next, false);

          const geo = latLngsToGeoJson(next);
          const acres = computeAreaAcres(next);

          setFormData((fd) => ({
            ...fd,
            geom: JSON.stringify(geo),
            areaAcres: Math.round(acres * 100) / 100,
          }));
        }

        return next;
      });
    },
    [drawPolygon]
  );

  // Init map once
  useEffect(() => {
    if (!mapElRef.current) return;
    if (mapRef.current) return;

    const map = L.map(mapElRef.current).setView([39.8283, -98.5795], 5);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      polygonRef.current = null;
    };
  }, []);

  // Bind click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.off("click", handleMapClick);
    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
    };
  }, [handleMapClick]);

  // Sync drawing state to ref + cursor
  useEffect(() => {
    isDrawingRef.current = isDrawing;
    setLeafletCursor(mapRef.current, isDrawing ? "crosshair" : null);
  }, [isDrawing]);

  // Load zone + draw polygon + zoom
  useEffect(() => {
    const load = async () => {
      if (!id) return;

      setLoading(true);
      setErrorMsg(null);

      try {
        const zone: ZoneData = await apiGet(`/zones/${id}`);

        const parsedGeom = zone.geom ? safeParseGeoJSON(zone.geom) : null;

        setFormData({
          name: zone.name ?? "",
          description: zone.description ?? "",
          geom: zone.geom ?? null,
          areaAcres:
            typeof zone.areaAcres === "number"
              ? zone.areaAcres
              : zone.areaAcres
                ? parseFloat(String(zone.areaAcres))
                : 0,
        });

        if (parsedGeom) {
          const polyPoints = geoJsonToLatLngs(parsedGeom);
          setPoints(polyPoints);
          drawPolygon(polyPoints, true);
        } else {
          setPoints([]);
          removePolygonFromMapOnly();
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to load zone");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id, drawPolygon, removePolygonFromMapOnly]);

  /**
   * NEW: “Hide Boundary” — removes polygon from the MAP only.
   * Does NOT modify the DB until the user clicks Update Zone.
   */
  const hideBoundary = () => {
    setErrorMsg(null);

    // remove visual polygon only
    removePolygonFromMapOnly();

    // clear in-memory boundary so "Update Zone" would persist removal
    setPoints([]);
    setFormData((fd) => ({ ...fd, geom: null, areaAcres: 0 }));

    // optional: do NOT auto-enter drawing mode
    setIsDrawing(false);
  };

  /**
   * NEW: Start drawing a replacement boundary.
   * We ALSO hide the existing boundary immediately (map-only).
   */
  const startDrawing = () => {
    setErrorMsg(null);

    removePolygonFromMapOnly();
    setPoints([]);
    setFormData((fd) => ({ ...fd, geom: null, areaAcres: 0 }));

    setIsDrawing(true);
    isDrawingRef.current = true;
  };

  const finishDrawing = () => setIsDrawing(false);

  const clearDrawing = () => {
    setIsDrawing(false);
    setPoints([]);
    setFormData((fd) => ({ ...fd, geom: null, areaAcres: 0 }));
    removePolygonFromMapOnly();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    if (!formData.name.trim()) {
      setErrorMsg("Zone name is required");
      return;
    }
    if (!formData.geom) {
      setErrorMsg("No boundary is defined. Draw a boundary, or hit Back to discard changes.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        geom: formData.geom,
        areaAcres: formData.areaAcres,
      };

      const res: { success: boolean } = await apiPut(`/zones/${id}`, payload);
      if (!res?.success) throw new Error("Update zone failed");

      navigate(ROUTES.land.zonesList);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to update zone");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-10">
        <div className="text-stone-600">Loading zone…</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      {/* Helps prevent Leaflet from overriding cursor */}
      <style>{`
        .gt-force-cursor { cursor: crosshair !important; }
      `}</style>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Edit Grazing Zone</h1>
          <p className="text-stone-600 text-sm">
            Build tag: <span className="font-mono">{pageBuildTag}</span>
          </p>
        </div>

        <Button variant="outline" onClick={() => navigate(ROUTES.land.zonesList)}>
          Back
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}

      {isDrawing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
          Drawing mode enabled — click 3+ points to create a boundary.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Zone Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData((fd) => ({ ...fd, name: e.target.value }))}
              placeholder="Enter zone name"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((fd) => ({ ...fd, description: e.target.value }))}
              placeholder="Optional notes"
              rows={3}
            />
          </div>

          {formData.areaAcres > 0 && (
            <div className="rounded-lg border bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-800">
                <MapPin className="h-4 w-4" />
                <span className="font-medium">Zone Area: {formData.areaAcres.toFixed(2)} acres</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="mr-2">Zone Boundary</Label>

            {/* NEW: hide existing polygon without touching DB */}
            <Button type="button" variant="outline" size="sm" onClick={hideBoundary}>
              Hide Boundary
            </Button>

            {!isDrawing ? (
              <Button type="button" variant="default" size="sm" onClick={startDrawing}>
                Draw New Boundary
              </Button>
            ) : (
              <>
                <Button type="button" variant="default" size="sm" onClick={finishDrawing}>
                  Finish Drawing
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearDrawing}>
                  Clear Drawing
                </Button>
              </>
            )}
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div ref={mapElRef} className="h-96 w-full" />
          </div>

          <p className="text-xs text-stone-600">
            {isDrawing
              ? `Click to add points. Current points: ${points.length} (polygon appears at 3+)`
              : formData.geom
                ? "Boundary is currently set in memory."
                : "No boundary is currently set (in memory). Hit Back to discard, or draw a new one."}
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={!canSave}>
          {saving ? "Updating..." : "Update Zone"}
        </Button>
      </form>
    </div>
  );
}
