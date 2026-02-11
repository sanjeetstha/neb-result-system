import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  GripVertical,
  MessageSquare,
  Users,
} from "lucide-react";

import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import NepaliCalendarCard from "./NepaliCalendarCard";

const KPI_CARDS = [
  {
    title: "Exam Sessions",
    value: "12",
    meta: "+2 this month",
    icon: ClipboardList,
    accent: "from-sky-600 to-cyan-500",
  },
  {
    title: "Total Students",
    value: "1,284",
    meta: "Across active batches",
    icon: Users,
    accent: "from-emerald-600 to-teal-500",
  },
  {
    title: "Pending Entries",
    value: "146",
    meta: "Needs mark submission",
    icon: BookOpenCheck,
    accent: "from-amber-500 to-orange-500",
  },
  {
    title: "Corrections Queue",
    value: "18",
    meta: "Awaiting approval",
    icon: MessageSquare,
    accent: "from-rose-500 to-fuchsia-500",
  },
];

const PIPELINE_STEPS = [
  { label: "Exam Setup", value: 88 },
  { label: "Component Mapping", value: 74 },
  { label: "Bulk Marks Entry", value: 58 },
  { label: "Correction Review", value: 39 },
  { label: "Result Publication", value: 22 },
];

const ACTIVITY_FEED = [
  {
    title: "Pre-Board 2082 updated",
    detail: "Exam components were updated for Class 12.",
    time: "10 min ago",
  },
  {
    title: "Bulk import completed",
    detail: "98 student marks imported successfully.",
    time: "38 min ago",
  },
  {
    title: "Correction approved",
    detail: "Symbol 823220060101 marks corrected in TH-104.",
    time: "1 hr ago",
  },
  {
    title: "Result snapshot generated",
    detail: "Class 11 First Terminal snapshots are ready.",
    time: "2 hr ago",
  },
];

const WIDGET_IDS = [
  "kpi_exam_sessions",
  "kpi_total_students",
  "kpi_pending_entries",
  "kpi_corrections_queue",
  "result_comparison",
  "pass_distribution",
  "marks_entry_trend",
  "workflow_pipeline",
  "nepali_calendar",
  "recent_activity",
  "priority_actions",
];

const DEFAULT_WIDGET_ZONES = {
  kpi: [
    "kpi_exam_sessions",
    "kpi_total_students",
    "kpi_pending_entries",
    "kpi_corrections_queue",
  ],
  left: ["result_comparison", "marks_entry_trend", "workflow_pipeline", "priority_actions"],
  right: ["pass_distribution", "nepali_calendar", "recent_activity"],
};

const DASHBOARD_LAYOUT_KEY = "dashboard_widget_layout_v2";

function arrayEquals(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getZoneForWidget(layout, widgetId) {
  if (!layout) return null;
  if (layout.kpi?.includes(widgetId)) return "kpi";
  if (layout.left?.includes(widgetId)) return "left";
  if (layout.right?.includes(widgetId)) return "right";
  return null;
}

function isValidWidgetLayout(layout) {
  if (!layout || typeof layout !== "object") return false;
  if (!Array.isArray(layout.kpi) || !Array.isArray(layout.left) || !Array.isArray(layout.right)) {
    return false;
  }
  const all = [...layout.kpi, ...layout.left, ...layout.right];
  const uniq = new Set(all);
  if (all.length !== WIDGET_IDS.length || uniq.size !== WIDGET_IDS.length) return false;
  return WIDGET_IDS.every((id) => uniq.has(id));
}

function loadWidgetLayout() {
  if (typeof window === "undefined") return DEFAULT_WIDGET_ZONES;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (!raw) return DEFAULT_WIDGET_ZONES;
    const parsed = JSON.parse(raw);
    return isValidWidgetLayout(parsed) ? parsed : DEFAULT_WIDGET_ZONES;
  } catch {
    return DEFAULT_WIDGET_ZONES;
  }
}

