import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

function parseTargets(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const targets = [];
  for (const line of lines) {
    const parts = line.split(/[,\t;]/).map((p) => p.trim());
    if (parts.length < 2) continue;
    const symbol_no = parts[0];
    const phone = parts[1];
    if (!symbol_no || !phone) continue;
    targets.push({ symbol_no, phone });
  }
  return targets;
}

export default function BulkSmsPage() {
  const [examId, setExamId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [template, setTemplate] = useState(
    "Dear {name}, {exam} result: GPA {gpa}, Grade {grade}, Status {result}."
  );
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState(null);

  const examsQ = useQuery({
    queryKey: ["exams", "list"],
    queryFn: async () => {
      const res = await api.get("/api/exams");
      const arr = res.data?.exams ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(arr) ? arr : [];
    },
    staleTime: 10_000,
  });

  const sectionsQ = useQuery({
    queryKey: ["masters", "sections"],
    queryFn: async () => {
      const res = await api.get("/api/masters/sections");
      const data = res.data?.sections ?? res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const examOptions = useMemo(() => {
    return (examsQ.data || []).map((e) => ({
      value: String(e.id ?? e.exam_id ?? ""),
      label: e.name ?? e.title ?? `Exam #${e.id ?? e.exam_id}`,
    }));
  }, [examsQ.data]);

  const sectionOptions = useMemo(() => {
    return (sectionsQ.data || []).map((s) => ({
      value: String(s.id ?? s.section_id ?? ""),
      label: s.name ? `Section ${s.name}` : `Section #${s.id ?? s.section_id}`,
    }));
  }, [sectionsQ.data]);

  const bulkMutation = useMutation({
    mutationFn: async ({ previewOnly }) => {
      const targets = parseTargets(csvText);
      if (!targets.length) throw new Error("Provide list: symbol_no,phone per line");

      const payload = {
        exam_id: Number(examId),
        section_id: sectionId ? Number(sectionId) : null,
        template,
        targets,
        preview_only: !!previewOnly,
      };

      const res = await api.post("/api/sms/bulk", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setPreview(data);
      toast.success(data?.message || "SMS batch ready");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err.message || "Bulk SMS failed");
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Bulk SMS Results</h2>
        <p className="text-sm text-muted-foreground">
          Upload a list of symbol numbers and phone numbers to generate result SMS messages.
        </p>
        <div className="mt-2 text-xs text-muted-foreground">
          Provider: Aakash SMS (requires server config).
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
              <label className="text-sm font-medium">Section (optional)</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">All sections</option>
                {sectionOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Message Template</label>
            <Input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">
              Placeholders: <code>{"{name}"}</code>, <code>{"{symbol_no}"}</code>, <code>{"{gpa}"}</code>, <code>{"{grade}"}</code>, <code>{"{result}"}</code>, <code>{"{exam}"}</code>.
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Targets (CSV)</label>
            <textarea
              className="w-full min-h-[140px] rounded-md border bg-background p-2 text-sm"
              placeholder="symbol_no,phone\n823220060001,9841000000"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">
              One student per line: <code>symbol_no,phone</code>
            </div>
            <div className="text-xs text-muted-foreground">
              Aakash SMS expects 10-digit mobile numbers (Nepal). We auto-normalize
              numbers like <code>+97798XXXXXXXX</code>.
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => bulkMutation.mutate({ previewOnly: true })}
              disabled={!examId || bulkMutation.isPending}
            >
              {bulkMutation.isPending ? "Generating..." : "Generate Preview"}
            </Button>
            <Button
              onClick={() => bulkMutation.mutate({ previewOnly: false })}
              disabled={!examId || bulkMutation.isPending}
            >
              {bulkMutation.isPending ? "Queuing..." : "Queue SMS"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Matched: {preview.matched || 0}</Badge>
              <Badge variant="outline">Missing: {preview.missing || 0}</Badge>
              <Badge variant="outline">Total Targets: {preview.total || 0}</Badge>
              {preview.provider ? (
                <Badge variant="outline">Provider: {preview.provider}</Badge>
              ) : null}
              {typeof preview.sent === "number" ? (
                <Badge variant="outline">Sent: {preview.sent}</Badge>
              ) : null}
              {typeof preview.failed === "number" ? (
                <Badge variant="outline">Failed: {preview.failed}</Badge>
              ) : null}
            </div>

            {Array.isArray(preview.preview) && preview.preview.length ? (
              <div className="space-y-2">
                {preview.preview.map((p, idx) => (
                  <div key={idx} className="rounded-md border p-2 text-xs">
                    <div className="font-medium">{p.symbol_no} • {p.phone}</div>
                    <div className="text-muted-foreground">{p.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No preview messages.</div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
