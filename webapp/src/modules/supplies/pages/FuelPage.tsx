import { Card } from "@/components/ui/card";

export default function FuelPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Fuel</h1>
        <p className="text-stone-600 mt-1">
          Monitor fuel storage, usage, and delivery history.
        </p>
      </header>

      <Card title="Fuel Records">
        <p className="text-stone-600">
          This section will track fuel tanks, levels, and consumption logs.
        </p>
      </Card>

    </div>
  );
}