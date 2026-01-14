import { Routes, Route, Navigate } from "react-router-dom";
import { Shell } from "@/components/layout/Shell";

/* AUTH */
import LoginPage from "@/modules/auth/pages/LoginPage";
import AuthGate from "@/modules/auth/AuthGate";

/* ---------------------------
   RANCH OVERVIEW
---------------------------- */
import RanchOverviewPage from "@/modules/ranch/pages/RanchOverviewPage";

/* ---------------------------
   HERD MANAGEMENT
---------------------------- */
import HerdOverviewPage from "@/modules/herd-management/pages/HerdOverviewPage";
import DefineHerdPage from "@/modules/herd-management/pages/DefineHerdPage";
import ManageAnimalsPage from "@/modules/herd-management/pages/ManageAnimalsPage";
import HealthLogsPage from "@/modules/herd-management/pages/HealthLogsPage";

/* ---------------------------
   LAND MANAGEMENT
---------------------------- */
import LandManagementPage from "@/modules/land-management/pages/LandManagementPage";
import DefineZonesPage from "@/modules/land-management/pages/DefineZonesPage";
import PasturesFencesPage from "@/modules/land-management/pages/PasturesFencesPage";
import WaterPointsPage from "@/modules/land-management/pages/WaterPointsPage";
import SoilVegetationPage from "@/modules/land-management/pages/SoilVegetationPage";
import GrazingPlansPage from "@/modules/land-management/pages/GrazingPlansPage";

/* ---------------------------
   HARDWARE MANAGEMENT
---------------------------- */
import HardwareOverviewPage from "@/modules/hardware-management/pages/HardwareOverviewPage";
import VehiclesPage from "@/modules/hardware-management/pages/VehiclesPage";
import TractorsPage from "@/modules/hardware-management/pages/TractorsPage";

/* ---------------------------
   SUPPLIES & CONSUMABLES
---------------------------- */
import SuppliesOverviewPage from "@/modules/supplies/pages/SuppliesOverviewPage";
import FeedPage from "@/modules/supplies/pages/FeedPage";
import MineralsPage from "@/modules/supplies/pages/MineralsPage";
import MedicationsPage from "@/modules/supplies/pages/MedicationsPage";
import FuelPage from "@/modules/supplies/pages/FuelPage";
import ToolsPage from "@/modules/supplies/pages/ToolsPage";

/* ---------------------------
   SERVICES & SUPPLIERS
---------------------------- */
import ServicesOverviewPage from "@/modules/services/pages/ServicesOverviewPage";
import VetsPage from "@/modules/services/pages/VetsPage";
import SpecialistsPage from "@/modules/services/pages/SpecialistsPage";
import FeedSuppliersPage from "@/modules/services/pages/FeedSuppliersPage";
import ContractorsPage from "@/modules/services/pages/ContractorsPage";
import EquipmentRentalsPage from "@/modules/services/pages/EquipmentRentalsPage";

/* ---------------------------
   REPORTS
---------------------------- */
import ReportsOverviewPage from "@/modules/reports/pages/ReportsOverviewPage";

/* ---------------------------
   TASKS & SCHEDULING
---------------------------- */
import TasksOverviewPage from "@/modules/tasks/pages/TasksOverviewPage";
import TaskManagementPage from "@/modules/tasks/pages/TaskManagementPage";
import CalendarViewPage from "@/modules/tasks/pages/CalendarViewPage";
import AppointmentPage from "@/modules/tasks/pages/AppointmentPage";

/* ---------------------------
   SOPs
---------------------------- */
import SOPRepositoryPage from "@/modules/sops/pages/SOPRepositoryPage";

/* ---------------------------
   ADMINISTRATION
---------------------------- */
import AdminOverviewPage from "@/modules/admin/pages/AdminOverviewPage";
import UserManagementPage from "@/modules/admin/pages/UserManagementPage";
import BillingPage from "@/modules/admin/pages/BillingPage";
import AccountingPage from "@/modules/admin/pages/AccountingPage";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected app */}
      <Route
        element={
          <AuthGate>
            <Shell />
          </AuthGate>
        }
      >
        {/* RANCH OVERVIEW */}
        <Route path="/" element={<RanchOverviewPage />} />

        {/* HERD MANAGEMENT */}
        <Route path="/herd" element={<HerdOverviewPage />} />
        <Route path="/herd/define-herd" element={<DefineHerdPage />} />
        <Route path="/herd/manage-animals" element={<ManageAnimalsPage />} />
        <Route path="/herd/health-records" element={<HealthLogsPage />} />

        {/* LAND MANAGEMENT */}
        <Route path="/land-management" element={<LandManagementPage />} />
        <Route path="/land-management/zones" element={<DefineZonesPage />} />
        <Route
          path="/land-management/pastures-fences"
          element={<PasturesFencesPage />}
        />
        <Route path="/land-management/water-points" element={<WaterPointsPage />} />
        <Route
          path="/land-management/soil-vegetation"
          element={<SoilVegetationPage />}
        />
        <Route
          path="/land-management/grazing-plans"
          element={<GrazingPlansPage />}
        />

        {/* HARDWARE MANAGEMENT */}
        <Route path="/hardware" element={<HardwareOverviewPage />} />
        <Route path="/hardware/vehicles" element={<VehiclesPage />} />
        <Route path="/hardware/tractors" element={<TractorsPage />} />

        {/* SUPPLIES */}
        <Route path="/supplies" element={<SuppliesOverviewPage />} />
        <Route path="/supplies/feed" element={<FeedPage />} />
        <Route path="/supplies/minerals" element={<MineralsPage />} />
        <Route path="/supplies/medications" element={<MedicationsPage />} />
        <Route path="/supplies/fuel" element={<FuelPage />} />
        <Route path="/supplies/tools" element={<ToolsPage />} />

        {/* SERVICES */}
        <Route path="/services" element={<ServicesOverviewPage />} />
        <Route path="/services/vets" element={<VetsPage />} />
        <Route path="/services/specialists" element={<SpecialistsPage />} />
        <Route
          path="/services/feed-suppliers"
          element={<FeedSuppliersPage />}
        />
        <Route path="/services/contractors" element={<ContractorsPage />} />
        <Route
          path="/services/equipment-rentals"
          element={<EquipmentRentalsPage />}
        />

        {/* REPORTS */}
        <Route path="/reports" element={<ReportsOverviewPage />} />

        {/* TASKS */}
        <Route path="/tasks" element={<TasksOverviewPage />} />
        <Route path="/tasks/manage" element={<TaskManagementPage />} />
        <Route path="/tasks/appointments" element={<AppointmentPage />} />
        <Route path="/tasks/calendar" element={<CalendarViewPage />} />

        {/* SOPs */}
        <Route path="/sops" element={<SOPRepositoryPage />} />

        {/* ADMIN */}
        <Route path="/admin" element={<AdminOverviewPage />} />
        <Route path="/admin/users" element={<UserManagementPage />} />
        <Route path="/admin/billing" element={<BillingPage />} />
        <Route path="/admin/accounting" element={<AccountingPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
