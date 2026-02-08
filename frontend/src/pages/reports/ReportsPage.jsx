import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";

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

export default function ReportsPage() {
  const [examId, setExamId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [tab, setTab] = useState("TABULATION"); // TABULATION | MERIT | STATS
  const [limit, setLimit] = useState("10");

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
      return { value: id, label: name };
    });
  }, [examsQ.data]);

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

  const tabulationQ = useQuery({
    queryKey: ["reports", "tabulation", examId, batchId],
    enabled: tab === "TABULATION" && !!examId && !!batchId,
    queryFn: async () => {
      const res = await api.get(
        `/api/reports/tabulation?exam_id=${encodeURIComponent(
          examId
        )}&batch_id=${encodeURIComponent(batchId)}`
      );
      return res.data;
    },
  });

  const meritQ = useQuery({
    queryKey: ["reports", "merit", examId, batchId, limit],
    enabled: tab === "MERIT" && !!examId,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("exam_id", examId);
      if (batchId) params.set("batch_id", batchId);
      params.set("limit", String(limit || 10));
      const res = await api.get(`/api/reports/merit?${params.toString()}`);
      return res.data;
    },
  });

  const statsQ = useQuery({
    queryKey: ["reports", "pass-stats", examId, batchId],
    enabled: tab === "STATS" && !!examId,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("exam_id", examId);
      if (batchId) params.set("batch_id", batchId);
      const res = await api.get(`/api/reports/pass-stats?${params.toString()}`);
      return res.data;
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Published results only. Select exam and batch to generate reports.
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
              label="Batch (optional for merit/stats)"
              value={batchId}
              onChange={setBatchId}
              options={batchOptions}
              placeholder={batchesQ.isLoading ? "Loading batches..." : "Select batch"}
            />

            {tab === "MERIT" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Top Limit</label>
                <Input
                  type="number"
                  min="1"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
            ) : (
              <div />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "TABULATION" ? "default" : "outline"}
              onClick={() => setTab("TABULATION")}
            >
              Tabulation
            </Button>
            <Button
              variant={tab === "MERIT" ? "default" : "outline"}
              onClick={() => setTab("MERIT")}
            >
              Merit List
            </Button>
            <Button
              variant={tab === "STATS" ? "default" : "outline"}
              onClick={() => setTab("STATS")}
            >
              Pass Stats
            </Button>
          </div>
        </CardContent>
      </Card>

      {tab === "TABULATION" ? (
        <Card>
          <CardContent className="p-4">
            {!examId || !batchId ? (
              <div className="text-sm text-muted-foreground">
                Select exam and batch to view tabulation.
              </div>
            ) : tabulationQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading tabulation...</div>
            ) : tabulationQ.isError ? (
              <div className="text-sm text-destructive">
                {tabulationQ.error?.response?.data?.message ||
                  tabulationQ.error?.message ||
                  "Failed to load"}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Total: {tabulationQ.data?.count ?? 0}
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm border rounded-md">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Roll</th>
                        <th className="p-2 text-left">Student</th>
                        <th className="p-2 text-left">Symbol</th>
                        <th className="p-2 text-center">GPA</th>
                        <th className="p-2 text-center">Grade</th>
                        <th className="p-2 text-center">Status</th>
                        <th className="p-2 text-left">Subjects</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tabulationQ.data?.table || []).map((r) => (
                        <tr key={r.enrollment_id} className="border-t">
                          <td className="p-2">{r.roll_no || "—"}</td>
                          <td className="p-2">{r.full_name}</td>
                          <td className="p-2 font-mono">{r.symbol_no}</td>
                          <td className="p-2 text-center">{r.overall_gpa}</td>
                          <td className="p-2 text-center">{r.final_grade}</td>
                          <td className="p-2 text-center">
                            <Badge
                              variant={
                                r.result_status === "PASS" ? "secondary" : "destructive"
                              }
                            >
                              {r.result_status}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {(r.subjects || []).map((s, idx) => (
                                <span
                                  key={idx}
                                  className="rounded-md border px-2 py-1 text-xs"
                                >
                                  {s.subject_name}: {s.grade}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "MERIT" ? (
        <Card>
          <CardContent className="p-4">
            {!examId ? (
              <div className="text-sm text-muted-foreground">
                Select exam to view merit list.
              </div>
            ) : meritQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading merit list...</div>
            ) : meritQ.isError ? (
              <div className="text-sm text-destructive">
                {meritQ.error?.response?.data?.message ||
                  meritQ.error?.message ||
                  "Failed to load"}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Top {limit || 10}
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm border rounded-md">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Rank</th>
                        <th className="p-2 text-left">Student</th>
                        <th className="p-2 text-left">Symbol</th>
                        <th className="p-2 text-center">GPA</th>
                        <th className="p-2 text-center">Grade</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(meritQ.data?.merit || []).map((r, idx) => (
                        <tr key={r.enrollment_id} className="border-t">
                          <td className="p-2">{idx + 1}</td>
                          <td className="p-2">{r.full_name}</td>
                          <td className="p-2 font-mono">{r.symbol_no}</td>
                          <td className="p-2 text-center">{r.overall_gpa}</td>
                          <td className="p-2 text-center">{r.final_grade}</td>
                          <td className="p-2 text-center">{r.result_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "STATS" ? (
        <Card>
          <CardContent className="p-4">
            {!examId ? (
              <div className="text-sm text-muted-foreground">
                Select exam to view pass statistics.
              </div>
            ) : statsQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading stats...</div>
            ) : statsQ.isError ? (
              <div className="text-sm text-destructive">
                {statsQ.error?.response?.data?.message ||
                  statsQ.error?.message ||
                  "Failed to load"}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-lg font-semibold">{statsQ.data?.total ?? 0}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Passed</div>
                  <div className="text-lg font-semibold">{statsQ.data?.passed ?? 0}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Failed</div>
                  <div className="text-lg font-semibold">{statsQ.data?.failed ?? 0}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Pass %</div>
                  <div className="text-lg font-semibold">{statsQ.data?.pass_percent ?? 0}%</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
