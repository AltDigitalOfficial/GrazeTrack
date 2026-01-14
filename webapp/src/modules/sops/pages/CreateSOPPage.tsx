import { Card } from "@/components/ui/card";

export default function CreateSOPPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Create SOP</h1>
        <p className="text-stone-600 mt-1">
          Write a new SOP directly in GrazeTrack using the built‑in editor.
        </p>
      </header>

      <Card title="SOP Editor">
        <p className="text-stone-600">
          A rich text editor will appear here for drafting SOPs.
        </p>
      </Card>

    </div>
  );
}