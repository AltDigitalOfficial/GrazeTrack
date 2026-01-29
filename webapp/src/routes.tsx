// webapp/src/routes.tsx
export const ROUTES = {
  auth: {
    login: "/login",
  },

  ranch: {
    overview: "/",
  },

  herd: {
    root: "/herd",
    list: "/herd",
    edit: "/herd/create",
    create: "/herd/create",

    // Animals (Inventory)
    animals: "/herd/animals",
    animalDetail: "/herd/animals/:animalId",

    // Intake (future-safe, explicit)
    animalIntakeRoot: "/herd/animals/intake",
    animalIntakeBirth: "/herd/animals/intake/birth",
    animalIntakeBirthBatch: "/herd/animals/intake/birth/batch",
    animalIntakePurchase: "/herd/animals/intake/purchase",
    animalIntakeExisting: "/herd/animals/intake/existing",
  },

  land: {
    root: "/land",
    zonesList: "/land/zones",
    zonesCreate: "/land/zones/create",
    zonesEdit: "/land/zones/edit/:id",
    pastures: "/land/pastures",
    water: "/land/water",
    soil: "/land/soil",
    grazing: "/land/grazing",
  },

  hardware: {
    root: "/hardware",
    vehicles: "/hardware/vehicles",
    tractors: "/hardware/tractors",
  },

  supplies: {
    root: "/supplies",
    feed: "/supplies/feed",
    minerals: "/supplies/minerals",

    medications: "/supplies/medications",
    medicationsStandardsCreate: "/supplies/medications/standards/create",
    medicationsPurchasesCreate: "/supplies/medications/purchases/create",

    fuel: "/supplies/fuel",
    tools: "/supplies/tools",
  },

  services: {
    root: "/services",
    vets: "/services/vets",
    specialists: "/services/specialists",
    feedSuppliers: "/services/feed",
    contractors: "/services/contractors",
    equipmentRentals: "/services/rentals",
  },

  reports: {
    root: "/reports",
    workspace: "/reports/workspace",
  },

  tasks: {
    root: "/tasks",
    manage: "/tasks/manage",
    appointments: "/tasks/appointments",
    calendar: "/tasks/calendar",
  },

  sops: {
    root: "/sops",
    upload: "/sops/upload",
    create: "/sops/create",
  },

  admin: {
    root: "/admin",
    ranch: "/admin/ranch",
    users: "/admin/users",
    billing: "/admin/billing",
    accounting: "/admin/accounting",
  },
} as const;
