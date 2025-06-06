// import Image from "next/image";
// import Blackbox from "./components/blackbox";
import { Analytics } from "@vercel/analytics/next";
import DashboardPage from "./dashboard/page";
import { ProtectedRoute } from "./components/ProtectedRoute";

export default function Home() {
  return (
    <>
      <ProtectedRoute>
        <div className="flex flex-row min-h-screen w-full overflow-hidden">
          <div className="flex-1 h-screen">
            <DashboardPage />
          </div>
        </div>
      </ProtectedRoute>
      <Analytics />
    </>
  );
}
