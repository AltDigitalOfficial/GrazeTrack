export default function SOPRepositoryPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <header>
        <h1 className="text-3xl font-bold text-stone-800">
          Standard Operating Procedures
        </h1>
        <p className="text-stone-600 mt-1">
          Store, organize, and reference your ranch’s SOPs in one central location.
        </p>
      </header>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Upload Document */}
        <a
          href="/sops/upload"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Upload Document</h2>
          <p className="text-stone-600 mt-1">
            Add PDFs, Word documents, or reference files to your SOP library.
          </p>
        </a>

        {/* Create SOP */}
        <a
          href="/sops/create"
          className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-white hover:shadow-md transition"
        >
          <h2 className="text-xl font-semibold text-stone-800">Create SOP</h2>
          <p className="text-stone-600 mt-1">
            Write a new SOP directly in GrazeTrack using the built‑in editor.
          </p>
        </a>

        {/* Categories (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Categories (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Organize SOPs by topic, department, or workflow.
          </p>
        </div>

        {/* Versioning (Coming Soon) */}
        <div className="block p-5 border border-stone-300 rounded-lg shadow-sm bg-stone-100 opacity-60 cursor-not-allowed">
          <h2 className="text-xl font-semibold text-stone-500">
            Versioning (Coming Soon)
          </h2>
          <p className="text-stone-500 mt-1">
            Track revisions and maintain historical SOP versions.
          </p>
        </div>

      </section>
    </div>
  );
}