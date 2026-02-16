import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function SuppliesOverviewPage() {
  return (
    <PageShell
      title="Supplies & Consumables"
      description="Manage feed, minerals, medications, fuel, and tools used across your ranch."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.supplies.feed}
          title="Feed"
          description="Track feed inventory, usage, and storage."
        />
        <FeatureTileLink
          to={ROUTES.supplies.minerals}
          title="Minerals"
          description="Manage mineral supplements and consumption."
        />
        <FeatureTileLink
          to={ROUTES.supplies.medications}
          title="Medications"
          description="Track veterinary medications and treatment supplies."
        />
        <FeatureTileLink
          to={ROUTES.supplies.fuel}
          title="Fuel"
          description="Monitor fuel storage, usage, and deliveries."
        />
        <FeatureTileLink
          to={ROUTES.supplies.tools}
          title="Tools"
          description="Track tools, repairs, and replacements."
        />
      </FeatureGrid>
    </PageShell>
  );
}
