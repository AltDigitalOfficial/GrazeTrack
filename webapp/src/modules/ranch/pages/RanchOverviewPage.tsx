export default function RanchOverviewPage() {
  return (
    <div className="p-6 space-y-8">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Ranch Overview</h1>
        <p className="text-stone-600 mt-1">
          A high-level snapshot of your ranch operations for the week ahead.
        </p>
      </header>

      {/* GRID: Herd Summary • Weather • Tasks */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* HERD POPULATION SUMMARY */}
        <div className="col-span-1 p-5 border border-stone-300 rounded-lg shadow-sm bg-white">
          <h2 className="text-xl font-semibold text-stone-800">Herd Population</h2>
          <p className="text-stone-600 mt-1">
            Current counts across all herd groups.
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex justify-between text-stone-700">
              <span>Total Animals</span>
              <span className="font-semibold text-stone-900">—</span>
            </div>

            <div className="flex justify-between text-stone-700">
              <span>Cows</span>
              <span className="font-semibold text-stone-900">—</span>
            </div>

            <div className="flex justify-between text-stone-700">
              <span>Calves</span>
              <span className="font-semibold text-stone-900">—</span>
            </div>

            <div className="flex justify-between text-stone-700">
              <span>Bulls</span>
              <span className="font-semibold text-stone-900">—</span>
            </div>
          </div>
        </div>

        {/* WEATHER REPORT */}
        <div className="col-span-1 p-5 border border-stone-300 rounded-lg shadow-sm bg-white">
          <h2 className="text-xl font-semibold text-stone-800">Weather</h2>
          <p className="text-stone-600 mt-1">
            Local conditions for planning grazing and operations.
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex justify-between text-stone-700">
              <span>Today</span>
              <span className="font-semibold text-stone-900">—</span>
            </div>

            <div className="flex justify-between text-stone-700">
              <span>High / Low</span>
              <span className="font-semibold text-stone-900">— / —</span>
            </div>

            <div className="flex justify-between text-stone-700">
              <span>Conditions</span>
              <span className="font-semibold text-stone-900">—</span>
            </div>

            <div className="flex justify-between text-stone-700">
              <span>Wind</span>
              <span className="font-semibold text-stone-900">—</span>
            </div>
          </div>
        </div>

        {/* UPCOMING TASKS */}
        <div className="col-span-1 p-5 border border-stone-300 rounded-lg shadow-sm bg-white">
          <h2 className="text-xl font-semibold text-stone-800">This Week’s Tasks</h2>
          <p className="text-stone-600 mt-1">
            Scheduled work and appointments for the next 7 days.
          </p>

          <ul className="mt-4 space-y-3 text-stone-700">
            <li className="flex justify-between border-b border-stone-200 pb-2">
              <span>—</span>
              <span className="font-semibold text-stone-900">—</span>
            </li>
            <li className="flex justify-between border-b border-stone-200 pb-2">
              <span>—</span>
              <span className="font-semibold text-stone-900">—</span>
            </li>
            <li className="flex justify-between border-b border-stone-200 pb-2">
              <span>—</span>
              <span className="font-semibold text-stone-900">—</span>
            </li>
          </ul>
        </div>

      </section>

      {/* FUTURE: More Dashboard Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div className="p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">Grazing Status (Coming Soon)</h2>
          <p className="text-stone-500 mt-1">
            Pasture readiness, rest periods, and grazing rotation insights.
          </p>
        </div>

        <div className="p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">Hardware Readiness (Coming Soon)</h2>
          <p className="text-stone-500 mt-1">
            Vehicle and equipment status at a glance.
          </p>
        </div>

      </section>
    </div>
  );
}