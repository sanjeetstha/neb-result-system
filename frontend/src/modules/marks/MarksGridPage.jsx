import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { useMe } from "../../lib/useMe";
import { usePagination } from "../../lib/usePagination";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";
import PaginationBar from "../../components/ui/pagination-bar";
import ResultPreviewDialog from "../../components/results/ResultPreviewDialog";

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

function formatGpa(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(2);
}

function parseOptionalRank(name) {
  const s = String(name || "").trim().toLowerCase();
  const m = s.match(/(\d+)/);
  if (m) return Number(m[1]);
  if (s.includes("first")) return 1;
  if (s.includes("second")) return 2;
  if (s.includes("third")) return 3;
  if (s.includes("fourth")) return 4;
  return 999;
}

function workflowBadgeVariant(status) {
  const s = String(status || "").toUpperCase();
  if (s === "PUBLISHED") return "default";
  if (s === "APPROVED") return "secondary";
  if (s === "VERIFIED") return "outline";
  if (s === "SUBMITTED") return "outline";
  return "outline";
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

export default function MarksGridPage() {
  const location = useLocation();
  const { data: me } = useMe();
  const [examId, setExamId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [viewMode, setViewMode] = useState("ledger");

  const [marksByEnrollment, setMarksByEnrollment] = useState({});
  const [ledgerByEnrollment, setLedgerByEnrollment] = useState({});
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [gradesByEnrollment, setGradesByEnrollment] = useState({});
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [gradeProgress, setGradeProgress] = useState({ done: 0, total: 0 });
  const [optionalByEnrollment, setOptionalByEnrollment] = useState({});
  const [dirtyByEnrollment, setDirtyByEnrollment] = useState({});
  const [studentEdits, setStudentEdits] = useState({});
  const studentBaselineRef = useRef({});
  const optionalBaselineRef = useRef({});

  const [savingAll, setSavingAll] = useState(false);
  const [saveAllProgress, setSaveAllProgress] = useState({ done: 0, total: 0 });
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 });

  // ✅ NEW FEATURE: student search
  const [studentQuery, setStudentQuery] = useState("");
  const [columnQuery, setColumnQuery] = useState("");
  const [columnTypes, setColumnTypes] = useState({ TH: true, IN: true, PR: true });

  // ✅ Import state
  const [importFile, setImportFile] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  // ✅ baseline marks (to detect unsaved changes)
  const baselineRef = useRef({}); // { [enrollment_id]: { [component_code]: "12" } }

  // ✅ Sticky sizes (Actions smaller)
  const STICKY = {
    SN_W: 36,
    SYMBOL_W: 86,
    STUDENT_W: 140,
    ACTION_W: 220,
    TOTAL_W: 76,
  };
  const SUBJECT_COL_W = 96;

  // ✅ Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStudent, setPreviewStudent] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const canEditMarks = ["SUPER_ADMIN", "ADMIN", "TEACHER"].includes(me?.role);
  const canGenerateSnapshots = ["SUPER_ADMIN", "ADMIN"].includes(me?.role);
  const canSubmit = ["SUPER_ADMIN", "ADMIN", "TEACHER"].includes(me?.role);
  const canVerify = ["SUPER_ADMIN", "EXAM_HEAD"].includes(me?.role);
  const canApprove = ["SUPER_ADMIN", "CAMPUS_CHIEF", "ASSISTANT_CAMPUS_CHIEF"].includes(me?.role);
  const canPublish = ["SUPER_ADMIN", "ADMIN"].includes(me?.role);

  const importErrors = useMemo(() => {
    const arr = importSummary?.errors;
    return Array.isArray(arr) ? arr : [];
  }, [importSummary]);

  // Allows opening direct task links from notifications
  useEffect(() => {
    const q = new URLSearchParams(location.search || "");
    const examFromQuery = String(q.get("exam_id") || "").trim();
    const batchFromQuery = String(q.get("batch_id") || "").trim();
    if (examFromQuery && examFromQuery !== String(examId || "")) {
      setExamId(examFromQuery);
    }
    if (batchFromQuery && batchFromQuery !== String(batchId || "")) {
      setBatchId(batchFromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const downloadImportErrors = () => {
    if (!importErrors.length) return;
    const lines = ["row,reason"];
    for (const err of importErrors) {
      const row = String(err?.row ?? "").replace(/"/g, "\"\"");
      const reason = String(err?.reason ?? "").replace(/"/g, "\"\"");
      lines.push(`"${row}","${reason}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-grid-import-errors-exam-${examId || "unknown"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
  const workflowQ = useQuery({
    queryKey: ["results", "workflow", examId],
    enabled: !!examId,
    queryFn: async () => {
      const res = await api.get(`/api/results/${examId}/workflow`);
      return res.data?.workflow || {};
    },
    staleTime: 5_000,
  });
  const workflowStatus = String(
    workflowQ.data?.status || (isLocked ? "PUBLISHED" : "DRAFT")
  ).toUpperCase();

  // ---------------- EXAM COMPONENT GROUPS (for Ledger view) ----------------
  const examComponentsQ = useQuery({
    queryKey: ["exams", "components", examId],
    enabled: !!examId,
    queryFn: async () => {
      const res = await api.get(`/api/exams/${examId}/components`);
      return res.data || {};
    },
    staleTime: 30_000,
  });

  const examGroups = useMemo(
    () => (Array.isArray(examComponentsQ.data?.groups) ? examComponentsQ.data.groups : []),
    [examComponentsQ.data]
  );

  const compulsoryCols = useMemo(() => {
    const group = examGroups.find(
      (g) => String(g.name || "").trim().toLowerCase() === "compulsory"
    );
    const subjects = group?.subjects || [];
    return subjects
      .map((s) => {
        const th =
          (s.components || []).find(
            (c) => c.component_type === "TH" && c.is_enabled
          ) || null;
        if (!th) return null;
        return {
          subject_id: s.id,
          label: s.name,
          component_code: String(th.component_code || "").trim(),
          full_marks: th.full_marks ?? null,
        };
      })
      .filter(Boolean);
  }, [examGroups]);

  const optionalGroups = useMemo(() => {
    return examGroups
      .filter((g) => String(g.name || "").toLowerCase().startsWith("opt"))
      .map((g) => ({
        name: g.name,
        subjects: (g.subjects || [])
          .map((s) => {
            const th =
              (s.components || []).find(
                (c) => c.component_type === "TH" && c.is_enabled
              ) || null;
            if (!th) return null;
            return {
              subject_id: s.id,
              subject_name: s.name,
              component_code: String(th.component_code || "").trim(),
              full_marks: th.full_marks ?? null,
            };
          })
          .filter(Boolean),
      }))
      .sort((a, b) => parseOptionalRank(a.name) - parseOptionalRank(b.name))
      .slice(0, 3);
  }, [examGroups]);

  const optionalCodeMap = useMemo(() => {
    const map = new Map();
    for (const g of optionalGroups) {
      for (const s of g.subjects || []) {
        if (!s?.component_code) continue;
        map.set(String(s.component_code), {
          ...s,
          group_name: g.name,
        });
      }
    }
    return map;
  }, [optionalGroups]);

  const subjectIdToOptionalGroup = useMemo(() => {
    const map = new Map();
    for (const g of optionalGroups) {
      for (const s of g.subjects || []) {
        if (!s?.subject_id) continue;
        if (!map.has(s.subject_id)) map.set(s.subject_id, g.name);
      }
    }
    return map;
  }, [optionalGroups]);

  // ---------------- BATCHES ----------------
  const batchesQ = useQuery({
    queryKey: ["masters", "batches"],
    queryFn: async () => {
      const res = await api.get("/api/masters/batches");
      const data = res.data?.batches ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const batchOptions = useMemo(() => {
    const arr = batchesQ.data || [];
    return arr.map((b) => {
      const id = String(b.id ?? b.batch_id ?? "");
      const name = b.name ?? "";
      const year = b.year_bs ?? "";
      const label = [name, year ? `(${year})` : ""].filter(Boolean).join(" ");
      return { value: id, label: label || `Batch #${id}` };
    });
  }, [batchesQ.data]);

  // ---------------- STUDENTS BY BATCH ----------------
  const studentsQ = useQuery({
    queryKey: ["students", "list", batchId, selectedExam?.class_id],
    enabled: !!batchId && !!selectedExam?.class_id,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("batch_id", batchId);
      if (selectedExam?.class_id) params.set("class_id", selectedExam.class_id);
      const res = await api.get(`/api/students?${params.toString()}`);
      return res.data?.students ?? [];
    },
    staleTime: 5_000,
  });

  const students = useMemo(() => {
    const arr = studentsQ.data || [];
    return Array.isArray(arr) ? arr : [];
  }, [studentsQ.data]);

  useEffect(() => {
    if (!students.length) {
      setStudentEdits({});
      studentBaselineRef.current = {};
      return;
    }
    const init = {};
    for (const s of students) {
      init[s.enrollment_id] = {
        full_name: s.full_name || "",
        symbol_no: s.symbol_no || "",
        regd_no: s.regd_no || "",
        roll_no: s.roll_no || "",
        dob: s.dob ? String(s.dob).slice(0, 10) : "",
      };
    }
    setStudentEdits(init);
    studentBaselineRef.current = JSON.parse(JSON.stringify(init));
  }, [students]);

  // reset when selection changes
  useEffect(() => {
    setLedgerByEnrollment({});
    setMarksByEnrollment({});
    setGradesByEnrollment({});
    setLoadingGrades(false);
    setGradeProgress({ done: 0, total: 0 });
    setOptionalByEnrollment({});
    setDirtyByEnrollment({});
    setStudentEdits({});
    setPreviewOpen(false);
    setPreviewStudent(null);
    setPreviewData(null);
    setPreviewError("");
    setStudentQuery("");
    setColumnQuery("");
    setColumnTypes({ TH: true, IN: true, PR: true });
    setImportFile(null);
    setImportSummary(null);
    baselineRef.current = {};
    studentBaselineRef.current = {};
    optionalBaselineRef.current = {};
  }, [examId, batchId]);

  // ---------------- LOAD LEDGERS FOR ALL STUDENTS ----------------
  const canLoad = !!examId && !!batchId && students.length > 0;

  const loadLedgers = async (studentsOverride = null) => {
    const targetStudents = Array.isArray(studentsOverride) ? studentsOverride : students;
    if (!examId || !batchId || targetStudents.length === 0) return;
    if (compulsoryCols.length === 0 && optionalGroups.length === 0) {
      toast.error("No subject catalog configured for this class. Configure subjects first.");
      return;
    }

    try {
      setLoadingLedgers(true);

      const ledgers = {};
      const marksInit = {};
      const optInit = {};
      const errors = [];

      for (const s of targetStudents) {
        const enrollment_id = s.enrollment_id;
        try {
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

          const optRow = {};
          const canonicalChoiceCodes = Array.isArray(res.data?.optional_choice_codes)
            ? res.data.optional_choice_codes
            : [];
          for (const ch of canonicalChoiceCodes) {
            const groupName = String(ch?.group_name || "").trim();
            const code = String(ch?.component_code || "").trim();
            if (groupName && code && !optRow[groupName]) {
              optRow[groupName] = code;
            }
          }

          // Fallback: infer from ledger rows only when canonical data is unavailable.
          if (Object.keys(optRow).length === 0) {
            for (const item of ledger || []) {
              if (!item?.enabled_in_exam) continue;
              if (String(item.component_type || "").toUpperCase() !== "TH") continue;
              const groupName = subjectIdToOptionalGroup.get(item.subject_id);
              if (groupName && !optRow[groupName]) {
                optRow[groupName] = String(item.component_code || "");
              }
            }
          }
          optInit[enrollment_id] = optRow;
        } catch (e) {
          errors.push({
            enrollment_id,
            symbol_no: s.symbol_no,
            name: s.full_name,
            message: e?.response?.data?.message || e.message || "Ledger load failed",
          });
          ledgers[enrollment_id] = [];
          marksInit[enrollment_id] = {};
          optInit[enrollment_id] = {};
        }
      }

      setLedgerByEnrollment(ledgers);
      setMarksByEnrollment(marksInit);
      setOptionalByEnrollment(optInit);
      optionalBaselineRef.current = JSON.parse(JSON.stringify(optInit));

      // ✅ set baseline for dirty tracking
      baselineRef.current = JSON.parse(JSON.stringify(marksInit));
      setDirtyByEnrollment({});

      if (errors.length === 0) {
        toast.success("Ledgers loaded for batch");
      } else {
        toast.error(`Loaded with ${errors.length} error(s). Check console.`);
        console.table(errors);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Failed to load ledgers");
    } finally {
      setLoadingLedgers(false);
    }
  };

  useEffect(() => {
    if (!canLoad) return;
    if (examComponentsQ.isLoading) return;
    loadLedgers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, examId, batchId, studentsQ.dataUpdatedAt, examComponentsQ.dataUpdatedAt, examComponentsQ.isLoading]);

  const loadGrades = async () => {
    if (!canLoad) return;
    if (!examId) return;
    if (students.length === 0) return;

    try {
      setLoadingGrades(true);
      setGradeProgress({ done: 0, total: students.length });

      const out = {};
      const errors = [];

      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const enrollment_id = s.enrollment_id;

        try {
          const res = await api.get(
            `/api/results/${examId}/enrollments/${enrollment_id}/preview`
          );
          const result =
            res.data?.result ?? res.data?.summary ?? res.data?.data ?? res.data ?? {};
          const subjectArr = Array.isArray(result.subjects)
            ? result.subjects
            : Array.isArray(result.subject_results)
            ? result.subject_results
            : [];

          const subjectMap = {};
          for (const subj of subjectArr) {
            const sid = subj.subject_id ?? subj.id;
            if (sid == null) continue;
            subjectMap[String(sid)] = {
              grade: subj.grade ?? subj.final_grade ?? "",
              gpa: subj.gpa ?? subj.grade_point ?? "",
            };
          }

          out[enrollment_id] = {
            subjects: subjectMap,
            overall_grade: result.final_grade ?? result.grade ?? "",
            overall_gpa: result.overall_gpa ?? result.gpa ?? "",
          };
        } catch (e) {
          errors.push({
            enrollment_id,
            symbol_no: s.symbol_no,
            name: s.full_name,
            message: e?.response?.data?.message || e.message || "Grade load failed",
          });
          out[enrollment_id] = { subjects: {}, overall_grade: "", overall_gpa: "" };
        } finally {
          setGradeProgress({ done: i + 1, total: students.length });
        }
      }

      setGradesByEnrollment(out);

      if (errors.length === 0) {
        toast.success("Grade ledger loaded");
      } else {
        toast.error(`Grades loaded with ${errors.length} error(s). Check console.`);
        console.table(errors);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Failed to load grades");
    } finally {
      setLoadingGrades(false);
    }
  };

  useEffect(() => {
    if (viewMode !== "grade") return;
    if (!canLoad) return;
    loadGrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, canLoad, examId, batchId, studentsQ.dataUpdatedAt]);

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

  const visibleColumns = useMemo(() => {
    const q = String(columnQuery || "").trim().toLowerCase();
    return columns.filter((c) => {
      const type = c.component_type || "TH";
      if (!columnTypes[type]) return false;
      if (!q) return true;
      const hay = [
        c.subject_name,
        c.title,
        c.code,
        c.component_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [columns, columnQuery, columnTypes]);

  // ---------------- GROUPED COLUMNS BY SUBJECT ----------------
  const groupedColumns = useMemo(() => {
    const groups = [];
    const idx = new Map();

    for (const c of visibleColumns) {
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
  }, [visibleColumns]);

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

  const pager = usePagination(visibleStudents, 20);
  const pagedStudents = pager.pageItems;
  const pageStartIndex = (pager.page - 1) * pager.pageSize;

  // ---------------- DIRTY CHECK ----------------
  const isRowDirty = (enrollment_id) => {
    const base = baselineRef.current?.[enrollment_id] || {};
    const now = marksByEnrollment?.[enrollment_id] || {};
    const keys = new Set([...Object.keys(base), ...Object.keys(now)]);
    for (const k of keys) {
      const a = String(base?.[k] ?? "");
      const b = String(now?.[k] ?? "");
      if (a !== b) return true;
    }
    return false;
  };

  const optionalNeedsUpdate = (enrollment_id) => {
    const prev = optionalBaselineRef.current?.[enrollment_id] || {};
    const now = optionalByEnrollment?.[enrollment_id] || {};
    const keys = new Set([...Object.keys(prev), ...Object.keys(now)]);
    for (const k of keys) {
      if (String(prev[k] || "") !== String(now[k] || "")) return true;
    }
    return false;
  };

  const isLedgerRowDirty = (enrollment_id) => {
    if (isRowDirty(enrollment_id)) return true;
    if (studentNeedsUpdate(enrollment_id)) return true;
    return optionalNeedsUpdate(enrollment_id);
  };

  const markRowSaved = (enrollment_id) => {
    const now = marksByEnrollment?.[enrollment_id] || {};
    const optNow = optionalByEnrollment?.[enrollment_id] || {};
    baselineRef.current = {
      ...baselineRef.current,
      [enrollment_id]: JSON.parse(JSON.stringify(now)),
    };
    optionalBaselineRef.current = {
      ...optionalBaselineRef.current,
      [enrollment_id]: JSON.parse(JSON.stringify(optNow)),
    };
    setDirtyByEnrollment((prev) => ({ ...prev, [enrollment_id]: false }));
  };

  // ---------------- KEYBOARD NAVIGATION ----------------
  const inputRefs = useRef({});
  const cellKey = (enrollmentId, code) => `${enrollmentId}__${code}`;
  const ledgerInputRefs = useRef({});
  const ledgerCellKey = (enrollmentId, code) => `${enrollmentId}__${code}`;

  const focusCell = (enrollmentId, code) => {
    const k = cellKey(enrollmentId, code);
    const el = inputRefs.current[k];
    if (el && typeof el.focus === "function") {
      el.focus();
      el.select?.();
    }
  };

  const moveFocus = (rowIndex, colIndex, dir) => {
    const totalRows = pagedStudents.length;
    const totalCols = visibleColumns.length;
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

      const enrollmentId = pagedStudents[r].enrollment_id;
      const code = visibleColumns[c].code;
      focusCell(enrollmentId, code);
      return;
    }
  };

  const focusLedgerCell = (enrollmentId, code) => {
    const k = ledgerCellKey(enrollmentId, code);
    const el = ledgerInputRefs.current[k];
    if (el && typeof el.focus === "function") {
      el.focus();
      el.select?.();
    }
  };

  const getLedgerRowCodes = (enrollment_id) => {
    const codes = [];
    for (const c of compulsoryCols) {
      if (c?.component_code) codes.push(c.component_code);
    }
    for (const g of optionalGroups) {
      const code = (optionalByEnrollment?.[enrollment_id] || {})[g.name];
      if (code) codes.push(code);
    }
    return codes;
  };

  const buildLedgerMarks = (enrollment_id) => {
    const row = marksByEnrollment[enrollment_id] || {};
    const items = [];

    for (const c of compulsoryCols) {
      if (!c?.component_code) continue;
      const val = row[c.component_code];
      const raw = val == null ? "" : val;
      items.push({
        component_code: c.component_code,
        marks_obtained: raw === "" ? null : Number(raw),
      });
    }

    for (const g of optionalGroups) {
      const code = (optionalByEnrollment?.[enrollment_id] || {})[g.name];
      if (!code) continue;
      const val = row[code];
      const raw = val == null ? "" : val;
      items.push({
        component_code: code,
        marks_obtained: raw === "" ? null : Number(raw),
      });
    }

    return items;
  };

  const buildDetailedMarks = (enrollment_id) => {
    const row = marksByEnrollment[enrollment_id] || {};
    return Object.entries(row).map(([component_code, value]) => ({
      component_code,
      marks_obtained: value == null || value === "" ? null : Number(value),
    }));
  };

  const buildOptionalChoices = (enrollment_id) => {
    const choices = [];
    const errors = [];
    for (const g of optionalGroups) {
      const code = (optionalByEnrollment?.[enrollment_id] || {})[g.name];
      if (!code) continue;
      const meta = optionalCodeMap.get(String(code));
      if (!meta?.subject_id) {
        errors.push(`Invalid optional code ${code} for ${g.name}`);
        continue;
      }
      choices.push({ group_name: g.name, subject_id: meta.subject_id });
    }
    return { choices, errors };
  };

  const getStudentEdit = (enrollment_id) => studentEdits?.[enrollment_id] || {};

  const studentNeedsUpdate = (enrollment_id) => {
    const current = getStudentEdit(enrollment_id);
    const base = studentBaselineRef.current?.[enrollment_id] || {};
    return (
      String(current.full_name || "") !== String(base.full_name || "") ||
      String(current.symbol_no || "") !== String(base.symbol_no || "") ||
      String(current.regd_no || "") !== String(base.regd_no || "") ||
      String(current.roll_no || "") !== String(base.roll_no || "") ||
      String(current.dob || "") !== String(base.dob || "")
    );
  };

  const isLedgerMode = viewMode === "ledger" || viewMode === "grade";
  const isEnrollmentDirty = (enrollment_id) =>
    isLedgerMode ? isLedgerRowDirty(enrollment_id) : isRowDirty(enrollment_id);

  const persistEnrollment = async ({ enrollment_id, student }) => {
    if (isLedgerMode) {
      if (student && studentNeedsUpdate(enrollment_id)) {
        const current = getStudentEdit(enrollment_id);
        if (!current.full_name || !current.symbol_no) {
          throw new Error("Full name and symbol number required");
        }
        await api.put(`/api/students/${student.student_id}`, {
          full_name: current.full_name,
          symbol_no: current.symbol_no,
          regd_no: current.regd_no || null,
          roll_no: current.roll_no || null,
          dob: current.dob || null,
        });
        studentBaselineRef.current = {
          ...studentBaselineRef.current,
          [enrollment_id]: { ...current },
        };
      }

      if (optionalNeedsUpdate(enrollment_id)) {
        const { choices, errors } = buildOptionalChoices(enrollment_id);
        if (errors.length) {
          throw new Error(errors[0]);
        }
        if (choices.length) {
          await api.post(`/api/students/${enrollment_id}/optional-choices`, { choices });
        }
      }
    }

    const items =
      isLedgerMode
        ? buildLedgerMarks(enrollment_id)
        : buildDetailedMarks(enrollment_id);

    if (items.length === 0) return;

    const payload = { marks: items };
    await api.post(`/api/marks/${examId}/enrollments/${enrollment_id}`, payload);
  };

  // ---------------- SAVE ONE ----------------
  const saveOne = useMutation({
    mutationFn: async ({ enrollment_id, student }) => {
      await persistEnrollment({ enrollment_id, student });
      return { enrollment_id };
    },
    onSuccess: ({ enrollment_id }) => {
      markRowSaved(enrollment_id);
      toast.success("Saved");
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || "Save failed"),
  });

  // ---------------- SAVE ALL ----------------
  const saveAll = async () => {
    if (!examId || !batchId) return toast.error("Select exam and batch first");
    if (!canEditMarks) return toast.error("You do not have permission to edit marks.");
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
          await persistEnrollment({ enrollment_id: eid, student: s });

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

  const generateAll = async () => {
    if (!examId || !batchId) return toast.error("Select exam and batch first");
    if (isLocked) return toast.error("Exam is locked/published. Cannot generate.");
    if (students.length === 0) return toast.error("No students found");
    if (!canGenerateSnapshots) {
      return toast.error("Only Admin or Super Admin can generate snapshots.");
    }

    setGeneratingAll(true);
    setGenerateProgress({ done: 0, total: students.length });

    const errors = [];
    try {
      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const eid = s.enrollment_id;
        try {
          if (isEnrollmentDirty(eid)) {
            await persistEnrollment({ enrollment_id: eid, student: s });
            markRowSaved(eid);
          }
          await api.post(`/api/results/${examId}/enrollments/${eid}/generate`);
        } catch (e) {
          errors.push({
            enrollment_id: eid,
            symbol_no: s.symbol_no,
            name: s.full_name,
            message: e?.response?.data?.message || e.message || "Generate failed",
          });
        } finally {
          setGenerateProgress({ done: i + 1, total: students.length });
        }
      }

      if (errors.length === 0) toast.success(`Generated all (${students.length})`);
      else {
        toast.error(`Generated with ${errors.length} error(s). Check console.`);
        console.table(errors);
      }
      await workflowQ.refetch();
    } finally {
      setGeneratingAll(false);
    }
  };

  const submitWorkflowMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/results/${examId}/submit`);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Submitted for verification");
      await workflowQ.refetch();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || "Submit failed"),
  });

  const verifyWorkflowMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/results/${examId}/verify`);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Exam verified");
      await workflowQ.refetch();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || "Verification failed"),
  });

  const approveWorkflowMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/results/${examId}/approve`);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Exam approved");
      await workflowQ.refetch();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || "Approval failed"),
  });

  const publishWorkflowMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/results/${examId}/publish`);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Exam published and locked");
      await examsQ.refetch();
      await workflowQ.refetch();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || "Publish failed"),
  });

  // ---------------- IMPORT ----------------
  const importMutation = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      const qs = new URLSearchParams();
      qs.set("exam_id", String(examId));
      if (batchId) qs.set("batch_id", String(batchId));
      const res = await api.post(`/api/import/marks?${qs.toString()}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: async (data) => {
      setImportSummary(data);
      setImportFile(null);
      const imported = Number(data?.imported || 0);
      const errorsCount = Number(data?.errors_count || 0);
      const skipped = Number(data?.skipped || 0);
      if (errorsCount > 0 || skipped > 0) {
        toast.error(
          `Imported ${imported} row(s) with ${errorsCount} error(s) and ${skipped} skipped row(s).`
        );
      } else {
        toast.success(`Imported ${imported} rows`);
      }
      let latestStudents = students;
      if (batchId) {
        const refreshed = await studentsQ.refetch?.();
        if (Array.isArray(refreshed?.data)) {
          latestStudents = refreshed.data;
        }
      }
      await loadLedgers(latestStudents);
      if (viewMode === "grade") {
        await loadGrades();
      }
    },
    onError: (e) => {
      const data = e?.response?.data;
      if (data?.errors_count || Array.isArray(data?.errors)) {
        setImportSummary(data);
      }
      toast.error(data?.message || e.message || "Import failed");
    },
  });

  const onImport = () => {
    if (!examId) {
      toast.error("Select exam first");
      return;
    }
    if (!batchId) {
      toast.error("Select batch first");
      return;
    }
    if (isLocked) {
      toast.error("Exam is locked/published. Import disabled.");
      return;
    }
    if (!canEditMarks) {
      toast.error("You do not have permission to import marks.");
      return;
    }
    if (!importFile) {
      toast.error("Choose a file to import");
      return;
    }
    importMutation.mutate(importFile);
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
    setDirtyByEnrollment((prev) => ({ ...prev, [enrollment_id]: true }));
  };

  const setStudentField = (enrollment_id, field, value) => {
    setStudentEdits((prev) => ({
      ...prev,
      [enrollment_id]: {
        ...(prev[enrollment_id] || {}),
        [field]: value,
      },
    }));
  };

  const setOptionalCode = (enrollment_id, groupName, value) => {
    const nextCode = String(value ?? "").trim();
    const prevCode = (optionalByEnrollment?.[enrollment_id] || {})[groupName];
    setOptionalByEnrollment((prev) => {
      const row = { ...(prev[enrollment_id] || {}) };
      row[groupName] = nextCode;
      return { ...prev, [enrollment_id]: row };
    });
    setDirtyByEnrollment((prev) => ({ ...prev, [enrollment_id]: true }));

    // remove marks for old optional code if code changed
    setMarksByEnrollment((prev) => {
      const row = { ...(prev[enrollment_id] || {}) };
      if (prevCode && prevCode !== nextCode) {
        delete row[prevCode];
      }
      return { ...prev, [enrollment_id]: row };
    });
  };

  const getRowTotal = (enrollment_id) => {
    const row = marksByEnrollment?.[enrollment_id] || {};
    let sum = 0;
    for (const c of compulsoryCols) {
      const v = Number(row[c.component_code]);
      if (Number.isFinite(v)) sum += v;
    }
    for (const g of optionalGroups) {
      const code = (optionalByEnrollment?.[enrollment_id] || {})[g.name];
      if (!code) continue;
      const v = Number(row[code]);
      if (Number.isFinite(v)) sum += v;
    }
    return Number.isFinite(sum) ? Number(sum.toFixed(2)) : "";
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
    setPreviewError("");
    setPreviewOpen(true);

    if (canEditMarks && isEnrollmentDirty(student.enrollment_id)) {
      try {
        await persistEnrollment({
          enrollment_id: student.enrollment_id,
          student,
        });
        markRowSaved(student.enrollment_id);
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || "Auto-save failed";
        setPreviewError(`Auto-save failed: ${msg}. Showing last saved marks preview.`);
        toast.error(msg);
      }
    } else if (!canEditMarks && isEnrollmentDirty(student.enrollment_id)) {
      setPreviewError("Unsaved local changes are not included because this role has read-only access.");
    }

    try {
      const data = await previewMutation.mutateAsync({
        enrollment_id: student.enrollment_id,
      });
      setPreviewData(data);
      toast.success("Preview loaded");
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "Preview failed";
      setPreviewError(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mobile warning overlay */}
      <div className="fixed inset-0 z-50 md:hidden">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-lg border bg-background p-5 text-center shadow-lg">
            <div className="text-sm font-semibold">Bulk Grid Not Suitable for Mobile</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Please use a desktop or tablet device for bulk marks entry. The grid is
              too wide for mobile screens.
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Marks Entry (Bulk Grid)</h2>
        <p className="text-sm text-muted-foreground">
          Batch-wise bulk marks entry with a simplified Mark Ledger view.
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
              label="Batch"
              value={batchId}
              onChange={setBatchId}
              options={batchOptions}
              placeholder={batchesQ.isLoading ? "Loading batches..." : "Select batch"}
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

              {batchId ? (
                <Badge variant="outline">Batch #{batchId}</Badge>
              ) : (
                <Badge variant="outline">Select batch</Badge>
              )}

              <Badge variant="outline">Students: {studentsQ.isLoading ? "…" : students.length}</Badge>
              <Badge variant="outline">Visible: {visibleStudents.length}</Badge>
              {viewMode === "detailed" ? (
                <Badge variant="outline">
                  Columns: {visibleColumns.length}/{columns.length}
                </Badge>
              ) : viewMode === "grade" ? (
                <Badge variant="outline">
                  Grade Ledger {Object.keys(gradesByEnrollment || {}).length}/{students.length}
                </Badge>
              ) : (
                <Badge variant="outline">
                  Subjects: {compulsoryCols.length} • Optional groups: {optionalGroups.length}
                </Badge>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={viewMode === "ledger" ? "secondary" : "outline"}
                  onClick={() => setViewMode("ledger")}
                >
                  Mark Ledger
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "grade" ? "secondary" : "outline"}
                  onClick={() => setViewMode("grade")}
                >
                  Grade Ledger
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "detailed" ? "secondary" : "outline"}
                  onClick={() => setViewMode("detailed")}
                >
                  Detailed View
                </Button>
              </div>
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

              {viewMode === "detailed" ? (
                <>
                  <div className="w-full sm:w-[260px]">
                    <Input
                      value={columnQuery}
                      onChange={(e) => setColumnQuery(e.target.value)}
                      placeholder="Filter columns..."
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {["TH", "IN", "PR"].map((t) => (
                      <label key={t} className="text-xs flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!columnTypes[t]}
                          onChange={(e) =>
                            setColumnTypes((p) => ({ ...p, [t]: e.target.checked }))
                          }
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </>
              ) : null}

              {viewMode === "grade" ? (
                <>
                  {loadingGrades ? (
                    <Badge variant="outline">
                      Grades {gradeProgress.done}/{gradeProgress.total}
                    </Badge>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={loadGrades}
                    disabled={!canLoad || loadingGrades}
                  >
                    {loadingGrades ? "Loading..." : "Reload Grades"}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={loadLedgers}
                  disabled={!canLoad || loadingLedgers}
                >
                  {loadingLedgers ? "Loading..." : "Reload Ledgers"}
                </Button>
              )}

              {savingAll ? (
                <Badge variant="outline">
                  Saving {saveAllProgress.done}/{saveAllProgress.total}
                </Badge>
              ) : null}

              <Button
                variant="outline"
                onClick={saveAll}
                disabled={
                  !examId ||
                  !batchId ||
                  savingAll ||
                  loadingLedgers ||
                  isLocked ||
                  !canEditMarks
                }
              >
                {savingAll ? "Saving..." : "Save All"}
              </Button>

              {generatingAll ? (
                <Badge variant="outline">
                  Finalizing {generateProgress.done}/{generateProgress.total}
                </Badge>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Import Marks (Excel/CSV)</div>
              <div className="text-xs text-muted-foreground">
                Use the Mark Ledger template (Symbol, Regd, DOB, compulsory + optional codes).
                You can also import the simple template with: symbol_no, component_code, marks_obtained.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`${api.defaults.baseURL || ""}/api/import/marks-ledger-template${
                  examId ? `?exam_id=${encodeURIComponent(examId)}` : ""
                }`}
                className="text-xs text-primary underline"
              >
                Download Mark Ledger template
              </a>
              <a
                href="/marks_import_template.csv"
                download
                className="text-xs text-muted-foreground underline"
              >
                Simple CSV template
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setImportFile(file);
                setImportSummary(null);
              }}
            />
            <Button
              onClick={onImport}
              disabled={!importFile || importMutation.isPending || !canEditMarks}
            >
              {importMutation.isPending ? "Importing..." : "Import Marks"}
            </Button>
          </div>

          {importSummary ? (
            <div className="rounded-md border p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    Number(importSummary?.errors_count || 0) > 0 ||
                    Number(importSummary?.skipped || 0) > 0
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {Number(importSummary?.errors_count || 0) > 0 ||
                  Number(importSummary?.skipped || 0) > 0
                    ? "Imported With Issues"
                    : "Import Successful"}
                </Badge>
                <div className="text-muted-foreground">
                  Sheet: {importSummary.sheet || "—"}
                </div>
              </div>

              <div>
                Imported: {importSummary.imported || 0} • Skipped:{" "}
                {importSummary.skipped || 0} • Errors: {importSummary.errors_count || 0}
              </div>

              {importErrors.length > 0 ? (
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-foreground">
                      Import Issues ({importErrors.length})
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={downloadImportErrors}
                    >
                      Download Error CSV
                    </Button>
                  </div>
                  <div className="max-h-36 overflow-auto rounded border p-2 text-muted-foreground">
                    <ul className="space-y-1">
                      {importErrors.map((e, idx) => (
                        <li key={`${e?.row || "x"}-${idx}`}>
                          Row {e?.row ?? "—"}: {e?.reason || "Unknown error"}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
          {!examId || !batchId ? (
            <div className="text-sm text-muted-foreground">
              Select exam + batch to load bulk grid.
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
            <div className="text-sm text-muted-foreground">No students found in this batch.</div>
          ) : visibleStudents.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No match for: <span className="font-medium">{studentQuery}</span>
            </div>
          ) : viewMode === "ledger" ? (
            examComponentsQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading subjects...</div>
            ) : compulsoryCols.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No compulsory subjects configured. Configure exam components first.
              </div>
            ) : (
              <div className="w-full">
                <div className="relative w-full overflow-x-auto overflow-y-auto max-h-[72vh] rounded-md border">
                  <table className="min-w-max w-max text-[10px] leading-none">
                    <thead className="bg-muted sticky top-0 z-30">
                      <tr>
                        <th
                          className="px-0.5 py-0.5 text-left bg-muted border-r shadow-sm"
                          style={{
                            position: "sticky",
                            left: 0,
                            zIndex: 70,
                            width: STICKY.SN_W,
                            minWidth: STICKY.SN_W,
                          }}
                        >
                          SN
                        </th>
                        <th
                          className="px-0.5 py-0.5 text-left bg-muted border-r shadow-sm"
                          style={{
                            position: "sticky",
                            left: STICKY.SN_W,
                            zIndex: 70,
                            width: STICKY.SYMBOL_W,
                            minWidth: STICKY.SYMBOL_W,
                          }}
                        >
                          Symbol No.
                        </th>
                        <th
                          className="px-0.5 py-0.5 text-left bg-muted border-r shadow-sm"
                          style={{
                            position: "sticky",
                            left: STICKY.SN_W + STICKY.SYMBOL_W,
                            zIndex: 70,
                            width: STICKY.STUDENT_W,
                            minWidth: STICKY.STUDENT_W,
                          }}
                        >
                          Name of Student
                        </th>

                        {compulsoryCols.map((c) => (
                          <th
                            key={c.component_code}
                            className="px-0.5 py-0.5 text-center border-l"
                            style={{
                              width: SUBJECT_COL_W,
                              minWidth: SUBJECT_COL_W,
                              maxWidth: SUBJECT_COL_W,
                            }}
                          >
                            <div className="font-semibold text-[10px] leading-tight whitespace-normal break-words">
                              {c.label}
                            </div>
                            <div className="text-[9px] text-muted-foreground">
                              TH{c.full_marks != null ? ` • ${c.full_marks}` : ""}
                            </div>
                          </th>
                        ))}

                        {optionalGroups.map((g) => (
                          <Fragment key={g.name}>
                            <th
                              className="px-0.5 py-0.5 text-center border-l"
                              style={{
                                width: SUBJECT_COL_W,
                                minWidth: SUBJECT_COL_W,
                                maxWidth: SUBJECT_COL_W,
                              }}
                            >
                              <div className="font-semibold text-[10px] leading-tight whitespace-normal break-words">
                                {g.name}
                              </div>
                              <div className="text-[9px] text-muted-foreground">Sub. Code</div>
                            </th>
                            <th
                              className="px-0.5 py-0.5 text-center border-l"
                              style={{
                                width: SUBJECT_COL_W,
                                minWidth: SUBJECT_COL_W,
                                maxWidth: SUBJECT_COL_W,
                              }}
                            >
                              <div className="font-semibold text-[10px] leading-tight whitespace-normal break-words">
                                {g.name}
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                TH
                              </div>
                            </th>
                          </Fragment>
                        ))}

                        <th className="px-0.5 py-0.5 text-center border-l" style={{ minWidth: STICKY.TOTAL_W }}>
                          Grand Total
                        </th>

                        <th
                          className="px-0.5 py-0.5 text-right bg-muted border-l shadow-sm"
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
                    </thead>
                    <tbody>
                      {pagedStudents.map((s, rowIndex) => {
                        const eid = s.enrollment_id;
                        const row = marksByEnrollment[eid] || {};
                        const edits = studentEdits[eid] || {};
                        const total = getRowTotal(eid);
                        const leftSn = 0;
                        const leftSymbol = STICKY.SN_W;
                        const leftName = STICKY.SN_W + STICKY.SYMBOL_W;

                        return (
                          <tr key={eid} className={rowIndex % 2 ? "bg-muted/20" : ""}>
                            <td
                              className="px-0.5 py-0.5 bg-background border-r shadow-sm"
                              style={{
                                position: "sticky",
                                left: leftSn,
                                zIndex: 20,
                                width: STICKY.SN_W,
                                minWidth: STICKY.SN_W,
                              }}
                            >
                              <div className="text-center font-medium">
                                {edits.roll_no || s.roll_no || pageStartIndex + rowIndex + 1}
                              </div>
                            </td>
                            <td
                              className="px-0.5 py-0.5 bg-background border-r shadow-sm"
                              style={{
                                position: "sticky",
                                left: leftSymbol,
                                zIndex: 20,
                                width: STICKY.SYMBOL_W,
                                minWidth: STICKY.SYMBOL_W,
                              }}
                            >
                              <div className="font-mono text-sm">
                                {edits.symbol_no || s.symbol_no || "—"}
                              </div>
                            </td>
                            <td
                              className="px-0.5 py-0.5 bg-background border-r shadow-sm"
                              style={{
                                position: "sticky",
                                left: leftName,
                                zIndex: 20,
                                width: STICKY.STUDENT_W,
                                minWidth: STICKY.STUDENT_W,
                              }}
                            >
                              <div className="text-sm">
                                {edits.full_name || s.full_name || "—"}
                              </div>
                            </td>

                            {compulsoryCols.map((c) => {
                              const v = row[c.component_code] ?? "";
                              const full = c.full_marks ?? getFullMarks(eid, c.component_code);
                              const isInvalid =
                                v !== "" &&
                                full != null &&
                                Number(v) > Number(full);
                              return (
                                <td
                                  key={c.component_code}
                                  className="px-0.5 py-0.5 border-l"
                                  style={{
                                    width: SUBJECT_COL_W,
                                    minWidth: SUBJECT_COL_W,
                                    maxWidth: SUBJECT_COL_W,
                                  }}
                                >
                                  <Input
                                    className="h-[26px] px-0 text-[10px] text-center"
                                    value={v}
                                    placeholder={full != null ? `0-${full}` : "marks"}
                                    ref={(el) => {
                                      if (!el) return;
                                      ledgerInputRefs.current[
                                        ledgerCellKey(eid, c.component_code)
                                      ] = el;
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const codes = getLedgerRowCodes(eid);
                                        const idx = codes.findIndex(
                                          (x) => String(x) === String(c.component_code)
                                        );
                                        const dir = e.shiftKey ? -1 : 1;

                                        if (idx === -1) return;
                                        const nextIdx = idx + dir;

                                        if (nextIdx >= 0 && nextIdx < codes.length) {
                                          focusLedgerCell(eid, codes[nextIdx]);
                                          return;
                                        }

                                        const nextRowIndex = rowIndex + (dir > 0 ? 1 : -1);
                                        if (nextRowIndex < 0 || nextRowIndex >= pagedStudents.length)
                                          return;
                                        const nextEid = pagedStudents[nextRowIndex].enrollment_id;
                                        const nextCodes = getLedgerRowCodes(nextEid);
                                        if (nextCodes.length === 0) return;
                                        const targetCode =
                                          dir > 0
                                            ? nextCodes[0]
                                            : nextCodes[nextCodes.length - 1];
                                        focusLedgerCell(nextEid, targetCode);
                                      }
                                    }}
                                    onChange={(e) => {
                                      const val = safeNum(e.target.value);
                                      setMark(eid, c.component_code, val === "" ? "" : String(val));
                                    }}
                                  />
                                  {isInvalid ? (
                                    <div className="text-[8px] text-destructive mt-0.5">
                                      Invalid
                                    </div>
                                  ) : null}
                                </td>
                              );
                            })}

                            {optionalGroups.map((g) => {
                              const optCode =
                                (optionalByEnrollment?.[eid] || {})[g.name] || "";
                              const meta = optionalCodeMap.get(String(optCode));
                              const isMissingOptCode =
                                (g.subjects || []).length > 0 && !optCode;
                              const listId = `opt-${String(g.name || "")
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")}`;
                              const optMarks = optCode ? row[optCode] ?? "" : "";
                              const full = meta?.full_marks ?? getFullMarks(eid, optCode);
                              const isInvalid =
                                optMarks !== "" &&
                                full != null &&
                                Number(optMarks) > Number(full);

                              return (
                                <Fragment key={g.name}>
                                  <td
                                    className={`px-0.5 py-0.5 border-l ${
                                      isMissingOptCode ? "bg-destructive/5" : ""
                                    }`}
                                    style={{
                                      width: SUBJECT_COL_W,
                                      minWidth: SUBJECT_COL_W,
                                      maxWidth: SUBJECT_COL_W,
                                    }}
                                  >
                                    <Input
                                      className={
                                        isMissingOptCode
                                          ? "h-5 px-0 text-[10px] border-destructive focus-visible:ring-destructive/40"
                                          : "h-5 px-0 text-[10px]"
                                      }
                                      list={listId}
                                      value={optCode}
                                      placeholder="Code"
                                      onChange={(e) =>
                                        setOptionalCode(eid, g.name, e.target.value)
                                      }
                                    />
                                    <datalist id={listId}>
                                      {g.subjects.map((s) => (
                                        <option
                                          key={`${g.name}-${s.component_code}`}
                                          value={s.component_code}
                                        >
                                          {s.subject_name}
                                        </option>
                                      ))}
                                    </datalist>
                                    {meta ? (
                                      <div className="text-[8px] text-muted-foreground mt-0.5">
                                        {meta.subject_name}
                                      </div>
                                    ) : isMissingOptCode ? (
                                      <div className="text-[8px] text-destructive mt-0.5">
                                        Required
                                      </div>
                                    ) : null}
                                  </td>
                                  <td
                                    className="px-0.5 py-0.5 border-l"
                                    style={{
                                      width: SUBJECT_COL_W,
                                      minWidth: SUBJECT_COL_W,
                                      maxWidth: SUBJECT_COL_W,
                                    }}
                                  >
                                    <Input
                                      className="h-[26px] px-0 text-[10px] text-center"
                                      disabled={!optCode}
                                      value={optMarks}
                                      placeholder={full != null ? `0-${full}` : "marks"}
                                      ref={(el) => {
                                        if (!el || !optCode) return;
                                        ledgerInputRefs.current[
                                          ledgerCellKey(eid, optCode)
                                        ] = el;
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          if (!optCode) return;
                                          const codes = getLedgerRowCodes(eid);
                                          const idx = codes.findIndex(
                                            (x) => String(x) === String(optCode)
                                          );
                                          const dir = e.shiftKey ? -1 : 1;

                                          if (idx === -1) return;
                                          const nextIdx = idx + dir;

                                          if (nextIdx >= 0 && nextIdx < codes.length) {
                                            focusLedgerCell(eid, codes[nextIdx]);
                                            return;
                                          }

                                          const nextRowIndex = rowIndex + (dir > 0 ? 1 : -1);
                                          if (
                                            nextRowIndex < 0 ||
                                            nextRowIndex >= pagedStudents.length
                                          )
                                            return;
                                          const nextEid =
                                            pagedStudents[nextRowIndex].enrollment_id;
                                          const nextCodes = getLedgerRowCodes(nextEid);
                                          if (nextCodes.length === 0) return;
                                          const targetCode =
                                            dir > 0
                                              ? nextCodes[0]
                                              : nextCodes[nextCodes.length - 1];
                                          focusLedgerCell(nextEid, targetCode);
                                        }
                                      }}
                                      onChange={(e) => {
                                        const val = safeNum(e.target.value);
                                        if (!optCode) return;
                                        setMark(eid, optCode, val === "" ? "" : String(val));
                                      }}
                                    />
                                    {isInvalid ? (
                                      <div className="text-[8px] text-destructive mt-0.5">
                                        Invalid
                                      </div>
                                    ) : null}
                                  </td>
                                </Fragment>
                              );
                            })}

                            <td className="px-0.5 py-0.5 text-center border-l font-medium text-[10px]">
                              {total === "" ? "—" : total}
                            </td>

                            <td
                              className="px-0.5 py-0.5 text-right bg-background border-l shadow-sm"
                              style={{
                                position: "sticky",
                                right: 0,
                                zIndex: 20,
                                width: STICKY.ACTION_W,
                                minWidth: STICKY.ACTION_W,
                              }}
                            >
                              <div className="flex justify-end gap-1 whitespace-nowrap">
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  disabled={saveOne.isPending || !canEditMarks}
                                  onClick={() => {
                                    if (!examId) {
                                      toast.error("Select exam first");
                                      return;
                                    }
                                    if (!canEditMarks) {
                                      toast.error("You do not have permission to edit marks.");
                                      return;
                                    }
                                    if (isLocked) {
                                      toast.error("Exam is locked/published. Cannot save.");
                                      return;
                                    }
                                    saveOne.mutate({ enrollment_id: eid, student: s });
                                  }}
                                >
                                  Save
                                </Button>

                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  variant="outline"
                                  disabled={!examId || previewMutation.isPending}
                                  onClick={() => openPreview(s)}
                                >
                                  {previewStudent?.enrollment_id === eid &&
                                  previewMutation.isPending
                                    ? "Loading..."
                                    : "Preview"}
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
                    Notes: Optional codes set the student’s optional subjects. Save rows after
                    entering codes and marks. Regd/DOB can be edited from the Students page.
                    </div>
                </div>
              </div>
            )
          ) : viewMode === "grade" ? (
            loadingGrades ? (
              <div className="text-sm text-muted-foreground">Loading grade ledger...</div>
            ) : examComponentsQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading subjects...</div>
            ) : compulsoryCols.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No compulsory subjects configured. Configure exam components first.
              </div>
            ) : (
              <div className="w-full">
                <div className="relative w-full overflow-x-auto overflow-y-auto max-h-[72vh] rounded-md border">
                  <table className="min-w-max w-max text-sm">
                    <thead className="bg-muted sticky top-0 z-30">
                      <tr>
                        <th
                          className="p-2 text-left bg-muted border-r shadow-sm"
                          rowSpan={2}
                          style={{
                            position: "sticky",
                            left: 0,
                            zIndex: 70,
                            width: STICKY.SN_W,
                            minWidth: STICKY.SN_W,
                          }}
                        >
                          SN
                        </th>
                        <th
                          className="p-2 text-left bg-muted border-r shadow-sm"
                          rowSpan={2}
                          style={{
                            position: "sticky",
                            left: STICKY.SN_W,
                            zIndex: 70,
                            width: STICKY.SYMBOL_W,
                            minWidth: STICKY.SYMBOL_W,
                          }}
                        >
                          Symbol No.
                        </th>
                        <th
                          className="p-2 text-left bg-muted border-r shadow-sm"
                          rowSpan={2}
                          style={{
                            position: "sticky",
                            left: STICKY.SN_W + STICKY.SYMBOL_W,
                            zIndex: 70,
                            width: STICKY.STUDENT_W,
                            minWidth: STICKY.STUDENT_W,
                          }}
                        >
                          Name of Student
                        </th>

                        {compulsoryCols.map((c) => (
                          <th
                            key={c.subject_id}
                            className="p-2 text-center border-l font-semibold"
                            colSpan={2}
                          >
                            {c.label}
                          </th>
                        ))}

                        {optionalGroups.map((g) => (
                          <th
                            key={g.name}
                            className="p-2 text-center border-l font-semibold"
                            colSpan={3}
                          >
                            {g.name}
                          </th>
                        ))}

                        <th className="p-2 text-center border-l font-semibold" colSpan={2}>
                          Grand Total
                        </th>
                      </tr>
                      <tr>
                        {compulsoryCols.map((c) => (
                          <Fragment key={`sub-${c.subject_id}`}>
                            <th className="p-2 text-center border-l text-[11px]">
                              TH Grade
                            </th>
                            <th className="p-2 text-center border-l text-[11px]">
                              TH GPA
                            </th>
                          </Fragment>
                        ))}

                        {optionalGroups.map((g) => (
                          <Fragment key={`sub-${g.name}`}>
                            <th className="p-2 text-center border-l text-[11px]">
                              Sub. Code
                            </th>
                            <th className="p-2 text-center border-l text-[11px]">
                              TH Grade
                            </th>
                            <th className="p-2 text-center border-l text-[11px]">
                              TH GPA
                            </th>
                          </Fragment>
                        ))}

                        <th className="p-2 text-center border-l text-[11px]">TH Grade</th>
                        <th className="p-2 text-center border-l text-[11px]">TH GPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedStudents.map((s, rowIndex) => {
                        const eid = s.enrollment_id;
                        const edits = studentEdits[eid] || {};
                        const gradeRow = gradesByEnrollment[eid] || {};
                        const subjectMap = gradeRow.subjects || {};
                        const leftSn = 0;
                        const leftSymbol = STICKY.SN_W;
                        const leftName = STICKY.SN_W + STICKY.SYMBOL_W;

                        const getSubGrade = (subjectId) =>
                          subjectMap[String(subjectId)] || {};

                        return (
                          <tr key={eid} className={rowIndex % 2 ? "bg-muted/20" : ""}>
                            <td
                              className="p-2 bg-background border-r shadow-sm"
                              style={{
                                position: "sticky",
                                left: leftSn,
                                zIndex: 20,
                                width: STICKY.SN_W,
                                minWidth: STICKY.SN_W,
                              }}
                            >
                              <div className="text-center font-medium">
                                {edits.roll_no || s.roll_no || pageStartIndex + rowIndex + 1}
                              </div>
                            </td>
                            <td
                              className="p-2 bg-background border-r shadow-sm"
                              style={{
                                position: "sticky",
                                left: leftSymbol,
                                zIndex: 20,
                                width: STICKY.SYMBOL_W,
                                minWidth: STICKY.SYMBOL_W,
                              }}
                            >
                              {edits.symbol_no || s.symbol_no || "—"}
                            </td>
                            <td
                              className="p-2 bg-background border-r shadow-sm"
                              style={{
                                position: "sticky",
                                left: leftName,
                                zIndex: 20,
                                width: STICKY.STUDENT_W,
                                minWidth: STICKY.STUDENT_W,
                              }}
                            >
                              {edits.full_name || s.full_name || "—"}
                            </td>

                            {compulsoryCols.map((c) => {
                              const g = getSubGrade(c.subject_id);
                              return (
                                <Fragment key={`row-${eid}-${c.subject_id}`}>
                                  <td className="p-2 text-center border-l">
                                    {g.grade || "—"}
                                  </td>
                                  <td className="p-2 text-center border-l">
                                    {formatGpa(g.gpa)}
                                  </td>
                                </Fragment>
                              );
                            })}

                            {optionalGroups.map((g) => {
                              const optCode =
                                (optionalByEnrollment?.[eid] || {})[g.name] || "";
                              const missingOptCode =
                                (g.subjects || []).length > 0 && !optCode;
                              const meta = optCode
                                ? optionalCodeMap.get(String(optCode))
                                : null;
                              const g2 = meta ? getSubGrade(meta.subject_id) : {};

                              return (
                                <Fragment key={`row-${eid}-${g.name}`}>
                                  <td
                                    className={`p-2 text-center border-l ${
                                      missingOptCode
                                        ? "bg-destructive/5 text-destructive font-medium"
                                        : ""
                                    }`}
                                  >
                                    {optCode || "—"}
                                  </td>
                                  <td className="p-2 text-center border-l">
                                    {g2.grade || "—"}
                                  </td>
                                  <td className="p-2 text-center border-l">
                                    {formatGpa(g2.gpa)}
                                  </td>
                                </Fragment>
                              );
                            })}

                            <td className="p-2 text-center border-l font-medium">
                              {gradeRow.overall_grade || "—"}
                            </td>
                            <td className="p-2 text-center border-l font-medium">
                              {formatGpa(gradeRow.overall_gpa)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <Separator />
                  <div className="p-3 text-xs text-muted-foreground">
                    Notes: Grade Ledger uses saved marks. Save marks first, then reload grades.
                  </div>
                </div>
              </div>
            )
          ) : columns.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No enabled components found for this exam. Configure exam components first.
            </div>
          ) : visibleColumns.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No columns match filter:{" "}
              <span className="font-medium">{columnQuery || "—"}</span>
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
                    {pagedStudents.map((s) => {
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
                                  className="px-1 py-0.5 text-center border-l"
                                  style={{ minWidth: "72px" }}
                                >
                                  <Input
                                    disabled={isLocked}
                                    value={value}
                                    placeholder={full != null ? `0-${full}` : "marks"}
                                    className={
                                      isInvalid
                                        ? "border-destructive h-5 px-0 text-[10px] text-center"
                                        : "h-5 px-0 text-[10px] text-center"
                                    }
                                    ref={(el) => {
                                      if (!el) return;
                                      inputRefs.current[cellKey(eid, c.code)] = el;
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const dir = e.shiftKey ? -1 : 1;
                                        const rIndex = pagedStudents.findIndex(
                                          (x) => x.enrollment_id === eid
                                        );
                                        const cIndex = visibleColumns.findIndex(
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
                            <div className="flex justify-end gap-1 whitespace-nowrap">
                              <Button
                                size="sm"
                                className="h-8 px-2"
                                disabled={saveOne.isPending || !canEditMarks}
                                onClick={() => {
                                  if (!examId) {
                                    toast.error("Select exam first");
                                    return;
                                  }
                                  if (!canEditMarks) {
                                    toast.error("You do not have permission to edit marks.");
                                    return;
                                  }
                                  if (isLocked) {
                                    toast.error("Exam is locked/published. Cannot save.");
                                    return;
                                  }
                                  saveOne.mutate({ enrollment_id: eid, student: s });
                                }}
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

          {examId &&
          batchId &&
          !studentsQ.isLoading &&
          !loadingLedgers &&
          visibleStudents.length > 0 ? (
            <div className="mt-3">
              <PaginationBar
                page={pager.page}
                totalPages={pager.totalPages}
                onPageChange={pager.setPage}
                pageSize={pager.pageSize}
                onPageSizeChange={pager.setPageSize}
                totalItems={visibleStudents.length}
              />
            </div>
          ) : null}
        </div>
      </div>


{/* Review and approval section starts from here------------------------- */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Final Result Workflow</div>
              <div className="text-xs text-muted-foreground">
                Finalize All → Submit for verification → Verify (Exam Head) → Approve (Chief/Asst Chief) → Publish
              </div>
            </div>
            <Badge variant={workflowBadgeVariant(workflowStatus)}>
              {workflowStatus}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Button
              variant="secondary"
              onClick={generateAll}
              disabled={
                !examId ||
                !batchId ||
                generatingAll ||
                loadingLedgers ||
                isLocked ||
                !canGenerateSnapshots
              }
              title="Generate latest result snapshots from entered marks"
            >
              {generatingAll ? "Finalizing..." : "Finalize All"}
            </Button>
            <Button
              variant="outline"
              onClick={() => submitWorkflowMutation.mutate()}
              disabled={
                !examId ||
                !canSubmit ||
                isLocked ||
                submitWorkflowMutation.isPending ||
                workflowStatus === "SUBMITTED" ||
                workflowStatus === "VERIFIED" ||
                workflowStatus === "APPROVED" ||
                workflowStatus === "PUBLISHED"
              }
            >
              {submitWorkflowMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
            <Button
              variant="outline"
              onClick={() => verifyWorkflowMutation.mutate()}
              disabled={
                !examId ||
                !canVerify ||
                isLocked ||
                verifyWorkflowMutation.isPending ||
                workflowStatus !== "SUBMITTED"
              }
            >
              {verifyWorkflowMutation.isPending ? "Verifying..." : "Verify"}
            </Button>
            <Button
              variant="outline"
              onClick={() => approveWorkflowMutation.mutate()}
              disabled={
                !examId ||
                !canApprove ||
                isLocked ||
                approveWorkflowMutation.isPending ||
                workflowStatus !== "VERIFIED"
              }
            >
              {approveWorkflowMutation.isPending ? "Approving..." : "Approve"}
            </Button>
            <Button
              onClick={() => publishWorkflowMutation.mutate()}
              disabled={
                !examId ||
                !canPublish ||
                isLocked ||
                publishWorkflowMutation.isPending ||
                workflowStatus !== "APPROVED"
              }
            >
              {publishWorkflowMutation.isPending ? "Publishing..." : "Publish"}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Snapshots: {workflowQ.data?.snapshots_total ?? 0} | Published:{" "}
            {workflowQ.data?.snapshots_published ?? 0}
          </div>
        </CardContent>
      </Card>

      
      <ResultPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        loading={previewMutation.isPending && !previewData}
        previewData={previewData}
        examLabel={selectedExam?.name || selectedExam?.title || `Exam #${examId || "—"}`}
        student={previewStudent}
        enrollmentId={previewStudent?.enrollment_id || ""}
      />
    </div>
  );
}
