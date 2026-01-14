import { Card } from "@/components/ui/card";

export default function VetsPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Vets</h1>
        <p className="text-stone-600 mt-1">
          Manage veterinary contacts, visits, and service history.
        </p>
      </header>

      <Card title="Veterinary Services">
        <p className="text-stone-600">
          This section will store vet contact details, visit logs, and treatment notes.
        </p>
      </Card>

    </div>
  );
}