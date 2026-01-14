import { Card } from "@/components/ui/card";

export default function AppointmentPAge() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Appointment Management</h1>
        <p className="text-stone-600 mt-1">
          Set appointments, save the details.
        </p>
      </header>

      <Card title="Task List">
        <p className="text-stone-600">
          This section will appointments, providers, and locations.
        </p>
      </Card>

    </div>
  );
}