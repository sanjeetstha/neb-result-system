import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../../lib/api";
import { usePagination } from "../../lib/usePagination";
import {
  EXAM_PRESETS,
  applyPresetToFlatComponents,
  buildComponentsPayloadFromFlat,
  flattenExamGroups,
  toNumberOrEmpty,
} from "../../lib/examPresets";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Separator } from "../../components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import PaginationBar from "../../components/ui/pagination-bar";

function norm(v) {
  return String(v ?? "").trim();
}

function normalizeExamPayload(form) {
  const name = norm(form.name);
  const campus_id = Number(form.campus_id || 0);
  const academic_year_id = Number(form.academic_year_id || 0);
  const class_id = Number(form.class_id || 0);
  const grading_scheme_id = Number(form.grading_scheme_id || 0);

  if (!name) return { error: "Exam name is required" };
  if (!campus_id) return { error: "Campus is required" };
  if (!academic_year_id) return { error: "Academic year is required" };
  if (!class_id) return { error: "Class is required" };
  if (!grading_scheme_id) return { error: "Grading scheme is required" };

  return {
    payload: {
      name,
      campus_id,
      academic_year_id,
      class_id,
      faculty_id: null,
      grading_scheme_id,
      exam_type: form.exam_type || "CUSTOM",
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    },
  };
}

