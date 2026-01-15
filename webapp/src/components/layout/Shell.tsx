import { Sidebar } from "./Sidebar";
import { Outlet } from "react-router-dom";
import { RanchProvider } from "@/lib/ranchContext";

export function Shell() {
  return (
    <RanchProvider>
      <div className="min-h-screen flex relative">
        {/* Sidebar - full viewport height background */}
        <div className="fixed left-0 top-0 h-screen w-64 bg-stone-700 z-0">
          <div className="h-full overflow-hidden">
            <Sidebar />
          </div>
        </div>

        {/* Main content - overlays sidebar background */}
        <div className="flex-1 flex flex-col ml-64 min-h-screen">
          <main className="flex-1 p-6 bg-stone-100 text-stone-900 overflow-auto">
            <Outlet />
          </main>

          {/* Footer - spans full width */}
          <footer className="bg-stone-700 text-stone-100 p-4 text-center text-sm shrink-0 relative z-10">
            GrazeTrack © 2025
          </footer>
        </div>
      </div>
    </RanchProvider>
  );
}
