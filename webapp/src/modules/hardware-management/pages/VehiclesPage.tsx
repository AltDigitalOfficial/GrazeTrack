import { Card } from "@/components/ui/card";

export default function VehiclesPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Vehicles</h1>
        <p className="text-stone-600 mt-1">
          Manage trucks, ATVs, UTVs, and other ranch vehicles.
        </p>
      </header>

      {/* Content Card */}
      <Card title="Vehicle Records">
        <p className="text-stone-600">
          This is where you'll add, edit, and track ranch vehicles.  
          Maintenance logs, mileage, and assignments will appear here.
        </p>
      </Card>

    </div>
  );
}