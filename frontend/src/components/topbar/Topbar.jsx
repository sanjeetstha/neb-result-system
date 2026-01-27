import { useMemo, useState } from "react";
import { Menu, Moon, Sun, PanelLeftClose, PanelLeftOpen } from "lucide-react";


import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback } from "../ui/avatar";

import { toggleTheme, getTheme } from "../../lib/theme";

export default function Topbar({ me, onOpenSidebar, onToggleCollapse, collapsed, onLogout }) {
  const initials = useMemo(() => {
    const s = String(me?.name || me?.email || "U").trim();
    const parts = s.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [me]);

  // local state for smooth UI update (icons/knob)
  const [theme, setTheme] = useState(getTheme());

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4">
        {/* Mobile sidebar button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenSidebar}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          onClick={onToggleCollapse}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>



        <div className="font-semibold">NEB Result System</div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block text-right leading-tight">
            <div className="text-sm font-medium">{me?.name || me?.email}</div>
            <div className="text-xs text-muted-foreground">{me?.role}</div>
          </div>

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
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>{me?.email || "—"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
