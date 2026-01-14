export default function LandManagementPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Land Management</h1>
        <p className="text-stone-600 mt-1">
          Manage your ranch’s land assets, including pasture boundaries,
          infrastructure, and environmental data.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Define Zones */}
        <a
          href="/land-management/zones"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Define Zones</h2>
          <p className="text-stone-600 mt-1">
            Draw and manage pasture boundaries directly on the ranch map.
          </p>
        </a>

        {/* Fencing (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Fencing (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Map permanent and temporary fencing lines.
          </p>
        </div>

        {/* Water Points (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Water Points (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Track troughs, tanks, wells, and natural water sources.
          </p>
        </div>

        {/* Soil & Vegetation (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Soil & Vegetation (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Integrate soil data, forage quality, and vegetation layers.
          </p>
        </div>

      </section>
    </div>
  );
}