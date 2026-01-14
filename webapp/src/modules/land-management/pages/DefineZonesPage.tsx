import { useState } from "react";
import MapCanvas from "../components/MapCanvas";
import PastureSaveModal from "../components/PastureSaveModal";

export default function DefineZonesPage() {
  const [points, setPoints] = useState<[number, number][]>([]);
  const [showModal, setShowModal] = useState(false);

  // Called by MapCanvas when user clicks to add points
  function handlePointsUpdated(newPoints: [number, number][]) {
    setPoints(newPoints);

    // When polygon is complete (3+ points), open modal
    if (newPoints.length > 2) {
      setShowModal(true);
    }
  }

  // Called when user saves the pasture
  function handleSavePasture(data: { name: string; notes: string }) {
    console.log("Saving pasture:", data);
    console.log("Polygon points:", points);

    // TODO: Persist to Supabase or backend

    // Reset UI
    setShowModal(false);
    setPoints([]);
  }

  return (
    <div className="flex flex-col w-full h-full p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-brown-800">Grazing Zones</h1>
        <p className="text-brown-700 mt-1">
          Click on the map to outline a pasture boundary. Once complete, you can
          name and save the zone.
        </p>
      </div>

      {/* Map Canvas */}
      <div className="flex-1 min-h-150">
        <MapCanvas points={points} onPointsUpdated={handlePointsUpdated} />
      </div>

      {/* Save Modal */}
      <PastureSaveModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSavePasture}
      />
    </div>
  );
}