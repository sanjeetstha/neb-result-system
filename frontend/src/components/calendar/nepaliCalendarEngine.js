const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const WEEK_DAYS_NP = [
  "आइतबार",
  "सोमबार",
  "मंगलबार",
  "बुधबार",
  "बिहिबार",
  "सुक्रबार",
  "शनिबार",
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

export const BS_MIN_YEAR = 1970;

const SHORT_MONTH_NAMES_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Encoded BS month lengths for 1970-2090.
// Month length = 29 + ((encodedYear >> (monthIndex * 2)) & 3)
const BS_ENCODED_MONTH_LENGTHS = [
  5315258, 5314490, 9459438, 8673005, 5315258, 5315066, 9459438, 8673005,
  5315258, 5314298, 9459438, 5327594, 5315258, 5314298, 9459438, 5327594,
  5315258, 5314286, 9459438, 5315306, 5315258, 5314286, 8673006, 5315306,
  5315258, 5265134, 8673006, 5315258, 5315258, 9459438, 8673005, 5315258,
  5314298, 9459438, 8673005, 5315258, 5314298, 9459438, 8473322, 5315258,
  5314298, 9459438, 5327594, 5315258, 5314298, 9459438, 5327594, 5315258,
  5314286, 8673006, 5315306, 5315258, 5265134, 8673006, 5315306, 5315258,
  9459438, 8673005, 5315258, 5314490, 9459438, 8673005, 5315258, 5314298,
  9459438, 8473325, 5315258, 5314298, 9459438, 5327594, 5315258, 5314298,
  9459438, 5327594, 5315258, 5314286, 9459438, 5315306, 5315258, 5265134,
  8673006, 5315306, 5315258, 5265134, 8673006, 5315258, 5314490, 9459438,
  8673005, 5315258, 5314298, 9459438, 8669933, 5315258, 5314298, 9459438,
  8473322, 5315258, 5314298, 9459438, 5327594, 5315258, 5314286, 9459438,
  5315306, 5315258, 5265134, 8673006, 5315306, 5315258, 5265134, 8673006,
  5315258, 5527226, 5527226, 5528046, 5527277, 5528250, 5528057, 5527277,
  5527277,
];

export const BS_MAX_YEAR = BS_MIN_YEAR + BS_ENCODED_MONTH_LENGTHS.length - 1;

// 1970-01-01 BS == 1913-04-13 AD
const AD_EPOCH_UTC = Date.UTC(1913, 3, 13);

const BS_MONTH_LENGTHS = BS_ENCODED_MONTH_LENGTHS.map((encodedYear) =>
  Array.from({ length: 12 }, (_, monthIndex) => 29 + ((encodedYear >> (monthIndex * 2)) & 3))
);

const BS_YEAR_START_DAY_OFFSETS = (() => {
  const offsets = [0];
  for (const months of BS_MONTH_LENGTHS) {
    offsets.push(offsets[offsets.length - 1] + months.reduce((sum, days) => sum + days, 0));
  }
  return offsets;
})();

const MAX_DAY_OFFSET = BS_YEAR_START_DAY_OFFSETS[BS_YEAR_START_DAY_OFFSETS.length - 1] - 1;

function parseIsoDateString(value) {
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

function isSupportedBsYear(year) {
  return Number(year) >= BS_MIN_YEAR && Number(year) <= BS_MAX_YEAR;
}

function toLocalNoonDate(year, month, day) {
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
}

function getAdDateParts(inputDate) {
  if (typeof inputDate === "string") {
    const parsed = parseIsoDateString(inputDate);
    if (parsed) return parsed;
  }
  const date = inputDate instanceof Date ? new Date(inputDate.getTime()) : new Date(inputDate);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function getUtcDayOffset(year, month, day) {
  return Math.floor((Date.UTC(year, month - 1, day) - AD_EPOCH_UTC) / MS_PER_DAY);
}

function findBsYearIndex(dayOffset) {
  let low = 0;
  let high = BS_MONTH_LENGTHS.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = BS_YEAR_START_DAY_OFFSETS[mid];
    const next = BS_YEAR_START_DAY_OFFSETS[mid + 1];
    if (dayOffset < start) {
      high = mid - 1;
    } else if (dayOffset >= next) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
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
  const y = Number(year);
  if (!isSupportedBsYear(y)) return false;
  return getBsYearDays(y) === 366;
}

export function getBsMonthDays(year, month) {
  const y = Number(year);
  const monthIndex = Number(month) - 1;
  if (!isSupportedBsYear(y) || monthIndex < 0 || monthIndex > 11) {
    throw new RangeError(`Unsupported BS date: ${year}-${month}`);
  }
  return BS_MONTH_LENGTHS[y - BS_MIN_YEAR][monthIndex];
}

export function getBsYearDays(year) {
  const y = Number(year);
  if (!isSupportedBsYear(y)) {
    throw new RangeError(`Unsupported BS year: ${year}`);
  }
  return BS_MONTH_LENGTHS[y - BS_MIN_YEAR].reduce((sum, days) => sum + days, 0);
}

export function bsToAd(bsDate) {
  const year = Number(bsDate?.year);
  const month = Number(bsDate?.month);
  const day = Number(bsDate?.day);
  if (!isSupportedBsYear(year)) {
    throw new RangeError(`Unsupported BS year: ${year}`);
  }
  const monthDays = getBsMonthDays(year, month);
  if (day < 1 || day > monthDays) {
    throw new RangeError(`Unsupported BS day: ${year}-${month}-${day}`);
  }

  let dayOffset = BS_YEAR_START_DAY_OFFSETS[year - BS_MIN_YEAR];
  for (let m = 1; m < month; m += 1) {
    dayOffset += getBsMonthDays(year, m);
  }
  dayOffset += day - 1;

  const utcDate = new Date(AD_EPOCH_UTC + dayOffset * MS_PER_DAY);
  return toLocalNoonDate(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

export function adToBs(inputDate) {
  const adParts = getAdDateParts(inputDate);
  if (!adParts) {
    throw new RangeError("Invalid AD date");
  }
  const dayOffset = getUtcDayOffset(adParts.year, adParts.month, adParts.day);
  if (dayOffset < 0 || dayOffset > MAX_DAY_OFFSET) {
    throw new RangeError(
      `AD date is outside supported Bikram Sambat range: ${adParts.year}-${String(
        adParts.month
      ).padStart(2, "0")}-${String(adParts.day).padStart(2, "0")}`
    );
  }

  const yearIndex = findBsYearIndex(dayOffset);
  const months = BS_MONTH_LENGTHS[yearIndex];
  let remainingDays = dayOffset - BS_YEAR_START_DAY_OFFSETS[yearIndex];
  let monthIndex = 0;

  while (monthIndex < months.length && remainingDays >= months[monthIndex]) {
    remainingDays -= months[monthIndex];
    monthIndex += 1;
  }

  const adDate = toLocalNoonDate(adParts.year, adParts.month, adParts.day);
  return {
    year: BS_MIN_YEAR + yearIndex,
    month: monthIndex + 1,
    day: remainingDays + 1,
    weekdayIndex: adDate.getDay(),
    adDate,
  };
}

export function getPreviousBsMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (m <= 1) {
    if (y <= BS_MIN_YEAR) return { year: BS_MIN_YEAR, month: 1 };
    return { year: y - 1, month: 12 };
  }
  return { year: y, month: m - 1 };
}

export function getNextBsMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (m >= 12) {
    if (y >= BS_MAX_YEAR) return { year: BS_MAX_YEAR, month: 12 };
    return { year: y + 1, month: 1 };
  }
  return { year: y, month: m + 1 };
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
  const parts = getAdDateParts(adDate);
  if (!parts) return "—";
  const monthName = SHORT_MONTH_NAMES_EN[parts.month - 1] || String(parts.month).padStart(2, "0");
  return `${monthName} ${String(parts.day).padStart(2, "0")}, ${parts.year}`;
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
