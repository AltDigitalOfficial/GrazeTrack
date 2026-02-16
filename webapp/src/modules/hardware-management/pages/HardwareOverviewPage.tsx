import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileDisabled, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function HardwareOverviewPage() {
  return (
    <PageShell
      title="Hardware Management"
      description="Track and manage ranch vehicles, tractors, and equipment assets."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.hardware.vehicles}
          title="Vehicles"
          description="Manage trucks, ATVs, UTVs, and other ranch vehicles."
        />
        <FeatureTileLink
          to={ROUTES.hardware.tractors}
          title="Tractors"
          description="Track tractors, implements, and maintenance schedules."
        />
        <FeatureTileDisabled
          title="IoT Devices (Coming Soon)"
          description="Monitor sensors, cameras, and connected ranch hardware."
        />
        <FeatureTileDisabled
          title="Equipment Health (Coming Soon)"
          description="Track maintenance intervals, repairs, and operational readiness."
        />
      </FeatureGrid>
    </PageShell>
  );
}
