export default function HardwareOverviewPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Hardware Management</h1>
        <p className="text-stone-600 mt-1">
          Track and manage ranch vehicles, tractors, and equipment assets.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Vehicles */}
        <a
          href="/hardware/vehicles"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Vehicles</h2>
          <p className="text-stone-600 mt-1">
            Manage trucks, ATVs, UTVs, and other ranch vehicles.
          </p>
        </a>

        {/* Tractors */}
        <a
          href="/hardware/tractors"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Tractors</h2>
          <p className="text-stone-600 mt-1">
            Track tractors, implements, and maintenance schedules.
          </p>
        </a>

        {/* IoT Devices (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            IoT Devices (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Monitor sensors, cameras, and connected ranch hardware.
          </p>
        </div>

        {/* Equipment Health (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Equipment Health (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Track maintenance intervals, repairs, and operational readiness.
          </p>
        </div>

      </section>
    </div>
  );
}