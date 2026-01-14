export default function TasksOverviewPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Tasks & Scheduling</h1>
        <p className="text-stone-600 mt-1">
          Define tasks, assign responsibilities, and view upcoming work across your ranch.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Task Management */}
        <a
          href="/tasks/manage"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Task Management</h2>
          <p className="text-stone-600 mt-1">
            Create tasks, assign them to team members, and track progress.
          </p>
        </a>

        {/* Calendar View */}
        <a
          href="/tasks/calendar"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Calendar View</h2>
          <p className="text-stone-600 mt-1">
            View tasks, events, and deadlines on a unified ranch calendar.
          </p>
        </a>

        {/* Workflows (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Workflows (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Automate recurring tasks and seasonal operations.
          </p>
        </div>

        {/* Crew Assignments (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Appointments (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Track appointments, details, and locations.
          </p>
        </div>

        {/* Crew Assignments (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Crew Assignments (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Assign tasks to ranch hands and track completion.
          </p>
        </div>

      </section>
    </div>
  );
}