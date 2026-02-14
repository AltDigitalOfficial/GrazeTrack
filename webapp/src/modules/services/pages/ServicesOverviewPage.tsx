import { ROUTES } from "@/routes";

export default function ServicesOverviewPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Services & Suppliers</h1>
        <p className="text-stone-600 mt-1">
          Manage veterinary services, specialists, contractors, and supply partners.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Vets */}
        <a
          href={ROUTES.services.vets}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Vets</h2>
          <p className="text-stone-600 mt-1">
            Manage veterinary contacts, visits, and service history.
          </p>
        </a>

        {/* Specialists */}
        <a
          href={ROUTES.services.specialists}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Specialists</h2>
          <p className="text-stone-600 mt-1">
            Track farriers, nutritionists, and other specialists.
          </p>
        </a>

        {/* Feed Suppliers */}
        <a
          href={ROUTES.services.feedSuppliers}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Feed Suppliers</h2>
          <p className="text-stone-600 mt-1">
            Manage feed vendors, deliveries, and purchase history.
          </p>
        </a>

        {/* Contractors */}
        <a
          href={ROUTES.services.contractors}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Contractors</h2>
          <p className="text-stone-600 mt-1">
            Track fencing crews, welders, builders, and other contractors.
          </p>
        </a>

        {/* Equipment Rentals */}
        <a
          href={ROUTES.services.equipmentRentals}
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Equipment Rentals</h2>
          <p className="text-stone-600 mt-1">
            Manage rental equipment, schedules, and service providers.
          </p>
        </a>

      </section>
    </div>
  );
}
