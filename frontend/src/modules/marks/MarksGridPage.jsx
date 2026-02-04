import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";

function pad4(code) {
  const s = String(code ?? "").trim();
  if (!s) return "";
  if (s.length >= 4) return s;
  return s.padStart(4, "0");
}

function safeNum(v) {
  const s = String(v ?? "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function Select({ label, value, onChange, options, placeholder }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {(options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PreviewKV({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-right break-words max-w-[65%]">
        {value == null || value === "" ? "—" : String(value)}
      </div>
    </div>
  );
}

export default function MarksGridPage() {
  const [examId, setExamId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const [marksByEnrollment, setMarksByEnrollment] = useState({});
  const [ledgerByEnrollment, setLedgerByEnrollment] = useState({});
  const [loadingLedgers, setLoadingLedgers] = useState(false);

  const [savingAll, setSavingAll] = useState(false);
  const [saveAllProgress, setSaveAllProgress] = useState({ done: 0, total: 0 });

  // ✅ NEW FEATURE: student search
  const [studentQuery, setStudentQuery] = useState("");

  // ✅ baseline marks (to detect unsaved changes)
  const baselineRef = useRef({}); // { [enrollment_id]: { [component_code]: "12" } }

  // ✅ Sticky sizes (Actions smaller)
  const STICKY = {
    SYMBOL_W: 140,
    STUDENT_W: 260,
    ACTION_W: 240,
  };

  // ✅ Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStudent, setPreviewStudent] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // ---------------- EXAMS ----------------
  const examsQ = useQuery({
    queryKey: ["exams", "list"],
    queryFn: async () => {
      const res = await api.get("/api/exams");
      const arr = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(arr) ? arr : [];
    },
    staleTime: 10_000,
  });

  const examOptions = useMemo(() => {
    return (examsQ.data || []).map((e) => {
      const id = String(e.id ?? e.exam_id ?? "");
      const name = e.name ?? e.title ?? `Exam #${id}`;
      const isPublished = !!(e.published_at || e.is_published);
      return { value: id, label: isPublished ? `${name} (Published)` : name };
    });
  }, [examsQ.data]);

  const selectedExam = useMemo(() => {
    return (
      (examsQ.data || []).find(
        (e) => String(e.id ?? e.exam_id) === String(examId)
      ) || null
    );
  }, [examsQ.data, examId]);

  const isLocked = !!(
    selectedExam?.published_at ||
    selectedExam?.is_published ||
    selectedExam?.is_locked
  );

  // ---------------- SECTIONS ----------------
  const sectionsQ = useQuery({
    queryKey: ["masters", "sections"],
    queryFn: async () => {
      const res = await api.get("/api/masters/sections");
      const data = res.data?.sections ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const sectionOptions = useMemo(() => {
    const arr = sectionsQ.data || [];
    return arr.map((s) => {
      const id = String(s.id ?? s.section_id ?? "");
      const name = s.name ?? s.section_name ?? "";
      const campus = s.campus_code || s.campus?.code || "";
      const faculty = s.faculty_code || s.faculty?.code || "";
      const year = s.year_bs || s.academic_year?.year_bs || "";
      const cls = s.class_name || s.class?.name || s.class_id || "";
      const label = [campus, year, cls, faculty, name].filter(Boolean).join(" • ");
      return { value: id, label: label || `Section #${id}` };
    });
  }, [sectionsQ.data]);

  // ---------------- STUDENTS BY SECTION ----------------
  const studentsQ = useQuery({
    queryKey: ["students", "list", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const res = await api.get(
        `/api/students?section_id=${encodeURIComponent(sectionId)}`
      );
      return res.data?.students ?? [];
    },
    staleTime: 5_000,
  });

  const students = useMemo(() => {
    const arr = studentsQ.data || [];
    return Array.isArray(arr) ? arr : [];
  }, [studentsQ.data]);

  // reset when selection changes
  useEffect(() => {
    setLedgerByEnrollment({});
    setMarksByEnrollment({});
    setPreviewOpen(false);
    setPreviewStudent(null);
    setPreviewData(null);
    setStudentQuery("");
    baselineRef.current = {};
  }, [examId, sectionId]);

  // ---------------- LOAD LEDGERS FOR ALL STUDENTS ----------------
  const canLoad = !!examId && !!sectionId && students.length > 0;

  const loadLedgers = async () => {
    if (!canLoad) return;

    try {
      setLoadingLedgers(true);

      const ledgers = {};
      const marksInit = {};

      for (const s of students) {
        const enrollment_id = s.enrollment_id;
        const res = await api.get(`/api/marks/${examId}/enrollments/${enrollment_id}`);
        const ledger = res.data?.ledger ?? [];
        ledgers[enrollment_id] = ledger;

        const rowMarks = {};
        for (const item of ledger) {
          if (!item?.enabled_in_exam) continue;
          const code = String(item.component_code ?? "").trim();
          if (!code) continue;
          rowMarks[code] = item.marks_obtained == null ? "" : String(item.marks_obtained);
        }
        marksInit[enrollment_id] = rowMarks;
      }

      setLedgerByEnrollment(ledgers);
      setMarksByEnrollment(marksInit);

      // ✅ set baseline for dirty tracking
      baselineRef.current = JSON.parse(JSON.stringify(marksInit));

      toast.success("Ledgers loaded for section");
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Failed to load ledgers");
    } finally {
      setLoadingLedgers(false);
    }
  };

  useEffect(() => {
    if (!canLoad) return;
    loadLedgers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad]);

  // ---------------- BUILD FLAT COLUMNS ----------------
  const columns = useMemo(() => {
    const map = new Map();

    for (const ledger of Object.values(ledgerByEnrollment)) {
      for (const item of ledger || []) {
        if (!item?.enabled_in_exam) continue;

        const code = String(item.component_code ?? "").trim();
        if (!code) continue;

        if (!map.has(code)) {
          map.set(code, {
            code,
            title: item.title ?? "",
            subject_name: item.subject_name ?? "Other",
            component_type: item.component_type ?? "",
            full_marks: item.full_marks ?? null,
          });
        } else {
          const prev = map.get(code);
          if (prev.full_marks == null && item.full_marks != null) {
            map.set(code, { ...prev, full_marks: item.full_marks });
          }
        }
      }
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const an = Number(a.code);
      const bn = Number(b.code);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.code).localeCompare(String(b.code));
    });

    return arr;
  }, [ledgerByEnrollment]);

  // ---------------- GROUPED COLUMNS BY SUBJECT ----------------
  const groupedColumns = useMemo(() => {
    const groups = [];
    const idx = new Map();

    for (const c of columns) {
      const key = c.subject_name || "Other";
      if (!idx.has(key)) {
        idx.set(key, groups.length);
        groups.push({ subject_name: key, cols: [c] });
      } else {
        groups[idx.get(key)].cols.push(c);
      }
    }

    const typeOrder = { TH: 1, IN: 2, PR: 3 };
    for (const g of groups) {
      g.cols.sort((a, b) => {
        const ao = typeOrder[a.component_type] ?? 99;
        const bo = typeOrder[b.component_type] ?? 99;
        if (ao !== bo) return ao - bo;
        return String(a.code).localeCompare(String(b.code));
      });
    }

    return groups;
  }, [columns]);

  // ---------------- NEW: FILTERED STUDENTS ----------------
  const visibleStudents = useMemo(() => {
    const q = String(studentQuery || "").trim().toLowerCase();
    if (!q) return students;

    return students.filter((s) => {
      const hay = [
        s.symbol_no,
        s.full_name,
        s.roll_no,
        s.regd_no,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [students, studentQuery]);

  // ---------------- DIRTY CHECK ----------------
  const isRowDirty = (enrollment_id) => {
    const base = baselineRef.current?.[enrollment_id] || {};
    const now = marksByEnrollment?.[enrollment_id] || {};
    // compare only current enabled columns to avoid noise
    for (const c of columns) {
      const k = c.code;
      const a = String(base?.[k] ?? "");
      const b = String(now?.[k] ?? "");
      if (a !== b) return true;
    }
    return false;
  };

  const markRowSaved = (enrollment_id) => {
    const now = marksByEnrollment?.[enrollment_id] || {};
    baselineRef.current = {
      ...baselineRef.current,
      [enrollment_id]: JSON.parse(JSON.stringify(now)),
    };
  };

  // ---------------- KEYBOARD NAVIGATION ----------------
  const inputRefs = useRef({});
  const cellKey = (enrollmentId, code) => `${enrollmentId}__${code}`;

  const focusCell = (enrollmentId, code) => {
    const k = cellKey(enrollmentId, code);
    const el = inputRefs.current[k];
    if (el && typeof el.focus === "function") {
      el.focus();
      el.select?.();
    }
  };

  const moveFocus = (rowIndex, colIndex, dir) => {
    const totalRows = visibleStudents.length;
    const totalCols = columns.length;
    if (totalRows === 0 || totalCols === 0) return;

    let r = rowIndex;
    let c = colIndex + dir;

    while (true) {
      if (c >= totalCols) {
        r += 1;
        c = 0;
      } else if (c < 0) {
        r -= 1;
        c = totalCols - 1;
      }

      if (r < 0 || r >= totalRows) return;

      const enrollmentId = visibleStudents[r].enrollment_id;
      const code = columns[c].code;
      focusCell(enrollmentId, code);
      return;
    }
  };

  // ---------------- SAVE ONE ----------------
  const saveOne = useMutation({
    mutationFn: async ({ enrollment_id }) => {
      const row = marksByEnrollment[enrollment_id] || {};
      const items = Object.entries(row).map(([component_code, value]) => ({
        component_code,
        marks: value === "" ? null : Number(value),
      }));
      const payload = { marks: items, items, by_code: row };
      const res = await api.post(`/api/marks/${examId}/enrollments/${enrollment_id}`, payload);
      return { data: res.data, enrollment_id };
    },
    onSuccess: ({ enrollment_id }) => {
      markRowSaved(enrollment_id);
      toast.success("Saved");
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || "Save failed"),
  });

  // ---------------- SAVE ALL ----------------
  const saveAll = async () => {
    if (!examId || !sectionId) return toast.error("Select exam and section first");
    if (isLocked) return toast.error("Exam is locked/published. Cannot save.");
    if (students.length === 0) return toast.error("No students found");

    setSavingAll(true);
    setSaveAllProgress({ done: 0, total: students.length });

    const errors = [];
    try {
      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const eid = s.enrollment_id;

        try {
          const row = marksByEnrollment[eid] || {};
          const items = Object.entries(row).map(([component_code, value]) => ({
            component_code,
            marks: value === "" ? null : Number(value),
          }));
          const payload = { marks: items, items, by_code: row };
          await api.post(`/api/marks/${examId}/enrollments/${eid}`, payload);

          // ✅ mark saved baseline
          markRowSaved(eid);
        } catch (e) {
          errors.push({
            enrollment_id: eid,
            symbol_no: s.symbol_no,
            name: s.full_name,
            message: e?.response?.data?.message || e.message || "Save failed",
          });
        } finally {
          setSaveAllProgress({ done: i + 1, total: students.length });
        }
      }

      if (errors.length === 0) toast.success(`Saved all (${students.length})`);
      else {
        toast.error(`Saved with ${errors.length} error(s). Check console.`);
        console.table(errors);
      }
    } finally {
      setSavingAll(false);
    }
  };

  // ---------------- HELPERS ----------------
  const getFullMarks = (enrollment_id, component_code) => {
    const ledger = ledgerByEnrollment[enrollment_id] || [];
    const row = ledger.find((x) => String(x.component_code) === String(component_code));
    return row?.full_marks ?? null;
  };

  const setMark = (enrollment_id, component_code, value) => {
    setMarksByEnrollment((prev) => {
      const next = { ...prev };
      const row = { ...(next[enrollment_id] || {}) };
      row[component_code] = value;
      next[enrollment_id] = row;
      return next;
    });
  };

  // ---------------- PREVIEW MUTATION ----------------
  const previewMutation = useMutation({
    mutationFn: async ({ enrollment_id }) => {
      const res = await api.get(`/api/results/${examId}/enrollments/${enrollment_id}/preview`);
      return res.data;
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e.message || "Preview failed");
    },
  });

  const openPreview = async (student) => {
    if (!examId) return toast.error("Select exam first");
    if (!student?.enrollment_id) return toast.error("Invalid enrollment");

    setPreviewStudent({
      enrollment_id: student.enrollment_id,
      symbol_no: student.symbol_no,
      full_name: student.full_name,
    });
    setPreviewData(null);
    setPreviewOpen(true);

    try {
      const data = await previewMutation.mutateAsync({
        enrollment_id: student.enrollment_id,
      });
      setPreviewData(data);
    } catch {
      // toast already shown
    }
  };

  const summary = useMemo(() => {
    const d = previewData || {};
    return d.summary || d.result || d.data?.summary || d.data?.result || d;
  }, [previewData]);

  const subjects = useMemo(() => {
    if (!summary) return [];
    if (Array.isArray(summary.subjects)) return summary.subjects;
    if (Array.isArray(summary.subject_results)) return summary.subject_results;
    if (Array.isArray(summary.rows)) return summary.rows;
    return [];
  }, [summary]);

  // ✅ GENERATE SNAPSHOT PER ROW
  const generateMutation = useMutation({
    mutationFn: async ({ enrollment_id }) => {
      const res = await api.post(`/api/results/${examId}/enrollments/${enrollment_id}/generate`);
      return res.data;
    },
  });

  const generateOne = async (student) => {
    if (!examId) return toast.error("Select exam first");
    if (!student?.enrollment_id) return toast.error("Invalid enrollment");
    if (isLocked) return toast.error("Exam is locked/published. Cannot generate.");

    try {
      await generateMutation.mutateAsync({ enrollment_id: student.enrollment_id });
      toast.success(`Snapshot generated: ${student.symbol_no}`);
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Generate failed");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marks Entry (Bulk Grid)</h2>
        <p className="text-sm text-muted-foreground">
          Section-wise bulk marks entry. Subject-wise grouped columns.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              label="Exam"
              value={examId}
              onChange={setExamId}
              options={examOptions}
              placeholder={examsQ.isLoading ? "Loading exams..." : "Select exam"}
            />
            <Select
              label="Section"
              value={sectionId}
              onChange={setSectionId}
              options={sectionOptions}
              placeholder={sectionsQ.isLoading ? "Loading sections..." : "Select section"}
            />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {examId ? (
                isLocked ? (
                  <Badge variant="secondary">Exam Locked / Published</Badge>
                ) : (
                  <Badge variant="outline">Exam Draft</Badge>
                )
              ) : (
                <Badge variant="outline">Select exam</Badge>
              )}

              {sectionId ? (
                <Badge variant="outline">Section #{sectionId}</Badge>
              ) : (
                <Badge variant="outline">Select section</Badge>
              )}

              <Badge variant="outline">Students: {studentsQ.isLoading ? "…" : students.length}</Badge>
              <Badge variant="outline">Visible: {visibleStudents.length}</Badge>
              <Badge variant="outline">Columns: {columns.length}</Badge>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {/* ✅ NEW: Search bar */}
              <div className="w-full sm:w-[320px]">
                <Input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search: symbol / name / roll / regd…"
                />
              </div>

              <Button
                variant="outline"
                onClick={loadLedgers}
                disabled={!canLoad || loadingLedgers}
              >
                {loadingLedgers ? "Loading..." : "Reload Ledgers"}
              </Button>

              {savingAll ? (
                <Badge variant="outline">
                  Saving {saveAllProgress.done}/{saveAllProgress.total}
                </Badge>
              ) : null}

              <Button
                variant="outline"
                onClick={saveAll}
                disabled={!examId || !sectionId || savingAll || loadingLedgers || isLocked}
              >
                {savingAll ? "Saving..." : "Save All"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="text-sm font-medium">Grid</div>
          <div className="text-xs text-muted-foreground">
            Enter → next cell | Shift+Enter → previous
          </div>
        </div>

        <div className="p-3">
          {!examId || !sectionId ? (
            <div className="text-sm text-muted-foreground">
              Select exam + section to load bulk grid.
            </div>
          ) : studentsQ.isError ? (
            <div className="text-sm text-destructive">
              Failed to load students:{" "}
              {studentsQ.error?.response?.data?.message ||
                studentsQ.error?.message ||
                "Unknown error"}
            </div>
          ) : studentsQ.isLoading || loadingLedgers ? (
            <div className="text-sm text-muted-foreground">Loading students/ledgers...</div>
          ) : students.length === 0 ? (
            <div className="text-sm text-muted-foreground">No students found in this section.</div>
          ) : columns.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No enabled components found for this exam. Configure exam components first.
            </div>
          ) : visibleStudents.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No match for: <span className="font-medium">{studentQuery}</span>
            </div>
          ) : (
            <div className="w-full">
              {/* ✅ ONLY table area scrolls */}
              <div className="relative w-full overflow-x-auto overflow-y-auto max-h-[72vh] rounded-md border">
                <table className="min-w-max w-max text-sm">
                  <thead className="bg-muted sticky top-0 z-30">
                    <tr>
                      <th
                        className="p-2 text-left bg-muted border-r shadow-sm"
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 70,
                          width: STICKY.SYMBOL_W,
                          minWidth: STICKY.SYMBOL_W,
                        }}
                      >
                        Symbol
                      </th>

                      <th
                        className="p-2 text-left bg-muted border-r shadow-sm"
                        style={{
                          position: "sticky",
                          left: STICKY.SYMBOL_W,
                          zIndex: 70,
                          width: STICKY.STUDENT_W,
                          minWidth: STICKY.STUDENT_W,
                        }}
                      >
                        Student
                      </th>

                      {groupedColumns.map((g) => (
                        <th
                          key={g.subject_name}
                          className="p-2 text-center font-semibold border-l"
                          colSpan={g.cols.length}
                        >
                          {g.subject_name}
                        </th>
                      ))}

                      <th
                        className="p-2 text-right bg-muted border-l shadow-sm"
                        style={{
                          position: "sticky",
                          right: 0,
                          zIndex: 70,
                          width: STICKY.ACTION_W,
                          minWidth: STICKY.ACTION_W,
                        }}
                      >
                        Actions
                      </th>
                    </tr>

                    <tr>
                      <th
                        className="p-2 text-left bg-muted border-r shadow-sm"
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 65,
                          width: STICKY.SYMBOL_W,
                          minWidth: STICKY.SYMBOL_W,
                        }}
                      />
                      <th
                        className="p-2 text-left bg-muted border-r shadow-sm"
                        style={{
                          position: "sticky",
                          left: STICKY.SYMBOL_W,
                          zIndex: 65,
                          width: STICKY.STUDENT_W,
                          minWidth: STICKY.STUDENT_W,
                        }}
                      />

                      {groupedColumns.flatMap((g) =>
                        g.cols.map((c) => (
                          <th
                            key={c.code}
                            className="p-2 text-center border-l"
                            style={{ minWidth: "160px" }}
                          >
                            <div className="font-medium">{c.component_type}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {pad4(c.code)}
                              {c.full_marks != null ? ` • ${c.full_marks}` : ""}
                            </div>
                          </th>
                        ))
                      )}

                      <th
                        className="p-2 text-right bg-muted border-l shadow-sm"
                        style={{
                          position: "sticky",
                          right: 0,
                          zIndex: 65,
                          width: STICKY.ACTION_W,
                          minWidth: STICKY.ACTION_W,
                        }}
                      />
                    </tr>
                  </thead>

                  <tbody>
                    {visibleStudents.map((s) => {
                      const eid = s.enrollment_id;
                      const rowMarks = marksByEnrollment[eid] || {};
                      const dirty = isRowDirty(eid);

                      return (
                        <tr key={eid} className="border-t">
                          <td
                            className="p-2 font-mono bg-background border-r shadow-sm"
                            style={{
                              position: "sticky",
                              left: 0,
                              zIndex: 20,
                              width: STICKY.SYMBOL_W,
                              minWidth: STICKY.SYMBOL_W,
                            }}
                          >
                            {s.symbol_no}
                          </td>

                          <td
                            className="p-2 bg-background border-r shadow-sm"
                            style={{
                              position: "sticky",
                              left: STICKY.SYMBOL_W,
                              zIndex: 20,
                              width: STICKY.STUDENT_W,
                              minWidth: STICKY.STUDENT_W,
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="font-medium">{s.full_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  Roll: {s.roll_no || "—"} • Regd: {s.regd_no || "—"}
                                </div>
                              </div>

                              {dirty ? (
                                <Badge variant="secondary" className="shrink-0">
                                  Unsaved
                                </Badge>
                              ) : null}
                            </div>
                          </td>

                          {groupedColumns.flatMap((g) =>
                            g.cols.map((c) => {
                              const full = getFullMarks(eid, c.code);
                              const value = rowMarks[c.code] ?? "";
                              const n = value === "" ? "" : Number(value);

                              const isInvalid =
                                value !== "" &&
                                (!Number.isFinite(n) ||
                                  (full != null && (n < 0 || n > full)));

                              return (
                                <td
                                  key={c.code}
                                  className="p-2 text-center border-l"
                                  style={{ minWidth: "160px" }}
                                >
                                  <Input
                                    disabled={isLocked}
                                    value={value}
                                    placeholder={full != null ? `0-${full}` : "marks"}
                                    className={isInvalid ? "border-destructive" : ""}
                                    ref={(el) => {
                                      if (!el) return;
                                      inputRefs.current[cellKey(eid, c.code)] = el;
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const dir = e.shiftKey ? -1 : 1;
                                        const rIndex = visibleStudents.findIndex(
                                          (x) => x.enrollment_id === eid
                                        );
                                        const cIndex = columns.findIndex(
                                          (x) => x.code === c.code
                                        );
                                        moveFocus(rIndex, cIndex, dir);
                                      }
                                    }}
                                    onChange={(e) => {
                                      const v = safeNum(e.target.value);
                                      setMark(eid, c.code, v === "" ? "" : String(v));
                                    }}
                                  />

                                  {isInvalid ? (
                                    <div className="text-[11px] text-destructive mt-1">
                                      Invalid
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-muted-foreground mt-1">
                                      {c.title || ""}
                                    </div>
                                  )}
                                </td>
                              );
                            })
                          )}

                          <td
                            className="p-2 text-right bg-background border-l shadow-sm"
                            style={{
                              position: "sticky",
                              right: 0,
                              zIndex: 20,
                              width: STICKY.ACTION_W,
                              minWidth: STICKY.ACTION_W,
                            }}
                          >
                            <div className="flex justify-end gap-1 flex-wrap">
                              <Button
                                size="sm"
                                className="h-8 px-2"
                                disabled={isLocked || saveOne.isPending}
                                onClick={() => saveOne.mutate({ enrollment_id: eid })}
                              >
                                Save
                              </Button>

                              <Button
                                size="sm"
                                className="h-8 px-2"
                                variant="outline"
                                disabled={!examId || previewMutation.isPending}
                                onClick={() => openPreview(s)}
                              >
                                {previewStudent?.enrollment_id === eid &&
                                previewMutation.isPending
                                  ? "Loading..."
                                  : "Preview"}
                              </Button>

                              <Button
                                size="sm"
                                className="h-8 px-2"
                                variant="secondary"
                                disabled={!examId || isLocked || generateMutation.isPending}
                                onClick={() => generateOne(s)}
                              >
                                {generateMutation.isPending ? "Generating..." : "Generate"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <Separator />
                <div className="p-3 text-xs text-muted-foreground">
                  Notes: Disabled components are hidden automatically (enabled_in_exam=false).
                  Locked/published exams disable editing.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Result Preview</DialogTitle>
            <DialogDescription>
              Exam #{examId || "—"} •{" "}
              {previewStudent
                ? `${previewStudent.symbol_no} — ${previewStudent.full_name}`
                : "—"}
            </DialogDescription>
          </DialogHeader>

          {!previewStudent ? (
            <div className="text-sm text-muted-foreground">No student selected.</div>
          ) : previewMutation.isPending && !previewData ? (
            <div className="text-sm text-muted-foreground">Loading preview...</div>
          ) : !previewData ? (
            <div className="text-sm text-muted-foreground">Preview data not available.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <div className="text-sm font-semibold mb-2">Summary</div>
                <PreviewKV label="GPA" value={summary?.gpa ?? summary?.overall_gpa} />
                <PreviewKV label="Grade" value={summary?.grade ?? summary?.overall_grade} />
                <PreviewKV label="Result" value={summary?.result ?? summary?.status} />
                <PreviewKV label="Total" value={summary?.total ?? summary?.grand_total} />
              </div>

              <div className="rounded-md border">
                <div className="px-4 py-2 border-b text-sm font-semibold">Subjects</div>

                {subjects.length === 0 ? (
                  <div className="rounded-md border">
                    <div className="px-4 py-2 border-b text-sm font-semibold">
                      Raw Preview JSON (Debug)
                    </div>
                    <div className="p-4">
                      <pre className="text-xs whitespace-pre-wrap break-words">
                        {JSON.stringify(previewData, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {subjects.map((subj, idx) => {
                      const subjectName =
                        subj.subject_name || subj.name || `Subject ${idx + 1}`;
                      const subjectCode = subj.subject_code || subj.code || "";
                      const gpa = subj.gpa ?? subj.grade_point ?? "";
                      const grade = subj.grade ?? "";
                      const status = subj.status ?? subj.result ?? "";

                      const components = Array.isArray(subj.components)
                        ? subj.components
                        : Array.isArray(subj.component_results)
                        ? subj.component_results
                        : [];

                      return (
                        <div key={idx} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">
                                {subjectName}{" "}
                                {subjectCode ? (
                                  <span className="text-xs text-muted-foreground">
                                    ({pad4(subjectCode)})
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {status ? `Status: ${status}` : ""}
                              </div>
                            </div>

                            <div className="text-right text-sm">
                              {gpa !== "" ? <div>GPA: {gpa}</div> : null}
                              {grade ? <div>Grade: {grade}</div> : null}
                            </div>
                          </div>

                          {components.length ? (
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                              {components.map((c, cidx) => (
                                <div key={cidx} className="flex justify-between text-sm">
                                  <div className="text-muted-foreground">
                                    {c.component_name ||
                                      c.name ||
                                      c.component_type ||
                                      c.code ||
                                      "Component"}
                                  </div>
                                  <div className="font-medium">
                                    {c.marks ?? c.obtained ?? c.score ?? "—"}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-muted-foreground">
                              (No components returned)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
