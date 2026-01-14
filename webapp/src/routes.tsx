
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
    animals: "/herd/animals",
    health: "/herd/health",
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

