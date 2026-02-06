import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useAppSettings, isLightColor } from "../../lib/appSettings";

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
  UserPlus,
  Mail,
  ChevronDown,
  Settings,
  UserCog,
  MessageSquare,
  Printer,
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
  const [openGroups, setOpenGroups] = useState({});
  const settings = useAppSettings();
  const sidebarIsDark = !isLightColor(settings.sidebar_color);
  const textBase = sidebarIsDark ? "text-white/90" : "text-foreground";
  const textMuted = sidebarIsDark ? "text-white/60" : "text-muted-foreground";
  const iconMuted = sidebarIsDark ? "text-white/50" : "text-foreground/60";
  const iconActive = "text-accent";
  const itemHover = sidebarIsDark ? "hover:bg-white/10" : "hover:bg-muted/60";
  const itemActive = sidebarIsDark
    ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
    : "bg-gradient-to-r from-primary/10 to-primary/5 font-medium text-primary shadow-sm";

  // ✅ static (later dynamic)
  const ORG = {
    name: settings.org_name,
    tagline: settings.tagline,
    logoSrc: settings.logo_data_url || settings.logo_small_data_url || null,
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
      {
        label: "Users",
        icon: Users,
        children: [
          { label: "Manage Users", path: "/admin/users", icon: Users },
          { label: "Invites", path: "/admin/invites", icon: Mail },
          { label: "Add User", path: "/admin/users/new", icon: UserPlus },
        ],
      },
      {
        label: "Academics",
        icon: ClipboardList,
        children: [
          { label: "Exams", path: "/exams", icon: ClipboardList },
          { label: "Marks Entry", path: "/marks", icon: PencilRuler },
          { label: "Bulk Grid", path: "/marks/grid", icon: PencilRuler },
        ],
      },
      {
        label: "Results",
        icon: BarChart3,
        children: [
          { label: "Reports", path: "/reports", icon: BarChart3 },
          { label: "Corrections", path: "/corrections", icon: BadgeCheck },
          { label: "Bulk SMS", path: "/results/sms", icon: MessageSquare },
          { label: "Marksheet Print", path: "/results/marksheet", icon: Printer },
          { label: "Public Portal", path: "/public", icon: Globe },
          { label: "My Results", path: "/my-results", icon: BadgeCheck },
        ],
      },
      {
        label: "Account",
        icon: UserCog,
        children: [
          { label: "Profile", path: "/account/profile", icon: UserCog },
          { label: "App Settings", path: "/settings", icon: Settings },
        ],
      },
    ],
    ADMIN: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Masters", path: "/masters", icon: Building2 },
      { label: "Students", path: "/students", icon: Users },
      {
        label: "Academics",
        icon: ClipboardList,
        children: [
          { label: "Exams", path: "/exams", icon: ClipboardList },
          { label: "Marks Entry", path: "/marks", icon: PencilRuler },
          { label: "Bulk Grid", path: "/marks/grid", icon: PencilRuler },
        ],
      },
      {
        label: "Results",
        icon: BarChart3,
        children: [
          { label: "Reports", path: "/reports", icon: BarChart3 },
          { label: "Corrections", path: "/corrections", icon: BadgeCheck },
          { label: "Bulk SMS", path: "/results/sms", icon: MessageSquare },
          { label: "Marksheet Print", path: "/results/marksheet", icon: Printer },
          { label: "Public Portal", path: "/public", icon: Globe },
          { label: "My Results", path: "/my-results", icon: BadgeCheck },
        ],
      },
      {
        label: "Account",
        icon: UserCog,
        children: [
          { label: "Profile", path: "/account/profile", icon: UserCog },
          { label: "App Settings", path: "/settings", icon: Settings },
        ],
      },
    ],
    TEACHER: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      {
        label: "Academics",
        icon: ClipboardList,
        children: [
          { label: "Marks Entry", path: "/marks", icon: PencilRuler },
          { label: "Bulk Grid", path: "/marks/grid", icon: PencilRuler },
        ],
      },
      {
        label: "Results",
        icon: BarChart3,
        children: [
          { label: "Corrections", path: "/corrections", icon: BadgeCheck },
          { label: "Reports", path: "/reports", icon: BarChart3 },
          { label: "Bulk SMS", path: "/results/sms", icon: MessageSquare },
          { label: "Public Portal", path: "/public", icon: Globe },
        ],
      },
      {
        label: "Account",
        icon: UserCog,
        children: [{ label: "Profile", path: "/account/profile", icon: UserCog }],
      },
    ],
    STUDENT: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "My Results", path: "/my-results", icon: BadgeCheck },
      { label: "Public Portal", path: "/public", icon: Globe },
      {
        label: "Account",
        icon: UserCog,
        children: [{ label: "Profile", path: "/account/profile", icon: UserCog }],
      },
    ],
    PUBLIC: [{ label: "Public Portal", path: "/public", icon: Globe }],
  };

  const menuItems = MENUS[role] || MENUS.STUDENT;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return menuItems;
    const matches = (label) => label.toLowerCase().includes(s);
    return menuItems
      .map((item) => {
        if (item.children?.length) {
          const childMatches = item.children.filter((c) => matches(c.label));
          if (matches(item.label) || childMatches.length > 0) {
            return { ...item, children: childMatches.length ? childMatches : item.children };
          }
          return null;
        }
        return matches(item.label) ? item : null;
      })
      .filter(Boolean);
  }, [menuItems, q]);

  const header = (
    <div className={cn("px-4 pt-4 transition-all duration-300", isCollapsed && "px-2")}>
      {/* Product + org header with animation */}
      <div className={cn("flex items-center gap-3 transition-all duration-300", isCollapsed && "justify-center")}>
        <div className="h-10 w-10 rounded-xl border bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:scale-105">
          {ORG.logoSrc ? (
            <img src={ORG.logoSrc} alt="Org Logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-primary">
              {String(settings.brand_name || "NEB")
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
        </div>

      {!isCollapsed ? (
        <div className="min-w-0 animate-fade-in">
          <div
            className={cn(
              "font-bold leading-tight truncate bg-gradient-to-r bg-clip-text text-transparent font-display",
              sidebarIsDark ? "from-white to-white/70" : "from-foreground to-foreground/70"
            )}
          >
            {settings.brand_name}
          </div>
          <div className={cn("text-xs truncate", textMuted)}>{ORG.name}</div>
        </div>
      ) : null}
      </div>

      {/* tagline */}
      {!isCollapsed ? (
        <div className={cn("mt-2 text-xs animate-fade-in", textMuted)}>{ORG.tagline}</div>
      ) : null}

      {/* user line */}
      {!isCollapsed ? (
        <div className={cn("mt-3 text-xs animate-fade-in", textMuted)}>
          <span className={cn("font-medium", textBase)}>
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
    <div
      className={cn(
        "h-full w-full flex flex-col border-r border-border/50 shadow-lg relative overflow-hidden",
        "transition-all duration-500 ease-in-out",
        isCollapsed ? "w-16" : "w-64",
        sidebarIsDark && "text-white"
      )}
      style={{
        backgroundImage:
          "radial-gradient(120px 120px at 20% 10%, rgba(255,255,255,0.08), transparent 60%), linear-gradient(180deg, hsl(var(--sidebar-strong)) 0%, hsl(var(--sidebar)) 55%, hsl(var(--sidebar-soft)) 100%)",
      }}
    >
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.06] pointer-events-none" />
      <div className="absolute -top-24 -right-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl opacity-40 pointer-events-none" />

      {header}

      {/* search - enhanced with icon and focus state */}
      {!isCollapsed && (
        <div
          className={cn(
            "px-4 py-3 transition-all duration-300",
            isSearchFocused && "bg-muted/30"
          )}
        >
          <div className="relative">
            <Search
              className={cn(
                "absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 transition-colors duration-200",
                sidebarIsDark ? "text-white/50" : "text-muted-foreground",
                isSearchFocused && "text-primary"
              )}
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search menu..."
              className={cn(
                "pl-9 transition-all duration-200",
                sidebarIsDark &&
                  "bg-white/10 border-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/30",
                isSearchFocused && "ring-2 ring-primary/20 shadow-sm"
              )}
            />
          </div>
        </div>
      )}

      {/* nav with enhanced hover effects */}
      <div
        className={cn(
          "flex-1 overflow-y-auto py-3 transition-all duration-300",
          isCollapsed && "px-1",
          !isCollapsed && "px-2"
        )}
      >
        <div className="space-y-1">
          {filtered.map((item, index) => {
            const Icon = item.icon;

            if (item.children?.length) {
              const childActive = item.children.some(
                (c) =>
                  location.pathname === c.path ||
                  location.pathname.startsWith(c.path + "/")
              );
              const isOpen = q ? true : openGroups[item.label] ?? childActive;

              return (
                <div key={item.label} className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({
                        ...prev,
                        [item.label]: !isOpen,
                      }))
                    }
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 relative overflow-hidden w-full text-left",
                      itemHover,
                      "hover:translate-x-1 hover:shadow-sm",
                      childActive ? itemActive : textBase,
                      isCollapsed && "justify-center px-2"
                    )}
                    title={item.label}
                    style={{
                      animationDelay: `${index * 50}ms`,
                    }}
                  >
                    {/* Active indicator */}
                {childActive && (
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 h-6 w-1 bg-accent rounded-r-full" />
                )}

                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-all duration-200",
                        childActive ? `${iconActive} scale-110` : iconMuted,
                        !childActive && "group-hover:scale-105"
                      )}
                    />

                    {!isCollapsed ? (
                      <>
                        <span
                          className={cn(
                            "truncate transition-all duration-200",
                            childActive && "font-medium"
                          )}
                        >
                          {item.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 transition-transform duration-200",
                            isOpen && "rotate-180"
                          )}
                        />
                      </>
                    ) : null}

                    {/* Hover indicator for collapsed state */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                        {item.label}
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -ml-1 w-2 h-2 bg-popover rotate-45" />
                      </div>
                    )}
                  </button>

                  {isOpen && (
                    <div className={cn("space-y-1", !isCollapsed && "pl-4")}>
                      {item.children.map((child, childIndex) => {
                        const ChildIcon = child.icon;
                        const active =
                          location.pathname === child.path ||
                          location.pathname.startsWith(child.path + "/");

                        return (
                          <NavLink
                            key={child.path}
                            to={child.path}
                            className={({ isActive }) =>
                              cn(
                                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 relative overflow-hidden",
                                itemHover,
                                "hover:translate-x-1 hover:shadow-sm",
                                isActive ? itemActive : textBase,
                                isCollapsed && "justify-center px-2"
                              )
                            }
                            title={child.label}
                            style={{
                              animationDelay: `${(index + childIndex + 1) * 50}ms`,
                            }}
                          >
                            {/* Active indicator */}
                            {active && (
                              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 h-6 w-1 bg-accent rounded-r-full" />
                            )}

                            <ChildIcon
                              className={cn(
                                "h-4 w-4 shrink-0 transition-all duration-200",
                                active ? `${iconActive} scale-110` : iconMuted,
                                !active && "group-hover:scale-105"
                              )}
                            />

                            {!isCollapsed ? (
                              <span
                                className={cn(
                                  "truncate transition-all duration-200",
                                  active && "font-medium"
                                )}
                              >
                                {child.label}
                              </span>
                            ) : null}

                            {/* Hover indicator for collapsed state */}
                            {isCollapsed && (
                              <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                                {child.label}
                                <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -ml-1 w-2 h-2 bg-popover rotate-45" />
                              </div>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const active =
              location.pathname === item.path ||
              location.pathname.startsWith(item.path + "/");

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 relative overflow-hidden",
                    itemHover,
                    "hover:translate-x-1 hover:shadow-sm",
                    isActive ? itemActive : textBase,
                    isCollapsed && "justify-center px-2"
                  )
                }
                title={item.label}
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
                end={item.path === "/"}
              >
                {/* Active indicator */}
                {active && (
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 h-6 w-1 bg-accent rounded-r-full" />
                )}

                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-all duration-200",
                    active ? `${iconActive} scale-110` : iconMuted,
                    !active && "group-hover:scale-105"
                  )}
                />

                {!isCollapsed ? (
                  <span
                    className={cn(
                      "truncate transition-all duration-200",
                      active && "font-medium"
                    )}
                  >
                    {item.label}
                  </span>
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
            <div
              className={cn(
                "px-3 py-2 text-xs animate-pulse",
                textMuted,
                isCollapsed && "hidden"
              )}
            >
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
            "w-full justify-start gap-2 transition-all duration-200 hover:shadow-sm border-destructive/30 text-destructive hover:bg-destructive/10",
            sidebarIsDark && "border-white/20 text-white/90 hover:bg-white/10 hover:text-white",
            isCollapsed && "justify-center"
          )}
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          {!isCollapsed ? "Logout" : null}
        </Button>

        {!isCollapsed ? (
          <div className={cn("mt-2 text-[11px] flex items-center gap-1", textMuted)}>
            <span>v1</span>
            <span
              className={cn(
                "inline-block w-1 h-1 rounded-full",
                sidebarIsDark ? "bg-white/50" : "bg-muted-foreground"
              )}
            />
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
          background-image: linear-gradient(
              to right,
              rgba(255, 255, 255, 0.05) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(255, 255, 255, 0.05) 1px,
              transparent 1px
            );
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}
