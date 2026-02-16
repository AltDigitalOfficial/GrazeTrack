import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function LandManagementPage() {
  return (
    <PageShell
      title="Land Management"
      description="Manage your ranch's land assets, including pasture boundaries, infrastructure, and environmental data."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.land.zonesList}
          title="Define Zones"
          description="Draw and manage pasture boundaries directly on the ranch map."
        />
        <FeatureTileLink
          to={ROUTES.land.pastures}
          title="Pastures & Fences"
          description="Organize fenced paddocks and pasture structure within zones."
        />
        <FeatureTileLink
          to={ROUTES.land.soil}
          title="Soil & Vegetation"
          description="Capture sampling data, weather context, and zone daily state."
        />
        <FeatureTileLink
          to={ROUTES.land.grazing}
          title="Grazing Plans"
          description="Log sessions, manage subzones, and run actionable recommendations."
        />
      </FeatureGrid>
    </PageShell>
  );
}

