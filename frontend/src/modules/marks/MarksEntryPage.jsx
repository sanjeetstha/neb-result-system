import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";
import ResultPreviewDialog from "../../components/results/ResultPreviewDialog";

function norm(v) {
  return String(v ?? "").trim();
}

function toNumberOrEmpty(v) {
  const s = String(v ?? "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function pad4(code) {
  const s = String(code ?? "").trim();
  if (!s) return "";
  if (s.length >= 4) return s;
  return s.padStart(4, "0");
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

function isOptionalGroup(name) {
  return /^\s*opt/i.test(String(name || ""));
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

export default function MarksEntryPage() {
  const qc = useQueryClient();

  const [examId, setExamId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");

  // editable marks map: { component_code: value }
  const [marks, setMarks] = useState({});
  const [ledgerQuery, setLedgerQuery] = useState("");

  // optional subjects (per-student)
  const [optDraft, setOptDraft] = useState({});
  const [optDirty, setOptDirty] = useState(false);

  // ----------------- LOAD EXAMS -----------------
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

  // helpful exam status (must be defined before studentsQ)
  const selectedExam = useMemo(() => {
    return (examsQ.data || []).find((e) => String(e.id ?? e.exam_id) === String(examId)) || null;
  }, [examsQ.data, examId]);

  const isPublished = !!(selectedExam?.published_at || selectedExam?.is_published);

  // ----------------- LOAD SECTIONS -----------------
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

  // ----------------- LOAD STUDENTS for BATCH -----------------
  const studentsQ = useQuery({
    queryKey: ["students", "list", batchId, selectedExam?.class_id],
    enabled: !!batchId && !!selectedExam?.class_id,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("batch_id", batchId);
      if (selectedExam?.class_id) params.set("class_id", selectedExam.class_id);
      const res = await api.get(`/api/students?${params.toString()}`);
      const data = res.data?.students ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10_000,
  });

  const studentOptions = useMemo(() => {
    const arr = studentsQ.data || [];
    return arr
      .map((x) => {
        const eid = String(
          x.enrollment_id ??
            x.enrollmentId ??
            x.id_enrollment ??
            x.enrollment?.id ??
            ""
        );
        const fullName = x.full_name ?? x.name ?? "Student";
        const sym = x.symbol_no ?? x.symbol ?? "";
        const label = sym ? `${fullName} — ${sym}` : fullName;
        return { value: eid, label };
      })
      .filter((x) => x.value);
  }, [studentsQ.data]);

  const selectedStudent = useMemo(() => {
    const arr = studentsQ.data || [];
    return (
      arr.find(
        (x) =>
          String(
            x.enrollment_id ??
              x.enrollmentId ??
              x.id_enrollment ??
              x.enrollment?.id ??
              ""
          ) === String(enrollmentId)
      ) || null
    );
  }, [studentsQ.data, enrollmentId]);

  // ----------------- STUDENT PROFILE + OPTIONALS -----------------
  const profileQ = useQuery({
    queryKey: ["students", "profile", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const res = await api.get(`/api/students/${enrollmentId}/profile`);
      return res.data;
    },
    staleTime: 10_000,
  });

  const catalogQ = useQuery({
    queryKey: ["masters", "subject-catalog", enrollmentId],
    enabled: !!enrollmentId && !!profileQ.data?.enrollment,
    queryFn: async () => {
      const e = profileQ.data.enrollment;
      const academic_year_id = e.academic_year_id;
      const class_id = e.class_id;
      const res = await api.get(
        `/api/masters/subject-catalog?academic_year_id=${encodeURIComponent(academic_year_id)}&class_id=${encodeURIComponent(class_id)}`
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  // reset enrollment if batch changed
  useEffect(() => {
    setEnrollmentId("");
    setMarks({});
    setPreviewData(null);
    setPreviewOpen(false);
  }, [batchId]);

  // reset marks if exam changed
  useEffect(() => {
    setMarks({});
    setLedgerQuery("");
    setPreviewData(null);
    setPreviewOpen(false);
  }, [examId]);

  useEffect(() => {
    if (!enrollmentId) {
      setOptDraft({});
      setOptDirty(false);
      setPreviewData(null);
      setPreviewOpen(false);
    }
  }, [enrollmentId]);

  // init optional choices when profile loads
  useEffect(() => {
    if (!profileQ.data?.ok) return;
    const serverChoices = profileQ.data.optional_choices || [];
    const draft = {};
    for (const c of serverChoices) {
      if (!c?.group_name) continue;
      draft[c.group_name] = Number(c.subject_id) || "";
    }
    setOptDraft(draft);
    setOptDirty(false);
  }, [profileQ.data]);

  // ----------------- LOAD LEDGER -----------------
  const ledgerQ = useQuery({
    queryKey: ["marks", "ledger", examId, enrollmentId],
    enabled: !!examId && !!enrollmentId,
    queryFn: async () => {
      const res = await api.get(`/api/marks/${examId}/enrollments/${enrollmentId}`);
      return res.data;
    },
    staleTime: 0,
  });

  // normalize ledger rows
  const ledgerRows = useMemo(() => {
    const data = ledgerQ.data || {};
    const items =
      data.ledger ??
      data.marks ??
      data.items ??
      data.data ??
      [];
    const arr = Array.isArray(items) ? items : [];

    return arr
      .map((r) => ({
        component_code: String(r.component_code ?? r.code ?? "").trim(),
        component_title: r.component_title ?? r.title ?? "",
        subject_name: r.subject_name ?? r.subject ?? "",
        full_marks: r.full_marks ?? r.max_marks ?? null,
        enabled_in_exam: r.enabled_in_exam == null ? true : !!r.enabled_in_exam,
        obtained: r.marks ?? r.obtained_marks ?? r.value ?? "",
        raw: r,
      }))
      .filter((x) => x.component_code && x.enabled_in_exam);
  }, [ledgerQ.data]);

  const filteredLedgerRows = useMemo(() => {
    const q = String(ledgerQuery || "").trim().toLowerCase();
    if (!q) return ledgerRows;
    return ledgerRows.filter((r) => {
      const hay = [
        r.subject_name,
        r.component_title,
        r.component_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [ledgerRows, ledgerQuery]);

  // When ledger loads, initialize marks state
  useEffect(() => {
    if (!ledgerQ.data) return;
    const next = {};
    for (const r of ledgerRows) {
      // keep as string/number for Input
      next[r.component_code] = r.obtained === null || r.obtained === undefined ? "" : String(r.obtained);
    }
    setMarks(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerQ.data]);

  // ----------------- SAVE MARKS -----------------
  const saveMarks = useMutation({
    mutationFn: async () => {
      if (!examId || !enrollmentId) throw new Error("Select exam and student first");

      // Build payload expected by backend: marks by component_code
      // We'll send both formats for compatibility.
      const items = Object.entries(marks).map(([component_code, value]) => ({
        component_code,
        marks: value === "" ? null : Number(value),
      }));

      const payload = {
        marks: items,
        items,
        by_code: marks,
      };

      const res = await api.post(`/api/marks/${examId}/enrollments/${enrollmentId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Marks saved");
      await qc.invalidateQueries({ queryKey: ["marks", "ledger", examId, enrollmentId] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to save marks");
    },
  });

  const saveOptionals = useMutation({
    mutationFn: async () => {
      if (!enrollmentId) throw new Error("Missing enrollment id");

      const allowedGroups = new Set(optionalGroups.map((g) => g.group_name));
      const choices = Object.entries(optDraft)
        .filter(([group_name, sid]) => allowedGroups.has(group_name) && Number(sid) > 0)
        .map(([group_name, subject_id]) => ({
          group_name,
          subject_id: Number(subject_id),
        }));

      if (choices.length === 0) throw new Error("Select at least one optional subject");

      const payload = { choices, optional_choices: choices };
      const res = await api.post(`/api/students/${enrollmentId}/optional-choices`, payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Optional subjects saved");
      setOptDirty(false);
      await qc.invalidateQueries({ queryKey: ["students", "profile", enrollmentId] });
      await qc.invalidateQueries({ queryKey: ["marks", "ledger", examId, enrollmentId] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to save optionals");
    },
  });

  // ----------------- RESULT PREVIEW -----------------
  const [previewData, setPreviewData] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const getPreviewSubjectCount = (payload) => {
    const result = payload?.result || payload || {};
    if (Array.isArray(result.subjects)) return result.subjects.length;
    if (Array.isArray(result.subject_results)) return result.subject_results.length;
    if (Array.isArray(result.rows)) return result.rows.length;
    return 0;
  };

  const runPreview = async () => {
    try {
      if (!examId || !enrollmentId) {
        throw new Error("Select exam and student first");
      }
      const res = await api.get(
        `/api/results/${examId}/enrollments/${enrollmentId}/preview`
      );
      const payload = res.data || null;
      if (!payload) throw new Error("Preview data is incomplete");

      setPreviewData(payload);
      setPreviewOpen(true);
      toast.success(`Result preview loaded (${getPreviewSubjectCount(payload)} subjects)`);
    } catch (e) {
      setPreviewData(null);
      toast.error(
        e?.response?.data?.message || e.message || "Preview failed"
      );
    }
  };




  const optionalGroups = useMemo(() => {
    const raw =
      catalogQ.data?.catalog_groups ||
      catalogQ.data?.groups ||
      catalogQ.data?.data?.catalog_groups ||
      catalogQ.data?.data?.groups ||
      [];

    const groups = Array.isArray(raw) ? raw : [];

    const normalizedFromCatalog = groups
      .map((g) => {
        const group_name = g.group_name || g.name || g.title || "";
        if (!isOptionalGroup(group_name)) return null;
        const subs = g.subjects || g.items || g.subject_list || [];
        const subjects = (Array.isArray(subs) ? subs : []).map((s) => {
          const components = s.components || [];
          const th = components.find((c) => c.component_type === "TH");
          const code = th?.component_code || components?.[0]?.component_code || "";
          return {
            id: s.id ?? s.subject_id,
            name: s.name ?? s.subject_name,
            code,
          };
        });
        if (!group_name) return null;
        return { group_name, subjects: subjects.filter((x) => x.id) };
      })
      .filter(Boolean);

    if (normalizedFromCatalog.length > 0) {
      return normalizedFromCatalog
        .sort((a, b) => parseOptionalRank(a.group_name) - parseOptionalRank(b.group_name));
    }

    const choiceGroups = (profileQ.data?.optional_choices || [])
      .map((c) => c.group_name)
      .filter(Boolean);
    const uniqueGroups = [...new Set(choiceGroups)];

    const fallbackSubjects = (profileQ.data?.optional_subjects || []).map((s) => ({
      id: s.id,
      name: s.name,
      code: s.components?.[0]?.component_code || "",
    }));

    return uniqueGroups
      .filter((group_name) => isOptionalGroup(group_name))
      .sort((a, b) => parseOptionalRank(a) - parseOptionalRank(b))
      .map((group_name) => ({
        group_name,
        subjects: fallbackSubjects,
      }));
  }, [catalogQ.data, profileQ.data, profileQ.data?.optional_choices]);

  const selectedOptionalCount = useMemo(() => {
    return optionalGroups.reduce(
      (count, g) => count + (Number(optDraft[g.group_name] || 0) > 0 ? 1 : 0),
      0
    );
  }, [optionalGroups, optDraft]);

  const visibleOptionalGroups = useMemo(() => {
    if (selectedOptionalCount < 3) return optionalGroups;
    return optionalGroups.filter((g) => Number(optDraft[g.group_name] || 0) > 0);
  }, [optionalGroups, optDraft, selectedOptionalCount]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marks Entry</h2>
        <p className="text-sm text-muted-foreground">
          Student-wise marks entry. Select exam, batch, and student enrollment.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

            <Select
              label="Student (Enrollment)"
              value={enrollmentId}
              onChange={setEnrollmentId}
              options={studentOptions}
              placeholder={!batchId ? "Select batch first" : (studentsQ.isLoading ? "Loading students..." : "Select student")}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {examId ? (
              isPublished ? (
                <Badge variant="secondary">Exam is Published / Locked</Badge>
              ) : (
                <Badge variant="outline">Exam is Draft</Badge>
              )
            ) : (
              <Badge variant="outline">Select an exam</Badge>
            )}

            {batchId ? (
              <Badge variant="outline">Batch #{batchId}</Badge>
            ) : (
              <Badge variant="outline">Select a batch</Badge>
            )}

            {enrollmentId ? (
              <Badge variant="outline">Enrollment #{enrollmentId}</Badge>
            ) : (
              <Badge variant="outline">Select a student</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {enrollmentId ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Optional Subjects</div>
                <div className="text-xs text-muted-foreground">
                  Select optional subjects for this student before entering marks.
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!optDirty || saveOptionals.isPending || isPublished}
                  onClick={() => {
                    const serverChoices = profileQ.data?.optional_choices || [];
                    const draft = {};
                    for (const c of serverChoices) {
                      if (!c?.group_name) continue;
                      draft[c.group_name] = Number(c.subject_id) || "";
                    }
                    setOptDraft(draft);
                    setOptDirty(false);
                  }}
                >
                  Reset
                </Button>

                <Button
                  disabled={saveOptionals.isPending || !optDirty || isPublished}
                  onClick={() => saveOptionals.mutate()}
                >
                  {saveOptionals.isPending ? "Saving..." : "Save Optionals"}
                </Button>
              </div>
            </div>

            {profileQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading profile...</div>
            ) : optionalGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No optional groups found for this student.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {visibleOptionalGroups.map((g) => {
                  const current = optDraft[g.group_name] ?? "";
                  const opts = (g.subjects || []).map((s) => ({
                    value: String(s.id),
                    label: `${s.name}${s.code ? ` (${pad4(s.code)})` : ""}`,
                  }));

                  return (
                    <div key={g.group_name} className="rounded-md border p-3">
                      <div className="text-sm font-medium">{g.group_name}</div>
                      <div className="mt-2">
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={String(current || "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            setOptDraft((p) => {
                              const prevValue = Number(p[g.group_name] || 0);
                              if (v && !prevValue && selectedOptionalCount >= 3) {
                                toast.error("Only 3 optional subjects can be selected");
                                return p;
                              }
                              return { ...p, [g.group_name]: v };
                            });
                            setOptDirty(true);
                          }}
                          disabled={isPublished}
                        >
                          <option value="">Select subject</option>
                          {opts.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Ledger</div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!examId || !enrollmentId || saveMarks.isPending}
              onClick={runPreview}
            >
              Preview Result
            </Button>
            <Button
              disabled={!examId || !enrollmentId || saveMarks.isPending || isPublished}
              onClick={() => saveMarks.mutate()}
            >
              {saveMarks.isPending ? "Saving..." : "Save Marks"}
            </Button>
          </div>
        </div>

        <div className="p-3">
          {!examId || !enrollmentId ? (
            <div className="text-sm text-muted-foreground">
              Select exam + student to load ledger.
            </div>
          ) : ledgerQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading ledger...</div>
          ) : ledgerQ.isError ? (
            <div className="text-sm text-destructive">
              Failed to load ledger:{" "}
              {ledgerQ.error?.response?.data?.message || ledgerQ.error?.message || "Unknown error"}
            </div>
          ) : ledgerRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No ledger rows returned. Check exam components and student subjects.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Components: {ledgerRows.length}
                </div>
                <div className="w-full sm:w-[280px]">
                  <Input
                    value={ledgerQuery}
                    onChange={(e) => setLedgerQuery(e.target.value)}
                    placeholder="Filter components..."
                  />
                </div>
              </div>

              {filteredLedgerRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No components match filter.
                </div>
              ) : (
                filteredLedgerRows.map((r) => (
                  <div key={r.component_code} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">
                        {r.component_title || r.subject_name || "Component"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Code: <span className="font-mono">{pad4(r.component_code)}</span>
                        {r.full_marks != null ? (
                          <>
                            {" "}• Full: <span className="font-mono">{r.full_marks}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="w-full sm:w-[240px]">
                      <label className="text-xs text-muted-foreground">Marks</label>
                      {(() => {
                        const full = r.full_marks;
                        const raw = marks[r.component_code] ?? "";
                        const num = raw === "" ? "" : Number(raw);
                        const isInvalid =
                          raw !== "" &&
                          (!Number.isFinite(num) ||
                            (full != null && (num < 0 || num > full)));

                        return (
                          <>
                            <Input
                              disabled={isPublished}
                              placeholder="Enter marks"
                              value={raw}
                              className={isInvalid ? "border-destructive" : ""}
                              onChange={(e) => {
                                const v = toNumberOrEmpty(e.target.value);
                                setMarks((p) => ({
                                  ...p,
                                  [r.component_code]: v === "" ? "" : String(v),
                                }));
                              }}
                            />
                            {isInvalid ? (
                              <div className="text-[11px] text-destructive mt-1">
                                Invalid marks
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <Separator className="my-3" />

                  <div className="text-xs text-muted-foreground">
                    {isPublished
                      ? "Exam is locked; marks editing is blocked."
                      : "Enter obtained marks. Leave blank if not applicable."}
                  </div>
                </div>
                ))
              )}

            </div>
          )}
        </div>
      </div>

      <ResultPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        previewData={previewData}
        loading={false}
        examLabel={selectedExam?.name || selectedExam?.title || `Exam #${examId || "—"}`}
        enrollmentId={enrollmentId}
        student={{
          full_name:
            profileQ.data?.enrollment?.full_name ||
            selectedStudent?.full_name ||
            selectedStudent?.name ||
            "",
          symbol_no:
            profileQ.data?.enrollment?.symbol_no ||
            selectedStudent?.symbol_no ||
            selectedStudent?.symbol ||
            "",
          enrollment_id: enrollmentId || "",
        }}
      />
    </div>
  );
}
