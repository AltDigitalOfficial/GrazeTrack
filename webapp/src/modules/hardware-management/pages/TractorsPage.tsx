import { Card } from "@/components/ui/card";

export default function TractorsPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Tractors</h1>
        <p className="text-stone-600 mt-1">
          Track tractors, implements, and maintenance schedules.
        </p>
      </header>

      {/* Content Card */}
      <Card title="Tractor Records">
        <p className="text-stone-600">
          This section will store tractor details, attachments, service logs,
          and operational readiness.
        </p>
      </Card>

    </div>
  );
}