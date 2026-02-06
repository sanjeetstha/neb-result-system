import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Sparkles,
  UserCog,
  Check,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

import { toggleTheme, getTheme } from "../../lib/theme";
import { useAppSettings } from "../../lib/appSettings";
import { useProfileSettings } from "../../lib/profileSettings";

export default function Topbar({ me, onOpenSidebar, onToggleCollapse, collapsed, onLogout }) {
  const nav = useNavigate();
  const initials = useMemo(() => {
    const s = String(me?.name || me?.email || "U").trim();
    const parts = s.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [me]);

  // local state for smooth UI update (icons/knob)
  const [theme, setTheme] = useState(getTheme());
  const settings = useAppSettings();
  const profile = useProfileSettings(me);
  const avatarSrc = profile?.avatar_data_url || "";
  const canManageApp = ["SUPER_ADMIN", "ADMIN"].includes(me?.role);
  const canQuickActions = ["SUPER_ADMIN", "ADMIN", "TEACHER"].includes(me?.role);
  const isActive = me?.is_active !== false;

  const headerClass =
    settings.header_style === "solid"
      ? "bg-background/95 border-b text-foreground shadow-sm"
      : "bg-background/70 backdrop-blur border-b text-foreground shadow-sm";

  const noticeStyle =
    settings.notice_style === "gradient"
      ? {
          background: `linear-gradient(90deg, ${settings.notice_bg_color}, ${settings.notice_accent_color})`,
          color: settings.notice_text_color,
        }
      : {
          background: settings.notice_bg_color,
          color: settings.notice_text_color,
        };

  return (
    <header className={`sticky top-0 z-20 ${headerClass}`}>
      {settings.notice_enabled && settings.notice_text ? (
        <div className="border-b" style={noticeStyle}>
          <div className="overflow-hidden">
            <div className="notice-marquee whitespace-nowrap py-2 text-xs font-semibold tracking-wide">
              {settings.notice_text}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex h-14 items-center gap-2 px-4">
        {/* Mobile sidebar button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-foreground"
          onClick={onOpenSidebar}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex text-foreground"
          onClick={onToggleCollapse}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
        <div className="flex items-center gap-2 font-semibold font-display">
          {settings.logo_small_data_url || settings.logo_data_url ? (
            <img
              src={settings.logo_small_data_url || settings.logo_data_url}
              alt="Logo"
              className="h-7 w-7 rounded-md object-cover border"
            />
          ) : null}
          {settings.brand_name}
        </div>

        <div className="flex-1 hidden md:flex items-center justify-center">
          <div className="text-center leading-tight">
            <div className="text-sm font-medium text-foreground">
              {me?.name || me?.full_name || me?.email || "User"}
            </div>
            <div className="text-xs text-muted-foreground">{me?.role || "—"}</div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canQuickActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Quick actions"
                  className="text-foreground"
                >
                  <Sparkles className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav("/exams")}>Create Exam</DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav("/marks/grid")}>Bulk Marks Entry</DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav("/reports")}>Open Reports</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {settings.notifications_enabled ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Notifications" className="text-foreground">
                  <Bell className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No new notifications
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {/* Animated Theme Toggle */}
          <Button
            variant="outline"
            className="relative h-9 w-16 rounded-full px-0"
            onClick={() => {
              const next = toggleTheme();
              setTheme(next);
            }}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            <span className="sr-only">Toggle theme</span>

            {/* sliding knob */}
            <span
              className={[
                "absolute left-1 top-1 h-7 w-7 rounded-full bg-background shadow-sm transition-transform duration-300",
                theme === "dark" ? "translate-x-7" : "translate-x-0",
              ].join(" ")}
            />

            {/* icons */}
            <span className="absolute left-2 top-2">
              <Sun
                className={[
                  "h-5 w-5 transition-all duration-300",
                  "text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.55)]",
                  theme === "dark" ? "opacity-40 scale-90" : "opacity-100 scale-100",
                ].join(" ")}
              />

            </span>

            <span className="absolute right-2 top-2">
              <Moon
                className={[
                  "h-5 w-5 transition-all duration-300",
                  "text-sky-400",
                  theme === "dark" ? "opacity-100 scale-100" : "opacity-40 scale-90",
                ].join(" ")}
              />

            </span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <div className="relative">
                  <Avatar className="h-9 w-9">
                    {avatarSrc ? <AvatarImage src={avatarSrc} alt="User avatar" /> : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  {isActive ? (
                    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#1877F2] border-2 border-background flex items-center justify-center shadow-sm">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  ) : null}
                </div>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>{me?.email || "—"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav("/account/profile")}>
                <UserCog className="mr-2 h-4 w-4" />
                Profile Settings
              </DropdownMenuItem>
              {canManageApp ? (
                <DropdownMenuItem onClick={() => nav("/settings")}>
                  App Settings
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onLogout}
                className="text-red-600 font-medium focus:text-red-600 focus:bg-red-50"
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={onLogout}
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
