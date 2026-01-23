// webapp/src/router.tsx
import { createBrowserRouter } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { ROUTES } from "./routes";

/* AUTH */
import LoginPage from "./modules/auth/pages/LoginPage";
import AuthGate from "./modules/auth/AuthGate";

// Admin
import AdminOverviewPage from "./modules/admin/pages/AdminOverviewPage";
import RanchSettingsPage from "./modules/admin/pages/RanchSettingsPage";
import BillingPage from "./modules/admin/pages/BillingPage";
import UserManagementPage from "./modules/admin/pages/UserManagementPage";
import AccountingPage from "./modules/admin/pages/AccountingPage";

// Ranch
import RanchOverviewPage from "./modules/ranch/pages/RanchOverviewPage";

// Herd
import ListHerdPage from "./modules/herd-management/pages/ListHerdPage";
import CreateHerdPage from "./modules/herd-management/pages/CreateHerdPage";
import AnimalInventoryListPage from "./modules/herd-management/pages/AnimalInventoryListPage";
import AnimalIntakeExistingInventoryPage from "./modules/herd-management/pages/AnimalIntakeExistingInventoryPage";

// Land
import LandManagementPage from "./modules/land-management/pages/LandManagementPage";
import ListZonesPage from "./modules/land-management/pages/ListZonesPage";
import CreateZonePage from "./modules/land-management/pages/CreateZonePage";
import EditZonePage from "./modules/land-management/pages/EditZonePage";
import PasturesFencesPage from "./modules/land-management/pages/PasturesFencesPage";
import SoilVegetationPage from "./modules/land-management/pages/SoilVegetationPage";
import WaterPointsPage from "./modules/land-management/pages/WaterPointsPage";
import GrazingPlansPage from "./modules/land-management/pages/GrazingPlansPage";

// Hardware
import HardwareOverviewPage from "./modules/hardware-management/pages/HardwareOverviewPage";
import VehiclesPage from "./modules/hardware-management/pages/VehiclesPage";
import TractorsPage from "./modules/hardware-management/pages/TractorsPage";

// Supplies
import SuppliesOverviewPage from "./modules/supplies/pages/SuppliesOverviewPage";
import FeedPage from "./modules/supplies/pages/FeedPage";
import MineralsPage from "./modules/supplies/pages/MineralsPage";
import MedicationsPage from "./modules/supplies/pages/MedicationsPage";
import MedicationHistoryPage from "./modules/supplies/pages/MedicationHistoryPage";
import MedicationPurchaseDetailPage from "./modules/supplies/pages/MedicationPurchaseDetailPage";
import CreateStandardMedicationsPage from "./modules/supplies/pages/CreateStandardMedicationsPage";
import CreateMedicationPurchasePage from "./modules/supplies/pages/CreateMedicationPurchasePage";
import FuelPage from "./modules/supplies/pages/FuelPage";
import ToolsPage from "./modules/supplies/pages/ToolsPage";

// Services
import ServicesOverviewPage from "./modules/services/pages/ServicesOverviewPage";
import VetsPage from "./modules/services/pages/VetsPage";
import SpecialistsPage from "./modules/services/pages/SpecialistsPage";
import FeedSuppliersPage from "./modules/services/pages/FeedSuppliersPage";
import ContractorsPage from "./modules/services/pages/ContractorsPage";
import EquipmentRentalsPage from "./modules/services/pages/EquipmentRentalsPage";

// Reports
import ReportsOverviewPage from "./modules/reports/pages/ReportsOverviewPage";
import ReportsWorkspacePage from "./modules/reports/pages/ReportsWorkspacePage";

// SOPs
import SOPRepositoryPage from "./modules/sops/pages/SOPRepositoryPage";
import UploadSOPPage from "./modules/sops/pages/UploadSOPPage";
import CreateSOPPage from "./modules/sops/pages/CreateSOPPage";

