import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

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
  const [sectionId, setSectionId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");

  // editable marks map: { component_code: value }
  const [marks, setMarks] = useState({});

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

  // ----------------- LOAD SECTIONS -----------------
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

  // ----------------- LOAD STUDENTS for SECTION -----------------
  const studentsQ = useQuery({
    queryKey: ["students", "list", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const res = await api.get(`/api/students?section_id=${encodeURIComponent(sectionId)}`);
      const data = res.data?.students ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10_000,
  });

  const studentOptions = useMemo(() => {
    const arr = studentsQ.data || [];
    return arr.map((x) => {
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
    }).filter((x) => x.value);
  }, [studentsQ.data]);

  // reset enrollment if section changed
  useEffect(() => {
    setEnrollmentId("");
    setMarks({});
  }, [sectionId]);

  // reset marks if exam changed
  useEffect(() => {
    setMarks({});
  }, [examId]);

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

    return arr.map((r) => ({
      component_code: String(r.component_code ?? r.code ?? "").trim(),
      component_title: r.component_title ?? r.title ?? "",
      subject_name: r.subject_name ?? r.subject ?? "",
      full_marks: r.full_marks ?? r.max_marks ?? null,
      obtained: r.marks ?? r.obtained_marks ?? r.value ?? "",
      raw: r,
    })).filter((x) => x.component_code);
  }, [ledgerQ.data]);

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

  // ----------------- RESULT PREVIEW -----------------
  const previewQ = useQuery({
    queryKey: ["results", "preview", examId, enrollmentId],
    enabled: false,
    queryFn: async () => {
      const res = await api.get(`/api/results/${examId}/enrollments/${enrollmentId}/preview`);
      return res.data;
    },
  });
  
  const [preview, setPreview] = useState(null);


  // const runPreview = async () => {
  //   try {
  //     const data = await previewQ.refetch();
  //     if (data?.data?.ok === false) throw new Error(data?.data?.message || "Preview failed");
  //     toast.success("Preview loaded");
  //   } catch (e) {
  //     toast.error(e?.message || "Preview failed");
  //   }
  // };

    const runPreview = async () => {
      try {
        const res = await api.get(
          `/api/results/${examId}/enrollments/${enrollmentId}/preview`
        );

        setPreview(res.data);
        toast.success("Result preview loaded");
      } catch (e) {
        toast.error(
          e?.response?.data?.message || e.message || "Preview failed"
        );
      }
    };




  // helpful exam status
  const selectedExam = useMemo(() => {
    return (examsQ.data || []).find((e) => String(e.id ?? e.exam_id) === String(examId)) || null;
  }, [examsQ.data, examId]);

  const isPublished = !!(selectedExam?.published_at || selectedExam?.is_published);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marks Entry</h2>
        <p className="text-sm text-muted-foreground">
          Student-wise marks entry. Select exam, section, and student enrollment.
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
              label="Section"
              value={sectionId}
              onChange={setSectionId}
              options={sectionOptions}
              placeholder={sectionsQ.isLoading ? "Loading sections..." : "Select section"}
            />

            <Select
              label="Student (Enrollment)"
              value={enrollmentId}
              onChange={setEnrollmentId}
              options={studentOptions}
              placeholder={!sectionId ? "Select section first" : (studentsQ.isLoading ? "Loading students..." : "Select student")}
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

            {sectionId ? (
              <Badge variant="outline">Section #{sectionId}</Badge>
            ) : (
              <Badge variant="outline">Select a section</Badge>
            )}

            {enrollmentId ? (
              <Badge variant="outline">Enrollment #{enrollmentId}</Badge>
            ) : (
              <Badge variant="outline">Select a student</Badge>
            )}
          </div>
        </CardContent>
      </Card>

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
              {ledgerRows.map((r) => (
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
                      <Input
                        disabled={isPublished}
                        placeholder="Enter marks"
                        value={marks[r.component_code] ?? ""}
                        onChange={(e) => {
                          const v = toNumberOrEmpty(e.target.value);
                          setMarks((p) => ({ ...p, [r.component_code]: v === "" ? "" : String(v) }));
                        }}
                      />
                    </div>
                  </div>

                  <Separator className="my-3" />

                  <div className="text-xs text-muted-foreground">
                    {isPublished
                      ? "Exam is locked; marks editing is blocked."
                      : "Enter obtained marks. Leave blank if not applicable."}
                  </div>
                </div>
              ))}

              {/* {previewQ.data ? (
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium">Result Preview</div>
                  <pre className="mt-2 text-xs overflow-auto p-2 rounded-md bg-muted">
{JSON.stringify(previewQ.data, null, 2)}
                  </pre>
                </div>
              ) : null} */}

              {preview && (
                <div className="rounded-lg border mt-6">
                  <div className="p-3 border-b flex justify-between items-center">
                    <div className="text-sm font-semibold">Result Preview</div>
                    <Badge variant="outline">
                      {preview?.result?.status || "PREVIEW"}
                    </Badge>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Student Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground">Student</div>
                        <div className="font-medium">
                          {preview?.student?.full_name}
                        </div>
                      </div>

                      <div>
                        <div className="text-muted-foreground">Symbol No</div>
                        <div className="font-mono">
                          {preview?.student?.symbol_no}
                        </div>
                      </div>

                      <div>
                        <div className="text-muted-foreground">Exam</div>
                        <div className="font-medium">
                          {preview?.exam?.name}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Subject Table */}
                    <div className="overflow-auto">
                      <table className="w-full text-sm border rounded-md">
                        <thead className="bg-muted">
                          <tr>
                            <th className="p-2 text-left">Subject</th>
                            <th className="p-2 text-center">Marks</th>
                            <th className="p-2 text-center">Grade</th>
                            <th className="p-2 text-center">GPA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview?.subjects?.map((s, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2">{s.subject_name}</td>
                              <td className="p-2 text-center">{s.total_marks}</td>
                              <td className="p-2 text-center">{s.grade}</td>
                              <td className="p-2 text-center">{s.gpa}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <Separator />

                    {/* Final Summary */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Final GPA:</span>{" "}
                        <span className="font-semibold text-lg">
                          {preview?.result?.final_gpa}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Result:</span>{" "}
                        <Badge
                          variant={
                            preview?.result?.status === "PASS"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {preview?.result?.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}



            </div>
          )}
        </div>
      </div>
    </div>
  );
}
