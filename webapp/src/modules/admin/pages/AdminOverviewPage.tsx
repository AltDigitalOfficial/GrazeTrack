import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileDisabled, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function AdminOverviewPage() {
  return (
    <PageShell
      title="Administration"
      description="Manage users, billing, permissions, and ranch-wide administrative settings."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.admin.users}
          title="User Management"
          description="Add users, assign roles, and manage access permissions."
        />
        <FeatureTileLink
          to={ROUTES.admin.billing}
          title="Billing"
          description="View invoices, update payment methods, and manage subscriptions."
        />
        <FeatureTileLink
          to={ROUTES.admin.accounting}
          title="Accounting"
          description="Track ranch expenses, revenue, and financial summaries."
        />
        <FeatureTileDisabled
          title="Audit Logs (Coming Soon)"
          description="Review system activity and administrative changes."
        />
      </FeatureGrid>
    </PageShell>
  );
}
