// Sidebar.tsx
import { NavLink, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { ROUTES } from "@/routes";
import { useRanch } from "@/lib/ranchContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Sidebar() {
  const location = useLocation();
  const { me, activeRanchId, loading, setActiveRanchId } = useRanch();

  // Active section detection (match ROUTES prefixes)
  const herdActive = location.pathname.startsWith(ROUTES.herd.root);
  const landActive = location.pathname.startsWith(ROUTES.land.root);
  const hardwareActive = location.pathname.startsWith("/hardware");
  const suppliesActive = location.pathname.startsWith(ROUTES.supplies.root);
  const servicesActive = location.pathname.startsWith(ROUTES.services.root);
  const tasksActive = location.pathname.startsWith(ROUTES.tasks.root);
  const adminActive = location.pathname.startsWith(ROUTES.admin.root);
  const feedActive = location.pathname.startsWith("/supplies/feed");
  const fuelActive = location.pathname.startsWith("/supplies/fuel");
  const equipmentActive =
    location.pathname.startsWith("/supplies/equipment") ||
    location.pathname === "/supplies/tools";

  const linkClasses = ({ isActive }: { isActive: boolean }) =>
    `block px-2 py-1 rounded ${
      isActive
        ? "bg-green-100 text-green-800 font-semibold"
        : "text-stone-100 hover:bg-stone-700"
    }`;

  const nestedLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `block px-2 py-1 rounded text-sm ml-4 ${
      isActive
        ? "bg-green-100 text-green-800 font-semibold"
        : "text-stone-200 hover:bg-stone-600"
    }`;

  const subNestedLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `block px-2 py-1 rounded text-sm ml-8 ${
      isActive
        ? "bg-green-100 text-green-800 font-semibold"
        : "text-stone-300 hover:bg-stone-600"
    }`;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("currentRanchId");
      // AuthGate / router will redirect to /login
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Derive ranch name from context
  const ranchName = (() => {
    if (loading) return "Loading ranch…";
    if (!me || !activeRanchId) return "No ranch selected";

    const match = me.ranches.find((r) => r.ranchId === activeRanchId);
    return match?.ranchName ?? "Unknown ranch";
  })();

  return (
    <aside className="w-64 text-stone-100 relative h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-stone-600 shrink-0">
        <h2 className="text-lg font-bold text-amber-400">GrazeTrack</h2>
        <div className="text-sm text-stone-300 mt-1 truncate">{ranchName}</div>
        {!loading && (me?.ranches?.length ?? 0) > 1 && (
          <div className="mt-2">
            <Select
              value={activeRanchId ?? ""}
              onValueChange={(value) => setActiveRanchId(value || null)}
            >
              <SelectTrigger aria-label="Active ranch" className="h-8 bg-stone-800 border-stone-600 text-stone-100">
                <SelectValue placeholder="Select ranch" />
              </SelectTrigger>
              <SelectContent>
                {me?.ranches.map((r) => (
                  <SelectItem key={r.ranchId} value={r.ranchId}>
                    {r.ranchName ?? r.ranchId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Scrollable nav - takes up space between header and footer */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 pb-20 min-h-0">
        <div className="flex flex-col space-y-2">
          {/* RANCH OVERVIEW */}
          <NavLink to={ROUTES.ranch.overview} className={linkClasses}>
            Ranch Overview
          </NavLink>

          {/* HERD MANAGEMENT */}
          <div>
            <NavLink
              to={ROUTES.herd.root}
              className={({ isActive }) =>
                `block px-2 py-1 rounded font-semibold ${
                  herdActive || isActive
                    ? "bg-green-100 text-green-800"
                    : "text-stone-100 hover:bg-stone-700"
                }`
              }
            >
              Herd Management
            </NavLink>

            {herdActive && (
              <div className="mt-1 space-y-1">
                <NavLink to={ROUTES.herd.create} className={nestedLinkClasses}>
                  Herds
                </NavLink>

                {/* Animals inventory (first page = AnimalInventoryListPage.tsx) */}
                <NavLink to={ROUTES.herd.animals} className={nestedLinkClasses}>
                  Animals
                </NavLink>

                {/* Health Records removed (will live on animal detail) */}
              </div>
            )}
          </div>

          {/* LAND MANAGEMENT */}
          <div>
            <NavLink
              to={ROUTES.land.root}
              className={({ isActive }) =>
                `block px-2 py-1 rounded font-semibold ${
                  landActive || isActive
                    ? "bg-green-100 text-green-800"
                    : "text-stone-100 hover:bg-stone-700"
                }`
              }
            >
              Land Management
            </NavLink>

            {landActive && (
              <div className="mt-1 space-y-1">
                <NavLink to={ROUTES.land.zonesList} className={nestedLinkClasses}>
                  Zones
                </NavLink>

                <NavLink to={ROUTES.land.pastures} className={nestedLinkClasses}>
                  Pastures & Fences
                </NavLink>

                <NavLink to={ROUTES.land.water} className={nestedLinkClasses}>
                  Water Points
                </NavLink>

                <NavLink to={ROUTES.land.soil} className={nestedLinkClasses}>
                  Soil & Vegetation
                </NavLink>

                <NavLink to={ROUTES.land.grazing} className={nestedLinkClasses}>
                  Grazing Plans
                </NavLink>
              </div>
            )}
          </div>

          {/* HARDWARE MANAGEMENT */}
          <div>
            <NavLink
              to={ROUTES.hardware.root}
              className={({ isActive }) =>
                `block px-2 py-1 rounded font-semibold ${
                  hardwareActive || isActive
                    ? "bg-green-100 text-green-800"
                    : "text-stone-100 hover:bg-stone-700"
                }`
              }
            >
              Hardware Management
            </NavLink>

            {hardwareActive && (
              <div className="mt-1 space-y-1">
                <NavLink to={ROUTES.hardware.assetsOverview} className={nestedLinkClasses}>
                  Assets Overview
                </NavLink>

                <NavLink to={ROUTES.hardware.maintenanceLog} className={nestedLinkClasses}>
                  Maintenance Log
                </NavLink>
              </div>
            )}
          </div>

          {/* SUPPLIES */}
          <div>
            <NavLink
              to={ROUTES.supplies.root}
              className={({ isActive }) =>
                `block px-2 py-1 rounded font-semibold ${
                  suppliesActive || isActive
                    ? "bg-green-100 text-green-800"
                    : "text-stone-100 hover:bg-stone-700"
                }`
              }
            >
              Supplies & Consumables
            </NavLink>

            {suppliesActive && (
              <div className="mt-1 space-y-1">
                <NavLink
                  to={ROUTES.supplies.feed}
                  className={({ isActive }) =>
                    `block px-2 py-1 rounded text-sm ml-4 font-semibold ${
                      feedActive || isActive
                        ? "bg-green-100 text-green-800"
                        : "text-stone-200 hover:bg-stone-600"
                    }`
                  }
                >
                  Feed
                </NavLink>

                {feedActive && (
                  <div className="space-y-1">
                    <NavLink to={ROUTES.supplies.feedComponents} className={subNestedLinkClasses}>
                      Components
                    </NavLink>

                    <NavLink to={ROUTES.supplies.feedBlends} className={subNestedLinkClasses}>
                      Blends
                    </NavLink>

                    <NavLink to={ROUTES.supplies.feedPurchases} className={subNestedLinkClasses}>
                      Purchases
                    </NavLink>

                    <NavLink to={ROUTES.supplies.feedInventory} className={subNestedLinkClasses}>
                      Inventory
                    </NavLink>
                  </div>
                )}

                <NavLink to={ROUTES.supplies.additives} className={nestedLinkClasses}>
                  Additives
                </NavLink>

                <NavLink to={ROUTES.supplies.medications} className={nestedLinkClasses}>
                  Medications
                </NavLink>

                <NavLink
                  to={ROUTES.supplies.fuel}
                  className={({ isActive }) =>
                    `block px-2 py-1 rounded text-sm ml-4 font-semibold ${
                      fuelActive || isActive
                        ? "bg-green-100 text-green-800"
                        : "text-stone-200 hover:bg-stone-600"
                    }`
                  }
                >
                  Fuel & Fluids
                </NavLink>

                {fuelActive && (
                  <div className="space-y-1">
                    <NavLink to={ROUTES.supplies.fuelProducts} className={subNestedLinkClasses}>
                      Products
                    </NavLink>

                    <NavLink to={ROUTES.supplies.fuelPurchases} className={subNestedLinkClasses}>
                      Purchases
                    </NavLink>

                    <NavLink to={ROUTES.supplies.fuelInventory} className={subNestedLinkClasses}>
                      Inventory
                    </NavLink>
                  </div>
                )}

                <NavLink
                  to={ROUTES.supplies.equipmentAssets}
                  className={({ isActive }) =>
                    `block px-2 py-1 rounded text-sm ml-4 font-semibold ${
                      equipmentActive || isActive
                        ? "bg-green-100 text-green-800"
                        : "text-stone-200 hover:bg-stone-600"
                    }`
                  }
                >
                  Equipment
                </NavLink>

                {equipmentActive && (
                  <div className="space-y-1">
                    <NavLink to={ROUTES.supplies.equipmentAssets} className={subNestedLinkClasses}>
                      Assets
                    </NavLink>

                    <NavLink to={ROUTES.supplies.equipmentParts} className={subNestedLinkClasses}>
                      Parts & Supplies
                    </NavLink>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SERVICES */}
          <div>
            <NavLink
              to={ROUTES.services.root}
              className={({ isActive }) =>
                `block px-2 py-1 rounded font-semibold ${
                  servicesActive || isActive
                    ? "bg-green-100 text-green-800"
                    : "text-stone-100 hover:bg-stone-700"
                }`
              }
            >
              Services & Suppliers
            </NavLink>

            {servicesActive && (
              <div className="mt-1 space-y-1">
                <NavLink to={ROUTES.services.vets} className={nestedLinkClasses}>
                  Vets
                </NavLink>

                <NavLink to={ROUTES.services.specialists} className={nestedLinkClasses}>
                  Specialists
                </NavLink>

                <NavLink to={ROUTES.services.feedSuppliers} className={nestedLinkClasses}>
                  Feed Suppliers
                </NavLink>

                <NavLink to={ROUTES.services.contractors} className={nestedLinkClasses}>
                  Contractors
                </NavLink>

                <NavLink to={ROUTES.services.equipmentRentals} className={nestedLinkClasses}>
                  Equipment Rentals
                </NavLink>
              </div>
            )}
          </div>

          {/* REPORTS */}
          <NavLink to={ROUTES.reports.root} className={linkClasses}>
            Reports & Analytics
          </NavLink>

          {/* TASKS */}
          <div>
            <NavLink
              to={ROUTES.tasks.root}
              className={({ isActive }) =>
                `block px-2 py-1 rounded font-semibold ${
                  tasksActive || isActive
                    ? "bg-green-100 text-green-800"
                    : "text-stone-100 hover:bg-stone-700"
                }`
              }
            >
              Tasks & Scheduling
            </NavLink>

            {tasksActive && (
              <div className="mt-1 space-y-1">
                <NavLink to={ROUTES.tasks.manage} className={nestedLinkClasses}>
                  Task Management
                </NavLink>

                <NavLink to={ROUTES.tasks.appointments} className={nestedLinkClasses}>
                  Appointments
                </NavLink>

                <NavLink to={ROUTES.tasks.calendar} className={nestedLinkClasses}>
                  Calendar View
                </NavLink>
              </div>
            )}
          </div>

          {/* SOPs */}
          <NavLink to={ROUTES.sops.root} className={linkClasses}>
            Standard Operating Procedures
          </NavLink>

          {/* ADMIN */}
          <div>
            <NavLink
              to={ROUTES.admin.root}
              className={({ isActive }) =>
                `block px-2 py-1 rounded font-semibold ${
                  adminActive || isActive
                    ? "bg-green-100 text-green-800"
                    : "text-stone-100 hover:bg-stone-700"
                }`
              }
            >
              Administration
            </NavLink>

            {adminActive && (
              <div className="mt-1 space-y-1">
                <NavLink to={ROUTES.admin.ranch} className={nestedLinkClasses}>
                  Ranch Settings
                </NavLink>

                <NavLink to={ROUTES.admin.users} className={nestedLinkClasses}>
                  User Management
                </NavLink>

                <NavLink to={ROUTES.admin.billing} className={nestedLinkClasses}>
                  Billing
                </NavLink>

                <NavLink to={ROUTES.admin.accounting} className={nestedLinkClasses}>
                  Accounting
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Absolutely positioned logout button - always at bottom of sidebar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-stone-700 border-t border-stone-600">
        <Button
          type="button"
          onClick={handleLogout}
          className="w-full rounded px-3 py-2 text-sm font-semibold bg-stone-600 hover:bg-stone-500 text-stone-100"
        >
          Logout
        </Button>
      </div>
    </aside>
  );
}
