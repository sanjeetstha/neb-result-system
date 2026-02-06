import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

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

export default function CorrectionsPage() {
  const qc = useQueryClient();

  const [tab, setTab] = useState("REQUEST"); // REQUEST | REVIEW | MINE
  const [examId, setExamId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [componentCode, setComponentCode] = useState("");
  const [newMarks, setNewMarks] = useState("");
  const [newAbsent, setNewAbsent] = useState(false);
  const [reason, setReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [reviewNotes, setReviewNotes] = useState({});

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
    return (examsQ.data || []).map((e) => ({
      value: String(e.id ?? e.exam_id ?? ""),
      label: e.name ?? e.title ?? `Exam #${e.id}`,
    }));
  }, [examsQ.data]);

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

  const studentsQ = useQuery({
    queryKey: ["students", "list", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const res = await api.get(
        `/api/students?section_id=${encodeURIComponent(sectionId)}`
      );
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

  const ledgerQ = useQuery({
    queryKey: ["marks", "ledger", examId, enrollmentId],
    enabled: tab === "REQUEST" && !!examId && !!enrollmentId,
    queryFn: async () => {
      const res = await api.get(`/api/marks/${examId}/enrollments/${enrollmentId}`);
      return res.data?.ledger ?? [];
    },
  });

  const componentOptions = useMemo(() => {
    const arr = Array.isArray(ledgerQ.data) ? ledgerQ.data : [];
    return arr
      .filter((r) => r.enabled_in_exam)
      .map((r) => ({
        value: String(r.component_code),
        label: `${r.subject_name} • ${r.component_title} (${r.component_code})`,
      }));
  }, [ledgerQ.data]);

  const createRequest = useMutation({
    mutationFn: async () => {
      if (!examId || !enrollmentId || !componentCode || !reason) {
        throw new Error("Exam, student, component and reason are required");
      }
      const payload = {
        exam_id: Number(examId),
        enrollment_id: Number(enrollmentId),
        component_code: componentCode,
        new_marks: newAbsent ? null : Number(newMarks),
        new_is_absent: newAbsent ? 1 : 0,
        reason,
      };
      const res = await api.post("/api/corrections", payload);
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Correction request submitted");
      setComponentCode("");
      setNewMarks("");
      setNewAbsent(false);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["corrections", "mine"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Request failed");
    },
  });

  const reviewQ = useQuery({
    queryKey: ["corrections", "list", statusFilter],
    enabled: tab === "REVIEW",
    queryFn: async () => {
      const res = await api.get(`/api/corrections?status=${encodeURIComponent(statusFilter)}`);
      return res.data?.requests ?? [];
    },
    staleTime: 5_000,
  });

  const mineQ = useQuery({
    queryKey: ["corrections", "mine"],
    enabled: tab === "MINE",
    queryFn: async () => {
      const res = await api.get("/api/corrections/mine");
      return res.data?.requests ?? [];
    },
    staleTime: 5_000,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }) => {
      const res = await api.post(`/api/corrections/${id}/approve`, { note });
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Request approved");
      await qc.invalidateQueries({ queryKey: ["corrections", "list", statusFilter] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Approve failed");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }) => {
      const res = await api.post(`/api/corrections/${id}/reject`, { note });
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Request rejected");
      await qc.invalidateQueries({ queryKey: ["corrections", "list", statusFilter] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Reject failed");
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Corrections</h2>
        <p className="text-sm text-muted-foreground">
          Submit corrections and review pending requests.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={tab === "REQUEST" ? "default" : "outline"}
          onClick={() => setTab("REQUEST")}
        >
          New Request
        </Button>
        <Button
          variant={tab === "REVIEW" ? "default" : "outline"}
          onClick={() => setTab("REVIEW")}
        >
          Review Requests
        </Button>
        <Button
          variant={tab === "MINE" ? "default" : "outline"}
          onClick={() => setTab("MINE")}
        >
          My Requests
        </Button>
      </div>

      {tab === "REQUEST" ? (
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
                label="Student"
                value={enrollmentId}
                onChange={setEnrollmentId}
                options={studentOptions}
                placeholder={!sectionId ? "Select section first" : "Select student"}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select
                label="Component"
                value={componentCode}
                onChange={setComponentCode}
                options={componentOptions}
                placeholder={!enrollmentId ? "Select student first" : "Select component"}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">New Marks</label>
                <Input
                  type="number"
                  value={newMarks}
                  onChange={(e) => setNewMarks(e.target.value)}
                  disabled={newAbsent}
                  placeholder="Enter new marks"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newAbsent}
                    onChange={(e) => setNewAbsent(e.target.checked)}
                  />
                  Mark as Absent
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the correction request"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => createRequest.mutate()} disabled={createRequest.isPending}>
                {createRequest.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "REVIEW" ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>

            {reviewQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading requests...</div>
            ) : reviewQ.isError ? (
              <div className="text-sm text-destructive">
                {reviewQ.error?.response?.data?.message ||
                  reviewQ.error?.message ||
                  "Failed to load"}
              </div>
            ) : (reviewQ.data || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No requests found.</div>
            ) : (
              <div className="space-y-2">
                {(reviewQ.data || []).map((r) => (
                  <div key={r.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">#{r.id}</Badge>
                      <Badge>{r.status}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {r.requested_by_name}
                      </span>
                    </div>

                    <div className="text-sm">
                      <span className="text-muted-foreground">Component: </span>
                      <span className="font-mono">{r.component_code}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Old: </span>
                      {r.old_marks ?? "—"}{" "}
                      <span className="text-muted-foreground">→ New: </span>
                      {r.new_marks ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Reason: {r.reason}
                    </div>

                    {statusFilter === "PENDING" ? (
                      <div className="flex flex-wrap gap-2">
                        <Input
                          placeholder="Review note (optional)"
                          value={reviewNotes[r.id] || ""}
                          onChange={(e) =>
                            setReviewNotes((p) => ({ ...p, [r.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            approveMutation.mutate({
                              id: r.id,
                              note: reviewNotes[r.id] || "",
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            rejectMutation.mutate({
                              id: r.id,
                              note: reviewNotes[r.id] || "",
                            })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "MINE" ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {mineQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : mineQ.isError ? (
              <div className="text-sm text-destructive">
                {mineQ.error?.response?.data?.message ||
                  mineQ.error?.message ||
                  "Failed to load"}
              </div>
            ) : (mineQ.data || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No requests submitted.</div>
            ) : (
              <div className="space-y-2">
                {(mineQ.data || []).map((r) => (
                  <div key={r.id} className="rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{r.id}</Badge>
                      <Badge>{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {String(r.requested_at || "").slice(0, 19)}
                      </span>
                    </div>
                    <div className="text-sm mt-2">
                      Component: <span className="font-mono">{r.component_code}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Reason: {r.reason}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
