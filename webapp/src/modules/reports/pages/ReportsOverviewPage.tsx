export default function ReportsOverviewPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Reports & Analytics</h1>
        <p className="text-stone-600 mt-1">
          View operational insights, performance metrics, and ranch-wide analytics.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Herd Performance */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 cursor-not-allowed opacity-60">
          <h2 className="text-xl font-semibold text-stone-500">
            Herd Performance (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Analyze weight gain, health trends, and herd productivity.
          </p>
        </div>

        {/* Grazing Efficiency */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 cursor-not-allowed opacity-60">
          <h2 className="text-xl font-semibold text-stone-500">
            Grazing Efficiency (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Evaluate pasture utilization and grazing rotation effectiveness.
          </p>
        </div>

        {/* Cost Analysis */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 cursor-not-allowed opacity-60">
          <h2 className="text-xl font-semibold text-stone-500">
            Cost Analysis (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Track operational costs and identify opportunities for savings.
          </p>
        </div>

        {/* Custom Reports */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 cursor-not-allowed opacity-60">
          <h2 className="text-xl font-semibold text-stone-500">
            Custom Reports (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Build custom dashboards tailored to your ranch’s needs.
          </p>
        </div>

      </section>
    </div>
  );
}