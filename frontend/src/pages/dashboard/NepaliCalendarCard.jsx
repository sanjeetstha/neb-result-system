import { CalendarDays } from "lucide-react";

import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";
import NepaliCalendar from "../../components/calendar/NepaliCalendar";
import { NEPALI_FONT_STACK, toNepaliDigits } from "../../components/calendar/nepaliCalendarEngine";
import { cn } from "../../lib/utils";

const SPECIAL_DAYS = [10, 18, 27];
const PUBLIC_HOLIDAY_DAYS = [15, 24];

export default function NepaliCalendarCard({ className }) {
  return (
    <Card className={cn("border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]", className)}>
      <CardContent className="p-5 space-y-3" style={{ fontFamily: NEPALI_FONT_STACK }}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">कार्य क्यालेन्डर</div>
          <CalendarDays className="h-4 w-4 text-slate-500" />
        </div>

        <NepaliCalendar
          highlights={{
            special: SPECIAL_DAYS,
            publicHoliday: PUBLIC_HOLIDAY_DAYS,
          }}
        />

        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-900 inline-block" />
            विशेष दिन
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
            PH
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
            शनिबार
          </span>
        </div>

        <Separator />

        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <span>परीक्षा सेटअप फ्रिज</span>
            <span className="font-medium">{toNepaliDigits(10)} गते</span>
          </div>
          <div className="flex items-center justify-between">
            <span>बल्क अपलोड डेडलाइन</span>
            <span className="font-medium">{toNepaliDigits(18)} गते</span>
          </div>
          <div className="flex items-center justify-between">
            <span>नतिजा समीक्षा</span>
            <span className="font-medium">{toNepaliDigits(27)} गते</span>
          </div>
          <div className="flex items-center justify-between">
            <span>सार्वजनिक बिदा (PH)</span>
            <span className="font-medium">{toNepaliDigits(15)}, {toNepaliDigits(24)} गते</span>
          </div>
          <div className="flex items-center justify-between">
            <span>प्रकाशन विन्डो</span>
            <span className="font-medium">{toNepaliDigits(24)} गते</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
