import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { publicApi } from "../../lib/publicApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

function norm(v) {
  return String(v ?? "").trim();
}

function dateOnly(v) {
  if (!v) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default function ResultsSearchPage({ title = "Result Portal", variant = "default" }) {
  const [examId, setExamId] = useState("");
  const [regdNo, setRegdNo] = useState("");
  const [dob, setDob] = useState("");
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState("");

  const examsQ = useQuery({
    queryKey: ["public", "exams"],
    queryFn: async () => {
      const res = await publicApi.get("/api/public/exams");
      const data = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const examOptions = useMemo(() => {
    return (examsQ.data || []).map((e) => ({
      value: String(e.exam_id || e.id || ""),
      label: e.name || e.title || `Exam #${e.exam_id || e.id}`,
    }));
  }, [examsQ.data]);

  const studentsQ = useQuery({
    queryKey: ["public", "students", examId],
    queryFn: async () => {
      const res = await publicApi.get("/api/public/students", {
        params: { exam_id: Number(examId) },
      });
      const data = res.data?.students ?? res.data?.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(examId),
    staleTime: 30_000,
  });

  const regdOptions = useMemo(() => {
    return (studentsQ.data || [])
      .map((s) => ({
        regd_no: String(s.regd_no || "").trim(),
        full_name: s.full_name,
      }))
      .filter((s) => s.regd_no);
  }, [studentsQ.data]);

  const searchMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        exam_id: Number(examId),
        regd_no: norm(regdNo),
      };
      if (norm(dob)) payload.dob = norm(dob);
      const res = await publicApi.post("/api/public/results/search", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("Result loaded");
    },
    onError: (err) => {
      setResult(null);
      toast.error(
        err?.response?.data?.message || err.message || "Result not found"
      );
    },
  });

  const resultSummary = result?.summary || {};
  const payload = result?.result || {};
  const subjects = Array.isArray(payload?.subjects) ? payload.subjects : [];

  const resultSymbolNo = norm(result?.student?.symbol_no);
  const effectiveDob = norm(dob) || dateOnly(result?.student?.dob);
  const canDownloadMarksheet = Boolean(examId && resultSymbolNo);
  const canDownloadTranscript = Boolean(examId && resultSymbolNo && effectiveDob);

  const compact = variant === "compact";

  const openPdf = async (type) => {
    if (!canDownloadMarksheet || downloading) return;
    const isMarksheet = type === "marksheet";
    if (!isMarksheet && !canDownloadTranscript) {
      toast.error("Date of birth is required to open transcript.");
      return;
    }
    const endpoint = isMarksheet ? "/api/public/marksheet.pdf" : "/api/public/transcript.pdf";
    setDownloading(type);
    try {
      const res = await publicApi.get(endpoint, {
        params: {
          exam_id: Number(examId),
          symbol_no: resultSymbolNo,
          ...(type === "transcript" || effectiveDob ? { dob: effectiveDob } : {}),
        },
        responseType: "blob",
      });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
      const contentType = String(res.headers?.["content-type"] || blob.type || "").toLowerCase();
      if (!contentType.includes("pdf")) {
        const text = await blob.text().catch(() => "");
        let message = "Failed to load PDF document";
        if (text) {
          try {
            const parsed = JSON.parse(text);
            message = parsed?.message || message;
          } catch {
            message = text.slice(0, 180) || message;
          }
        }
        throw new Error(message);
      }
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to open PDF");
    } finally {
      setDownloading("");
    }
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact ? (
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Search published results by exam and registration number. Date of birth is optional for confirmation.
          </p>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Exam</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={examId}
                onChange={(e) => {
                  setExamId(e.target.value);
                  setRegdNo("");
                  setDob("");
                  setResult(null);
                }}
              >
                <option value="">
                  {examsQ.isLoading ? "Loading..." : "Select exam"}
                </option>
                {examOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Registration No.</label>
              <Input
                placeholder="Enter registration number"
                value={regdNo}
                onChange={(e) => setRegdNo(e.target.value)}
                list="public-regd-no-list"
              />
              <datalist id="public-regd-no-list">
                {regdOptions.map((s) => (
                  <option key={`${s.regd_no}-${s.full_name || ""}`} value={s.regd_no}>
                    {s.full_name || ""}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth (Optional)</label>
              <Input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
          </div>

          {examId ? (
            <div className="text-xs text-muted-foreground">
              {studentsQ.isLoading
                ? "Indexing students..."
                : `Indexed ${(studentsQ.data || []).length} published student record(s) for this exam.`}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => searchMutation.mutate()}
              disabled={!examId || !regdNo || searchMutation.isPending}
            >
              {searchMutation.isPending ? "Searching..." : "Search Result"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!result ? null : (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {result?.student?.full_name || "Student"}
              </Badge>
              <Badge variant="outline">
                Symbol: {result?.student?.symbol_no || "—"}
              </Badge>
              <Badge variant="outline">
                Regd: {result?.student?.regd_no || "—"}
              </Badge>
              <Badge variant="outline">
                Result: {resultSummary?.result_status || payload?.result_status || "—"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
              <div>
                <div className="text-muted-foreground">Overall GPA</div>
                <div className="font-medium">
                  {resultSummary?.overall_gpa ?? payload?.overall_gpa ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Final Grade</div>
                <div className="font-medium">
                  {resultSummary?.final_grade ?? payload?.final_grade ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Published At</div>
                <div className="font-medium">
                  {result?.published_at
                    ? new Date(result.published_at).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>

            <Separator />

            <div className="overflow-auto">
              <table className="w-full text-sm border rounded-md">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Subject</th>
                    <th className="p-2 text-center">Marks</th>
                    <th className="p-2 text-center">Grade</th>
                    <th className="p-2 text-center">GPA</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.length === 0 ? (
                    <tr>
                      <td className="p-3 text-center text-muted-foreground" colSpan={5}>
                        Subject breakdown not available.
                      </td>
                    </tr>
                  ) : (
                    subjects.map((s, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{s.subject_name}</td>
                        <td className="p-2 text-center">{s.total_obtained ?? s.total_marks ?? "—"}</td>
                        <td className="p-2 text-center">{s.grade ?? "—"}</td>
                        <td className="p-2 text-center">{s.gpa ?? "—"}</td>
                        <td className="p-2 text-center">{s.status ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {canDownloadMarksheet ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!downloading}
                  onClick={() => openPdf("marksheet")}
                >
                  {downloading === "marksheet" ? "Opening..." : "Open Marksheet (PDF)"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!downloading || !canDownloadTranscript}
                  onClick={() => openPdf("transcript")}
                >
                  {downloading === "transcript" ? "Opening..." : "Open Transcript (PDF)"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
