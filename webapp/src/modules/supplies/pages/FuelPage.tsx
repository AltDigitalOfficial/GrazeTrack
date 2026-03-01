import { Navigate } from "react-router-dom";

import { ROUTES } from "@/routes";

export default function FuelPage() {
  return <Navigate to={ROUTES.supplies.fuelProducts} replace />;
}
