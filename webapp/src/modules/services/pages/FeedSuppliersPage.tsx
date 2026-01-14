import { Card } from "@/components/ui/card";

export default function FeedSuppliersPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Feed Suppliers</h1>
        <p className="text-stone-600 mt-1">
          Manage feed vendors, deliveries, and purchase history.
        </p>
      </header>

      <Card title="Supplier Records">
        <p className="text-stone-600">
          This section will track supplier contacts, pricing, and delivery logs.
        </p>
      </Card>

    </div>
  );
}