function moveWidget(layout, widgetId, toZone, beforeWidgetId = null) {
  const fromZone = getZoneForWidget(layout, widgetId);
  if (!fromZone || !layout[toZone]) return layout;

  const fromList = layout[fromZone];
  const toList = layout[toZone];
  const fromIndex = fromList.indexOf(widgetId);
  if (fromIndex < 0) return layout;

  if (fromZone === toZone) {
    const targetIndex = beforeWidgetId ? toList.indexOf(beforeWidgetId) : toList.length;
    if (beforeWidgetId && targetIndex < 0) return layout;
    if (beforeWidgetId) {
      if (fromIndex === targetIndex || fromIndex === targetIndex - 1) return layout;
    } else if (fromIndex === toList.length - 1) {
      return layout;
    }

    const nextList = [...toList];
    nextList.splice(fromIndex, 1);
    let insertAt = beforeWidgetId ? nextList.indexOf(beforeWidgetId) : nextList.length;
    if (insertAt < 0) insertAt = nextList.length;
    nextList.splice(insertAt, 0, widgetId);
    return { ...layout, [fromZone]: nextList };
  }

  const nextFrom = fromList.filter((id) => id !== widgetId);
  const nextTo = [...toList];
  let insertAt = beforeWidgetId ? nextTo.indexOf(beforeWidgetId) : nextTo.length;
  if (insertAt < 0) insertAt = nextTo.length;
  nextTo.splice(insertAt, 0, widgetId);

  if (arrayEquals(nextFrom, fromList) && arrayEquals(nextTo, toList)) return layout;
  return { ...layout, [fromZone]: nextFrom, [toZone]: nextTo };
}

