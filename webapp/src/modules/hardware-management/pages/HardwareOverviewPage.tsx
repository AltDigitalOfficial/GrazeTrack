import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileDisabled, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function HardwareOverviewPage() {
  return (
    <PageShell
      title="Hardware Management"
      description="Track and manage ranch hard assets and maintenance history."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.hardware.assetsOverview}
          title="Assets Overview"
          description="Review all hard assets with filters and value/maintenance context."
        />
        <FeatureTileLink
          to={ROUTES.hardware.maintenanceLog}
          title="Maintenance Log"
          description="Review and edit maintenance events across all assets."
        />
        <FeatureTileDisabled
          title="Asset History Report (Coming Soon)"
          description="Generate timeline-style hardware history for valuation and audits."
        />
        <FeatureTileDisabled
          title="Documents View (Coming Soon)"
          description="Review manuals, warranties, and receipts across assets."
        />
      </FeatureGrid>
    </PageShell>
  );
}
