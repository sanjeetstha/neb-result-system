import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/masters/campuses", label: "Campuses" },
  { to: "/masters/academic-years", label: "Academic Years" },
  { to: "/masters/faculties", label: "Faculties" },
  { to: "/masters/sections", label: "Sections" },
];

export default function MastersLayout() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Masters</h2>
        <p className="text-sm text-muted-foreground">
          Configure campuses, academic years, faculties, and sections.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              [
                "px-3 py-1.5 rounded-md text-sm transition",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 hover:bg-muted text-foreground",
              ].join(" ")
            }
            end
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