function KpiCard({ title, value, meta, icon: Icon, accent }) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)] transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {value}
            </div>
            <div className="mt-1 text-xs text-slate-500">{meta}</div>
          </div>
          <div
            className={[
              "rounded-xl p-2.5 text-white shadow-md",
              "bg-gradient-to-br",
              accent,
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultBars() {
  const blue = [24, 36, 28, 32, 22, 42, 30, 34, 26];
  const amber = [18, 28, 20, 24, 34, 26, 36, 24, 31];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP"];
  const avgTermB = Math.round(blue.reduce((sum, v) => sum + v, 0) / blue.length);
  const avgTermA = Math.round(amber.reduce((sum, v) => sum + v, 0) / amber.length);
  const bestMonthIndex = blue.reduce(
    (best, value, i) => (value > blue[best] ? i : best),
    0
  );
  const positiveGapCount = blue.filter((value, i) => value >= amber[i]).length;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-9 gap-1.5 h-32 items-end">
        {months.map((m, i) => (
          <div key={m} className="flex flex-col items-center gap-1">
            <div className="h-24 w-full flex items-end justify-center gap-1">
              <div
                className="w-2 rounded-t bg-slate-900"
                style={{ height: `${blue[i] * 1.8}px` }}
              />
              <div
                className="w-2 rounded-t bg-amber-400"
                style={{ height: `${amber[i] * 1.8}px` }}
              />
            </div>
            <div className="text-[10px] text-slate-500">{m}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-4 text-[11px] text-slate-500">
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400 inline-block" />
          Term-A
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-900 inline-block" />
          Term-B
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-slate-500">Avg Term-A</div>
          <div className="font-semibold text-slate-800">{avgTermA}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-slate-500">Avg Term-B</div>
          <div className="font-semibold text-slate-800">{avgTermB}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-slate-500">Best Month</div>
          <div className="font-semibold text-slate-800">{months[bestMonthIndex]}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-slate-500">Positive Gap</div>
          <div className="font-semibold text-slate-800">
            {positiveGapCount}/{months.length}
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionDonut() {
  const pct = 67;
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative h-44 w-44 rounded-full"
        style={{
          background: `conic-gradient(#0f3d66 ${pct}%, #f8b321 ${pct}% 100%)`,
        }}
      >
        <div className="absolute inset-[20px] rounded-full bg-white flex items-center justify-center text-4xl font-semibold text-slate-700">
          {pct}%
        </div>
      </div>
      <div className="w-full space-y-2 text-sm text-slate-600">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-900 inline-block" />
            Passed
          </span>
          <span>67%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" />
            Need Attention
          </span>
          <span>33%</span>
        </div>
      </div>
    </div>
  );
}

function TrendArea() {
  return (
    <svg viewBox="0 0 700 190" className="w-full h-40">
      <defs>
        <linearGradient id="trendBlue" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#194f7a" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#194f7a" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="trendAmber" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f8b321" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f8b321" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <path
        d="M0,145 C60,70 130,180 190,115 C250,55 310,175 380,105 C450,35 520,180 580,110 C640,65 680,130 700,95 L700,190 L0,190 Z"
        fill="url(#trendBlue)"
      />
      <path
        d="M0,160 C70,95 130,165 200,128 C270,85 320,170 390,120 C460,80 520,165 590,122 C650,90 680,130 700,112 L700,190 L0,190 Z"
        fill="url(#trendAmber)"
      />
    </svg>
  );
}

function ResultComparisonPanel() {
  return (
    <Card className="border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-slate-700">Result Comparison</div>
            <div className="text-xs text-slate-500">Monthly term-wise performance</div>
          </div>
          <Button size="sm" className="h-8 px-3 bg-amber-400 hover:bg-amber-500 text-slate-900">
            Check Now
          </Button>
        </div>
        <ResultBars />
      </CardContent>
    </Card>
  );
}

function PassDistributionPanel() {
  return (
    <Card className="border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">Pass Distribution</div>
          <Badge variant="outline">Live</Badge>
        </div>
        <DistributionDonut />
        <Button className="w-full bg-amber-400 hover:bg-amber-500 text-slate-900">
          Check Now
        </Button>
      </CardContent>
    </Card>
  );
}

function MarksEntryTrendPanel() {
  return (
    <Card className="border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-slate-700">Marks Entry Trend</div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" />
              Manual
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-800 inline-block" />
              Imported
            </span>
          </div>
        </div>
        <TrendArea />
      </CardContent>
    </Card>
  );
}

function WorkflowPipelinePanel() {
  return (
    <Card className="border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">Workflow Pipeline</div>
          <Badge variant="outline">This Week</Badge>
        </div>
        <div className="space-y-3">
          {PIPELINE_STEPS.map((step) => (
            <div key={step.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{step.label}</span>
                <span>{step.value}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-slate-900 to-sky-700"
                  style={{ width: `${step.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityPanel() {
  return (
    <Card className="border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">Recent Activity</div>
          <Badge variant="outline">Live Feed</Badge>
        </div>
        <div className="space-y-3">
          {ACTIVITY_FEED.map((a) => (
            <div key={a.title} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-sm text-slate-800">{a.title}</div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">{a.time}</div>
              </div>
              <div className="mt-1 text-xs text-slate-500">{a.detail}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityActionsPanel() {
  return (
    <Card className="border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          Need to finalize something fast? Open priority actions directly.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/corrections">
              Review Corrections
              <ArrowUpRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/results/marksheet">
              Print Marksheet
              <ArrowUpRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button asChild className="bg-slate-900 hover:bg-slate-800 text-white">
            <Link to="/results/sms">
              Send Notifications
              <Bell className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DraggableWidget({
  zone,
  widgetId,
  draggingId,
  hoverKey,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDropWidget,
  children,
}) {
  const isDragging = draggingId === widgetId;
  const isHovering = hoverKey === `${zone}:${widgetId}`;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropWidget(zone, widgetId);
      }}
      onDragEnter={() => onDragEnter(zone, widgetId)}
      className={cn(
        "relative transition-all duration-150",
        !isDragging && "hover:-translate-y-0.5",
        isDragging && "opacity-55 scale-[0.98]",
        isHovering && "ring-2 ring-sky-400 rounded-xl"
      )}
      data-widget-id={widgetId}
      data-zone={zone}
    >
      <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, widgetId)}
        onDragEnd={onDragEnd}
        className="absolute -left-3 top-3 z-30 rounded-md border border-slate-200/80 bg-white/90 p-1 text-slate-400 shadow-sm cursor-grab active:cursor-grabbing hover:text-slate-600"
        aria-label="Drag card"
        title="Drag card"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

export default function DashboardHome() {
  const [widgetZones, setWidgetZones] = useState(loadWidgetLayout);
  const [draggingId, setDraggingId] = useState("");
  const [hoverKey, setHoverKey] = useState("");
  const dragRef = useRef({ id: "" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(widgetZones));
  }, [widgetZones]);

  function handleDragStart(event, widgetId) {
    dragRef.current = { id: widgetId };
    setDraggingId(widgetId);
    setHoverKey("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", widgetId);
  }

  function handleDragEnd() {
    dragRef.current = { id: "" };
    setDraggingId("");
    setHoverKey("");
  }

  function moveDraggingWidgetTo(toZone, beforeWidgetId = null) {
    const id = dragRef.current.id;
    if (!id) return;
    setWidgetZones((prev) => moveWidget(prev, id, toZone, beforeWidgetId));
  }

  function handleWidgetDragEnter(zone, overWidgetId) {
    const id = dragRef.current.id;
    if (!id || id === overWidgetId) return;
    setHoverKey(`${zone}:${overWidgetId}`);
    moveDraggingWidgetTo(zone, overWidgetId);
  }

  function handleWidgetDrop(zone, overWidgetId) {
    const id = dragRef.current.id;
    if (!id || id === overWidgetId) return;
    moveDraggingWidgetTo(zone, overWidgetId);
  }

  function handleZoneEndDragEnter(zone) {
    const id = dragRef.current.id;
    if (!id) return;
    setHoverKey(`${zone}:__end__`);
    moveDraggingWidgetTo(zone, null);
  }

  function handleZoneEndDrop(zone) {
    const id = dragRef.current.id;
    if (!id) return;
    moveDraggingWidgetTo(zone, null);
  }

  function renderWidget(widgetId, zone) {
    const content =
      widgetId === "kpi_exam_sessions" ? (
        <KpiCard {...KPI_CARDS[0]} />
      ) : widgetId === "kpi_total_students" ? (
        <KpiCard {...KPI_CARDS[1]} />
      ) : widgetId === "kpi_pending_entries" ? (
        <KpiCard {...KPI_CARDS[2]} />
      ) : widgetId === "kpi_corrections_queue" ? (
        <KpiCard {...KPI_CARDS[3]} />
      ) : widgetId === "result_comparison" ? (
        <ResultComparisonPanel />
      ) : widgetId === "pass_distribution" ? (
        <PassDistributionPanel />
      ) : widgetId === "marks_entry_trend" ? (
        <MarksEntryTrendPanel />
      ) : widgetId === "workflow_pipeline" ? (
        <WorkflowPipelinePanel />
      ) : widgetId === "nepali_calendar" ? (
        <NepaliCalendarCard />
      ) : widgetId === "recent_activity" ? (
        <RecentActivityPanel />
      ) : widgetId === "priority_actions" ? (
        <PriorityActionsPanel />
      ) : null;

    if (!content) return null;

    return (
      <DraggableWidget
        key={widgetId}
        zone={zone}
        widgetId={widgetId}
        draggingId={draggingId}
        hoverKey={hoverKey}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragEnter={handleWidgetDragEnter}
        onDropWidget={handleWidgetDrop}
      >
        {content}
      </DraggableWidget>
    );
  }

  function renderZoneDropArea(zone, className) {
    if (!draggingId) return null;
    return (
      <div
        key={`${zone}-drop-end`}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={() => handleZoneEndDragEnter(zone)}
        onDrop={(e) => {
          e.preventDefault();
          handleZoneEndDrop(zone);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed border-slate-300/80 bg-slate-100/70 p-3 text-center text-xs text-slate-500",
          hoverKey === `${zone}:__end__` && "border-sky-400 bg-sky-50 text-sky-600",
          className
        )}
      >
        Drop here
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-[0_18px_36px_rgba(15,23,42,0.38)]">
        <CardContent className="p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/70">Control Center</div>
              <div className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">
                Internal Examination Dashboard
              </div>
              <p className="mt-3 max-w-3xl text-sm md:text-base text-white/80">
                Manage exams, monitor marks entry progress, review corrections, and publish
                results from one operational dashboard designed for speed and clarity.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild className="bg-amber-400 hover:bg-amber-500 text-slate-900">
                  <Link to="/exams">Create Exam</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/marks/grid">Open Bulk Grid</Link>
                </Button>
                <Button asChild variant="outline" className="border-white/30 text-white hover:bg-white/10">
                  <Link to="/reports">View Reports</Link>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 min-w-[220px]">
              {[
                { label: "Draft Exams", value: "4" },
                { label: "Live Batches", value: "9" },
                { label: "Pending Tasks", value: "18" },
                { label: "Alerts", value: "3" },
              ].map((x) => (
                <div key={x.label} className="rounded-xl border border-white/20 bg-white/10 p-3">
                  <div className="text-xs text-white/70">{x.label}</div>
                  <div className="text-2xl font-semibold">{x.value}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Drag and drop cards to personalize your dashboard layout.
          </div>
          <Badge variant="outline">Drag Enabled</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {widgetZones.kpi.map((widgetId) => renderWidget(widgetId, "kpi"))}
          {renderZoneDropArea("kpi", "md:col-span-2 xl:col-span-4")}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 space-y-4">
          {widgetZones.left.map((widgetId) => renderWidget(widgetId, "left"))}
          {renderZoneDropArea("left")}
        </div>

        <div className="xl:col-span-4 space-y-4">
          {widgetZones.right.map((widgetId) => renderWidget(widgetId, "right"))}
          {renderZoneDropArea("right")}
        </div>
      </div>

      <div className="text-xs text-slate-500 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Dashboard design upgraded with shadcn cards, clean spacing, and actionable blocks.
      </div>
    </div>
  );
}
