import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Armchair,
  CheckCircle2,
  LayoutGrid,
  MapPinned,
  PencilRuler,
  Printer,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";
import { hasPermission } from "../../lib/access";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getRoomMetrics(config) {
  const rows = toPositiveInt(config?.row_count, 0);
  const desksPerRow = toPositiveInt(config?.desks_per_row, 0);
  const seatsPerDesk = toPositiveInt(config?.seats_per_desk, 0);
  const desks = rows * desksPerRow;
  const students = desks * seatsPerDesk;
  return { rows, desksPerRow, seatsPerDesk, desks, students };
}

function parseSymbolText(text) {
  return [...new Set(
    String(text || "")
      .split(/[\r\n,;\t]+/)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .filter((item) => !["symbol", "symbol_no", "symbol number"].includes(item.toLowerCase()))
  )];
}

function Select({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {(options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleChip({ checked, label, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
        checked
          ? "border-primary/25 bg-primary/[0.08] text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted/40",
      ].join(" ")}
    >
      <span
        className={[
          "h-2.5 w-2.5 rounded-full",
          checked ? "bg-primary" : "bg-muted-foreground/40",
        ].join(" ")}
      />
      {label}
    </button>
  );
}

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl border bg-background/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
          {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-primary/5 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SectionTabs({ value, onChange }) {
  const items = [
    { value: "overview", label: "Overview" },
    { value: "rooms", label: "Rooms" },
    { value: "preview", label: "Preview" },
  ];

  return (
    <div className="inline-flex rounded-2xl border bg-muted/25 p-1">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={[
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function SummaryPill({ label, value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function escapeHtml(raw) {
  return String(raw ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSeatPrintHtml(payload) {
  const plan = payload?.plan || {};
  const exam = payload?.exam || {};
  const rooms = payload?.rooms || [];

  const cards = rooms
    .flatMap((room) =>
      (room.desks || []).map((desk) => {
        const seats = [...(desk.seats || [])].sort((a, b) => a.seat_index - b.seat_index);
        const seatRows = seats
          .map((seat) => {
            const studentBits = [];
            if (plan.show_student_name && seat.student_name) studentBits.push(escapeHtml(seat.student_name));
            if (plan.show_symbol_no && seat.symbol_no) studentBits.push(`Sym: ${escapeHtml(seat.symbol_no)}`);
            if (plan.show_regd_no && seat.regd_no) studentBits.push(`Reg: ${escapeHtml(seat.regd_no)}`);
            return `
              <div class="seat-row">
                <div class="seat-tag">Seat ${escapeHtml(seat.seat_label || seat.seat_index)}</div>
                <div class="seat-body">${studentBits.length ? studentBits.join("<br />") : "&nbsp;"}</div>
              </div>
            `;
          })
          .join("");

        return `
          <div class="desk-card">
            <div class="desk-head">
              <div class="room-name">${escapeHtml(room.room_name)}</div>
              <div class="desk-no">Desk ${escapeHtml(desk.desk_no)}</div>
            </div>
            <div class="desk-sub">${escapeHtml(exam.name || "Exam")} • ${escapeHtml(exam.class_name || "")}</div>
            <div class="seat-grid">${seatRows}</div>
          </div>
        `;
      })
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(plan.plan_name || "Seat Plan")}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: Arial, sans-serif; color: #0f172a; }
  .page-title { margin-bottom: 12px; }
  .page-title h1 { margin: 0; font-size: 18px; }
  .page-title p { margin: 4px 0 0; font-size: 11px; color: #475569; }
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .desk-card { border: 1.5px dashed #334155; border-radius: 8px; padding: 10px; break-inside: avoid; }
  .desk-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .room-name { font-size: 15px; font-weight: 700; }
  .desk-no { font-size: 14px; font-weight: 700; }
  .desk-sub { margin-top: 4px; font-size: 11px; color: #475569; }
  .seat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 10px; }
  .seat-row { border: 1px solid #cbd5e1; border-radius: 6px; min-height: 82px; display: flex; flex-direction: column; }
  .seat-tag { padding: 6px 8px; border-bottom: 1px solid #cbd5e1; font-size: 11px; font-weight: 700; background: #f8fafc; }
  .seat-body { padding: 8px; font-size: 12px; line-height: 1.4; word-break: break-word; }
</style>
</head>
<body>
  <div class="page-title">
    <h1>${escapeHtml(plan.plan_name || "Seat Plan")}</h1>
    <p>${escapeHtml(exam.name || "Exam")} • ${escapeHtml(exam.campus_name || "Campus")} • ${escapeHtml(exam.year_bs || "")}</p>
  </div>
  <div class="cards">${cards}</div>
</body>
</html>`;
}

function RoomEditor({ room, onSave, onDelete, saving, deleting }) {
  const [form, setForm] = useState(() => ({
    room_name: room.room_name || "",
    room_code: room.room_code || "",
    row_count: String(room.row_count || 5),
    desks_per_row: String(room.desks_per_row || 5),
    seats_per_desk: String(room.seats_per_desk || 2),
    starting_desk_no: String(room.starting_desk_no || 1),
    sort_order: String(room.sort_order || 0),
    note: room.note || "",
  }));

  useEffect(() => {
    setForm({
      room_name: room.room_name || "",
      room_code: room.room_code || "",
      row_count: String(room.row_count || 5),
      desks_per_row: String(room.desks_per_row || 5),
      seats_per_desk: String(room.seats_per_desk || 2),
      starting_desk_no: String(room.starting_desk_no || 1),
      sort_order: String(room.sort_order || 0),
      note: room.note || "",
    });
  }, [room]);

  const metrics = getRoomMetrics(form);

  return (
    <details className="group overflow-hidden rounded-2xl border bg-background shadow-sm" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/20 px-4 py-3">
        <div>
          <div className="font-semibold tracking-tight">{room.room_name}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{metrics.desks} desks</span>
            <span>•</span>
            <span>{metrics.students} students</span>
            <span>•</span>
            <span>{room.room_code || "No code"}</span>
          </div>
        </div>
        <Badge variant="outline">{metrics.rows} x {metrics.desksPerRow}</Badge>
      </summary>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Room Name</label>
            <Input value={form.room_name} onChange={(e) => setForm((prev) => ({ ...prev, room_name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Room Code</label>
            <Input value={form.room_code} onChange={(e) => setForm((prev) => ({ ...prev, room_code: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Rows</label>
            <Input type="number" min="1" value={form.row_count} onChange={(e) => setForm((prev) => ({ ...prev, row_count: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Desks / Row</label>
            <Input type="number" min="1" value={form.desks_per_row} onChange={(e) => setForm((prev) => ({ ...prev, desks_per_row: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Seats / Desk</label>
            <Input type="number" min="1" max="4" value={form.seats_per_desk} onChange={(e) => setForm((prev) => ({ ...prev, seats_per_desk: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Starting Desk No</label>
            <Input type="number" min="1" value={form.starting_desk_no} onChange={(e) => setForm((prev) => ({ ...prev, starting_desk_no: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Sort Order</label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Note</label>
            <Input value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} />
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-2 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
          <span>Total desks: <span className="font-semibold text-foreground">{metrics.desks}</span></span>
          <span>Student capacity: <span className="font-semibold text-foreground">{metrics.students}</span></span>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onDelete} disabled={deleting}>
            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
            {deleting ? "Deleting..." : "Delete Room"}
          </Button>
          <Button variant="outline" onClick={() => onSave(form)} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Room"}
          </Button>
        </div>
      </div>
    </details>
  );
}

function DeskPreviewCard({ desk, plan }) {
  return (
    <div className="rounded-2xl border bg-background p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Desk {desk.desk_no}</div>
        <Armchair className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {desk.seats.map((seat) => (
          <div key={seat.id || `${desk.desk_no}-${seat.seat_label}`} className="rounded-xl border bg-muted/20 p-2.5 text-xs">
            <div className="font-semibold">Seat {seat.seat_label}</div>
            {plan.show_student_name ? <div className="mt-1 leading-5">{seat.student_name || "—"}</div> : null}
            {plan.show_symbol_no ? <div className="text-muted-foreground">Sym: {seat.symbol_no || "—"}</div> : null}
            {plan.show_regd_no ? <div className="text-muted-foreground">Reg: {seat.regd_no || "—"}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExamSeatPlannerPage() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const canAccess = hasPermission(me, "seat_planner.manage");

  const [examId, setExamId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [createForm, setCreateForm] = useState({
    plan_name: "",
    seating_mode: "ASSIGNED",
    show_symbol_no: true,
    show_regd_no: false,
    show_student_name: true,
    seats_per_desk: "2",
    note: "",
  });
  const [studentFilterDraft, setStudentFilterDraft] = useState({
    symbol_filter_mode: "ALL",
    symbol_start: "",
    symbol_end: "",
    symbol_list_text: "",
  });
  const [newRoom, setNewRoom] = useState({
    room_name: "",
    room_code: "",
    row_count: "5",
    desks_per_row: "5",
    seats_per_desk: "2",
    starting_desk_no: "1",
    sort_order: "0",
    note: "",
  });
  const [quickRooms, setQuickRooms] = useState({
    room_prefix: "Room",
    room_code_prefix: "",
    start_number: "101",
    room_count: "1",
    row_count: "5",
    desks_per_row: "5",
    seats_per_desk: "2",
    starting_desk_no: "1",
    note: "",
  });

  const examsQ = useQuery({
    queryKey: ["exams", "list", "seat-planner"],
    enabled: canAccess,
    queryFn: async () => {
      const res = await api.get("/api/exams");
      const data = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const examOptions = useMemo(
    () =>
      (examsQ.data || []).map((exam) => ({
        value: String(exam.id ?? exam.exam_id ?? ""),
        label: `${exam.name || `Exam #${exam.id}`} • ${exam.class_name || ""} ${exam.year_bs || ""}`.trim(),
      })),
    [examsQ.data]
  );

  const plansQ = useQuery({
    queryKey: ["seat-plans", "list", examId],
    enabled: canAccess && !!examId,
    queryFn: async () => {
      const res = await api.get("/api/seat-plans", { params: { exam_id: examId } });
      return Array.isArray(res.data?.plans) ? res.data.plans : [];
    },
    staleTime: 15_000,
  });

  const planQ = useQuery({
    queryKey: ["seat-plans", "detail", selectedPlanId],
    enabled: canAccess && !!selectedPlanId,
    queryFn: async () => {
      const res = await api.get(`/api/seat-plans/${selectedPlanId}`);
      return res.data;
    },
    staleTime: 10_000,
  });

  const templatesQ = useQuery({
    queryKey: ["seat-plans", "templates"],
    enabled: canAccess,
    queryFn: async () => {
      const res = await api.get("/api/seat-plans/templates");
      return Array.isArray(res.data?.templates) ? res.data.templates : [];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!examId && examOptions.length) {
      setExamId(examOptions[0].value);
    }
  }, [examId, examOptions]);

  useEffect(() => {
    if (!selectedPlanId && plansQ.data?.length) {
      setSelectedPlanId(String(plansQ.data[0].id));
    }
    if (
      selectedPlanId &&
      !(plansQ.data || []).some((plan) => String(plan.id) === String(selectedPlanId))
    ) {
      setSelectedPlanId(plansQ.data?.[0] ? String(plansQ.data[0].id) : "");
    }
  }, [plansQ.data, selectedPlanId]);

  useEffect(() => {
    const selectedExam = (examsQ.data || []).find((item) => String(item.id) === String(examId));
    if (!selectedExam) return;
    setCreateForm((prev) => ({
      ...prev,
      plan_name: prev.plan_name || `${selectedExam.name || "Exam"} Seat Plan`,
    }));
  }, [examId, examsQ.data]);

  useEffect(() => {
    const plan = planQ.data?.plan;
    if (!plan) return;
    setStudentFilterDraft({
      symbol_filter_mode: plan.symbol_filter_mode || "ALL",
      symbol_start: plan.symbol_start || "",
      symbol_end: plan.symbol_end || "",
      symbol_list_text: plan.symbol_list_text || "",
    });
  }, [planQ.data?.plan]);

  const createPlan = useMutation({
    mutationFn: async () => {
      const payload = {
        exam_id: Number(examId),
        plan_name: createForm.plan_name.trim(),
        seating_mode: createForm.seating_mode,
        show_symbol_no: !!createForm.show_symbol_no,
        show_regd_no: !!createForm.show_regd_no,
        show_student_name: !!createForm.show_student_name,
        seats_per_desk: Number(createForm.seats_per_desk || 2),
        note: createForm.note,
      };
      const res = await api.post("/api/seat-plans", payload);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success("Seat plan created");
      setSelectedPlanId(String(data.plan?.id || ""));
      setActiveSection("overview");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "list", examId] });
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail"] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to create plan"),
  });

  const updatePlan = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put(`/api/seat-plans/${selectedPlanId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Seat plan updated");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail", selectedPlanId] });
      await qc.invalidateQueries({ queryKey: ["seat-plans", "list", examId] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to update plan"),
  });

  const deletePlan = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/api/seat-plans/${selectedPlanId}`);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Seat plan deleted");
      setSelectedPlanId("");
      setActiveSection("overview");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "list", examId] });
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail"] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to delete plan"),
  });

  const addRoom = useMutation({
    mutationFn: async (payload) => {
      const body = payload || {
        room_name: newRoom.room_name.trim(),
        room_code: newRoom.room_code.trim(),
        row_count: Number(newRoom.row_count || 5),
        desks_per_row: Number(newRoom.desks_per_row || 5),
        seats_per_desk: Number(newRoom.seats_per_desk || 2),
        starting_desk_no: Number(newRoom.starting_desk_no || 1),
        sort_order: Number(newRoom.sort_order || 0),
        note: newRoom.note,
      };
      const res = await api.post(`/api/seat-plans/${selectedPlanId}/rooms`, body);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Room added");
      setNewRoom({
        room_name: "",
        room_code: "",
        row_count: "5",
        desks_per_row: "5",
        seats_per_desk: planQ.data?.plan?.seats_per_desk ? String(planQ.data.plan.seats_per_desk) : "2",
        starting_desk_no: "1",
        sort_order: "0",
        note: "",
      });
      setActiveSection("rooms");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail", selectedPlanId] });
      await qc.invalidateQueries({ queryKey: ["seat-plans", "list", examId] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to add room"),
  });

  const bulkCreateRooms = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/seat-plans/${selectedPlanId}/rooms/bulk`, {
        room_prefix: quickRooms.room_prefix,
        room_code_prefix: quickRooms.room_code_prefix,
        start_number: Number(quickRooms.start_number || 1),
        room_count: Number(quickRooms.room_count || 1),
        row_count: Number(quickRooms.row_count || 5),
        desks_per_row: Number(quickRooms.desks_per_row || 5),
        seats_per_desk: Number(quickRooms.seats_per_desk || 2),
        starting_desk_no: Number(quickRooms.starting_desk_no || 1),
        note: quickRooms.note,
      });
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Rooms created");
      setActiveSection("rooms");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail", selectedPlanId] });
      await qc.invalidateQueries({ queryKey: ["seat-plans", "list", examId] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to create rooms"),
  });

  const saveRoom = useMutation({
    mutationFn: async ({ roomId, form }) => {
      const res = await api.put(`/api/seat-plans/rooms/${roomId}`, {
        room_name: form.room_name,
        room_code: form.room_code,
        row_count: Number(form.row_count || 5),
        desks_per_row: Number(form.desks_per_row || 5),
        seats_per_desk: Number(form.seats_per_desk || 2),
        starting_desk_no: Number(form.starting_desk_no || 1),
        sort_order: Number(form.sort_order || 0),
        note: form.note,
      });
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Room updated");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail", selectedPlanId] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to update room"),
  });

  const deleteRoom = useMutation({
    mutationFn: async (roomId) => {
      const res = await api.delete(`/api/seat-plans/rooms/${roomId}`);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Room deleted");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail", selectedPlanId] });
      await qc.invalidateQueries({ queryKey: ["seat-plans", "list", examId] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to delete room"),
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const payload = {
        room_name: newRoom.room_name.trim(),
        room_code: newRoom.room_code.trim(),
        row_count: Number(newRoom.row_count || 5),
        desks_per_row: Number(newRoom.desks_per_row || 5),
        seats_per_desk: Number(newRoom.seats_per_desk || 2),
        starting_desk_no: Number(newRoom.starting_desk_no || 1),
        sort_order: Number(newRoom.sort_order || 0),
        note: newRoom.note,
      };
      const res = await api.post("/api/seat-plans/templates", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Room preset saved");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "templates"] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to save room preset"),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (templateId) => {
      const res = await api.delete(`/api/seat-plans/templates/${templateId}`);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Room preset deleted");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "templates"] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to delete room preset"),
  });

  const generatePlan = useMutation({
    mutationFn: async (mode) => {
      const res = await api.post(`/api/seat-plans/${selectedPlanId}/generate`, {
        seating_mode: mode,
      });
      return res.data;
    },
    onSuccess: async (data) => {
      if (Number(data?.truncated_students || 0) > 0) {
        toast.warning(`${data.truncated_students} students could not be assigned because seat capacity is not enough.`);
      } else {
        toast.success(data?.message || "Seat plan generated");
      }
      setActiveSection("preview");
      await qc.invalidateQueries({ queryKey: ["seat-plans", "detail", selectedPlanId] });
      await qc.invalidateQueries({ queryKey: ["seat-plans", "list", examId] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || "Failed to generate seat plan"),
  });

  const plan = planQ.data?.plan || null;
  const stats = planQ.data?.stats || {};
  const rooms = planQ.data?.rooms || [];
  const newRoomMetrics = useMemo(() => getRoomMetrics(newRoom), [newRoom]);
  const quickRoomMetrics = useMemo(() => getRoomMetrics(quickRooms), [quickRooms]);
  const quickTotalStudents = quickRoomMetrics.students * toPositiveInt(quickRooms.room_count, 0);
  const symbolListPreview = useMemo(
    () => parseSymbolText(studentFilterDraft.symbol_list_text).slice(0, 12),
    [studentFilterDraft.symbol_list_text]
  );
  const symbolListCount = useMemo(
    () => parseSymbolText(studentFilterDraft.symbol_list_text).length,
    [studentFilterDraft.symbol_list_text]
  );

  const selectedExamLabel = examOptions.find((item) => item.value === examId)?.label || "Select an exam";

  async function handleSymbolFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const symbols = parseSymbolText(text);
      if (!symbols.length) {
        toast.error("No symbol numbers found in the file");
        return;
      }
      setStudentFilterDraft((prev) => ({
        ...prev,
        symbol_filter_mode: "LIST",
        symbol_list_text: symbols.join("\n"),
      }));
      toast.success(`${symbols.length} symbol numbers loaded`);
    } catch (err) {
      toast.error(err?.message || "Failed to read symbol file");
    } finally {
      event.target.value = "";
    }
  }

  function handlePrintDeskCards() {
    if (!planQ.data?.rooms?.length) {
      toast.error("Generate a seat plan first");
      return;
    }
    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      toast.error("Popup blocked. Allow popups to print desk cards.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildSeatPrintHtml(planQ.data));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }

  if (meLoading) {
    return <div className="text-sm text-muted-foreground">Loading seat planner...</div>;
  }

  if (!canAccess) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You do not have permission to access the exam seat planner.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border bg-gradient-to-br from-primary/8 via-background to-accent/12 p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <MapPinned className="h-3.5 w-3.5" />
              Exam hall planning workspace
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Exam Seat Planner</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Add room numbers once, calculate desks and student capacity automatically, then optionally limit seating by symbol range or a CSV list.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => plansQ.refetch()} disabled={!examId}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handlePrintDeskCards} disabled={!rooms.length}>
              <Printer className="mr-2 h-4 w-4" />
              Print Desk Cards
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <Select
              label="Exam"
              value={examId}
              onChange={(value) => {
                setExamId(value);
                setSelectedPlanId("");
              }}
              options={examOptions}
              placeholder={examsQ.isLoading ? "Loading exams..." : "Select exam"}
            />

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan name</label>
                <Input
                  value={createForm.plan_name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, plan_name: e.target.value }))}
                  placeholder="Pre-Board Room Plan"
                />
              </div>

              <Select
                label="Seating mode"
                value={createForm.seating_mode}
                onChange={(value) => setCreateForm((prev) => ({ ...prev, seating_mode: value }))}
                options={[
                  { value: "ASSIGNED", label: "Assigned students" },
                  { value: "BLANK", label: "Blank layout" },
                ]}
                placeholder="Select mode"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <ToggleChip
                checked={createForm.show_student_name}
                label="Show name"
                onChange={(value) => setCreateForm((prev) => ({ ...prev, show_student_name: value }))}
              />
              <ToggleChip
                checked={createForm.show_symbol_no}
                label="Show symbol no"
                onChange={(value) => setCreateForm((prev) => ({ ...prev, show_symbol_no: value }))}
              />
              <ToggleChip
                checked={createForm.show_regd_no}
                label="Show registration no"
                onChange={(value) => setCreateForm((prev) => ({ ...prev, show_regd_no: value }))}
              />
            </div>
          </div>

          <div className="rounded-3xl border bg-muted/20 p-4">
            <div className="text-sm font-semibold">Quick start</div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              Pick the exam, create the plan, then open the Rooms tab to add room numbers one by one or in bulk.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <SummaryPill label="Exam" value={selectedExamLabel} />
              <SummaryPill label="Plans" value={plansQ.data?.length || 0} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => createPlan.mutate()} disabled={!examId || !createForm.plan_name.trim() || createPlan.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                {createPlan.isPending ? "Creating..." : "Create Plan"}
              </Button>
              {selectedPlanId ? (
                <Button variant="ghost" onClick={() => deletePlan.mutate()} disabled={deletePlan.isPending}>
                  <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                  {deletePlan.isPending ? "Deleting..." : "Delete Plan"}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[300px_1fr]">
        <Card className="xl:sticky xl:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Seat Plan Library</CardTitle>
            <CardDescription>
              Switch between saved plans for the selected exam.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!examId ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Select an exam to load plans.</div>
            ) : plansQ.isLoading ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Loading seat plans...</div>
            ) : (plansQ.data || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No seat plans yet for this exam.</div>
            ) : (
              (plansQ.data || []).map((item) => {
                const active = String(item.id) === String(selectedPlanId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPlanId(String(item.id))}
                    className={[
                      "w-full rounded-2xl border p-3 text-left transition-all",
                      active
                        ? "border-primary bg-primary/[0.07] shadow-sm ring-1 ring-primary/15"
                        : "hover:border-border hover:bg-muted/35",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold tracking-tight">{item.plan_name}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.seating_mode} • {item.room_count || 0} rooms • {item.seat_count || 0} seats
                        </div>
                      </div>
                      <Badge variant={active ? "default" : "outline"}>{item.assigned_count || 0}</Badge>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selectedPlanId ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardContent className="p-5"><LayoutGrid className="h-8 w-8 text-primary" /><div className="mt-4 font-semibold">1. Create the plan</div><div className="mt-2 text-sm text-muted-foreground">Choose the exam and create a named seating plan for this term.</div></CardContent></Card>
              <Card><CardContent className="p-5"><PencilRuler className="h-8 w-8 text-primary" /><div className="mt-4 font-semibold">2. Add rooms and desks</div><div className="mt-2 text-sm text-muted-foreground">Use saved room presets or bulk-create numbered rooms with desk counts.</div></CardContent></Card>
              <Card><CardContent className="p-5"><Upload className="h-8 w-8 text-primary" /><div className="mt-4 font-semibold">3. Filter symbol numbers</div><div className="mt-2 text-sm text-muted-foreground">Limit the plan by symbol range or upload a CSV list before generating seats.</div></CardContent></Card>
            </div>
          ) : planQ.isLoading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Loading seat plan...</CardContent>
            </Card>
          ) : !plan ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Seat plan not found.</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="space-y-5 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Active Plan</div>
                      <h3 className="mt-1 text-2xl font-semibold tracking-tight">{plan.plan_name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{plan.seating_mode}</Badge>
                        <Badge variant="outline">{planQ.data?.exam?.name || "Exam"}</Badge>
                        <Badge variant="outline">{planQ.data?.exam?.class_name || "Class"}</Badge>
                        <Badge variant="outline">{plan.symbol_filter_mode}</Badge>
                      </div>
                    </div>
                    <SectionTabs value={activeSection} onChange={setActiveSection} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <StatTile icon={MapPinned} label="Rooms" value={stats.room_count || 0} />
                    <StatTile icon={Armchair} label="Desks" value={stats.desk_count || 0} />
                    <StatTile icon={LayoutGrid} label="Seat Capacity" value={stats.seat_count || 0} />
                    <StatTile icon={Users} label="Filtered Students" value={stats.available_student_count || 0} hint={`${stats.assigned_count || 0} assigned after generation`} />
                    <StatTile icon={CheckCircle2} label="Unassigned" value={stats.unassigned_count || 0} />
                  </div>
                </CardContent>
              </Card>

              {activeSection === "overview" ? (
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Plan Settings</CardTitle>
                      <CardDescription>
                        Fine-tune what appears on each desk slip.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Plan name</label>
                          <Input defaultValue={plan.plan_name} onBlur={(e) => updatePlan.mutate({ plan_name: e.target.value })} />
                        </div>
                        <Select
                          label="Mode"
                          value={plan.seating_mode}
                          onChange={(value) => updatePlan.mutate({ seating_mode: value })}
                          options={[
                            { value: "ASSIGNED", label: "Assigned students" },
                            { value: "BLANK", label: "Blank layout" },
                          ]}
                          placeholder="Mode"
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Seats / desk</label>
                          <Input type="number" min="1" max="4" defaultValue={plan.seats_per_desk} onBlur={(e) => updatePlan.mutate({ seats_per_desk: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Note</label>
                          <Input defaultValue={plan.note || ""} onBlur={(e) => updatePlan.mutate({ note: e.target.value })} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <ToggleChip checked={!!plan.show_student_name} label="Show name" onChange={(value) => updatePlan.mutate({ show_student_name: value })} />
                        <ToggleChip checked={!!plan.show_symbol_no} label="Show symbol no" onChange={(value) => updatePlan.mutate({ show_symbol_no: value })} />
                        <ToggleChip checked={!!plan.show_regd_no} label="Show registration no" onChange={(value) => updatePlan.mutate({ show_regd_no: value })} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Student Selection</CardTitle>
                      <CardDescription>
                        Use all students, a symbol number range, or upload a CSV list of symbol numbers.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Select
                        label="Selection Mode"
                        value={studentFilterDraft.symbol_filter_mode}
                        onChange={(value) => setStudentFilterDraft((prev) => ({ ...prev, symbol_filter_mode: value }))}
                        options={[
                          { value: "ALL", label: "All exam students" },
                          { value: "RANGE", label: "Symbol number range" },
                          { value: "LIST", label: "CSV / symbol list" },
                        ]}
                        placeholder="Choose mode"
                      />

                      {studentFilterDraft.symbol_filter_mode === "RANGE" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">From symbol no</label>
                            <Input value={studentFilterDraft.symbol_start} onChange={(e) => setStudentFilterDraft((prev) => ({ ...prev, symbol_start: e.target.value }))} placeholder="100001" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">To symbol no</label>
                            <Input value={studentFilterDraft.symbol_end} onChange={(e) => setStudentFilterDraft((prev) => ({ ...prev, symbol_end: e.target.value }))} placeholder="100250" />
                          </div>
                        </div>
                      ) : null}

                      {studentFilterDraft.symbol_filter_mode === "LIST" ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted/30">
                              <Upload className="h-4 w-4" />
                              Upload CSV / TXT
                              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleSymbolFileUpload} />
                            </label>
                            <Badge variant="outline">{symbolListCount} symbols loaded</Badge>
                          </div>
                          <textarea
                            className="min-h-[130px] w-full rounded-2xl border bg-background px-3 py-2 text-sm"
                            value={studentFilterDraft.symbol_list_text}
                            onChange={(e) => setStudentFilterDraft((prev) => ({ ...prev, symbol_list_text: e.target.value }))}
                            placeholder="Paste symbol numbers here, one per line or comma separated"
                          />
                          {symbolListPreview.length ? (
                            <div className="flex flex-wrap gap-2">
                              {symbolListPreview.map((item) => (
                                <Badge key={item} variant="secondary">{item}</Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setStudentFilterDraft({
                              symbol_filter_mode: "ALL",
                              symbol_start: "",
                              symbol_end: "",
                              symbol_list_text: "",
                            })
                          }
                        >
                          Clear Filter
                        </Button>
                        <Button
                          onClick={() =>
                            updatePlan.mutate({
                              symbol_filter_mode: studentFilterDraft.symbol_filter_mode,
                              symbol_start: studentFilterDraft.symbol_start,
                              symbol_end: studentFilterDraft.symbol_end,
                              symbol_list_text: studentFilterDraft.symbol_list_text,
                            })
                          }
                          disabled={updatePlan.isPending}
                        >
                          {updatePlan.isPending ? "Applying..." : "Apply Student Filter"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="xl:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Generation</CardTitle>
                      <CardDescription>
                        Generate assigned or blank seating after room setup is complete.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                        Current seat capacity is <span className="font-semibold text-foreground">{stats.seat_count || 0}</span> and the filtered student pool is <span className="font-semibold text-foreground">{stats.available_student_count || 0}</span>.
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button onClick={() => generatePlan.mutate("ASSIGNED")} disabled={!rooms.length || generatePlan.isPending}>
                          {generatePlan.isPending ? "Generating..." : "Generate Assigned Seats"}
                        </Button>
                        <Button variant="outline" onClick={() => generatePlan.mutate("BLANK")} disabled={!rooms.length || generatePlan.isPending}>
                          Generate Blank Layout
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {activeSection === "rooms" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Bulk Room Creator</CardTitle>
                        <CardDescription>
                          Add several numbered rooms at once.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1"><label className="text-xs font-medium">Room Prefix</label><Input value={quickRooms.room_prefix} onChange={(e) => setQuickRooms((prev) => ({ ...prev, room_prefix: e.target.value }))} placeholder="Room" /></div>
                          <div className="space-y-1"><label className="text-xs font-medium">Room Code Prefix</label><Input value={quickRooms.room_code_prefix} onChange={(e) => setQuickRooms((prev) => ({ ...prev, room_code_prefix: e.target.value }))} placeholder="A-" /></div>
                          <div className="space-y-1"><label className="text-xs font-medium">Start Number</label><Input type="number" min="1" value={quickRooms.start_number} onChange={(e) => setQuickRooms((prev) => ({ ...prev, start_number: e.target.value }))} /></div>
                          <div className="space-y-1"><label className="text-xs font-medium">Number of Rooms</label><Input type="number" min="1" value={quickRooms.room_count} onChange={(e) => setQuickRooms((prev) => ({ ...prev, room_count: e.target.value }))} /></div>
                          <div className="space-y-1"><label className="text-xs font-medium">Rows</label><Input type="number" min="1" value={quickRooms.row_count} onChange={(e) => setQuickRooms((prev) => ({ ...prev, row_count: e.target.value }))} /></div>
                          <div className="space-y-1"><label className="text-xs font-medium">Desks / Row</label><Input type="number" min="1" value={quickRooms.desks_per_row} onChange={(e) => setQuickRooms((prev) => ({ ...prev, desks_per_row: e.target.value }))} /></div>
                          <div className="space-y-1"><label className="text-xs font-medium">Seats / Desk</label><Input type="number" min="1" max="4" value={quickRooms.seats_per_desk} onChange={(e) => setQuickRooms((prev) => ({ ...prev, seats_per_desk: e.target.value }))} /></div>
                          <div className="space-y-1"><label className="text-xs font-medium">Starting Desk No</label><Input type="number" min="1" value={quickRooms.starting_desk_no} onChange={(e) => setQuickRooms((prev) => ({ ...prev, starting_desk_no: e.target.value }))} /></div>
                        </div>
                        <div className="flex flex-wrap gap-2 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
                          <span>Desks / room: <span className="font-semibold text-foreground">{quickRoomMetrics.desks}</span></span>
                          <span>Students / room: <span className="font-semibold text-foreground">{quickRoomMetrics.students}</span></span>
                          <span>Total students: <span className="font-semibold text-foreground">{quickTotalStudents}</span></span>
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={() => bulkCreateRooms.mutate()} disabled={bulkCreateRooms.isPending}>
                            <Plus className="mr-2 h-4 w-4" />
                            {bulkCreateRooms.isPending ? "Creating..." : "Create Rooms"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Reusable Room Presets</CardTitle>
                        <CardDescription>
                          Save a room setup once and reuse it in future seat plans.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {templatesQ.isLoading ? (
                          <div className="text-sm text-muted-foreground">Loading presets...</div>
                        ) : (templatesQ.data || []).length === 0 ? (
                          <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No room presets saved yet.</div>
                        ) : (
                          (templatesQ.data || []).map((template) => {
                            const metrics = getRoomMetrics(template);
                            return (
                              <div key={template.id} className="rounded-2xl border p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold tracking-tight">{template.room_name}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {template.room_code || "No code"} • {metrics.desks} desks • {metrics.students} students
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!selectedPlanId || addRoom.isPending}
                                      onClick={() =>
                                        addRoom.mutate({
                                          room_name: template.room_name,
                                          room_code: template.room_code,
                                          row_count: template.row_count,
                                          desks_per_row: template.desks_per_row,
                                          seats_per_desk: template.seats_per_desk,
                                          starting_desk_no: template.starting_desk_no,
                                          sort_order: template.sort_order,
                                          note: template.note,
                                        })
                                      }
                                    >
                                      Use
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => deleteTemplate.mutate(template.id)}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Add Single Room</CardTitle>
                      <CardDescription>
                        Add one room manually, then optionally save it as a reusable preset.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1"><label className="text-xs font-medium">Room Name</label><Input value={newRoom.room_name} onChange={(e) => setNewRoom((prev) => ({ ...prev, room_name: e.target.value }))} placeholder="Room 101" /></div>
                        <div className="space-y-1"><label className="text-xs font-medium">Room Code</label><Input value={newRoom.room_code} onChange={(e) => setNewRoom((prev) => ({ ...prev, room_code: e.target.value }))} placeholder="A-101" /></div>
                        <div className="space-y-1"><label className="text-xs font-medium">Rows</label><Input type="number" min="1" value={newRoom.row_count} onChange={(e) => setNewRoom((prev) => ({ ...prev, row_count: e.target.value }))} /></div>
                        <div className="space-y-1"><label className="text-xs font-medium">Desks / Row</label><Input type="number" min="1" value={newRoom.desks_per_row} onChange={(e) => setNewRoom((prev) => ({ ...prev, desks_per_row: e.target.value }))} /></div>
                        <div className="space-y-1"><label className="text-xs font-medium">Seats / Desk</label><Input type="number" min="1" max="4" value={newRoom.seats_per_desk} onChange={(e) => setNewRoom((prev) => ({ ...prev, seats_per_desk: e.target.value }))} /></div>
                        <div className="space-y-1"><label className="text-xs font-medium">Starting Desk No</label><Input type="number" min="1" value={newRoom.starting_desk_no} onChange={(e) => setNewRoom((prev) => ({ ...prev, starting_desk_no: e.target.value }))} /></div>
                        <div className="space-y-1"><label className="text-xs font-medium">Sort Order</label><Input type="number" value={newRoom.sort_order} onChange={(e) => setNewRoom((prev) => ({ ...prev, sort_order: e.target.value }))} /></div>
                        <div className="space-y-1"><label className="text-xs font-medium">Note</label><Input value={newRoom.note} onChange={(e) => setNewRoom((prev) => ({ ...prev, note: e.target.value }))} /></div>
                      </div>

                      <div className="flex flex-wrap gap-2 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
                        <span>Total desks: <span className="font-semibold text-foreground">{newRoomMetrics.desks}</span></span>
                        <span>Student capacity: <span className="font-semibold text-foreground">{newRoomMetrics.students}</span></span>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="ghost" onClick={() => saveTemplate.mutate()} disabled={!newRoom.room_name.trim() || saveTemplate.isPending}>
                          <Save className="mr-2 h-4 w-4" />
                          {saveTemplate.isPending ? "Saving..." : "Save as Preset"}
                        </Button>
                        <Button onClick={() => addRoom.mutate()} disabled={!newRoom.room_name.trim() || addRoom.isPending}>
                          <Plus className="mr-2 h-4 w-4" />
                          {addRoom.isPending ? "Adding..." : "Add Room"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-3">
                    {rooms.length === 0 ? (
                      <Card>
                        <CardContent className="p-8 text-center text-sm text-muted-foreground">
                          No rooms added yet. Start with the bulk creator or add one room manually.
                        </CardContent>
                      </Card>
                    ) : (
                      rooms.map((room) => (
                        <RoomEditor
                          key={room.id}
                          room={room}
                          saving={saveRoom.isPending}
                          deleting={deleteRoom.isPending}
                          onSave={(form) => saveRoom.mutate({ roomId: room.id, form })}
                          onDelete={() => deleteRoom.mutate(room.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {activeSection === "preview" ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Printable Preview</CardTitle>
                      <CardDescription>
                        This is the clean desk-slip view your staff will print and use in classrooms.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {rooms.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                          Add rooms and generate a plan to preview desk cards.
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {rooms.map((room) => (
                            <div key={room.id} className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="text-lg font-semibold tracking-tight">{room.room_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {room.desks.length} desks • {room.assignments.length} seats • {room.room_code || "No code"}
                                  </div>
                                </div>
                                <Badge variant="outline">Start desk {room.starting_desk_no}</Badge>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                                {(room.desks || []).map((desk) => (
                                  <DeskPreviewCard key={`${room.id}-${desk.desk_no}`} desk={desk} plan={plan} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
