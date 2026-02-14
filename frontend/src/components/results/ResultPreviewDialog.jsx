import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";

function pad4(code) {
  const s = String(code ?? "").trim();
  if (!s) return "";
  if (s.length >= 4) return s;
  return s.padStart(4, "0");
}

function formatGpa(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(2);
}

function toPreviewResult(previewData) {
  if (!previewData) return null;
  return (
    previewData?.result ||
    previewData?.summary ||
    previewData?.data?.result ||
    previewData?.data?.summary ||
    previewData?.data ||
    previewData
  );
}

function toSubjectRows(result) {
  if (!result) return [];
  if (Array.isArray(result.subjects)) return result.subjects;
  if (Array.isArray(result.subject_results)) return result.subject_results;
  if (Array.isArray(result.rows)) return result.rows;
  return [];
}

function toStatus(result) {
  return (
    result?.result_status ||
    result?.status ||
    result?.result ||
    "PREVIEW"
  );
}

function toFinalGpa(result) {
  return (
    result?.overall_gpa ??
    result?.final_gpa ??
    result?.gpa ??
    ""
  );
}

function toFinalGrade(result) {
  return (
    result?.final_grade ??
    result?.overall_grade ??
    result?.grade ??
    ""
  );
}

function toSubjectMarksText(subj) {
  const obtained =
    subj?.total_obtained ??
    subj?.obtained ??
    subj?.marks_obtained ??
    subj?.score ??
    null;
  const full =
    subj?.total_full ??
    subj?.full_marks ??
    subj?.max_marks ??
    null;

  if (obtained == null && full == null) return "—";
  if (obtained != null && full != null) return `${obtained} / ${full}`;
  return String(obtained ?? full ?? "—");
}

export default function ResultPreviewDialog({
  open,
  onOpenChange,
  loading = false,
  previewData,
  errorMessage = "",
  examLabel = "—",
  student = null,
  enrollmentId = "",
}) {
  const result = toPreviewResult(previewData);
  const subjects = toSubjectRows(result);
  const status = toStatus(result);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Result Preview</DialogTitle>
          <DialogDescription>
            {examLabel} • {student?.symbol_no || "—"} — {student?.full_name || "—"}
          </DialogDescription>
        </DialogHeader>

        {loading && !previewData ? (
          <div className="text-sm text-muted-foreground">Loading preview...</div>
        ) : !previewData && errorMessage ? (
          <div className="text-sm text-destructive">{errorMessage}</div>
        ) : !previewData ? (
          <div className="text-sm text-muted-foreground">No preview loaded.</div>
        ) : (
          <div className="space-y-4">
            {errorMessage ? (
              <div className="text-xs text-destructive">{errorMessage}</div>
            ) : null}
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">{examLabel}</div>
              <Badge variant={status === "PASS" ? "secondary" : "outline"}>
                {status}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground">Student</div>
                <div className="font-medium">{student?.full_name || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Symbol No</div>
                <div className="font-mono">{student?.symbol_no || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Enrollment</div>
                <div className="font-mono">{enrollmentId || student?.enrollment_id || "—"}</div>
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
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subj, idx) => {
                    const name =
                      subj?.subject_name ||
                      subj?.name ||
                      `Subject ${idx + 1}`;
                    const code = subj?.subject_code || subj?.code || "";
                    const grade = subj?.grade ?? subj?.final_grade ?? "—";
                    const gpa = subj?.gpa ?? subj?.grade_point ?? "";
                    const percent = subj?.percent;

                    return (
                      <tr key={`${name}-${idx}`} className="border-t">
                        <td className="p-2">
                          {name}{" "}
                          {code ? (
                            <span className="text-[11px] text-muted-foreground">
                              ({pad4(code)})
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2 text-center">
                          {toSubjectMarksText(subj)}
                          {percent != null ? (
                            <div className="text-[11px] text-muted-foreground">
                              {percent}%
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2 text-center">{grade || "—"}</td>
                        <td className="p-2 text-center">{formatGpa(gpa)}</td>
                      </tr>
                    );
                  })}
                  {subjects.length === 0 ? (
                    <tr className="border-t">
                      <td className="p-2 text-center text-muted-foreground" colSpan={4}>
                        No subject rows in preview.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Final GPA:</span>{" "}
                <span className="font-semibold text-lg">{formatGpa(toFinalGpa(result))}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Result:</span>{" "}
                <Badge
                  variant={status === "PASS" ? "secondary" : "destructive"}
                >
                  {status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Final Grade:</span>{" "}
                <span className="font-semibold">{toFinalGrade(result) || "—"}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
