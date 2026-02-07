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
    // ✅ full screen shell + prevent page-level horizontal scroll
    <div className="h-screen w-full overflow-x-hidden bg-background">
      {/* ✅ Topbar stays fixed */}
      <div className="sticky top-0 z-50">
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
      </div>

      {/* ✅ Body: sidebar + content */}
      <div className="flex h-[calc(100vh-56px)] w-full">
        {/* Desktop sidebar (sticky and independently scrollable) */}
        <aside
          className={[
            "hidden md:block shrink-0 border-r bg-background",
            "sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto",
            "transition-[width] duration-300 ease-in-out overflow-hidden",
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
          <SheetContent
            side="left"
            className="p-0 w-[64vw] max-w-[360px] min-w-[260px] rounded-r-3xl border border-white/20 bg-white/10 backdrop-blur-2xl shadow-2xl"
          >
            <Sidebar
              me={me}
              onLogout={() => {
                setMobileOpen(false);
                onLogout();
              }}
              variant="mobile"
              onNavigate={() => {
                setTimeout(() => setMobileOpen(false), 500);
              }}
            />
          </SheetContent>
        </Sheet>

        {/* Main content area (ONLY this scrolls vertically) */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 bg-gradient-to-br from-muted/30 via-background to-background">
          <div className="rounded-2xl border bg-card/80 backdrop-blur p-4 md:p-6 shadow-sm">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
