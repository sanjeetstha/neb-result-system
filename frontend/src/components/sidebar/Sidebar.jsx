import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Separator } from "../ui/separator";

import {
  LayoutDashboard,
  Building2,
  Users,
  ClipboardList,
  PencilRuler,
  BarChart3,
  BadgeCheck,
  Globe,
  LogOut,
  Search,
} from "lucide-react";

/**
 * Enhanced Sidebar with animations and improved design
 * - Role-based menu system using MENUS from menu.js
 * - Search bar to filter menus with icon
 * - Works with desktop collapsed + mobile variant
 * - Added hover effects, transitions, and subtle animations
 *
 * Props expected (kept same as your current usage):
 * - me
 * - onLogout
 * - variant: "desktop" | "mobile"
 * - collapsed (desktop only)
 */
export default function Sidebar({ me, onLogout, variant = "desktop", collapsed = false }) {
  const location = useLocation();
  const [q, setQ] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // ✅ static (later dynamic)
  const ORG = {
    name: "Gaurishankar Multiple Campus",
    tagline: "NEB +2 Result Management",
    // If you later add an image, put it in /public and set src below:
    // logoSrc: "/campus-logo.png",
    logoSrc: null,
  };

  const isMobile = variant === "mobile";
  const isCollapsed = isMobile ? false : collapsed;
  
  // Get role-based menu items - using the same structure as menu.js
  const role = me?.role || "STUDENT";
  
  // Define the menu items directly in this component to avoid import issues
  const MENUS = {
    SUPER_ADMIN: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Masters", path: "/masters", icon: Building2 },
      { label: "Students", path: "/students", icon: Users },
      { label: "Exams", path: "/exams", icon: ClipboardList },
      { label: "Marks Entry", path: "/marks", icon: PencilRuler },
      { label: "Bulk Grid", path: "/marks/grid", icon: PencilRuler },
      { label: "Reports", path: "/reports", icon: BarChart3 },
      { label: "Corrections", path: "/corrections", icon: BadgeCheck },
      { label: "Public Portal", path: "/public", icon: Globe },
    ],
    ADMIN: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Masters", path: "/masters", icon: Building2 },
      { label: "Students", path: "/students", icon: Users },
      { label: "Exams", path: "/exams", icon: ClipboardList },
      { label: "Marks Entry", path: "/marks", icon: PencilRuler },
      { label: "Reports", path: "/reports", icon: BarChart3 },
      { label: "Corrections", path: "/corrections", icon: BadgeCheck },
    ],
    TEACHER: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Marks Entry", path: "/marks", icon: PencilRuler },
      { label: "Corrections", path: "/corrections", icon: BadgeCheck },
      { label: "Reports", path: "/reports", icon: BarChart3 },
    ],
    STUDENT: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "My Results", path: "/my-results", icon: BadgeCheck },
    ],
    PUBLIC: [{ label: "Public Portal", path: "/public", icon: Globe }],
  };
  
  const menuItems = MENUS[role] || MENUS.STUDENT;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return menuItems;
    return menuItems.filter((x) => x.label.toLowerCase().includes(s));
  }, [menuItems, q]);

  const header = (
    <div className={cn("px-4 pt-4 transition-all duration-300", isCollapsed && "px-2")}>
      {/* Product + org header with animation */}
      <div className={cn("flex items-center gap-3 transition-all duration-300", isCollapsed && "justify-center")}>
        <div className="h-10 w-10 rounded-xl border bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:scale-105">
          {ORG.logoSrc ? (
            <img src={ORG.logoSrc} alt="Org Logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-primary">NEB</span>
          )}
        </div>

        {!isCollapsed ? (
          <div className="min-w-0 animate-fade-in">
            <div className="font-bold leading-tight truncate bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              NEB Result System
            </div>
            <div className="text-xs text-muted-foreground truncate">{ORG.name}</div>
          </div>
        ) : null}
      </div>

      {/* tagline */}
      {!isCollapsed ? (
        <div className="mt-2 text-xs text-muted-foreground animate-fade-in">
          {ORG.tagline}
        </div>
      ) : null}

      {/* user line */}
      {!isCollapsed ? (
        <div className="mt-3 text-xs text-muted-foreground animate-fade-in">
          <span className="font-medium text-foreground">
            {me?.full_name || me?.name || "User"}
          </span>
          {" • "}
          <span>{me?.role || "—"}</span>
        </div>
      ) : null}

      <div className="mt-4 border-b border-border/50 transition-all duration-300" />
    </div>
  );

  return (
    <div className={cn(
      "h-full w-full flex flex-col bg-gradient-to-b from-sidebar to-sidebar/95 border-r border-border/50 shadow-sm relative overflow-hidden",
      "transition-all duration-500 ease-in-out",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />
      
      {header}

      {/* search - enhanced with icon and focus state */}
      {!isCollapsed && (
        <div className={cn(
          "px-4 py-3 transition-all duration-300",
          isSearchFocused && "bg-muted/30"
        )}>
          <div className="relative">
            <Search className={cn(
              "absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors duration-200",
              isSearchFocused && "text-primary"
            )} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search menu..."
              className={cn(
                "pl-9 transition-all duration-200",
                isSearchFocused && "ring-2 ring-primary/20 shadow-sm"
              )}
            />
          </div>
        </div>
      )}

      {/* nav with enhanced hover effects */}
      <div className={cn("flex-1 overflow-y-auto py-3 transition-all duration-300", isCollapsed && "px-1", !isCollapsed && "px-2")}>
        <div className="space-y-1">
          {filtered.map((item, index) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 relative overflow-hidden",
                  "hover:bg-muted/50 hover:translate-x-1 hover:shadow-sm",
                  isActive ? "bg-gradient-to-r from-primary/10 to-primary/5 font-medium text-primary shadow-sm" : "",
                  isCollapsed && "justify-center px-2"
                )}
                title={item.label}
                style={{
                  animationDelay: `${index * 50}ms`
                }}
                end={item.path === "/"}
              >
                {/* Active indicator */}
                {active && (
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 h-6 w-1 bg-primary rounded-r-full" />
                )}
                
                <Icon className={cn(
                  "h-4 w-4 shrink-0 transition-all duration-200",
                  active && "text-primary scale-110",
                  !active && "group-hover:scale-105"
                )} />
                
                {!isCollapsed ? (
                  <span className={cn(
                    "truncate transition-all duration-200",
                    active && "font-medium"
                  )}>{item.label}</span>
                ) : null}
                
                {/* Hover indicator for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                    {item.label}
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -ml-1 w-2 h-2 bg-popover rotate-45" />
                  </div>
                )}
              </NavLink>
            );
          })}

          {filtered.length === 0 ? (
            <div className={cn("px-3 py-2 text-xs text-muted-foreground animate-pulse", isCollapsed && "hidden")}>
              No menu found.
            </div>
          ) : null}
        </div>
      </div>

      {/* footer with enhanced logout button */}
      <div className={cn("p-3 border-t border-border/50 transition-all duration-300", isCollapsed && "p-2")}>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 hover:shadow-sm",
            isCollapsed && "justify-center"
          )}
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          {!isCollapsed ? "Logout" : null}
        </Button>

        {!isCollapsed ? (
          <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
            <span>v1</span>
            <span className="inline-block w-1 h-1 bg-muted-foreground rounded-full" />
            <span>Local Server</span>
          </div>
        ) : null}
      </div>
      
      {/* Add custom styles for animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        
        .bg-grid-pattern {
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}