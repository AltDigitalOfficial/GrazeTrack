import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function SuppliesOverviewPage() {
  return (
    <PageShell
      title="Supplies & Consumables"
      description="Manage feed, additives, medications, fuel & fluids, and equipment used across your ranch."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.supplies.feed}
          title="Feed"
          description="Manage feed components, blends, purchases, and inventory."
        />
        <FeatureTileLink
          to={ROUTES.supplies.additives}
          title="Additives"
          description="Manage minerals, supplements, vitamins, electrolytes, and related additives."
        />
        <FeatureTileLink
          to={ROUTES.supplies.medications}
          title="Medications"
          description="Track veterinary medications and treatment supplies."
        />
        <FeatureTileLink
          to={ROUTES.supplies.fuel}
          title="Fuel & Fluids"
          description="Track fuel/fluid products, purchases, and inventory balances."
        />
        <FeatureTileLink
          to={ROUTES.supplies.equipmentAssets}
          title="Equipment"
          description="Track equipment assets, parts & supplies, and supporting records."
        />
      </FeatureGrid>
    </PageShell>
  );
}
