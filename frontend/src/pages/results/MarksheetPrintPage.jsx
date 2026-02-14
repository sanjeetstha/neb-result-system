import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Printer, X } from "lucide-react";

import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";

function dateOnly(v) {
  if (!v) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function rowKey(symbol, dob) {
  return `${String(symbol || "").trim()}::${String(dob || "").trim()}`;
}

async function parseBlobMessage(blob, fallback) {
  if (!(blob instanceof Blob)) return fallback;
  try {
    const text = await blob.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return parsed?.message || fallback;
    } catch {
      return text.slice(0, 180) || fallback;
    }
  } catch {
    return fallback;
  }
}

export default function MarksheetPrintPage() {
  const iframeRef = useRef(null);

  const [examId, setExamId] = useState("");
  const [symbolNo, setSymbolNo] = useState("");
  const [dob, setDob] = useState("");

  const [tableSymbolFilter, setTableSymbolFilter] = useState("");
  const [tableDobFilter, setTableDobFilter] = useState("");

  const [url, setUrl] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [pendingPrint, setPendingPrint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const examsQ = useQuery({
    queryKey: ["marksheet", "exams"],
    queryFn: async () => {
      try {
        const res = await api.get("/api/exams");
        const data = res.data?.exams ?? res.data?.data ?? res.data ?? [];
        if (Array.isArray(data) && data.length > 0) return data;
      } catch {
        // fallback below
      }
      const pub = await api.get("/api/public/exams");
      const data = pub.data?.exams ?? pub.data?.data ?? pub.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const selectedExam = useMemo(() => {
    return (
      (examsQ.data || []).find((e) => String(e.exam_id || e.id || "") === String(examId)) ||
      null
    );
  }, [examsQ.data, examId]);

  const isExamPublished = !!(
    selectedExam?.published_at ||
    selectedExam?.is_published ||
    selectedExam?.is_locked
  );

  const studentsQ = useQuery({
    queryKey: [
      "marksheet",
      "students",
      examId,
      selectedExam?.class_id || "",
      selectedExam?.batch_id || "",
      selectedExam?.faculty_id || "",
    ],
    queryFn: async () => {
      const params = { exam_id: Number(examId) };
      let lastErr = null;

      for (const path of ["/api/exports/marksheet/students", "/api/export/marksheet/students"]) {
        try {
          const res = await api.get(path, { params });
          const data = res.data?.students ?? res.data?.data ?? [];
          if (Array.isArray(data)) return data;
        } catch (e) {
          lastErr = e;
        }
      }

      // Robust fallback: derive list from students API using exam context
      // (used when marksheet students endpoint is temporarily unavailable).
      if (selectedExam?.class_id) {
        const qs = new URLSearchParams();
        qs.set("class_id", String(selectedExam.class_id));
        if (selectedExam?.batch_id) qs.set("batch_id", String(selectedExam.batch_id));
        const res = await api.get(`/api/students?${qs.toString()}`);
        const data = Array.isArray(res.data?.students) ? res.data.students : [];
        return data.map((s) => ({
          enrollment_id: s.enrollment_id,
          full_name: s.full_name,
          symbol_no: s.symbol_no,
          regd_no: s.regd_no,
          roll_no: s.roll_no,
          dob: s.dob,
          has_snapshot: null,
          is_published: isExamPublished ? 1 : null,
        }));
      }

      throw lastErr || new Error("Failed to load students");
    },
    enabled: Boolean(examId),
    staleTime: 20_000,
  });

  const examOptions = useMemo(() => {
    return (examsQ.data || []).map((e) => ({
      value: String(e.exam_id || e.id || ""),
      label: e.name || e.title || `Exam #${e.exam_id || e.id}`,
    }));
  }, [examsQ.data]);

  const filteredStudents = useMemo(() => {
    let rows = Array.isArray(studentsQ.data) ? studentsQ.data : [];

    const hasPublishedFlag = rows.some((s) => s?.is_published != null);
    if (isExamPublished && hasPublishedFlag) {
      rows = rows.filter((s) => Number(s.is_published || 0) === 1);
    }

    const sq = String(tableSymbolFilter || "").trim().toLowerCase();
    if (sq) {
      rows = rows.filter((s) => {
        const hay = [s.symbol_no, s.full_name, s.regd_no, s.roll_no]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(sq);
      });
    }

    const d = String(tableDobFilter || "").trim();
    if (d) {
      rows = rows.filter((s) => dateOnly(s.dob) === d);
    }

    return rows;
  }, [studentsQ.data, isExamPublished, tableSymbolFilter, tableDobFilter]);

  useEffect(() => {
    return () => {
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    setUrl("");
    setLoadedKey("");
    setSymbolNo("");
    setDob("");
    setTableSymbolFilter("");
    setTableDobFilter("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const printCurrentPreview = () => {
    const frameWin = iframeRef.current?.contentWindow;
    if (frameWin) {
      try {
        frameWin.focus();
        frameWin.print();
        return;
      } catch {
        // fallback below
      }
    }
    if (url) window.open(url, "_blank");
  };

  const loadMarksheet = async ({ symbol, dobValue = "", printAfter = false }) => {
    const sym = String(symbol || "").trim();
    if (!examId || !sym) {
      setError("Exam and Symbol Number are required.");
      return false;
    }

    setLoading(true);
    setError("");
    try {
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);

      const params = { exam_id: Number(examId), symbol_no: sym };
      if (dobValue) params.dob = dobValue;
      let res = null;
      let lastErr = null;
      for (const path of ["/api/exports/marksheet.pdf", "/api/export/marksheet.pdf"]) {
        try {
          res = await api.get(path, { params, responseType: "blob" });
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!res) throw lastErr || new Error("Failed to load marksheet");

      const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
      const contentType = String(res.headers?.["content-type"] || blob.type || "").toLowerCase();
      if (!contentType.includes("pdf")) {
        const msg = await parseBlobMessage(blob, "Marksheet response is not a PDF document.");
        throw new Error(msg);
      }
      if (!blob.size) {
        throw new Error("Received an empty PDF document.");
      }
      const nextUrl = URL.createObjectURL(blob);
      setUrl(nextUrl);
      setLoadedKey(rowKey(sym, dobValue));

      if (printAfter) setPendingPrint(true);
      return true;
    } catch (e) {
      let message = e?.response?.data?.message || e?.message || "Failed to load marksheet";
      const data = e?.response?.data;
      if (data instanceof Blob) {
        message = await parseBlobMessage(data, message);
      }
      if (String(message).toLowerCase() === "network error") {
        message = "Cannot reach server. Please check backend service and network.";
      }
      setUrl("");
      setLoadedKey("");
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const onLoad = async () => {
    await loadMarksheet({
      symbol: symbolNo,
      dobValue: dob,
      printAfter: false,
    });
  };

  const onPrint = () => {
    if (!url) return;
    printCurrentPreview();
  };

  const onRowPreview = async (s) => {
    const sym = String(s.symbol_no || "").trim();
    const d = dateOnly(s.dob);
    setSymbolNo(sym);
    setDob(d);

    if (!sym) return;
    if (loadedKey === rowKey(sym, d) && url) return;

    await loadMarksheet({ symbol: sym, dobValue: d, printAfter: false });
  };

  const onRowPrint = async (s) => {
    const sym = String(s.symbol_no || "").trim();
    const d = dateOnly(s.dob);
    setSymbolNo(sym);
    setDob(d);

    if (!sym) return;
    if (loadedKey === rowKey(sym, d) && url) {
      printCurrentPreview();
      return;
    }

    await loadMarksheet({ symbol: sym, dobValue: d, printAfter: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Marksheet Print (A4)</h2>
        <p className="text-sm text-muted-foreground">
          Select exam, filter students by symbol/DOB, preview in browser, then print.
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
              <label className="text-sm font-medium">Quick Load: Symbol No</label>
              <Input
                value={symbolNo}
                onChange={(e) => setSymbolNo(e.target.value)}
                list="marksheet-symbol-list"
                placeholder="Enter symbol number"
              />
              <datalist id="marksheet-symbol-list">
                {(studentsQ.data || []).map((s) => (
                  <option
                    key={`${s.enrollment_id}-${s.symbol_no || "nosymbol"}`}
                    value={String(s.symbol_no || "")}
                  >
                    {`${s.full_name || ""} ${s.regd_no ? `(${s.regd_no})` : ""}`}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quick Load: Date of Birth (Optional)</label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}

          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onLoad}
              disabled={!examId || !String(symbolNo || "").trim() || loading}
            >
              {loading ? "Loading..." : "Load Marksheet"}
            </Button>
            <Button
              onClick={onPrint}
              disabled={!url}
              className="inline-flex items-center gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      {examId ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Student Records</h3>
              <div className="text-xs text-muted-foreground">
                {studentsQ.isLoading
                  ? "Loading..."
                  : `${filteredStudents.length} filtered / ${(studentsQ.data || []).length} total`}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px_auto]">
              <Input
                value={tableSymbolFilter}
                onChange={(e) => setTableSymbolFilter(e.target.value)}
                placeholder="Filter by symbol, name, regd, roll"
              />
              <Input
                type="date"
                value={tableDobFilter}
                onChange={(e) => setTableDobFilter(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTableSymbolFilter("");
                  setTableDobFilter("");
                }}
                className="inline-flex items-center gap-1.5"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>

            {isExamPublished ? (
              <div className="text-xs text-muted-foreground">
                Published exam selected: showing published student rows for direct printing.
              </div>
            ) : null}
            {studentsQ.isError ? (
              <div className="text-xs text-destructive">
                Failed to load student list:{" "}
                {studentsQ.error?.response?.data?.message ||
                  studentsQ.error?.message ||
                  "Unknown error"}
              </div>
            ) : null}

            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr className="text-left">
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Regd</th>
                    <th className="px-3 py-2">DOB</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr key={s.enrollment_id} className="border-t">
                      <td className="px-3 py-2">{s.symbol_no || "-"}</td>
                      <td className="px-3 py-2">{s.full_name || "-"}</td>
                      <td className="px-3 py-2">{s.regd_no || "-"}</td>
                      <td className="px-3 py-2">{dateOnly(s.dob) || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            title="Preview marksheet"
                            onClick={() => onRowPreview(s)}
                            disabled={!s.symbol_no || loading}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            title="Print marksheet"
                            onClick={() => onRowPrint(s)}
                            disabled={!s.symbol_no || loading}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!studentsQ.isLoading && filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                        No matching student records.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {url ? (
        <Card>
          <CardContent className="p-2 space-y-2">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              >
                Open in new tab
              </Button>
            </div>
            <iframe
              ref={iframeRef}
              title="marksheet"
              src={url}
              className="w-full h-[76vh]"
              onLoad={() => {
                if (!pendingPrint) return;
                setTimeout(() => {
                  printCurrentPreview();
                  setPendingPrint(false);
                }, 180);
              }}
            />
            <div className="px-1 text-xs text-muted-foreground">
              If preview fails on this browser, open in new tab and print from there.
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
