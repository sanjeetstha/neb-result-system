export function parseIsoDateParts(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatLocalDateToIso(dateValue) {
  if (!dateValue) return "";
  const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayLocalIsoDate() {
  return formatLocalDateToIso(new Date());
}
