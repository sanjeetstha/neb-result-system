import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  BS_MONTH_NAMES,
  NEPALI_FONT_STACK,
  WEEK_DAYS_NP,
  adToBs,
  bsToAd,
  formatAdDateShort,
  formatBsDateLong,
  getBsMonthMatrix,
  getMonthLabel,
  getNextBsMonth,
  getPreviousBsMonth,
  isSameBsDate,
  toNepaliDigits,
} from "./nepaliCalendarEngine";

function buildYearRange(centerYear, span = 20) {
  const years = [];
  for (let y = centerYear - span; y <= centerYear + span; y += 1) years.push(y);
  return years;
}

export default function NepaliCalendar({
  className,
  value,
  onChange,
  onMonthChange,
  highlights = { special: [], publicHoliday: [] },
  showSummary = true,
}) {
  const todayBs = useMemo(() => adToBs(new Date()), []);
  const initialBs = value || todayBs;

  const [selectedBs, setSelectedBs] = useState(initialBs);
  const [viewYear, setViewYear] = useState(initialBs.year);
  const [viewMonth, setViewMonth] = useState(initialBs.month);

  const highlightSpecial = useMemo(
    () => new Set(highlights?.special || highlights?.primary || []),
    [highlights?.special, highlights?.primary]
  );
  const highlightPublicHoliday = useMemo(
    () => new Set(highlights?.publicHoliday || highlights?.secondary || []),
    [highlights?.publicHoliday, highlights?.secondary]
  );

  useEffect(() => {
    if (!value) return;
    setSelectedBs(value);
    setViewYear(value.year);
    setViewMonth(value.month);
  }, [value?.year, value?.month, value?.day]);

  useEffect(() => {
    if (!onMonthChange) return;
    onMonthChange({ year: viewYear, month: viewMonth });
  }, [onMonthChange, viewMonth, viewYear]);

  const monthMatrix = useMemo(() => getBsMonthMatrix(viewYear, viewMonth), [viewMonth, viewYear]);
  const yearRange = useMemo(() => buildYearRange(todayBs.year), [todayBs.year]);

  const selectedAdDate = useMemo(() => bsToAd(selectedBs), [selectedBs]);

  function selectDay(cell) {
    setSelectedBs(cell.bsDate);
    if (!cell.inCurrentMonth) {
      setViewYear(cell.bsDate.year);
      setViewMonth(cell.bsDate.month);
    }
    onChange?.({
      bsDate: cell.bsDate,
      adDate: cell.adDate,
      weekdayIndex: cell.weekdayIndex,
    });
  }

  function goToToday() {
    const today = adToBs(new Date());
    setSelectedBs(today);
    setViewYear(today.year);
    setViewMonth(today.month);
    onChange?.({
      bsDate: today,
      adDate: bsToAd(today),
      weekdayIndex: bsToAd(today).getDay(),
    });
  }

  function goPrevMonth() {
    const prev = getPreviousBsMonth(viewYear, viewMonth);
    setViewYear(prev.year);
    setViewMonth(prev.month);
  }

  function goNextMonth() {
    const next = getNextBsMonth(viewYear, viewMonth);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  function setMonthFromDropdown(month) {
    setViewMonth(Number(month));
  }

  function setYearFromDropdown(year) {
    setViewYear(Number(year));
  }

  return (
    <div className={cn("space-y-3", className)} style={{ fontFamily: NEPALI_FONT_STACK }}>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={goPrevMonth}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-sm font-semibold text-slate-700">{getMonthLabel(viewYear, viewMonth)}</div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={goNextMonth}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
          value={viewMonth}
          onChange={(e) => setMonthFromDropdown(e.target.value)}
        >
          {BS_MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
          value={viewYear}
          onChange={(e) => setYearFromDropdown(e.target.value)}
        >
          {yearRange.map((y) => (
            <option key={y} value={y}>
              {toNepaliDigits(y)}
            </option>
          ))}
        </select>

        <Button type="button" variant="secondary" size="sm" className="h-8" onClick={goToToday}>
          आज
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[9px] leading-tight text-slate-500">
        {WEEK_DAYS_NP.map((day, index) => (
          <div
            key={day}
            className={cn("px-0.5 text-center break-words", index === 6 && "text-red-600 font-semibold")}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthMatrix.cells.map((cell) => {
          const isSelected = isSameBsDate(cell.bsDate, selectedBs);
          const isSpecialDay = cell.inCurrentMonth && highlightSpecial.has(cell.bsDate.day);
          const isPublicHoliday = cell.inCurrentMonth && highlightPublicHoliday.has(cell.bsDate.day);
          const isSaturday = cell.weekdayIndex === 6;
          const shouldPaintSaturday = isSaturday && !isSpecialDay && !isPublicHoliday;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => selectDay(cell)}
              className={cn(
                "h-7 rounded text-[10px] flex items-center justify-center transition-colors",
                cell.inCurrentMonth ? "hover:bg-slate-100" : "text-slate-300 hover:bg-slate-50",
                cell.inCurrentMonth && !shouldPaintSaturday && "text-slate-700",
                cell.inCurrentMonth && shouldPaintSaturday && "text-red-600 bg-red-50 hover:bg-red-100",
                !cell.inCurrentMonth && shouldPaintSaturday && "text-red-300",
                isSelected && "ring-1 ring-slate-400 bg-slate-100 font-semibold",
                isSpecialDay && "bg-sky-900 text-white hover:bg-sky-800",
                isPublicHoliday && "bg-amber-400 text-slate-900 hover:bg-amber-300"
              )}
            >
              {toNepaliDigits(cell.bsDate.day)}
            </button>
          );
        })}
      </div>

      {showSummary ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 space-y-1">
          <div className="font-medium">{formatBsDateLong(selectedBs)}</div>
          <div className="text-slate-500">AD: {formatAdDateShort(selectedAdDate)}</div>
        </div>
      ) : null}
    </div>
  );
}
