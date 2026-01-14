import { Card } from "@/components/ui/card";

export default function ToolsPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Tools</h1>
        <p className="text-stone-600 mt-1">
          Track tools, repairs, replacements, and assignments.
        </p>
      </header>

      <Card title="Tool Inventory">
        <p className="text-stone-600">
          This section will list tools, conditions, and maintenance history.
        </p>
      </Card>

    </div>
  );
}