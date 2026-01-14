import { Card } from "@/components/ui/card";

export default function AccountingPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Accounting</h1>
        <p className="text-stone-600 mt-1">
          Track ranch expenses, revenue, and financial summaries.
        </p>
      </header>

      <Card title="Financial Records">
        <p className="text-stone-600">
          This section will display financial summaries, expenses, and revenue logs.
        </p>
      </Card>

    </div>
  );
}