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
import AnimalIntakeBirthBatchPage from        "./modules/herd-management/pages/AnimalIntakeBirthBatchPage";

// Land
import LandManagementPage from "./modules/land-management/pages/LandManagementPage";
import ListZonesPage from "./modules/land-management/pages/ListZonesPage";
import CreateZonePage from "./modules/land-management/pages/CreateZonePage";
import EditZonePage from "./modules/land-management/pages/EditZonePage";
import PasturesFencesPage from "./modules/land-management/pages/PasturesFencesPage";

// Supplies (Medications etc)
import MedicationsOverviewPage from "./modules/supplies/pages/MedicationsPage";
import CreateStandardMedicationPage from "./modules/supplies/pages/CreateStandardMedicationsPage";
import CreateMedicationPurchasePage from "./modules/supplies/pages/CreateMedicationPurchasePage";
import FeedSuppliesPage from "./modules/supplies/pages/FeedPage";
import MineralSupplementsPage from "./modules/supplies/pages/MineralsPage";
import FuelSuppliesPage from "./modules/supplies/pages/FuelPage";
import ToolsSuppliesPage from "./modules/supplies/pages/ToolsPage";

// Services
import VetsPage from "./modules/services/pages/VetsPage";
import SpecialistsPage from "./modules/services/pages/SpecialistsPage";
import FeedSuppliersPage from "./modules/services/pages/FeedSuppliersPage";
import ContractorsPage from "./modules/services/pages/ContractorsPage";
import EquipmentRentalsPage from "./modules/services/pages/EquipmentRentalsPage";

// Reports
import ReportsOverviewPage from "./modules/reports/pages/ReportsOverviewPage";
import ReportsWorkspacePage from "./modules/reports/pages/ReportsWorkspacePage";

// Tasks
import TasksOverviewPage from "./modules/tasks/pages/TasksOverviewPage";
import TaskManagementPage from "./modules/tasks/pages/TaskManagementPage";
import AppointmentPage from "./modules/tasks/pages/AppointmentPage";
import CalendarViewPage from "./modules/tasks/pages/CalendarViewPage";

// SOPs
import SOPRepositoryPage from "./modules/sops/pages/SOPRepositoryPage";
import UploadSOPPage from "./modules/sops/pages/UploadSOPPage";
import CreateSOPPage from "./modules/sops/pages/CreateSOPPage";

export const router = createBrowserRouter([
  // Public route: login (no AuthGate)
  { path: ROUTES.auth.login, element: <LoginPage /> },

  // Protected app
  {
    path: "/",
    element: <AuthGate />,
    children: [
      {
        path: "/",
        element: <Shell />,
        children: [
          // Ranch overview
          { index: true, element: <RanchOverviewPage /> },
          { path: ROUTES.ranch.overview, element: <RanchOverviewPage /> },

          // Herd
          { path: ROUTES.herd.list, element: <ListHerdPage /> },
          { path: ROUTES.herd.create, element: <CreateHerdPage /> },

          // Animals (Inventory)
          { path: ROUTES.herd.animals, element: <AnimalInventoryListPage /> },

          // Intake (Existing Inventory)
          { path: ROUTES.herd.animalIntakeExisting, element: <AnimalIntakeExistingInventoryPage /> },

          // Intake (Birth — batch form)
          { path: ROUTES.herd.animalIntakeBirthBatch, element: <AnimalIntakeBirthBatchPage /> },

          // Land
          { path: ROUTES.land.root, element: <LandManagementPage /> },
          { path: ROUTES.land.zonesList, element: <ListZonesPage /> },
          { path: ROUTES.land.zonesCreate, element: <CreateZonePage /> },
          { path: ROUTES.land.zonesEdit, element: <EditZonePage /> },
          { path: ROUTES.land.pastures, element: <PasturesFencesPage /> },

          // Supplies
          { path: ROUTES.supplies.feed, element: <FeedSuppliesPage /> },
          { path: ROUTES.supplies.minerals, element: <MineralSupplementsPage /> },
          { path: ROUTES.supplies.fuel, element: <FuelSuppliesPage /> },
          { path: ROUTES.supplies.tools, element: <ToolsSuppliesPage /> },

          { path: ROUTES.supplies.medications, element: <MedicationsOverviewPage /> },
          { path: ROUTES.supplies.medicationsStandardsCreate, element: <CreateStandardMedicationPage /> },
          { path: ROUTES.supplies.medicationsPurchasesCreate, element: <CreateMedicationPurchasePage /> },

          // Services
          { path: ROUTES.services.vets, element: <VetsPage /> },
          { path: ROUTES.services.specialists, element: <SpecialistsPage /> },
          { path: ROUTES.services.feedSuppliers, element: <FeedSuppliersPage /> },
          { path: ROUTES.services.contractors, element: <ContractorsPage /> },
          { path: ROUTES.services.equipmentRentals, element: <EquipmentRentalsPage /> },

          // Reports
          { path: ROUTES.reports.root, element: <ReportsOverviewPage /> },
          { path: ROUTES.reports.workspace, element: <ReportsWorkspacePage /> },

          // Tasks
          { path: ROUTES.tasks.root, element: <TasksOverviewPage /> },
          { path: ROUTES.tasks.manage, element: <TaskManagementPage /> },
          { path: ROUTES.tasks.appointments, element: <AppointmentPage /> },
          { path: ROUTES.tasks.calendar, element: <CalendarViewPage /> },

          // SOPs
          { path: ROUTES.sops.root, element: <SOPRepositoryPage /> },
          { path: ROUTES.sops.upload, element: <UploadSOPPage /> },
          { path: ROUTES.sops.create, element: <CreateSOPPage /> },

          // Admin
          { path: ROUTES.admin.root, element: <AdminOverviewPage /> },
          { path: ROUTES.admin.ranch, element: <RanchSettingsPage /> },
          { path: ROUTES.admin.users, element: <UserManagementPage /> },
          { path: ROUTES.admin.billing, element: <BillingPage /> },
          { path: ROUTES.admin.accounting, element: <AccountingPage /> },
        ],
      },
    ],
  },
]);
