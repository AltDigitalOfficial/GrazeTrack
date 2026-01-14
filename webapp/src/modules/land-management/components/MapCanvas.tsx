import { useMemo } from "react";
import { MapContainer, TileLayer, Polygon, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";

interface MapCanvasProps {
  points: [number, number][];
  onPointsUpdated: (points: [number, number][]) => void;
}

function ClickHandler({
  points,
  onPointsUpdated,
}: {
  points: [number, number][];
  onPointsUpdated: (points: [number, number][]) => void;
}) {
  useMapEvents({
    click(e) {
      const newPoints: [number, number][] = [
        ...points,
        [e.latlng.lat, e.latlng.lng],
      ];
      onPointsUpdated(newPoints);
    },
  });
  return null;
}

export default function MapCanvas({ points, onPointsUpdated }: MapCanvasProps) {
  const polygonPositions: LatLngExpression[] = useMemo(
    () => points.map(([lat, lng]) => [lat, lng]),
    [points],
  );

  function resetPolygon() {
    onPointsUpdated([]);
  }

  return (
    <div className="relative w-full h-full border border-brown-600 rounded-lg overflow-hidden shadow-sm">
      <MapContainer
        center={[39.5, -104.7]}
        zoom={13}
        className="w-full h-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <ClickHandler points={points} onPointsUpdated={onPointsUpdated} />

        {polygonPositions.length > 2 && (
          <Polygon
            positions={polygonPositions}
            pathOptions={{ color: "#166534", weight: 3 }}
          />
        )}
      </MapContainer>

      <div className="absolute top-4 left-4 flex gap-2">
        <button
          onClick={resetPolygon}
          className="px-3 py-1 rounded bg-brown-700 text-white text-sm shadow hover:bg-brown-800 transition"
        >
          Reset
        </button>

        {points.length > 2 && (
          <div className="px-3 py-1 rounded bg-green-700 text-white text-sm shadow">
            {points.length} points
          </div>
        )}
      </div>
    </div>
  );
}