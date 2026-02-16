import { FeatureGrid, FeatureTileDisabled, PageShell } from "@/components/ui/page-shell";

export default function ReportsOverviewPage() {
  return (
    <PageShell
      title="Reports & Analytics"
      description="View operational insights, performance metrics, and ranch-wide analytics."
    >
      <FeatureGrid>
        <FeatureTileDisabled
          title="Herd Performance (Coming Soon)"
          description="Analyze weight gain, health trends, and herd productivity."
        />
        <FeatureTileDisabled
          title="Grazing Efficiency (Coming Soon)"
          description="Evaluate pasture utilization and grazing rotation effectiveness."
        />
        <FeatureTileDisabled
          title="Cost Analysis (Coming Soon)"
          description="Track operational costs and identify opportunities for savings."
        />
        <FeatureTileDisabled
          title="Custom Reports (Coming Soon)"
          description="Build custom dashboards tailored to your ranch's needs."
        />
      </FeatureGrid>
    </PageShell>
  );
}
