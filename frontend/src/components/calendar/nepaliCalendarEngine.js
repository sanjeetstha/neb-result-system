const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const WEEK_DAYS_NP = [
  "आइतबार",
  "सोमबार",
  "मंगलबार",
  "बुधबार",
  "बिहिबार",
  "सुक्रबार",
  "सनिबार",
];

export const BS_MONTH_NAMES = [
  "बैशाख",
  "जेठ",
  "असार",
  "साउन",
  "भदौ",
  "असोज",
  "कार्तिक",
  "मंसिर",
  "पुष",
  "माघ",
  "फागुन",
  "चैत",
];

export const NEPALI_FONT_STACK = [
  "'Noto Sans Devanagari'",
  "'Kalimati'",
  "'Mukta'",
  "'Hind Siliguri'",
  "sans-serif",
].join(", ");

const BS_BASE_MONTH_DAYS = [31, 31, 32, 31, 31, 30, 30, 29, 30, 29, 30, 30];

// Anchor:
// 2024-04-13 AD ~= 2081-01-01 BS
// This keeps the UI fully functional offline without external APIs.
const AD_ANCHOR = new Date(2024, 3, 13);
const BS_ANCHOR = { year: 2081, month: 1, day: 1 };

const yearStartOffsetCache = new Map([[BS_ANCHOR.year, 0]]);

function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, deltaDays) {
  const out = normalizeDate(date);
  out.setDate(out.getDate() + deltaDays);
  return out;
}

function diffDays(fromDate, toDate) {
  const from = normalizeDate(fromDate).getTime();
  const to = normalizeDate(toDate).getTime();
  return Math.round((to - from) / MS_PER_DAY);
}

export function toNepaliDigits(value) {
  const digits = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
  return String(value).replace(/\d/g, (d) => digits[Number(d)]);
}

export function fromNepaliDigits(value) {
  const map = {
    "०": "0",
    "१": "1",
    "२": "2",
    "३": "3",
    "४": "4",
    "५": "5",
    "६": "6",
    "७": "7",
    "८": "8",
    "९": "9",
  };
  return Number(String(value).replace(/[०-९]/g, (d) => map[d] || d));
}

export function isBsLeapYear(year) {
  return year % 4 === 0;
}

export function getBsMonthDays(year, month) {
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return 30;
  if (monthIndex === 11 && isBsLeapYear(Number(year))) return 31;
  return BS_BASE_MONTH_DAYS[monthIndex];
}

export function getBsYearDays(year) {
  return isBsLeapYear(Number(year)) ? 366 : 365;
}

function getYearStartOffsetFromAnchor(year) {
  const y = Number(year);
  if (yearStartOffsetCache.has(y)) return yearStartOffsetCache.get(y);

  let offset = 0;
  if (y > BS_ANCHOR.year) {
    for (let i = BS_ANCHOR.year; i < y; i += 1) {
      offset += getBsYearDays(i);
    }
  } else {
    for (let i = y; i < BS_ANCHOR.year; i += 1) {
      offset -= getBsYearDays(i);
    }
  }

  yearStartOffsetCache.set(y, offset);
  return offset;
}

function getBsDayOffsetFromAnchor(bsDate) {
  const year = Number(bsDate.year);
  const month = Number(bsDate.month);
  const day = Number(bsDate.day);

  let offset = getYearStartOffsetFromAnchor(year);
  for (let m = 1; m < month; m += 1) {
    offset += getBsMonthDays(year, m);
  }
  offset += day - 1;
  return offset;
}

export function bsToAd(bsDate) {
  const dayOffset = getBsDayOffsetFromAnchor(bsDate);
  return addDays(AD_ANCHOR, dayOffset);
}

export function adToBs(inputDate) {
  const adDate = normalizeDate(new Date(inputDate));
  let remainingDays = diffDays(AD_ANCHOR, adDate);
  let year = BS_ANCHOR.year;

  while (remainingDays >= getBsYearDays(year)) {
    remainingDays -= getBsYearDays(year);
    year += 1;
  }
  while (remainingDays < 0) {
    year -= 1;
    remainingDays += getBsYearDays(year);
  }

  let month = 1;
  while (remainingDays >= getBsMonthDays(year, month)) {
    remainingDays -= getBsMonthDays(year, month);
    month += 1;
  }

  const day = remainingDays + 1;
  return {
    year,
    month,
    day,
    weekdayIndex: adDate.getDay(),
    adDate,
  };
}

export function getPreviousBsMonth(year, month) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function getNextBsMonth(year, month) {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function isSameBsDate(a, b) {
  if (!a || !b) return false;
  return Number(a.year) === Number(b.year) && Number(a.month) === Number(b.month) && Number(a.day) === Number(b.day);
}

export function getMonthLabel(year, month) {
  const monthName = BS_MONTH_NAMES[Number(month) - 1] || "";
  return `${monthName} ${toNepaliDigits(year)}`;
}

export function formatBsDateLong(bsDate) {
  const weekday = WEEK_DAYS_NP[bsToAd(bsDate).getDay()] || "";
  const monthName = BS_MONTH_NAMES[Number(bsDate.month) - 1] || "";
  return `${weekday}, ${monthName} ${toNepaliDigits(bsDate.day)} गते ${toNepaliDigits(bsDate.year)}`;
}

export function formatAdDateShort(adDate) {
  return normalizeDate(adDate).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function getBsMonthMatrix(year, month, slots = 42) {
  const firstDayAd = bsToAd({ year, month, day: 1 });
  const firstWeekday = firstDayAd.getDay();
  const daysInCurrent = getBsMonthDays(year, month);

  const prevMonth = getPreviousBsMonth(year, month);
  const nextMonth = getNextBsMonth(year, month);
  const prevMonthDays = getBsMonthDays(prevMonth.year, prevMonth.month);

  const totalCells = Math.max(35, Math.ceil((firstWeekday + daysInCurrent) / 7) * 7, slots);
  const cells = [];

  for (let i = 0; i < totalCells; i += 1) {
    let cellYear = year;
    let cellMonth = month;
    let cellDay;
    let inCurrentMonth = true;

    if (i < firstWeekday) {
      inCurrentMonth = false;
      cellYear = prevMonth.year;
      cellMonth = prevMonth.month;
      cellDay = prevMonthDays - firstWeekday + i + 1;
    } else if (i >= firstWeekday + daysInCurrent) {
      inCurrentMonth = false;
      cellYear = nextMonth.year;
      cellMonth = nextMonth.month;
      cellDay = i - (firstWeekday + daysInCurrent) + 1;
    } else {
      cellDay = i - firstWeekday + 1;
    }

    const bsDate = { year: cellYear, month: cellMonth, day: cellDay };
    const adDate = bsToAd(bsDate);
    cells.push({
      key: `${cellYear}-${cellMonth}-${cellDay}-${i}`,
      bsDate,
      adDate,
      inCurrentMonth,
      weekdayIndex: adDate.getDay(),
    });
  }

  return {
    year,
    month,
    daysInCurrent,
    firstWeekday,
    cells,
  };
}

