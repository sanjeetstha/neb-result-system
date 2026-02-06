import { Link } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ArrowUpRight, ClipboardList, Sparkles, Users } from "lucide-react";

const STAT_CARDS = [
  {
    label: "Active Exams",
    value: "—",
    helper: "Schedule new session",
    tone: "sky",
    spark: [12, 22, 18, 35, 28, 44, 40],
  },
  {
    label: "Students",
    value: "—",
    helper: "Sync master data",
    tone: "emerald",
    spark: [18, 26, 22, 30, 38, 46, 52],
  },
  {
    label: "Marks Pending",
    value: "—",
    helper: "Auto updates",
    tone: "amber",
    spark: [44, 42, 38, 35, 30, 24, 18],
  },
  {
    label: "Published Results",
    value: "—",
    helper: "Publish on approval",
    tone: "rose",
    spark: [8, 12, 10, 16, 20, 26, 28],
  },
];

const TONE_STYLES = {
  sky: "from-sky-500/15 via-sky-400/5 to-transparent",
  emerald: "from-emerald-500/15 via-emerald-400/5 to-transparent",
  amber: "from-amber-500/15 via-amber-400/5 to-transparent",
  rose: "from-rose-500/15 via-rose-400/5 to-transparent",
};

const TONE_TEXT = {
  sky: "text-sky-500",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
};

const TONE_FILL = {
  sky: "fill-sky-500",
  emerald: "fill-emerald-500",
  amber: "fill-amber-500",
  rose: "fill-rose-500",
};

function Sparkline({ values, tone }) {
  const width = 120;
  const height = 48;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / (max - min || 1)) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        points={points}
        className={TONE_TEXT[tone]}
      />
      <circle
        cx={width}
        cy={height - ((values[values.length - 1] - min) / (max - min || 1)) * height}
        r="4"
        className={TONE_FILL[tone]}
      />
    </svg>
  );
}

export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 shadow-xl">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-6 lg:p-8 bg-gradient-to-br from-primary/10 via-background to-accent/10">
              <div className="text-xs text-muted-foreground">Home</div>
              <div className="mt-2 text-2xl font-display font-semibold">
                Welcome to the exam control center
              </div>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                Manage exam setup, marks entry, corrections, and result publishing in one
                calm workspace.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link to="/exams">Create Exam</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/marks/grid">Bulk Marks Entry</Link>
                </Button>
                <Button asChild>
                  <Link to="/reports">Open Reports</Link>
                </Button>
              </div>
            </div>
            <div className="p-6 lg:p-8 bg-white/80">
              <div className="text-sm font-medium">Today’s focus</div>
              <div className="mt-3 space-y-3 text-sm">
                {[
                  "Finalize subject full marks before entry",
                  "Review pending correction requests",
                  "Publish results for public portal",
                ].map((t) => (
                  <div key={t} className="rounded-lg border bg-background/70 p-3">
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((m) => (
          <Card key={m.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className={`rounded-lg bg-gradient-to-br ${TONE_STYLES[m.tone]} p-4`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">{m.label}</div>
                    <div className="text-2xl font-semibold mt-1">{m.value}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Preview
                  </Badge>
                </div>
                <div className="mt-3">
                  <Sparkline values={m.spark} tone={m.tone} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{m.helper}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Exam Pipeline</div>
              <Badge variant="outline">This term</Badge>
            </div>
            <div className="space-y-3">
              {[
                { label: "Setup & Subjects", value: 72 },
                { label: "Marks Entry", value: 48 },
                { label: "Corrections", value: 24 },
                { label: "Publishing", value: 10 },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.label}</span>
                    <span>{item.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Progress bars update once exam data is connected.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Entry Velocity</div>
              <Badge variant="outline">Daily</Badge>
            </div>
            <div className="rounded-xl border bg-gradient-to-br from-muted/40 via-background to-background p-3">
              <svg viewBox="0 0 300 120" className="w-full h-32">
                <polyline
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="3"
                  points="0,90 40,70 80,78 120,50 160,66 200,38 240,45 280,28 300,30"
                />
                <circle cx="40" cy="70" r="4" fill="hsl(var(--primary))" />
                <circle cx="120" cy="50" r="4" fill="hsl(var(--primary))" />
                <circle cx="200" cy="38" r="4" fill="hsl(var(--primary))" />
                <circle cx="280" cy="28" r="4" fill="hsl(var(--primary))" />
              </svg>
            </div>
            <div className="text-xs text-muted-foreground">
              Watch for spikes during bulk imports.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Result Distribution</div>
              <Badge variant="outline">Preview</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {[
                { label: "Pass", value: 78, color: "#22c55e" },
                { label: "Fail", value: 12, color: "#f97316" },
                { label: "Incomplete", value: 10, color: "#eab308" },
              ].map((p) => (
                <div key={p.label} className="flex flex-col items-center gap-2">
                  <div
                    className="h-20 w-20 rounded-full"
                    style={{
                      background: `conic-gradient(${p.color} ${p.value}%, hsl(var(--muted)) ${p.value}% 100%)`,
                    }}
                  />
                  <div className="text-xs text-muted-foreground">{p.label}</div>
                  <div className="text-sm font-semibold">{p.value}%</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Today’s Focus</div>
              <Badge variant="outline">Recommended</Badge>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <div className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Finalize subject full marks</div>
                  <div className="text-xs text-muted-foreground">
                    Configure terminal-wise totals before bulk entry.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <div className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Invite faculty</div>
                  <div className="text-xs text-muted-foreground">
                    Grant marks entry access for departments.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <div className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Publish result portal</div>
                  <div className="text-xs text-muted-foreground">
                    Enable access once corrections are done.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Quick Actions</div>
              <Badge variant="outline">Shortcuts</Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" className="justify-between">
                <Link to="/exams">
                  Create Exam <Sparkles className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link to="/marks/grid">
                  Bulk Entry <Sparkles className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link to="/results/marksheet">
                  Print Marksheet <Sparkles className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link to="/results/sms">
                  Send SMS <Sparkles className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">System Health</div>
              <Badge variant="outline">Live</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Bulk Entry", value: "Ready" },
                { label: "Result Engine", value: "Idle" },
                { label: "Public Portal", value: "Online" },
                { label: "Notifications", value: "Enabled" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="text-lg font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
