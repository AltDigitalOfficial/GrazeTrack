import { Card } from "@/components/ui/card";

export default function EquipmentRentalsPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Equipment Rentals</h1>
        <p className="text-stone-600 mt-1">
          Manage rental equipment, schedules, and service providers.
        </p>
      </header>

      <Card title="Rental Records">
        <p className="text-stone-600">
          This section will track rental agreements, schedules, and equipment details.
        </p>
      </Card>

    </div>
  );
}