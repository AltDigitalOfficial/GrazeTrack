import { Card } from "@/components/ui/card";

export default function MineralsPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Minerals</h1>
        <p className="text-stone-600 mt-1">
          Manage mineral supplements and consumption across the ranch.
        </p>
      </header>

      <Card title="Mineral Inventory">
        <p className="text-stone-600">
          This section will track mineral types, stock levels, and usage.
        </p>
      </Card>

    </div>
  );
}