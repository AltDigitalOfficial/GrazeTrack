import { FeedComponentsManager } from "@/modules/supplies/pages/FeedComponentsPage";

export default function AdditivesPage() {
  return (
    <FeedComponentsManager
      title="Additives"
      description="Manage food and water additives, including minerals, supplements, vitamins, and electrolytes."
      noRanchMessage="Select a ranch to manage additives."
      createTitle="Add Additive"
      editTitle="Edit Additive"
      createSubmitLabel="Add Additive"
      editSubmitLabel="Save Additive"
      listTitle="Additives"
      emptyListMessage="No additives yet."
      defaultFormCategory="MINERAL"
      defaultCategoryFilter="ADDITIVE_SET"
    />
  );
}
