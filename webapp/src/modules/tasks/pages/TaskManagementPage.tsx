import { Card } from "@/components/ui/card";

export default function TaskManagementPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Task Management</h1>
        <p className="text-stone-600 mt-1">
          Create tasks, assign responsibilities, and track progress across the ranch.
        </p>
      </header>

      <Card title="Task List">
        <p className="text-stone-600">
          This section will display all tasks, their statuses, and assignments.
        </p>
      </Card>

    </div>
  );
}