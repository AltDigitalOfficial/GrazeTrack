import { Card } from "@/components/ui/card";

export default function CalendarViewPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Calendar View</h1>
        <p className="text-stone-600 mt-1">
          View tasks, events, and deadlines on a unified ranch calendar.
        </p>
      </header>

      <Card title="Calendar">
        <p className="text-stone-600">
          A full interactive calendar will appear here, showing tasks and events.
        </p>
      </Card>

    </div>
  );
}