import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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

export default function ResultsSearchPage({ title = "Result Portal", variant = "default" }) {
  const [examId, setExamId] = useState("");
  const [symbolNo, setSymbolNo] = useState("");
  const [dob, setDob] = useState("");
  const [result, setResult] = useState(null);

  const examsQ = useQuery({
    queryKey: ["public", "exams"],
    queryFn: async () => {
      const res = await api.get("/api/public/exams");
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

  const searchMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        exam_id: Number(examId),
        symbol_no: norm(symbolNo),
        dob: norm(dob),
      };
      const res = await api.post("/api/public/results/search", payload);
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

  const downloadQuery = useMemo(() => {
    if (!examId || !symbolNo || !dob) return "";
    return `?exam_id=${encodeURIComponent(examId)}&symbol_no=${encodeURIComponent(
      norm(symbolNo)
    )}&dob=${encodeURIComponent(norm(dob))}`;
  }, [examId, symbolNo, dob]);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "";

  const compact = variant === "compact";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact ? (
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Search published results by exam, symbol number and date of birth.
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
                onChange={(e) => setExamId(e.target.value)}
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
              <label className="text-sm font-medium">Symbol No.</label>
              <Input
                placeholder="e.g. 823220060001"
                value={symbolNo}
                onChange={(e) => setSymbolNo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth</label>
              <Input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => searchMutation.mutate()}
              disabled={!examId || !symbolNo || !dob || searchMutation.isPending}
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

            {downloadQuery ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a
                    href={`${apiBase}/api/public/marksheet.pdf${downloadQuery}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download Marksheet (PDF)
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a
                    href={`${apiBase}/api/public/transcript.pdf${downloadQuery}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download Transcript (PDF)
                  </a>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
