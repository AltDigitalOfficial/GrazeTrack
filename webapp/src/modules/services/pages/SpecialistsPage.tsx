import { Card } from "@/components/ui/card";

export default function SpecialistsPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Specialists</h1>
        <p className="text-stone-600 mt-1">
          Track farriers, nutritionists, AI technicians, hoof care experts, and more.
        </p>
      </header>

      <Card title="Specialist Services">
        <p className="text-stone-600">
          This section will store specialist profiles, service history, and scheduling.
        </p>
      </Card>

    </div>
  );
}