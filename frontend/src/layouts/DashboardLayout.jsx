import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import Sidebar from "../components/sidebar/Sidebar";
import Topbar from "../components/topbar/Topbar";
import { useMe, logoutHard } from "../lib/useMe";

import { Sheet, SheetContent } from "../components/ui/sheet";
import { getSidebarCollapsed, setSidebarCollapsed } from "../lib/uiState";


export default function DashboardLayout() {
  const { data: me, isLoading, error } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed());

  useEffect(() => {
    if (!error) return;
    const status = error?.response?.status;
    if (status === 401) {
      toast.error("Session expired. Please login again.");
      logoutHard();
    } else {
      toast.error("Failed to load session. Please login again.");
      logoutHard();
    }
  }, [error]);

  function onLogout() {
    logoutHard();
  }

  return (
    <div className="min-h-screen bg-background">
      <Topbar
        me={me}
        onOpenSidebar={() => setMobileOpen(true)}
        onToggleCollapse={() =>
          setCollapsed((v) => {
            const next = !v;
            setSidebarCollapsed(next);
            return next;
          })
        }

        collapsed={collapsed}
        onLogout={onLogout}
      />


      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={[
            "hidden md:block border-r transition-all duration-300",
            collapsed ? "w-16" : "w-64",
          ].join(" ")}
        >
          <Sidebar
            me={me}
            onLogout={onLogout}
            variant="desktop"
            collapsed={collapsed}
          />
        </aside>


        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-72">
            <div className="border-b p-4 font-semibold">Menu</div>
            <Sidebar
              me={me}
              onLogout={() => {
                setMobileOpen(false);
                onLogout();
              }}
              variant="mobile"
            />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6">
          <div className="rounded-lg border p-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <Outlet />
            )}
          </div>

          {/* Debug (remove later) */}
          <pre className="text-xs mt-4 bg-muted p-3 rounded-md overflow-auto">
{JSON.stringify({ me, apiBase: import.meta.env.VITE_API_BASE_URL }, null, 2)}
          </pre>
        </main>
      </div>
    </div>
  );
}
