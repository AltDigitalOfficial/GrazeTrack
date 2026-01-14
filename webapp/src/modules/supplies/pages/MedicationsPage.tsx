import { Card } from "@/components/ui/card";

export default function MedicationsPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Medications</h1>
        <p className="text-stone-600 mt-1">
          Track veterinary medications, expiration dates, and treatment usage.
        </p>
      </header>

      <Card title="Medication Inventory">
        <p className="text-stone-600">
          This section will store medication details, stock levels, and logs.
        </p>
      </Card>

    </div>
  );
}