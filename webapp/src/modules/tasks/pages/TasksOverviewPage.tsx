import { ROUTES } from "@/routes";
import { FeatureGrid, FeatureTileDisabled, FeatureTileLink, PageShell } from "@/components/ui/page-shell";

export default function TasksOverviewPage() {
  return (
    <PageShell
      title="Tasks & Scheduling"
      description="Define tasks, assign responsibilities, and view upcoming work across your ranch."
    >
      <FeatureGrid>
        <FeatureTileLink
          to={ROUTES.tasks.manage}
          title="Task Management"
          description="Create tasks, assign them to team members, and track progress."
        />
        <FeatureTileLink
          to={ROUTES.tasks.calendar}
          title="Calendar View"
          description="View tasks, events, and deadlines on a unified ranch calendar."
        />
        <FeatureTileDisabled
          title="Workflows (Coming Soon)"
          description="Automate recurring tasks and seasonal operations."
        />
        <FeatureTileDisabled
          title="Appointments (Coming Soon)"
          description="Track appointments, details, and locations."
        />
        <FeatureTileDisabled
          title="Crew Assignments (Coming Soon)"
          description="Assign tasks to ranch hands and track completion."
        />
      </FeatureGrid>
    </PageShell>
  );
}
