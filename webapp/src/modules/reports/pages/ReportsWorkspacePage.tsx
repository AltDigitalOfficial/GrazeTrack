import { Card } from "@/components/ui/card";

export default function ReportsWorkspacePage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Reports Workspace</h1>
        <p className="text-stone-600 mt-1">
          This area will display dashboards, charts, and analytics tools.
        </p>
      </header>

      <Card title="Analytics Dashboard">
        <p className="text-stone-600">
          Future reporting components will appear here, including charts,
          KPIs, and data visualizations.
        </p>
      </Card>

    </div>
  );
}