import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Armchair,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ClipboardList,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  PencilRuler,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { hasAnyPermission } from "../../lib/access";
import { useAppSettings, isLightColor } from "../../lib/appSettings";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

const MENU_DEFINITIONS = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
    permissions: ["dashboard.view"],
    exact: true,
  },
  {
    label: "College",
    path: "/masters",
    icon: Building2,
    permissions: ["college.manage"],
  },
  {
    label: "Students",
    path: "/students",
    icon: Users,
    permissions: ["students.view", "students.manage"],
  },
  {
    label: "Academics",
    icon: ClipboardList,
    children: [
      {
        label: "Exam Manager",
        path: "/exams",
        icon: ClipboardList,
        permissions: ["exams.view", "exams.manage"],
      },
      {
        label: "Seat Planner",
        path: "/exams/seat-planner",
        icon: Armchair,
        permissions: ["seat_planner.manage"],
      },
      {
        label: "Subject Codes",
        path: "/academics/subject-codes",
        icon: KeyRound,
        permissions: ["academics.view", "academics.manage"],
      },
      {
        label: "Marks Entry",
        path: "/marks",
        icon: PencilRuler,
        permissions: ["marks.view", "marks.entry"],
      },
      {
        label: "Bulk Grid",
        path: "/marks/grid",
        icon: PencilRuler,
        permissions: ["marks.view", "marks.bulk"],
      },
    ],
  },
  {
    label: "Results",
    icon: BarChart3,
    children: [
      {
        label: "Reports",
        path: "/reports",
        icon: BarChart3,
        permissions: ["reports.view"],
      },
      {
        label: "Corrections",
        path: "/corrections",
        icon: ShieldCheck,
        permissions: ["corrections.request", "corrections.review"],
      },
      {
        label: "Bulk SMS",
        path: "/results/sms",
        icon: MessageSquare,
        permissions: ["results.sms"],
      },
      {
        label: "Marksheet Print",
        path: "/results/marksheet",
        icon: Printer,
        permissions: ["results.marksheet"],
      },
      {
        label: "Public Portal",
        path: "/public/portal",
        icon: Globe,
        permissions: ["public.portal"],
      },
      {
        label: "My Results",
        path: "/my-results",
        icon: Bell,
        permissions: ["my_results.view"],
      },
    ],
  },
  {
    label: "Operations",
    icon: BriefcaseBusiness,
    children: [
      {
        label: "OT Claims",
        path: "/operations/ot",
        icon: BriefcaseBusiness,
        permissions: ["ot.claims"],
      },
      {
        label: "OT Reports",
        path: "/operations/ot/reports",
        icon: BarChart3,
        permissions: ["ot.reports"],
      },
      {
        label: "OT Policy",
        path: "/operations/ot/policy",
        icon: Settings,
        permissions: ["ot.policy.manage"],
      },
    ],
  },
  {
    label: "Users",
    icon: Users,
    children: [
      {
        label: "Manage Users",
        path: "/admin/users",
        icon: Users,
        permissions: ["users.manage"],
      },
      {
        label: "Roles & Access",
        path: "/admin/roles",
        icon: ShieldCheck,
        permissions: ["roles.manage"],
      },
      {
        label: "Invites",
        path: "/admin/invites",
        icon: Mail,
        permissions: ["users.invites"],
      },
      {
        label: "Add User",
        path: "/admin/users/new",
        icon: UserPlus,
        permissions: ["users.add"],
      },
    ],
  },
  {
    label: "Account",
    icon: UserCog,
    children: [
      { label: "Profile", path: "/account/profile", icon: UserCog },
      {
        label: "App Settings",
        path: "/settings",
        icon: Settings,
        permissions: ["settings.manage"],
      },
    ],
  },
];

function getVisibleMenus(user) {
  return MENU_DEFINITIONS.reduce((acc, item) => {
    if (item.children?.length) {
      const children = item.children.filter((child) =>
        hasAnyPermission(user, child.permissions)
      );
      if (children.length) {
        acc.push({ ...item, children });
      }
      return acc;
    }

    if (hasAnyPermission(user, item.permissions)) {
      acc.push(item);
    }
    return acc;
  }, []);
}