// Tasks
import TasksOverviewPage from "./modules/tasks/pages/TasksOverviewPage";
import TaskManagementPage from "./modules/tasks/pages/TaskManagementPage";
import CalendarViewPage from "./modules/tasks/pages/CalendarViewPage";
import AppointmentPage from "./modules/tasks/pages/AppointmentPage";

export const router = createBrowserRouter([
  { path: ROUTES.auth.login, element: <LoginPage /> },

  {
    path: ROUTES.ranch.overview, // "/"
    element: <AuthGate />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <RanchOverviewPage /> },

          // Herd
          { path: "herd", element: <ListHerdPage /> },
          { path: "herd/create", element: <CreateHerdPage /> },

          // Animals (Inventory is now first-class)
          { path: "herd/animals", element: <AnimalInventoryListPage /> },

          // Intake (Existing Inventory)
          { path: "herd/animals/intake/existing", element: <AnimalIntakeExistingInventoryPage /> },

          // future:
          // { path: "herd/animals/:animalId", element: <AnimalDetailPage /> },

          // Land
          { path: "land", element: <LandManagementPage /> },
          { path: "land/zones", element: <ListZonesPage /> },
          { path: "land/zones/create", element: <CreateZonePage /> },
          { path: "land/zones/edit/:id", element: <EditZonePage /> },
          { path: "land/pastures", element: <PasturesFencesPage /> },
          { path: "land/water", element: <WaterPointsPage /> },
          { path: "land/soil", element: <SoilVegetationPage /> },
          { path: "land/grazing", element: <GrazingPlansPage /> },

          // Hardware
          { path: "hardware", element: <HardwareOverviewPage /> },
          { path: "hardware/vehicles", element: <VehiclesPage /> },
          { path: "hardware/tractors", element: <TractorsPage /> },

          // Supplies
          { path: "supplies", element: <SuppliesOverviewPage /> },
          { path: "supplies/feed", element: <FeedPage /> },
          { path: "supplies/minerals", element: <MineralsPage /> },
          { path: "supplies/medications", element: <MedicationsPage /> },
          { path: "supplies/medications/:standardMedicationId/history", element: <MedicationHistoryPage /> },
          { path: "supplies/medications/purchases/:purchaseId", element: <MedicationPurchaseDetailPage /> },
          { path: "supplies/medications/standards/create", element: <CreateStandardMedicationsPage /> },
          { path: "supplies/medications/purchases/create", element: <CreateMedicationPurchasePage /> },
          { path: "supplies/fuel", element: <FuelPage /> },
          { path: "supplies/tools", element: <ToolsPage /> },

          // Services
          { path: "services", element: <ServicesOverviewPage /> },
          { path: "services/vets", element: <VetsPage /> },
          { path: "services/specialists", element: <SpecialistsPage /> },
          { path: "services/feed", element: <FeedSuppliersPage /> },
          { path: "services/contractors", element: <ContractorsPage /> },
          { path: "services/rentals", element: <EquipmentRentalsPage /> },

          // Reports
          { path: "reports", element: <ReportsOverviewPage /> },
          { path: "reports/workspace", element: <ReportsWorkspacePage /> },

          // Tasks
          { path: "tasks", element: <TasksOverviewPage /> },
          { path: "tasks/manage", element: <TaskManagementPage /> },
          { path: "tasks/appointments", element: <AppointmentPage /> },
          { path: "tasks/calendar", element: <CalendarViewPage /> },

          // SOPs
          { path: "sops", element: <SOPRepositoryPage /> },
          { path: "sops/upload", element: <UploadSOPPage /> },
          { path: "sops/create", element: <CreateSOPPage /> },

          // Admin
          { path: "admin", element: <AdminOverviewPage /> },
          { path: "admin/ranch", element: <RanchSettingsPage /> },
          { path: "admin/users", element: <UserManagementPage /> },
          { path: "admin/billing", element: <BillingPage /> },
          { path: "admin/accounting", element: <AccountingPage /> },
        ],
      },
    ],
  },
]);
