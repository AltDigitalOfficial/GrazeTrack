import { useState } from "react";

interface PastureSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; notes: string }) => void;
}

export default function PastureSaveModal({
  isOpen,
  onClose,
  onSave,
}: PastureSaveModalProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ name, notes });
    setName("");
    setNotes("");
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-6 border border-brown-600">
        <div>
          <h2 className="text-2xl font-bold text-brown-800">Save Pasture</h2>
          <p className="text-brown-700 mt-1">
            Give this grazing zone a name and optional notes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-brown-800 font-medium mb-1">
              Pasture Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-brown-400 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-700"
              placeholder="North Hayfield"
            />
          </div>

          <div>
            <label className="block text-brown-800 font-medium mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-brown-400 rounded px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-green-700"
              placeholder="Optional notes about this pasture..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-brown-200 text-brown-800 hover:bg-brown-300 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-4 py-2 rounded bg-green-700 text-white hover:bg-green-800 transition"
            >
              Save Pasture
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}