import {
  LayoutDashboard,
  Building2,
  Users,
  ClipboardList,
  PencilRuler,
  BarChart3,
  BadgeCheck,
  Globe,
} from "lucide-react";

export const MENUS = {
  SUPER_ADMIN: [
    { label: "Dashboard", path: "/", icon: LayoutDashboard },
    { label: "Masters", path: "/masters", icon: Building2 },
    { label: "Students", path: "/students", icon: Users },
    { label: "Exams", path: "/exams", icon: ClipboardList },
    { label: "Marks Entry", path: "/marks", icon: PencilRuler },
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
