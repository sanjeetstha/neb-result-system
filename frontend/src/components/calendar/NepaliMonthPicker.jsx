import { useMemo } from "react";

import { cn } from "../../lib/utils";
import { BS_MAX_YEAR, BS_MIN_YEAR, BS_MONTH_NAMES, adToBs, toNepaliDigits } from "./nepaliCalendarEngine";

function parseMonthKey(value) {
  const m = String(value || "").trim().match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function currentBsMonthKey() {
  const bs = adToBs(new Date());
  return `${bs.year}-${String(bs.month).padStart(2, "0")}`;
}

export function formatNepaliMonthKey(value) {
  const parsed = parseMonthKey(value);
  if (!parsed) return String(value || "—");
  const monthName = BS_MONTH_NAMES[parsed.month - 1] || String(parsed.month);
  return `${monthName} ${toNepaliDigits(parsed.year)}`;
}

export default function NepaliMonthPicker({
  value,
  onChange,
  className,
  yearSpan = 5,
  showEmpty = false,
}) {
  const currentBs = useMemo(() => adToBs(new Date()), []);
  const parsed = parseMonthKey(value) || { year: currentBs.year, month: currentBs.month };
  const years = useMemo(() => {
    const out = [];
    const start = Math.max(BS_MIN_YEAR, currentBs.year - yearSpan);
    const end = Math.min(BS_MAX_YEAR, currentBs.year + yearSpan);
    for (let y = start; y <= end; y += 1) {
      out.push(y);
    }
    return out;
  }, [currentBs.year, yearSpan]);

  function emit(next) {
    if (!next?.year || !next?.month) {
      onChange?.("");
      return;
    }
    onChange?.(`${next.year}-${String(next.month).padStart(2, "0")}`);
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <select
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={String(parsed.month)}
        onChange={(e) => emit({ year: parsed.year, month: Number(e.target.value) })}
      >
        {showEmpty ? <option value="">महिना</option> : null}
        {BS_MONTH_NAMES.map((name, idx) => (
          <option key={`${name}-${idx + 1}`} value={String(idx + 1)}>
            {name}
          </option>
        ))}
      </select>
      <select
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={String(parsed.year)}
        onChange={(e) => emit({ year: Number(e.target.value), month: parsed.month })}
      >
        {showEmpty ? <option value="">वर्ष</option> : null}
        {years.map((year) => (
          <option key={year} value={String(year)}>
            {toNepaliDigits(year)}
          </option>
        ))}
      </select>
    </div>
  );
}
