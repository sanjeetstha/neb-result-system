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

function ReportMetaBadges({ data }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">Rows: {data?.count ?? data?.total ?? 0}</Badge>
      <Badge variant="outline">Snapshots: {data?.snapshot_count ?? 0}</Badge>
      <Badge variant="outline">Live: {data?.live_count ?? 0}</Badge>
      {data?.scope ? <Badge variant="secondary">Scope: {data.scope}</Badge> : null}
      {data?.message ? <Badge variant="outline">{data.message}</Badge> : null}
    </div>
  );
}

export default function ReportsPage() {
  const [examId, setExamId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [tab, setTab] = useState("TABULATION"); // TABULATION | MERIT | STATS
  const [limit, setLimit] = useState("10");
  const [scope, setScope] = useState("generated"); // generated | published
  const [includeLive, setIncludeLive] = useState(true);

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

  const buildParams = (extra = {}) => {
    const params = new URLSearchParams();
    params.set("exam_id", examId);
    if (batchId) params.set("batch_id", batchId);
    params.set("scope", scope);
    params.set("include_live", includeLive ? "1" : "0");
    Object.entries(extra).forEach(([k, v]) => {
      if (v == null || v === "") return;
      params.set(k, String(v));
    });
    return params.toString();
  };

  const tabulationQ = useQuery({
    queryKey: ["reports", "tabulation", examId, batchId, scope, includeLive],
    enabled: tab === "TABULATION" && !!examId,
    queryFn: async () => {
      const res = await api.get(`/api/reports/tabulation?${buildParams()}`);
      return res.data;
    },
  });

  const meritQ = useQuery({
    queryKey: ["reports", "merit", examId, batchId, limit, scope, includeLive],
    enabled: tab === "MERIT" && !!examId,
    queryFn: async () => {
      const res = await api.get(`/api/reports/merit?${buildParams({ limit: limit || 10 })}`);
      return res.data;
    },
  });

  const statsQ = useQuery({
    queryKey: ["reports", "pass-stats", examId, batchId, scope, includeLive],
    enabled: tab === "STATS" && !!examId,
    queryFn: async () => {
      const res = await api.get(`/api/reports/pass-stats?${buildParams()}`);
      return res.data;
    },
  });

  const currentQ =
    tab === "TABULATION" ? tabulationQ : tab === "MERIT" ? meritQ : statsQ;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Result reports for generated/published data. Batch filter is optional.
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
              label="Batch (optional)"
              value={batchId}
              onChange={setBatchId}
              options={batchOptions}
              placeholder={batchesQ.isLoading ? "Loading batches..." : "All batches"}
            />

            {tab === "MERIT" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Top Limit</label>
                <Input
                  type="number"
                  min="1"
                  max="500"
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

          <div className="flex flex-wrap gap-2 items-center">
            <Button
              size="sm"
              variant={scope === "generated" ? "secondary" : "outline"}
              onClick={() => setScope("generated")}
            >
              Generated + Live
            </Button>
            <Button
              size="sm"
              variant={scope === "published" ? "secondary" : "outline"}
              onClick={() => setScope("published")}
            >
              Published Only
            </Button>
            <label className="text-xs text-muted-foreground flex items-center gap-2 ml-1">
              <input
                type="checkbox"
                checked={includeLive}
                onChange={(e) => setIncludeLive(e.target.checked)}
                disabled={scope === "published"}
              />
              Include live preview for missing snapshots
            </label>
            {currentQ.isFetching ? <Badge variant="outline">Refreshing...</Badge> : null}
          </div>
        </CardContent>
      </Card>

      {tab === "TABULATION" ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {!examId ? (
              <div className="text-sm text-muted-foreground">
                Select exam to view tabulation.
              </div>
            ) : tabulationQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading tabulation...</div>
            ) : tabulationQ.isError ? (
              <div className="text-sm text-destructive">
                {tabulationQ.error?.response?.data?.message ||
                  tabulationQ.error?.message ||
                  "Failed to load tabulation"}
              </div>
            ) : (
              <div className="space-y-3">
                <ReportMetaBadges data={tabulationQ.data} />
                {(tabulationQ.data?.table || []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {tabulationQ.data?.message || "No records found."}
                  </div>
                ) : (
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
                          <th className="p-2 text-center">Source</th>
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
                            <td className="p-2 text-center">
                              <Badge variant={r.source === "LIVE" ? "outline" : "secondary"}>
                                {r.source || "SNAPSHOT"}
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
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "MERIT" ? (
        <Card>
          <CardContent className="p-4 space-y-3">
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
                  "Failed to load merit list"}
              </div>
            ) : (
              <div className="space-y-3">
                <ReportMetaBadges data={meritQ.data} />
                {(meritQ.data?.merit || []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {meritQ.data?.message || "No records found."}
                  </div>
                ) : (
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
                          <th className="p-2 text-center">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(meritQ.data?.merit || []).map((r, idx) => (
                          <tr key={r.enrollment_id} className="border-t">
                            <td className="p-2">{r.rank || idx + 1}</td>
                            <td className="p-2">{r.full_name}</td>
                            <td className="p-2 font-mono">{r.symbol_no}</td>
                            <td className="p-2 text-center">{r.overall_gpa}</td>
                            <td className="p-2 text-center">{r.final_grade}</td>
                            <td className="p-2 text-center">{r.result_status}</td>
                            <td className="p-2 text-center">
                              <Badge variant={r.source === "LIVE" ? "outline" : "secondary"}>
                                {r.source || "SNAPSHOT"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "STATS" ? (
        <Card>
          <CardContent className="p-4 space-y-3">
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
                  "Failed to load pass statistics"}
              </div>
            ) : (
              <div className="space-y-3">
                <ReportMetaBadges data={statsQ.data} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
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
                    <div className="text-xs text-muted-foreground">Others</div>
                    <div className="text-lg font-semibold">{statsQ.data?.others ?? 0}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Pass %</div>
                    <div className="text-lg font-semibold">
                      {statsQ.data?.pass_percent ?? 0}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
