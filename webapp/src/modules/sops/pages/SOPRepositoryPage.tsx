import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileDisabled, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function SOPRepositoryPage() {
  return (
    <PageShell
      title="Standard Operating Procedures"
      description="Store, organize, and reference your ranch's SOPs in one central location."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.sops.upload}
          title="Upload Document"
          description="Add PDFs, Word documents, or reference files to your SOP library."
        />
        <FeatureTileLink
          to={ROUTES.sops.create}
          title="Create SOP"
          description="Write a new SOP directly in GrazeTrack using the built-in editor."
        />
        <FeatureTileDisabled
          title="Categories (Coming Soon)"
          description="Organize SOPs by topic, department, or workflow."
        />
        <FeatureTileDisabled
          title="Versioning (Coming Soon)"
          description="Track revisions and maintain historical SOP versions."
        />
      </FeatureGrid>
    </PageShell>
  );
}
