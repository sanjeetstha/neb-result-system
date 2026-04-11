export const INTERNAL_ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "SUPER_ADMIN" },
  { value: "ADMIN", label: "ADMIN" },
  { value: "FINANCE", label: "FINANCE" },
  { value: "TEACHER", label: "TEACHER" },
  { value: "EXAM_HEAD", label: "EXAM_HEAD (Exam Head)" },
  { value: "CAMPUS_CHIEF", label: "CAMPUS_CHIEF (Campus Chief)" },
  {
    value: "ASSISTANT_CAMPUS_CHIEF",
    label: "ASSISTANT_CAMPUS_CHIEF (Asst Campus Chief)",
  },
  { value: "STUDENT", label: "STUDENT" },
];

export const INVITABLE_ROLE_OPTIONS = INTERNAL_ROLE_OPTIONS.filter(
  (item) => item.value !== "SUPER_ADMIN"
);

export function formatRoleLabel(role) {
  const value = String(role || "").trim().toUpperCase();
  const found = INTERNAL_ROLE_OPTIONS.find((item) => item.value === value);
  if (!found) return value || "—";
  return found.label
    .replace(/^EXAM_HEAD \((.+)\)$/i, "$1")
    .replace(/^CAMPUS_CHIEF \((.+)\)$/i, "$1")
    .replace(/^ASSISTANT_CAMPUS_CHIEF \((.+)\)$/i, "$1")
    .replace(/^([A-Z_]+)$/, found.value === "FINANCE" ? "Finance" : found.value);
}
