import { Card } from "@/components/ui/card";

export default function BillingPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Billing</h1>
        <p className="text-stone-600 mt-1">
          View invoices, update payment methods, and manage subscriptions.
        </p>
      </header>

      <Card title="Billing Details">
        <p className="text-stone-600">
          This section will show invoices, payment history, and subscription details.
        </p>
      </Card>

    </div>
  );
}