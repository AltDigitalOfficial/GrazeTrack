import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function ServicesOverviewPage() {
  return (
    <PageShell
      title="Services & Suppliers"
      description="Manage veterinary services, specialists, contractors, and supply partners."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.services.vets}
          title="Vets"
          description="Manage veterinary contacts, visits, and service history."
        />
        <FeatureTileLink
          to={ROUTES.services.specialists}
          title="Specialists"
          description="Track farriers, nutritionists, and other specialists."
        />
        <FeatureTileLink
          to={ROUTES.services.feedSuppliers}
          title="Feed Suppliers"
          description="Manage feed vendors, deliveries, and purchase history."
        />
        <FeatureTileLink
          to={ROUTES.services.contractors}
          title="Contractors"
          description="Track fencing crews, welders, builders, and other contractors."
        />
        <FeatureTileLink
          to={ROUTES.services.equipmentRentals}
          title="Equipment Rentals"
          description="Manage rental equipment, schedules, and service providers."
        />
      </FeatureGrid>
    </PageShell>
  );
}
