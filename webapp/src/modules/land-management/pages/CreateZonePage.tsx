import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api";
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

type ZoneFormData = {
  name: string;
  description: string;
  geom: string | null; // GeoJSON string
  areaAcres: number;
};

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

export default function CreateZonePage() {
  const navigate = useNavigate();

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // We only ever keep one drawn layer for the polygon
  const polygonLayerRef = useRef<L.Polygon | null>(null);

  // Refs used by Leaflet handler to avoid stale closures
  const isDrawingRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<L.LatLng[]>([]);

  const [formData, setFormData] = useState<ZoneFormData>({
    name: "",
    description: "",
    geom: null,
    areaAcres: 0,
  });

  const canSave = useMemo(() => {
    return Boolean(formData.name.trim()) && Boolean(formData.geom) && !saving;
  }, [formData.name, formData.geom, saving]);

  const clearPolygonLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polygonLayerRef.current) {
      map.removeLayer(polygonLayerRef.current);
      polygonLayerRef.current = null;
    }
  }, []);

  const drawPolygon = useCallback(
    (polyPoints: L.LatLng[]) => {
      const map = mapRef.current;
      if (!map) return;

      clearPolygonLayer();

      if (polyPoints.length < 3) return;

      const poly = L.polygon(polyPoints, {
        color: "#22c55e",
        weight: 2,
        fillColor: "#22c55e",
        fillOpacity: 0.2,
      }).addTo(map);

      polygonLayerRef.current = poly;
    },
    [clearPolygonLayer]
  );

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current) return;

      setPoints((prev) => {
        const next = [...prev, e.latlng];

        if (next.length >= 3) {
          drawPolygon(next);

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

  // Init Leaflet map ONCE
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
      polygonLayerRef.current = null;
    };
  }, []);

  // Bind click handler (stable)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.off("click", handleMapClick);
    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
    };
  }, [handleMapClick]);

  // Drawing state -> ref + cursor class
  useEffect(() => {
    isDrawingRef.current = isDrawing;

    const map = mapRef.current;
    if (!map) return;

    const container = map.getContainer();
    container.classList.toggle("leaflet-crosshair", isDrawing);
  }, [isDrawing]);

  const startDrawing = () => {
    setErrorMsg(null);
    setIsDrawing(true);
    setPoints([]);
    setFormData((fd) => ({ ...fd, geom: null, areaAcres: 0 }));
    clearPolygonLayer();
  };

  const finishDrawing = () => setIsDrawing(false);

  const clearDrawing = () => {
    setIsDrawing(false);
    setPoints([]);
    setFormData((fd) => ({ ...fd, geom: null, areaAcres: 0 }));
    clearPolygonLayer();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setErrorMsg("Zone name is required");
      return;
    }
    if (!formData.geom) {
      setErrorMsg("Please draw a zone boundary on the map");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        geom: formData.geom, // GeoJSON string
        areaAcres: formData.areaAcres,
      };

      const res: { id: string } = await apiPost("/zones", payload);
      if (!res?.id) throw new Error("Create zone failed");

      navigate(ROUTES.land.zonesList);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create zone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      {/* Cursor style that Leaflet won't override */}
      <style>{`
        .leaflet-crosshair { cursor: crosshair !important; }
      `}</style>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Create Grazing Zone</h1>
          <p className="text-stone-600 text-sm">Draw a boundary and save it.</p>
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
          <div className="flex items-center gap-2">
            <Label>Zone Boundary</Label>
            <div className="flex gap-2">
              {!isDrawing ? (
                <Button type="button" variant="outline" size="sm" onClick={startDrawing}>
                  Draw Zone
                </Button>
              ) : (
                <>
                  <Button type="button" variant="default" size="sm" onClick={finishDrawing}>
                    Finish Drawing
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={clearDrawing}>
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div ref={mapElRef} className="h-96 w-full" />
          </div>

          <p className="text-xs text-stone-600">
            {isDrawing
              ? `Click to add points. Current points: ${points.length} (polygon appears at 3+)`
              : formData.geom
                ? "Boundary captured. You can save now."
                : "Click “Draw Zone” to start."}
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={!canSave}>
          {saving ? "Saving..." : "Save Zone"}
        </Button>
      </form>
    </div>
  );
}
