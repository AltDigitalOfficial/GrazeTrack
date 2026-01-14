import { Card } from "@/components/ui/card";

export default function FeedPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Feed</h1>
        <p className="text-stone-600 mt-1">
          Track feed inventory, usage, and storage locations.
        </p>
      </header>

      <Card title="Feed Inventory">
        <p className="text-stone-600">
          This section will display feed types, quantities, and usage logs.
        </p>
      </Card>

    </div>
  );
}