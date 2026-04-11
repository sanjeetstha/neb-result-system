import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";

import { api } from "../../lib/api";
import { hasPermission } from "../../lib/access";
import { useMe } from "../../lib/useMe";
import {
  EXAM_PRESETS,
  applyPresetToFlatComponents,
  buildComponentsPayloadFromFlat,
  flattenExamGroups,
  getExamTermPolicy,
  getPresetDefaults,
  toNumberOrEmpty,
} from "../../lib/examPresets";
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
} from "../../components/ui/dialog";

function norm(v) {
  return String(v ?? "").trim();
}

function Select({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
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

export default function ExamWorkflowPage() {
  const qc = useQueryClient();
  const meQ = useMe();
  const me = meQ.data;
  const canManageExams = hasPermission(me, "exams.manage");
  const canManageResults = hasPermission(me, "results.manage");
  const canPublishResults = hasPermission(me, "results.publish");
  const canSeatPlan = hasPermission(me, "seat_planner.manage");

  const [examId, setExamId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [classId, setClassId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [gradingSchemeId, setGradingSchemeId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [examName, setExamName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [presetKey, setPresetKey] = useState("PRE_BOARD");
  const [presetValues, setPresetValues] = useState(() =>
    getPresetDefaults("PRE_BOARD", "")
  );

  const [importFile, setImportFile] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  const [generatingAll, setGeneratingAll] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  // ----------------- Masters -----------------
  const examsQ = useQuery({
    queryKey: ["exams", "list"],
    queryFn: async () => {
      const res = await api.get("/api/exams");
      const data = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10_000,
  });

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

  const batchesQ = useQuery({
    queryKey: ["masters", "batches"],
    queryFn: async () => {
      const res = await api.get("/api/masters/batches");
      const data = res.data?.batches ?? res.data?.data ?? res.data ?? [];
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

  // ----------------- Options -----------------
  const examOptions = useMemo(() => {
    return (examsQ.data || []).map((e) => {
      const id = String(e.id ?? e.exam_id ?? "");
      const name = e.name ?? e.title ?? `Exam #${id}`;
      const isPublished = !!(e.published_at || e.is_published);
      return { value: id, label: isPublished ? `${name} (Published)` : name };
    });
  }, [examsQ.data]);

  const classOptions = useMemo(() => {
    return (classesQ.data || []).map((c) => ({
      value: String(c.id),
      label: c.name || `Class ${c.id}`,
    }));
  }, [classesQ.data]);

  const batchOptions = useMemo(() => {
    return (batchesQ.data || []).map((b) => {
      const id = String(b.id ?? b.batch_id ?? "");
      const name = b.name ?? "";
      const year = b.year_bs ?? "";
      const label = [name, year ? `(${year})` : ""].filter(Boolean).join(" ");
      return { value: id, label: label || `Batch #${id}` };
    });
  }, [batchesQ.data]);

  const campusOptions = useMemo(() => {
    return (campusesQ.data || []).map((c) => ({
      value: String(c.id),
      label: c.name || c.code || `Campus ${c.id}`,
    }));
  }, [campusesQ.data]);

  const gradingOptions = useMemo(() => {
    return (gradingQ.data || []).map((g) => ({
      value: String(g.id),
      label: g.name || `Scheme ${g.id}`,
    }));
  }, [gradingQ.data]);

  const academicYearOptions = useMemo(() => {
    const batch = Number(batchId || 0);
    const list = (yearsQ.data || []).filter((y) => Number(y.batch_id || 0) === batch);
    return list.map((y) => ({
      value: String(y.id),
      label: `${y.year_bs}${y.batch_name ? ` • ${y.batch_name}` : ""}`,
    }));
  }, [yearsQ.data, batchId]);

  const selectedExam = useMemo(() => {
    return (examsQ.data || []).find(
      (e) => String(e.id ?? e.exam_id) === String(examId)
    );
  }, [examsQ.data, examId]);

  const selectedBatch = useMemo(() => {
    return (batchesQ.data || []).find(
      (b) => String(b.id ?? b.batch_id) === String(batchId)
    );
  }, [batchesQ.data, batchId]);

  const selectedClass = useMemo(() => {
    return (classesQ.data || []).find(
      (c) => String(c.id) === String(classId)
    );
  }, [classesQ.data, classId]);

  const termPolicy = useMemo(
    () => getExamTermPolicy(presetKey, selectedClass?.name || ""),
    [presetKey, selectedClass?.name]
  );

  const selectedAcademicYear = useMemo(() => {
    return (yearsQ.data || []).find(
      (y) => String(y.id) === String(academicYearId)
    );
  }, [yearsQ.data, academicYearId]);

  const isPublished = !!(selectedExam?.published_at || selectedExam?.is_published);

  useEffect(() => {
    const p = getPresetDefaults(presetKey, selectedClass?.name || "");
    setPresetValues({
      full: p.full,
      optionalFull: p.optionalFull,
      pass: p.pass,
      optionalPass: p.optionalPass,
      enableIN: p.enableIN,
      enablePR: p.enablePR,
      inFull: p.inFull,
      prFull: p.prFull,
    });
  }, [presetKey, selectedClass?.name]);

  // Defaults
  useEffect(() => {
    if (!campusId && campusOptions.length) setCampusId(campusOptions[0].value);
  }, [campusOptions, campusId]);

  useEffect(() => {
    if (!gradingSchemeId && gradingOptions.length) setGradingSchemeId(gradingOptions[0].value);
  }, [gradingOptions, gradingSchemeId]);

  // Auto-pick academic year from batch
  useEffect(() => {
    if (!batchId) {
      setAcademicYearId("");
      return;
    }
    if (academicYearOptions.length === 1) {
      setAcademicYearId(academicYearOptions[0].value);
    } else if (
      academicYearId &&
      !academicYearOptions.find((y) => y.value === academicYearId)
    ) {
      setAcademicYearId("");
    }
  }, [batchId, academicYearOptions, academicYearId]);

  // Auto name suggestion
  useEffect(() => {
    if (nameTouched) return;
    const presetLabel = EXAM_PRESETS[presetKey]?.label || "Exam";
    const year = selectedBatch?.year_bs || "";
    const classLabel = selectedClass?.name ? ` ${selectedClass.name}` : "";
    const base = [presetLabel, year].filter(Boolean).join(" ");
    setExamName(`${base}${classLabel}`.trim());
  }, [presetKey, selectedBatch, selectedClass, nameTouched]);

  // When selecting an existing exam, sync batch/class info
  useEffect(() => {
    if (!selectedExam) return;
    setClassId(String(selectedExam.class_id || ""));
    setAcademicYearId(String(selectedExam.academic_year_id || ""));
    setExamName(selectedExam.name || "");
  }, [selectedExam]);

  const flowBatchId = useMemo(() => {
    if (selectedExam?.academic_year_id && yearsQ.data?.length) {
      const ay = yearsQ.data.find((y) => String(y.id) === String(selectedExam.academic_year_id));
      return ay?.batch_id ? String(ay.batch_id) : "";
    }
    return batchId;
  }, [selectedExam, yearsQ.data, batchId]);

  // ----------------- CREATE EXAM -----------------
  const createExam = useMutation({
    mutationFn: async () => {
      if (!examName.trim()) throw new Error("Exam name is required");
      if (!campusId) throw new Error("Campus is required");
      if (!classId) throw new Error("Class is required");
      if (!gradingSchemeId) throw new Error("Grading scheme is required");
      if (!academicYearId) {
        throw new Error("Batch must be linked to an Academic Year");
      }

      const payload = {
        name: examName.trim(),
        campus_id: Number(campusId),
        academic_year_id: Number(academicYearId),
        class_id: Number(classId),
        faculty_id: null,
        grading_scheme_id: Number(gradingSchemeId),
        exam_type: presetKey,
        start_date: null,
        end_date: null,
      };

      const res = await api.post("/api/exams", payload);
      const exam_id = res.data?.exam_id || res.data?.id;
      if (!exam_id) throw new Error("Exam created but id missing");

      // Apply preset components (TH only)
      try {
        const full = toNumberOrEmpty(presetValues.full);
        const optionalFull = toNumberOrEmpty(presetValues.optionalFull);
        const inFull = toNumberOrEmpty(presetValues.inFull);
        const prFull = toNumberOrEmpty(presetValues.prFull);
        const pass = toNumberOrEmpty(presetValues.pass);
        const optionalPass = toNumberOrEmpty(presetValues.optionalPass);

        const componentsRes = await api.get(`/api/exams/${exam_id}/components`);
        const groups = componentsRes.data?.groups || [];
        const flat = flattenExamGroups(groups);
          const applied = applyPresetToFlatComponents(flat, {
            full,
            optionalFull,
            pass,
            optionalPass,
            enableIN:
              termPolicy.forceEnableIN !== null
                ? !!termPolicy.forceEnableIN
                : !!presetValues.enableIN,
            enablePR:
              termPolicy.forceEnablePR !== null
                ? !!termPolicy.forceEnablePR
                : !!presetValues.enablePR,
            inFull,
            prFull,
          });
        const payloadComponents = buildComponentsPayloadFromFlat(applied);
        await api.post(`/api/exams/${exam_id}/components`, { components: payloadComponents });
      } catch (e) {
        toast.error(e?.message || "Preset apply failed");
      }

      return exam_id;
    },
    onSuccess: async (newExamId) => {
      toast.success("Exam created");
      setExamId(String(newExamId));
      await qc.invalidateQueries({ queryKey: ["exams", "list"] });
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e.message || "Failed to create exam");
    },
  });

  // ----------------- IMPORT -----------------
  const importMutation = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/api/import/marks?exam_id=${examId}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setImportSummary(data);
      setImportFile(null);
      toast.success(`Imported ${data?.imported || 0} rows`);
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e.message || "Import failed");
    },
  });

  const onImport = () => {
    if (!examId) return toast.error("Select or create an exam first");
    if (!importFile) return toast.error("Choose a file to import");
    if (isPublished) return toast.error("Exam is published. Import disabled.");
    importMutation.mutate(importFile);
  };

  // ----------------- GENERATE ALL -----------------
  const studentsQ = useQuery({
    queryKey: ["students", "list", flowBatchId, selectedExam?.class_id],
    enabled: !!flowBatchId && !!selectedExam?.class_id,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("batch_id", flowBatchId);
      params.set("class_id", selectedExam.class_id);
      const res = await api.get(`/api/students?${params.toString()}`);
      return res.data?.students ?? [];
    },
    staleTime: 5_000,
  });

  const generateAll = async () => {
    if (!examId) return toast.error("Select or create an exam first");
    if (!studentsQ.data?.length) return toast.error("No students found for this batch/class");
    if (isPublished) return toast.error("Exam is published. Generate disabled.");

    setGeneratingAll(true);
    setGenerateProgress({ done: 0, total: studentsQ.data.length });

    const errors = [];
    try {
      for (let i = 0; i < studentsQ.data.length; i++) {
        const s = studentsQ.data[i];
        const eid = s.enrollment_id;
        try {
          await api.post(`/api/results/${examId}/enrollments/${eid}/generate`);
        } catch (e) {
          errors.push({
            enrollment_id: eid,
            symbol_no: s.symbol_no,
            name: s.full_name,
            message: e?.response?.data?.message || e.message || "Generate failed",
          });
        } finally {
          setGenerateProgress({ done: i + 1, total: studentsQ.data.length });
        }
      }
      if (errors.length === 0) toast.success("Generated all results");
      else {
        toast.error(`Generated with ${errors.length} error(s). Check console.`);
        console.table(errors);
      }
    } finally {
      setGeneratingAll(false);
    }
  };

  // ----------------- PUBLISH -----------------
  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/results/${examId}/publish`);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Exam published");
      await qc.invalidateQueries({ queryKey: ["exams", "list"] });
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e.message || "Publish failed");
    },
  });

  const deleteExamMutation = useMutation({
    mutationFn: async (password) => {
      const res = await api.delete(`/api/exams/${examId}`, {
        data: { password },
      });
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || "Exam deleted");
      setExamId("");
      setDeleteOpen(false);
      setDeletePassword("");
      await qc.invalidateQueries({ queryKey: ["exams", "list"] });
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e.message || "Delete failed");
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Exam Manager</h2>
        <p className="text-sm text-muted-foreground">
          One flow: Create Exam → Import Excel → Generate All → Publish. No extra steps.
        </p>
      </div>

      {/* STEP 1: CREATE OR SELECT EXAM */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Step 1 — Create or Select Exam</div>
              <div className="text-xs text-muted-foreground">
                Choose batch + class + term. Academic year is taken from the batch.
              </div>
            </div>
            {examId ? (
              <Badge variant={isPublished ? "secondary" : "outline"}>
                {isPublished ? "Published" : "Draft"}
              </Badge>
            ) : (
              <Badge variant="outline">No exam selected</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              label="Select Existing Exam"
              value={examId}
              onChange={setExamId}
              options={examOptions}
              placeholder={examsQ.isLoading ? "Loading exams..." : "Choose exam"}
            />
            <div className="text-xs text-muted-foreground flex items-end">
              Existing exam auto-fills batch/class info.
            </div>
          </div>

          {examId && canManageExams ? (
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                disabled={deleteExamMutation.isPending}
                onClick={() => {
                  setDeletePassword("");
                  setDeleteOpen(true);
                }}
              >
                {deleteExamMutation.isPending ? "Deleting..." : "Delete Exam"}
              </Button>
            </div>
          ) : null}

          <Separator />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select
              label="Batch"
              value={batchId}
              onChange={(v) => {
                setBatchId(v);
                setNameTouched(false);
              }}
              options={batchOptions}
              placeholder={batchesQ.isLoading ? "Loading batches..." : "Select batch"}
            />
            <Select
              label="Class"
              value={classId}
              onChange={(v) => {
                setClassId(v);
                setNameTouched(false);
              }}
              options={classOptions}
              placeholder={classesQ.isLoading ? "Loading classes..." : "Select class"}
            />
            <Select
              label="Term"
              value={presetKey}
              onChange={(v) => {
                setPresetKey(v);
                setNameTouched(false);
              }}
              options={Object.values(EXAM_PRESETS)
                .filter((p) => p.key !== "CUSTOM")
                .map((p) => ({ value: p.key, label: p.label }))}
              placeholder="Select term"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
              <label className="text-sm font-medium">Optional Full Marks (TH)</label>
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
            {termPolicy.showINToggle || termPolicy.forceEnableIN === true ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Internal Full Marks</label>
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
                  disabled={termPolicy.forceEnableIN === false || !presetValues.enableIN}
                />
              </div>
            ) : null}
            {termPolicy.showPRToggle || termPolicy.forceEnablePR === true ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Practical Full Marks</label>
                <Input
                  type="number"
                  step="0.25"
                  value={presetValues.prFull}
                  onChange={(e) =>
                    setPresetValues((p) => ({
                      ...p,
                      prFull: toNumberOrEmpty(e.target.value),
                    }))
                  }
                  disabled={termPolicy.forceEnablePR === false || !presetValues.enablePR}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {termPolicy.showINToggle ? (
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
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
                Include Internal (IN)
              </label>
            ) : null}
            {termPolicy.showPRToggle ? (
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!presetValues.enablePR}
                  onChange={(e) =>
                    setPresetValues((p) => ({
                      ...p,
                      enablePR: e.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
                Include Practical (PR)
              </label>
            ) : null}
            {!termPolicy.showINToggle && termPolicy.forceEnableIN !== null ? (
              <Badge variant="outline">
                Internal: {termPolicy.forceEnableIN ? "Enabled" : "Disabled"}
              </Badge>
            ) : null}
            {!termPolicy.showPRToggle && termPolicy.forceEnablePR !== null ? (
              <Badge variant="outline">
                Practical: {termPolicy.forceEnablePR ? "Enabled" : "Disabled"}
              </Badge>
            ) : null}
          </div>
          {termPolicy.note ? (
            <div className="text-xs text-muted-foreground">{termPolicy.note}</div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select
              label="Academic Year (from Batch)"
              value={academicYearId}
              onChange={setAcademicYearId}
              options={academicYearOptions}
              placeholder={
                batchId
                  ? academicYearOptions.length
                    ? "Select academic year"
                    : "No academic year linked to batch"
                  : "Select batch first"
              }
              disabled={!batchId}
            />
            <Select
              label="Campus"
              value={campusId}
              onChange={setCampusId}
              options={campusOptions}
              placeholder={campusesQ.isLoading ? "Loading campuses..." : "Select campus"}
            />
            <Select
              label="Grading Scheme"
              value={gradingSchemeId}
              onChange={setGradingSchemeId}
              options={gradingOptions}
              placeholder={gradingQ.isLoading ? "Loading schemes..." : "Select scheme"}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={examName}
              onChange={(e) => {
                setExamName(e.target.value);
                setNameTouched(true);
              }}
              placeholder="Exam name (e.g., Pre-Board 2082)"
            />
            <div className="flex flex-wrap justify-end gap-2">
              {canSeatPlan ? (
                <Button asChild variant="outline">
                  <Link to="/exams/seat-planner">Open Seat Planner</Link>
                </Button>
              ) : null}
              <Button onClick={() => createExam.mutate()} disabled={!canManageExams || createExam.isPending}>
                {createExam.isPending ? "Creating..." : "Create Exam"}
              </Button>
            </div>
          </div>

          {!academicYearId && batchId ? (
            <div className="text-xs text-destructive">
              Batch is not linked to an Academic Year. Go to Masters → Academic Years and set
              the batch.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Exam Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Enter your password to delete this exam and all related marks/results.
            </div>
            <Input
              type="password"
              placeholder="Password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!deletePassword || deleteExamMutation.isPending}
                onClick={() => deleteExamMutation.mutate(deletePassword)}
              >
                {deleteExamMutation.isPending ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* STEP 2: IMPORT */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Step 2 — Import Mark Ledger Excel</div>
              <div className="text-xs text-muted-foreground">
                Optional subjects are picked from the Excel codes. No manual selection needed.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`${api.defaults.baseURL || ""}/api/import/marks-ledger-template${
                  examId ? `?exam_id=${encodeURIComponent(examId)}` : ""
                }`}
                className="text-xs text-primary underline"
              >
                Download template
              </a>
              <Link className="text-xs text-muted-foreground underline" to="/marks/grid">
                Open Bulk Grid
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] || null);
                setImportSummary(null);
              }}
            />
            <Button onClick={onImport} disabled={!examId || !importFile || importMutation.isPending}>
              {importMutation.isPending ? "Importing..." : "Import Excel"}
            </Button>
          </div>

          {importSummary ? (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div>Sheet: {importSummary.sheet || "—"}</div>
              <div>
                Imported: {importSummary.imported || 0} • Skipped:{" "}
                {importSummary.skipped || 0} • Errors: {importSummary.errors_count || 0}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* STEP 3: GENERATE */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Step 3 — Generate All Results</div>
              <div className="text-xs text-muted-foreground">
                Uses saved marks. Required before reports and public portal.
              </div>
            </div>
            {generatingAll ? (
              <Badge variant="outline">
                Generating {generateProgress.done}/{generateProgress.total}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              Students: {studentsQ.isLoading ? "…" : studentsQ.data?.length || 0}
            </Badge>
            {flowBatchId ? (
              <Badge variant="outline">Batch #{flowBatchId}</Badge>
            ) : null}
            {selectedExam?.class_id ? (
              <Badge variant="outline">Class #{selectedExam.class_id}</Badge>
            ) : null}
          </div>

          <Button onClick={generateAll} disabled={!canManageResults || !examId || generatingAll || isPublished}>
            {generatingAll ? "Generating..." : "Generate All"}
          </Button>
        </CardContent>
      </Card>

      {/* STEP 4: PUBLISH */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-medium">Step 4 — Publish Results</div>
          <div className="text-xs text-muted-foreground">
            Publishing locks the exam and makes results visible in reports and public portal.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => publishMutation.mutate()}
              disabled={!canPublishResults || !examId || publishMutation.isPending || isPublished}
            >
              {publishMutation.isPending ? "Publishing..." : "Publish Exam"}
            </Button>
            {canPublishResults ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (!examId) {
                    toast.error("Select exam first");
                    return;
                  }
                  if (!isPublished) {
                    toast.error("Exam is not published");
                    return;
                  }
                  const ok = window.confirm(
                    "Unpublish this exam and unlock results? This will hide public results."
                  );
                  if (!ok) return;
                  api
                    .post(`/api/results/${examId}/unpublish`)
                    .then((res) => {
                      toast.success(res.data?.message || "Exam unpublished");
                      qc.invalidateQueries({ queryKey: ["exams", "list"] });
                    })
                    .catch((e) => {
                      toast.error(
                        e?.response?.data?.message || e.message || "Unpublish failed"
                      );
                    });
                }}
                disabled={!examId}
              >
                Unpublish / Unlock
              </Button>
            ) : null}
            <Link className="text-xs text-muted-foreground underline" to="/reports">
              Open Reports
            </Link>
            <Link className="text-xs text-muted-foreground underline" to="/public/portal">
              Open Public Portal
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
