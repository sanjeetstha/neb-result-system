import { useEffect, useMemo, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";



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
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function MarksGridPage() {
  const qc = useQueryClient();

  const [examId, setExamId] = useState("");
  const [sectionId, setSectionId] = useState("");

  // per-student marks map:
  // marksByEnrollment[enrollment_id][component_code] = value
  const [marksByEnrollment, setMarksByEnrollment] = useState({});
  const [ledgerByEnrollment, setLedgerByEnrollment] = useState({});
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllProgress, setSaveAllProgress] = useState({ done: 0, total: 0 });


//===============Keyboard Navigation Feature starts from here=================
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
      const totalRows = students.length;
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

        const enrollmentId = students[r].enrollment_id;
        const code = columns[c].code;

        focusCell(enrollmentId, code);
        return;
      }
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
      const label = isPublished ? `${name} (Published)` : name;
      return { value: id, label };
    });
  }, [examsQ.data]);

  const selectedExam = useMemo(() => {
    return (examsQ.data || []).find((e) => String(e.id ?? e.exam_id) === String(examId)) || null;
  }, [examsQ.data, examId]);

  const isLocked = !!(selectedExam?.published_at || selectedExam?.is_published || selectedExam?.is_locked);

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
      const res = await api.get(`/api/students?section_id=${encodeURIComponent(sectionId)}`);
      return res.data?.students ?? [];
    },
    staleTime: 5_000,
  });

  const students = useMemo(() => {
    const arr = studentsQ.data || [];
    return Array.isArray(arr) ? arr : [];
  }, [studentsQ.data]);

  // reset state when selection changes
  useEffect(() => {
    setLedgerByEnrollment({});
    setMarksByEnrollment({});
  }, [examId, sectionId]);

  // ---------------- LOAD LEDGERS FOR ALL STUDENTS ----------------
  const canLoad = !!examId && !!sectionId && students.length > 0;

  const loadLedgers = async () => {
    if (!canLoad) return;

    try {
      setLoadingLedgers(true);

      const ledgers = {};
      const marksInit = {};

      // Fetch each student's ledger
      // (for large classes later we optimize with backend batch endpoint)
      for (const s of students) {
        const enrollment_id = s.enrollment_id;
        const res = await api.get(`/api/marks/${examId}/enrollments/${enrollment_id}`);
        const ledger = res.data?.ledger ?? [];
        ledgers[enrollment_id] = ledger;

        // Initialize marks only for enabled components
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
      toast.success("Ledgers loaded for section");
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Failed to load ledgers");
    } finally {
      setLoadingLedgers(false);
    }
  };

  // auto-load ledgers when exam+section+students ready
  useEffect(() => {
    if (!canLoad) return;
    loadLedgers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad]);

  const saveAll = async () => {
    if (!examId || !sectionId) {
      toast.error("Select exam and section first");
      return;
    }
    if (isLocked) {
      toast.error("Exam is locked/published. Cannot save.");
      return;
    }
    if (students.length === 0) {
      toast.error("No students found");
      return;
    }

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

      if (errors.length === 0) {
        toast.success(`Saved all (${students.length})`);
      } else {
        toast.error(`Saved with ${errors.length} error(s). Check console.`);
        console.table(errors);
      }

      // Optional: refresh ledgers from backend after save
      // await loadLedgers();
    } finally {
      setSavingAll(false);
    }
  };





  // ---------------- BUILD GRID COLUMNS (enabled components) ----------------
  const columns = useMemo(() => {
    // Collect unique enabled component codes with metadata
    const map = new Map(); // code -> { title, subject_name, full_marks, component_type }
    for (const [enrollmentId, ledger] of Object.entries(ledgerByEnrollment)) {
      for (const item of ledger || []) {
        if (!item?.enabled_in_exam) continue;
        const code = String(item.component_code ?? "").trim();
        if (!code) continue;

        if (!map.has(code)) {
          map.set(code, {
            code,
            title: item.title ?? "",
            subject_name: item.subject_name ?? "",
            component_type: item.component_type ?? "",
            full_marks: item.full_marks ?? null,
          });
        } else {
          // if full_marks is null in one and not null in another, keep the value
          const prev = map.get(code);
          if (prev.full_marks == null && item.full_marks != null) {
            map.set(code, { ...prev, full_marks: item.full_marks });
          }
        }
      }
    }

    // Sort columns by numeric code if possible (otherwise string)
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const an = Number(a.code);
      const bn = Number(b.code);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.code).localeCompare(String(b.code));
    });

    return arr;
  }, [ledgerByEnrollment]);

  // ---------------- SAVE ONE STUDENT ----------------
  const saveOne = useMutation({
    mutationFn: async ({ enrollment_id }) => {
      const row = marksByEnrollment[enrollment_id] || {};
      const items = Object.entries(row).map(([component_code, value]) => ({
        component_code,
        marks: value === "" ? null : Number(value),
      }));

      const payload = { marks: items, items, by_code: row };
      const res = await api.post(`/api/marks/${examId}/enrollments/${enrollment_id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Saved");
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e.message || "Save failed");
    },
  });

  // ---------------- VALIDATION HELPERS ----------------
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marks Entry (Bulk Grid)</h2>
        <p className="text-sm text-muted-foreground">
          Section-wise bulk marks entry. This is optimized for teachers.
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

            <Badge variant="outline">
              Students: {studentsQ.isLoading ? "…" : students.length}
            </Badge>

            <Badge variant="outline">
              Columns: {columns.length}
            </Badge>

            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                onClick={loadLedgers}
                disabled={!canLoad || loadingLedgers}
              >
                {loadingLedgers ? "Loading..." : "Reload Ledgers"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <div className="p-3 border-b flex items-center justify-between">

          <div className="flex items-center gap-2">
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


          <div className="text-sm font-medium">Grid</div>
          <div className="text-xs text-muted-foreground">
            Tip: Save per student row first. “Save all” comes next.
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
            <div className="text-sm text-muted-foreground">
              Loading students/ledgers...
            </div>
          ) : students.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No students found in this section.
            </div>
          ) : columns.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No enabled components found for this exam. Configure exam components first.
            </div>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="p-2 text-left min-w-[140px]">Symbol</th>
                    <th className="p-2 text-left min-w-[220px]">Student</th>
                    {columns.map((c) => (
                      <th key={c.code} className="p-2 text-center min-w-[130px]">
                        <div className="font-medium">{pad4(c.code)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.component_type}
                          {c.full_marks != null ? ` • ${c.full_marks}` : ""}
                        </div>
                      </th>
                    ))}
                    <th className="p-2 text-right min-w-[140px]">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {students.map((s) => {
                    const eid = s.enrollment_id;
                    const rowMarks = marksByEnrollment[eid] || {};

                    return (
                      <tr key={eid} className="border-t">
                        <td className="p-2 font-mono">{s.symbol_no}</td>
                        <td className="p-2">
                          <div className="font-medium">{s.full_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Roll: {s.roll_no || "—"} • Regd: {s.regd_no || "—"}
                          </div>
                        </td>

                        {columns.map((c) => {
                          const full = getFullMarks(eid, c.code);
                          const value = rowMarks[c.code] ?? "";
                          const n = value === "" ? "" : Number(value);

                          const isInvalid =
                            value !== "" &&
                            (!Number.isFinite(n) || (full != null && (n < 0 || n > full)));

                          return (
                            <td key={c.code} className="p-2 text-center">
                              {/* <Input
                                disabled={isLocked}
                                value={value}
                                placeholder={full != null ? `0-${full}` : "marks"}
                                className={isInvalid ? "border-destructive" : ""}
                                onChange={(e) => {
                                  const v = safeNum(e.target.value);
                                  setMark(eid, c.code, v === "" ? "" : String(v));
                                }}
                              /> */}
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
                                    const rIndex = students.findIndex((x) => x.enrollment_id === eid);
                                    const cIndex = columns.findIndex((x) => x.code === c.code);
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
                                  {c.title || c.subject_name}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            disabled={isLocked || saveOne.isPending}
                            onClick={() => saveOne.mutate({ enrollment_id: eid })}
                          >
                            Save
                          </Button>
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
          )}
        </div>
      </div>
    </div>
  );
}
