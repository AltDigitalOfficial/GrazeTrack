import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-geometryutil";
import { MapPin, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut } from "@/lib/api";
import { ROUTES } from "@/routes";

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

type ZoneData = {
  id: string;
  name: string;
  description: string | null;
  areaAcres: string;
  geom: any; // GeoJSON geometry
};

type ZoneFormData = {
  name: string;
  description: string;
  geom: any; // GeoJSON geometry
  areaAcres: number;
};

export default function EditZonePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<ZoneFormData>({
    name: "",
    description: "",
    geom: null,
    areaAcres: 0,
  });

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState<L.Polygon | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<L.LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load zone data
  useEffect(() => {
    const loadZone = async () => {
      if (!id) return;

      try {
        const zone: ZoneData = await apiGet(`/zones/${id}`);
        setFormData({
          name: zone.name,
          description: zone.description || "",
          geom: zone.geom,
          areaAcres: parseFloat(zone.areaAcres) || 0,
        });
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load zone");
      } finally {
        setLoading(false);
      }
    };

    void loadZone();
  }, [id]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current || loading) return;

    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 5); // Center of US
    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Load existing zone geometry if available
    if (formData.geom) {
      try {
        const geoJson = JSON.parse(formData.geom);
        const polygon = L.polygon(geoJson.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]), {
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 0.2,
          weight: 2
        }).addTo(map);
        setCurrentPolygon(polygon);

        // Fit map to the zone bounds
        const bounds = polygon.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] });
        }
      } catch (e) {
        console.error('Failed to parse existing geometry:', e);
      }
    }

    // Handle map clicks for drawing
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isDrawing) return;

      const newPoints = [...polygonPoints, e.latlng];
      setPolygonPoints(newPoints);

      // Remove previous polygon
      if (currentPolygon) {
        map.removeLayer(currentPolygon);
      }

      // Create new polygon
      if (newPoints.length >= 3) {
        const polygon = L.polygon(newPoints, {
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 0.2,
          weight: 2
        }).addTo(map);
        setCurrentPolygon(polygon);

        // Calculate area
        updateZoneFromPoints(newPoints);
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
      map.remove();
      leafletMapRef.current = null;
    };
  }, [loading, formData.geom, isDrawing, polygonPoints]);

  const updateZoneFromPoints = (points: L.LatLng[]) => {
    if (points.length < 3) return;

    // Convert to GeoJSON
    const geoJson = {
      type: 'Polygon',
      coordinates: [points.map(p => [p.lng, p.lat])]
    };

    // Calculate area in square meters using leaflet-geometryutil
    const areaSqMeters = (L.GeometryUtil as any).geodesicArea(points);

    // Convert to acres (1 acre = 4046.86 square meters)
    const areaAcres = areaSqMeters / 4046.86;

    setFormData(prev => ({
      ...prev,
      geom: JSON.stringify(geoJson),
      areaAcres: Math.round(areaAcres * 100) / 100, // Round to 2 decimal places
    }));
  };

  const startDrawing = () => {
    setIsDrawing(true);
    setPolygonPoints([]);
    if (currentPolygon && leafletMapRef.current) {
      leafletMapRef.current.removeLayer(currentPolygon);
    }
    setCurrentPolygon(null);
    setFormData(prev => ({ ...prev, geom: null, areaAcres: 0 }));
  };

  const finishDrawing = () => {
    setIsDrawing(false);
  };

  const clearDrawing = () => {
    setIsDrawing(false);
    setPolygonPoints([]);
    if (currentPolygon && leafletMapRef.current) {
      leafletMapRef.current.removeLayer(currentPolygon);
    }
    setCurrentPolygon(null);
    setFormData(prev => ({ ...prev, geom: null, areaAcres: 0 }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!id) return;
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
        geom: formData.geom,
        areaAcres: formData.areaAcres.toString(),
      };

      const result: { success: boolean } = await apiPut(`/zones/${id}`, payload);

      if (result.success) {
        navigate(ROUTES.land.zonesList);
      } else {
        throw new Error("Failed to update zone");
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to update zone");
    } finally {
      setSaving(false);
    }
  };

  const canSave = formData.name.trim() && formData.geom && !saving && !loading;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-10">
        <div className="text-stone-600">Loading zone…</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Edit Grazing Zone</h1>
          <p className="text-stone-600 text-sm">
            Update the zone boundary and details.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(ROUTES.land.zonesList)}
        >
          Back
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Zone Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter zone name"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description of the zone"
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

        {/* Map */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Zone Boundary</Label>
            <div className="flex gap-2">
              {!isDrawing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startDrawing}
                >
                  Redraw Zone
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={finishDrawing}
                  >
                    Finish Drawing
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                      onClick={clearDrawing}
                    >
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div ref={mapRef} className="h-96 w-full" />
            </div>
            <p className="text-xs text-stone-600">
              {isDrawing
                ? `Click on the map to add points. Click "Finish Drawing" when done. Current points: ${polygonPoints.length}`
                : "The existing zone boundary is shown. Click 'Redraw Zone' to create a new boundary."
              }
            </p>
        </div>

        <Button type="submit" className="w-full" disabled={!canSave}>
          {saving ? "Updating..." : "Update Zone"}
        </Button>
      </form>
    </div>
  );
}