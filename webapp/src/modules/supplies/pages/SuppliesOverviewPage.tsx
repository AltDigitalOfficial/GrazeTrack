import { ROUTES } from "@/routes";

export default function SuppliesOverviewPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">
          Supplies & Consumables
        </h1>
        <p className="text-stone-600 mt-1">
          Manage feed, minerals, medications, fuel, and tools used across your ranch.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Feed */}
        <a
          href={ROUTES.supplies.feed}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Feed</h2>
          <p className="text-stone-600 mt-1">
            Track feed inventory, usage, and storage.
          </p>
        </a>

        {/* Minerals */}
        <a
          href={ROUTES.supplies.minerals}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Minerals</h2>
          <p className="text-stone-600 mt-1">
            Manage mineral supplements and consumption.
          </p>
        </a>

        {/* Medications */}
        <a
          href={ROUTES.supplies.medications}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Medications</h2>
          <p className="text-stone-600 mt-1">
            Track veterinary medications and treatment supplies.
          </p>
        </a>

        {/* Fuel */}
        <a
          href={ROUTES.supplies.fuel}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Fuel</h2>
          <p className="text-stone-600 mt-1">
            Monitor fuel storage, usage, and deliveries.
          </p>
        </a>

        {/* Tools */}
        <a
          href={ROUTES.supplies.tools}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Tools</h2>
          <p className="text-stone-600 mt-1">
            Track tools, repairs, and replacements.
          </p>
        </a>

      </section>
    </div>
  );
}