export default function ExamsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    campus_id: "",
    academic_year_id: "",
    class_id: "",
    grading_scheme_id: "",
    exam_type: "FIRST_TERMINAL",
    start_date: "",
    end_date: "",
  });
  const [autoConfig, setAutoConfig] = useState(true);
  const [presetKey, setPresetKey] = useState("FIRST_TERMINAL");
  const [presetValues, setPresetValues] = useState({
    full: EXAM_PRESETS.FIRST_TERMINAL.full,
    optionalFull: EXAM_PRESETS.FIRST_TERMINAL.optionalFull,
    enableIN: EXAM_PRESETS.FIRST_TERMINAL.enableIN,
    inFull: EXAM_PRESETS.FIRST_TERMINAL.inFull,
  });

  // Load exams
  const examsQ = useQuery({
    queryKey: ["exams", "list"],
    queryFn: async () => {
      const res = await api.get("/api/exams");
      const data = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10_000,
  });

  // Masters for select options
  const yearsQ = useQuery({
    queryKey: ["masters", "academic-years"],
    queryFn: async () => {
      const res = await api.get("/api/masters/academic-years");
      const data = res.data?.academic_years ?? res.data?.years ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const campusesQ = useQuery({
    queryKey: ["masters", "campuses"],
    queryFn: async () => {
      const res = await api.get("/api/masters/campuses");
      const data = res.data?.campuses ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const classesQ = useQuery({
    queryKey: ["masters", "classes"],
    queryFn: async () => {
      const res = await api.get("/api/masters/classes");
      const data = res.data?.classes ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const gradingQ = useQuery({
    queryKey: ["masters", "grading-schemes"],
    queryFn: async () => {
      const res = await api.get("/api/masters/grading-schemes");
      const data = res.data?.grading_schemes ?? res.data?.schemes ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const p = EXAM_PRESETS[presetKey] || EXAM_PRESETS.FIRST_TERMINAL;
    setPresetValues({
      full: p.full,
      optionalFull: p.optionalFull,
      enableIN: p.enableIN,
      inFull: p.inFull,
    });
  }, [presetKey]);

  useEffect(() => {
    if (!form.campus_id && campusesQ.data?.length) {
      setForm((p) => ({ ...p, campus_id: String(campusesQ.data[0].id) }));
    }
  }, [campusesQ.data, form.campus_id]);

  useEffect(() => {
    if (!form.grading_scheme_id && gradingQ.data?.length) {
      setForm((p) => ({ ...p, grading_scheme_id: String(gradingQ.data[0].id) }));
    }
  }, [gradingQ.data, form.grading_scheme_id]);

  const createExam = useMutation({
    mutationFn: async () => {
      const { payload, error } = normalizeExamPayload(form);
      if (error) throw new Error(error);

      const res = await api.post("/api/exams", payload);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success("Exam created");
      setOpen(false);
      const examId = data?.exam_id || data?.id;
      if (autoConfig && examId) {
        try {
          const full = toNumberOrEmpty(presetValues.full);
          const optionalFull = toNumberOrEmpty(presetValues.optionalFull);
          const inFull = toNumberOrEmpty(presetValues.inFull);

          if (full === "" || optionalFull === "") {
            throw new Error("Full marks and optional full marks are required to apply preset.");
          }

          const res = await api.get(`/api/exams/${examId}/components`);
          const groups = res.data?.groups || [];
          const flat = flattenExamGroups(groups);
          const applied = applyPresetToFlatComponents(flat, {
            full,
            optionalFull,
            enableIN: !!presetValues.enableIN,
            inFull,
          });
          const payload = buildComponentsPayloadFromFlat(applied);
          await api.post(`/api/exams/${examId}/components`, { components: payload });
          toast.success("Terminal preset applied");
        } catch (e) {
          toast.error(e?.message || "Failed to apply preset");
        }
      }

      setForm({
        name: "",
        campus_id: "",
        academic_year_id: "",
        class_id: "",
        grading_scheme_id: "",
        exam_type: "FIRST_TERMINAL",
        start_date: "",
        end_date: "",
      });
      setPresetKey("FIRST_TERMINAL");
      setAutoConfig(true);
      await qc.invalidateQueries({ queryKey: ["exams", "list"] });
      if (examId) nav(`/exams/${examId}/components`);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Failed to create exam");
    },
  });

  const publishExam = useMutation({
    mutationFn: async (examId) => {
      const res = await api.post(`/api/results/${examId}/publish`);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Exam published");
      await qc.invalidateQueries({ queryKey: ["exams", "list"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Publish failed");
    },
  });

  const rows = useMemo(() => {
    const arr = examsQ.data || [];
    return arr.map((x) => ({
      id: x.id ?? x.exam_id ?? "",
      name: x.name ?? x.title ?? "",
      exam_type: x.exam_type ?? "",
      academic_year_id: x.academic_year_id ?? "",
      class_id: x.class_id ?? "",
      faculty_id: x.faculty_id ?? "",
      is_published: !!(x.published_at || x.is_published),
      published_at: x.published_at || null,
      locked_at: x.locked_at || null,
      raw: x,
    }));
  }, [examsQ.data]);

  const pager = usePagination(rows, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Exams</h2>
          <p className="text-sm text-muted-foreground">
            Create exams and configure components/full marks per exam.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create Exam</Button>
          </DialogTrigger>

          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create exam</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Campus</label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.campus_id}
                  onChange={(e) => setForm((p) => ({ ...p, campus_id: e.target.value }))}
                >
                  <option value="">
                    {campusesQ.isLoading ? "Loading..." : "Select campus"}
                  </option>
                  {(campusesQ.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.code ? `${c.code} — ` : "") + (c.name || `Campus #${c.id}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Exam name</label>
                <Input
                  placeholder="e.g., Terminal 1 2082"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Academic year</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.academic_year_id}
                    onChange={(e) => setForm((p) => ({ ...p, academic_year_id: e.target.value }))}
                  >
                    <option value="">
                      {yearsQ.isLoading ? "Loading..." : "Select year"}
                    </option>
                    {(yearsQ.data || []).map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.year_bs || y.name || `Year #${y.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Class</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.class_id}
                    onChange={(e) => setForm((p) => ({ ...p, class_id: e.target.value }))}
                  >
                    <option value="">
                      {classesQ.isLoading ? "Loading..." : "Select class"}
                    </option>
                    {(classesQ.data || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.class_name || `Class #${c.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Grading Scheme</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.grading_scheme_id}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, grading_scheme_id: e.target.value }))
                    }
                  >
                    <option value="">
                      {gradingQ.isLoading ? "Loading..." : "Select scheme"}
                    </option>
                    {(gradingQ.data || []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name || g.title || `Scheme #${g.id}`}
                      </option>
                    ))}
                  </select>
                  {!gradingQ.isLoading && (gradingQ.data || []).length === 0 ? (
                    <div className="text-xs text-destructive">
                      No grading schemes found. Results cannot be generated until one exists.
                    </div>
                  ) : null}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="text-sm font-semibold">Terminal Setup</div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Exam Type</label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={presetKey}
                      onChange={(e) => {
                        const key = e.target.value;
                        setPresetKey(key);
                        setForm((p) => ({ ...p, exam_type: key }));
                      }}
                    >
                      {Object.values(EXAM_PRESETS).map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 h-10 mt-7">
                    <input
                      type="checkbox"
                      checked={autoConfig}
                      onChange={(e) => setAutoConfig(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-muted-foreground">
                      Auto-configure components after creation
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Full Marks (TH)</label>
                    <Input
                      type="number"
                      step="0.25"
                      value={presetValues.full}
                      onChange={(e) =>
                        setPresetValues((p) => ({
                          ...p,
                          full: toNumberOrEmpty(e.target.value),
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Optional Full Marks (Computer/Hotel)
                    </label>
                    <Input
                      type="number"
                      step="0.25"
                      value={presetValues.optionalFull}
                      onChange={(e) =>
                        setPresetValues((p) => ({
                          ...p,
                          optionalFull: toNumberOrEmpty(e.target.value),
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Practical/Internal Full Marks</label>
                    <Input
                      type="number"
                      step="0.25"
                      value={presetValues.inFull}
                      onChange={(e) =>
                        setPresetValues((p) => ({
                          ...p,
                          inFull: toNumberOrEmpty(e.target.value),
                        }))
                      }
                      disabled={!presetValues.enableIN}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!presetValues.enableIN}
                    onChange={(e) =>
                      setPresetValues((p) => ({
                        ...p,
                        enableIN: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-muted-foreground">
                    Include Practical/Internal components
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={createExam.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => createExam.mutate()} disabled={createExam.isPending}>
                  {createExam.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">Exam List</div>
          <div className="text-xs text-muted-foreground">
            {examsQ.isLoading ? "Loading..." : `Total: ${rows.length}`}
          </div>
        </div>

        <div className="p-3">
          {examsQ.isError ? (
            <div className="text-sm text-destructive">
              Failed to load exams:{" "}
              {examsQ.error?.response?.data?.message || examsQ.error?.message || "Unknown error"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {examsQ.isLoading ? "Loading..." : "No exams found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pager.pageItems.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        {r.is_published ? (
                          <Badge variant="secondary">Published</Badge>
                        ) : (
                          <Badge variant="outline">Draft</Badge>
                        )}
                        {r.exam_type ? (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {r.exam_type.replaceAll("_", " ")}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/exams/${r.id}/components`}>Components</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={publishExam.isPending || r.is_published}
                          onClick={() => {
                            if (r.is_published) return;
                            const ok = window.confirm(
                              "Publish this exam? This will lock the exam and make results public."
                            );
                            if (!ok) return;
                            publishExam.mutate(r.id);
                          }}
                        >
                          Publish
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
        <PaginationBar
          page={pager.page}
          totalPages={pager.totalPages}
          onPageChange={pager.setPage}
          pageSize={pager.pageSize}
          onPageSizeChange={pager.setPageSize}
          totalItems={pager.totalItems}
        />
      </div>
    </div>
  );
}
