import { NavLink } from "react-router-dom";
import { MENUS } from "./menu";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";

export default function Sidebar({
  me,
  onLogout,
  variant = "desktop",
  collapsed = false,
}) {
  const role = me?.role || "STUDENT";
  const menu = MENUS[role] || MENUS.STUDENT;

  return (
    <div className={variant === "desktop" ? "h-full p-3" : "p-4"}>
      {/* Header */}
      <div className={collapsed ? "px-2" : "px-1"}>
        <div className={collapsed ? "font-semibold text-sm" : "font-semibold"}>
          {collapsed ? "NEB" : "NEB Result System"}
        </div>
        {!collapsed && (
          <div className="text-xs text-muted-foreground mt-1">
            {me ? `${me.name || me.email} • ${role}` : "Loading..."}
          </div>
        )}
      </div>

      <Separator className="my-3" />

      {/* Menu */}
      <nav className="space-y-1">
        {menu.map((m) => {
          const Icon = m.icon;
          return (
            <NavLink
              key={m.path}
              to={m.path}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                  collapsed ? "justify-center px-2" : "",
                  isActive
                    ? "bg-muted font-medium"
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                ].join(" ")
              }
              title={collapsed ? m.label : undefined}
              end={m.path === "/"}
            >
              <Icon className="h-5 w-5" />
              {!collapsed && <span>{m.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <Separator className="my-3" />

      {/* Logout */}
      <div className={collapsed ? "px-1" : ""}>
        <Button
          variant="outline"
          onClick={onLogout}
          className={collapsed ? "w-full px-2" : "w-full"}
          title={collapsed ? "Logout" : undefined}
        >
          {collapsed ? "⎋" : "Logout"}
        </Button>
      </div>
    </div>
  );
}
