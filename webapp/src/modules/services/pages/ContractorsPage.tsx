import { Card } from "@/components/ui/card";

export default function ContractorsPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Contractors</h1>
        <p className="text-stone-600 mt-1">
          Track fencing crews, welders, builders, and other contractors.
        </p>
      </header>

      <Card title="Contractor Records">
        <p className="text-stone-600">
          This section will store contractor profiles, job history, and scheduling.
        </p>
      </Card>

    </div>
  );
}