export default function Sidebar({
  me,
  onLogout,
  variant = "desktop",
  collapsed = false,
  onNavigate,
}) {
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

  const org = {
    name: settings.org_name,
    tagline: settings.tagline,
    logoSrc: settings.logo_small_data_url || settings.logo_data_url || "",
  };

  const isMobile = variant === "mobile";
  const isCollapsed = isMobile ? false : collapsed;
  const handleNavigate = () => {
    if (typeof onNavigate === "function") onNavigate();
  };

  const menuItems = useMemo(() => getVisibleMenus(me), [me]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return menuItems;
    const matches = (label) => String(label || "").toLowerCase().includes(s);

    return menuItems
      .map((item) => {
        if (item.children?.length) {
          const childMatches = item.children.filter((child) => matches(child.label));
          if (matches(item.label) || childMatches.length > 0) {
            return {
              ...item,
              children: childMatches.length ? childMatches : item.children,
            };
          }
          return null;
        }
        return matches(item.label) ? item : null;
      })
      .filter(Boolean);
  }, [menuItems, q]);

  const header = (
    <div className={cn("px-4 pt-4 transition-all duration-300", isCollapsed && "px-2")}>
      <div className={cn("flex items-center gap-3 transition-all duration-300", isCollapsed && "justify-center")}>
        <div
          className="rounded-2xl border border-white/15 bg-white/5 shadow-sm backdrop-blur-md flex items-center justify-center overflow-hidden transition-all duration-300"
          style={{
            height: Math.max(42, Math.min(72, Number(settings.logo_size) || 54)),
            width: Math.max(42, Math.min(72, Number(settings.logo_size) || 54)),
          }}
        >
          {org.logoSrc ? (
            <img src={org.logoSrc} alt="Campus logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-primary">
              {String(settings.brand_name || "NEB")
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
        </div>

        {!isCollapsed ? (
          <div className="min-w-0 animate-fade-in">
            <div
              className={cn(
                "truncate bg-gradient-to-r bg-clip-text text-transparent font-display text-[1.65rem] font-semibold leading-tight",
                sidebarIsDark ? "from-white to-white/72" : "from-foreground to-foreground/70"
              )}
            >
              {settings.brand_name}
            </div>
            <div className={cn("truncate text-xs font-medium", textMuted)}>{org.name}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 border-b border-border/50 transition-all duration-300" />
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden border-r border-border/50 shadow-lg",
        "transition-[opacity,transform] duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64",
        sidebarIsDark && "text-white",
        isMobile && "rounded-r-3xl"
      )}
      style={{
        backgroundImage:
          "radial-gradient(120px 120px at 18% 8%, rgba(255,255,255,0.08), transparent 60%), linear-gradient(180deg, hsl(var(--sidebar-strong)) 0%, hsl(var(--sidebar)) 52%, hsl(var(--sidebar-soft)) 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-[0.06]" />
      <div className="pointer-events-none absolute -right-10 -top-24 h-40 w-40 rounded-full bg-accent/20 blur-3xl opacity-40" />

      {header}

      {!isCollapsed ? (
        <div className={cn("px-4 py-3 transition-all duration-300", isSearchFocused && "bg-muted/30")}>
          <div className="relative">
            <Search
              className={cn(
                "absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transform transition-colors duration-200",
                sidebarIsDark ? "text-white/50" : "text-muted-foreground",
                isSearchFocused && "text-accent"
              )}
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search menu..."
              className={cn(
                "rounded-full pl-10 transition-all duration-200",
                sidebarIsDark &&
                  "border-white/10 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/30",
                isSearchFocused && "ring-2 ring-accent/20 shadow-sm"
              )}
            />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex-1 overflow-y-auto py-3 transition-all duration-300",
          isCollapsed ? "px-1" : "px-2"
        )}
      >
        <div className="space-y-1">
          {filtered.map((item, index) => {
            const Icon = item.icon;

            if (item.children?.length) {
              const childActive = item.children.some(
                (child) =>
                  location.pathname === child.path ||
                  location.pathname.startsWith(`${child.path}/`)
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
                      "group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-200",
                      itemHover,
                      "hover:translate-x-1 hover:shadow-sm",
                      childActive ? itemActive : textBase,
                      isCollapsed && "justify-center px-2"
                    )}
                    title={item.label}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {childActive ? (
                      <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 transform rounded-r-full bg-accent" />
                    ) : null}

                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-all duration-200",
                        childActive ? `${iconActive} scale-110` : iconMuted,
                        !childActive && "group-hover:scale-105"
                      )}
                    />

                    {!isCollapsed ? (
                      <>
                        <span className={cn("truncate transition-all duration-200", childActive && "font-medium")}>
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
                  </button>

                  {isOpen ? (
                    <div className={cn("space-y-1", !isCollapsed && "pl-4")}>
                      {item.children.map((child, childIndex) => {
                        const ChildIcon = child.icon;
                        const active =
                          location.pathname === child.path ||
                          location.pathname.startsWith(`${child.path}/`);

                        return (
                          <NavLink
                            key={child.path}
                            to={child.path}
                            onClick={handleNavigate}
                            className={({ isActive }) =>
                              cn(
                                "group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                                itemHover,
                                "hover:translate-x-1 hover:shadow-sm",
                                isActive ? itemActive : textBase,
                                isCollapsed && "justify-center px-2"
                              )
                            }
                            title={child.label}
                            style={{ animationDelay: `${(index + childIndex + 1) * 50}ms` }}
                          >
                            {active ? (
                              <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 transform rounded-r-full bg-accent" />
                            ) : null}
                            <ChildIcon
                              className={cn(
                                "h-4 w-4 shrink-0 transition-all duration-200",
                                active ? `${iconActive} scale-110` : iconMuted,
                                !active && "group-hover:scale-105"
                              )}
                            />
                            {!isCollapsed ? (
                              <span className={cn("truncate transition-all duration-200", active && "font-medium")}>
                                {child.label}
                              </span>
                            ) : null}
                          </NavLink>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            const active = item.exact
              ? location.pathname === item.path
              : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                    itemHover,
                    "hover:translate-x-1 hover:shadow-sm",
                    isActive ? itemActive : textBase,
                    isCollapsed && "justify-center px-2"
                  )
                }
                title={item.label}
                style={{ animationDelay: `${index * 50}ms` }}
                end={!!item.exact}
              >
                {active ? (
                  <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 transform rounded-r-full bg-accent" />
                ) : null}
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-all duration-200",
                    active ? `${iconActive} scale-110` : iconMuted,
                    !active && "group-hover:scale-105"
                  )}
                />
                {!isCollapsed ? (
                  <span className={cn("truncate transition-all duration-200", active && "font-medium")}>
                    {item.label}
                  </span>
                ) : null}
              </NavLink>
            );
          })}

          {filtered.length === 0 ? (
            <div className={cn("px-3 py-2 text-xs", textMuted, isCollapsed && "hidden")}>
              No menu found.
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn("border-t border-border/50 p-3 transition-all duration-300", isCollapsed && "p-2")}>
        <Button
          variant="default"
          className={cn(
            "w-full justify-start gap-2 bg-white text-slate-900 transition-all duration-200 hover:bg-white/95 hover:shadow-sm",
            sidebarIsDark && "bg-white text-slate-900 hover:bg-white/95",
            isCollapsed && "justify-center"
          )}
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed ? "Logout" : null}
        </Button>

        {!isCollapsed ? (
          <div className={cn("mt-2 flex items-center gap-1 text-[11px]", textMuted)}>
            <span>v1</span>
            <span className={cn("inline-block h-1 w-1 rounded-full", sidebarIsDark ? "bg-white/50" : "bg-muted-foreground")} />
            <span>Local Server</span>
          </div>
        ) : null}
      </div>

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
