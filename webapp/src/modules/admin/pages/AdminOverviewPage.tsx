export default function AdminOverviewPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Administration</h1>
        <p className="text-stone-600 mt-1">
          Manage users, billing, permissions, and ranch-wide administrative settings.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* User Management */}
        <a
          href="/admin/users"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">User Management</h2>
          <p className="text-stone-600 mt-1">
            Add users, assign roles, and manage access permissions.
          </p>
        </a>

        {/* Billing */}
        <a
          href="/admin/billing"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Billing</h2>
          <p className="text-stone-600 mt-1">
            View invoices, update payment methods, and manage subscriptions.
          </p>
        </a>

        {/* Accounting */}
        <a
          href="/admin/accounting"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Accounting</h2>
          <p className="text-stone-600 mt-1">
            Track ranch expenses, revenue, and financial summaries.
          </p>
        </a>

        {/* Audit Logs (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Audit Logs (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Review system activity and administrative changes.
          </p>
        </div>

      </section>
    </div>
  );
}