import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";

export default function MarksheetPrintPage() {
  const [examId, setExamId] = useState("");
  const [symbolNo, setSymbolNo] = useState("");
  const [dob, setDob] = useState("");
  const [url, setUrl] = useState("");

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

  const apiBase = import.meta.env.VITE_API_BASE_URL || "";

  const buildUrl = () => {
    if (!examId || !symbolNo || !dob) return "";
    const q = `?exam_id=${encodeURIComponent(examId)}&symbol_no=${encodeURIComponent(symbolNo)}&dob=${encodeURIComponent(dob)}`;
    return `${apiBase}/api/public/marksheet.pdf${q}`;
  };

  const onLoad = () => {
    const u = buildUrl();
    setUrl(u);
  };

  const onPrint = () => {
    if (!url) return;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marksheet Print (A4)</h2>
        <p className="text-sm text-muted-foreground">
          Fetch a student marksheet and print directly on A4 size.
        </p>
      </div>

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
                <option value="">{examsQ.isLoading ? "Loading..." : "Select exam"}</option>
                {examOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Symbol No</label>
              <Input value={symbolNo} onChange={(e) => setSymbolNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth</label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onLoad} disabled={!examId || !symbolNo || !dob}>
              Load Marksheet
            </Button>
            <Button onClick={onPrint} disabled={!url}>
              Print / Open PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {url ? (
        <Card>
          <CardContent className="p-2">
            <iframe title="marksheet" src={url} className="w-full h-[75vh]" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
