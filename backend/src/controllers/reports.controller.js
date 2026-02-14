const db = require("../db");
const { previewResult } = require("../services/result.service");

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseScope(v) {
  return String(v || "").trim().toLowerCase() === "published"
    ? "published"
    : "generated";
}

function parseBool(v, fallback = false) {
  if (v == null || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function rollSortValue(v) {
  if (v == null || v === "") return Number.MAX_SAFE_INTEGER;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const s = String(v).trim();
  const d = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(d) ? d : Number.MAX_SAFE_INTEGER;
}

function mapSnapshotRow(row) {
  let payload = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }
  return {
    enrollment_id: row.enrollment_id,
    roll_no: row.roll_no || null,
    symbol_no: row.symbol_no || null,
    regd_no: row.regd_no || null,
    full_name: row.full_name || "",
    overall_gpa: row.overall_gpa != null ? Number(row.overall_gpa) : 0,
    final_grade: row.final_grade || "",
    result_status: row.result_status || "",
    subjects: Array.isArray(payload?.subjects) ? payload.subjects : [],
    source: "SNAPSHOT",
    published_at: row.published_at || null,
  };
}

function buildEnrollmentContextWhere({ exam, batchId }) {
  let where = `e.campus_id=? AND e.academic_year_id=? AND e.class_id=?`;
  const params = [exam.campus_id, exam.academic_year_id, exam.class_id];

  if (exam.faculty_id) {
    where += ` AND e.faculty_id=?`;
    params.push(exam.faculty_id);
  }
  if (batchId) {
    where += ` AND e.batch_id=?`;
    params.push(batchId);
  }

  return { where, params };
}

async function collectReportRows({ examId, batchId, scope, includeLive }) {
  const [[exam]] = await db.query(
    `SELECT id, name, campus_id, academic_year_id, class_id, faculty_id, is_locked, published_at
     FROM exams
     WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) {
    throw new Error("Exam not found");
  }

  const { where, params } = buildEnrollmentContextWhere({ exam, batchId });

  let snapSql =
    `SELECT rs.enrollment_id, rs.overall_gpa, rs.final_grade, rs.result_status, rs.payload_json, rs.published_at,
            s.full_name, s.roll_no, s.symbol_no, s.regd_no
     FROM result_snapshots rs
     JOIN student_enrollments e ON e.id=rs.enrollment_id
     JOIN students s ON s.id=e.student_id
     WHERE rs.exam_id=? AND ${where}`;
  const snapParams = [examId, ...params];

  if (scope === "published") {
    snapSql += ` AND rs.published_at IS NOT NULL`;
  }

  const [snapshotRows] = await db.query(snapSql, snapParams);
  const normalizedSnapshots = snapshotRows.map(mapSnapshotRow);
  const snapshotByEnrollment = new Map(
    normalizedSnapshots.map((r) => [String(r.enrollment_id), r])
  );

  const rows = [...normalizedSnapshots];
  const liveErrors = [];

  if (includeLive && scope !== "published") {
    const [enrollmentRows] = await db.query(
      `SELECT e.id AS enrollment_id, s.full_name, s.roll_no, s.symbol_no, s.regd_no
       FROM student_enrollments e
       JOIN students s ON s.id=e.student_id
       WHERE ${where}`,
      params
    );

    const missing = enrollmentRows.filter(
      (r) => !snapshotByEnrollment.has(String(r.enrollment_id))
    );

    if (missing.length > 0) {
      const concurrency = Math.min(5, missing.length);
      let index = 0;

      async function worker() {
        while (index < missing.length) {
          const current = missing[index++];
          try {
            const result = await previewResult({
              examId,
              enrollmentId: current.enrollment_id,
            });
            rows.push({
              enrollment_id: current.enrollment_id,
              roll_no: current.roll_no || null,
              symbol_no: current.symbol_no || null,
              regd_no: current.regd_no || null,
              full_name: current.full_name || "",
              overall_gpa: Number(result?.overall_gpa || 0),
              final_grade: result?.final_grade || "",
              result_status: result?.result_status || "",
              subjects: Array.isArray(result?.subjects) ? result.subjects : [],
              source: "LIVE",
              published_at: null,
            });
          } catch (e) {
            liveErrors.push({
              enrollment_id: current.enrollment_id,
              symbol_no: current.symbol_no,
              message: e?.message || "Live preview failed",
            });
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    }
  }

  rows.sort((a, b) => {
    const ra = rollSortValue(a.roll_no);
    const rb = rollSortValue(b.roll_no);
    if (ra !== rb) return ra - rb;
    return String(a.full_name || "").localeCompare(String(b.full_name || ""));
  });

  return {
    exam,
    rows,
    snapshot_count: normalizedSnapshots.length,
    live_count: rows.filter((r) => r.source === "LIVE").length,
    live_errors: liveErrors,
  };
}

async function tabulation(req, res) {
  try {
    const examId = toInt(req.query.exam_id);
    const batchId = toInt(req.query.batch_id);
    const scope = parseScope(req.query.scope);
    const includeLive = parseBool(req.query.include_live, true);

    if (!examId) {
      return res.status(400).json({ ok: false, message: "exam_id required" });
    }

    const data = await collectReportRows({
      examId,
      batchId,
      scope,
      includeLive,
    });

    return res.json({
      ok: true,
      exam_id: examId,
      batch_id: batchId,
      scope,
      include_live: includeLive,
      count: data.rows.length,
      snapshot_count: data.snapshot_count,
      live_count: data.live_count,
      live_errors_count: data.live_errors.length,
      live_errors: data.live_errors.slice(0, 20),
      message:
        data.rows.length === 0
          ? "No report data found. Save marks and generate/publish results first."
          : undefined,
      table: data.rows,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e?.message || "Failed to load tabulation report",
    });
  }
}

async function meritList(req, res) {
  try {
    const examId = toInt(req.query.exam_id);
    const batchId = toInt(req.query.batch_id);
    const scope = parseScope(req.query.scope);
    const includeLive = parseBool(req.query.include_live, true);
    const limitRaw = toInt(req.query.limit);
    const limit = Math.min(500, Math.max(1, limitRaw || 10));

    if (!examId) {
      return res.status(400).json({ ok: false, message: "exam_id required" });
    }

    const data = await collectReportRows({
      examId,
      batchId,
      scope,
      includeLive,
    });

    const merit = data.rows
      .slice()
      .sort((a, b) => {
        const ga = Number(a.overall_gpa || 0);
        const gb = Number(b.overall_gpa || 0);
        if (ga !== gb) return gb - ga;
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      })
      .slice(0, limit)
      .map((r, idx) => ({ ...r, rank: idx + 1 }));

    return res.json({
      ok: true,
      exam_id: examId,
      batch_id: batchId,
      scope,
      include_live: includeLive,
      limit,
      count: merit.length,
      snapshot_count: data.snapshot_count,
      live_count: data.live_count,
      merit,
      message:
        merit.length === 0
          ? "No merit data found. Save marks and generate/publish results first."
          : undefined,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e?.message || "Failed to load merit list report",
    });
  }
}

async function passStats(req, res) {
  try {
    const examId = toInt(req.query.exam_id);
    const batchId = toInt(req.query.batch_id);
    const scope = parseScope(req.query.scope);
    const includeLive = parseBool(req.query.include_live, true);

    if (!examId) {
      return res.status(400).json({ ok: false, message: "exam_id required" });
    }

    const data = await collectReportRows({
      examId,
      batchId,
      scope,
      includeLive,
    });

    const total = data.rows.length;
    const passed = data.rows.filter((r) => String(r.result_status) === "PASS").length;
    const failed = data.rows.filter((r) => String(r.result_status) === "FAIL").length;
    const others = Math.max(0, total - passed - failed);
    const pass_percent = total > 0 ? Math.round((passed / total) * 10000) / 100 : 0;

    return res.json({
      ok: true,
      exam_id: examId,
      batch_id: batchId,
      scope,
      include_live: includeLive,
      total,
      passed,
      failed,
      others,
      pass_percent,
      snapshot_count: data.snapshot_count,
      live_count: data.live_count,
      message:
        total === 0
          ? "No statistics data found. Save marks and generate/publish results first."
          : undefined,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e?.message || "Failed to load pass statistics report",
    });
  }
}

module.exports = { tabulation, meritList, passStats };
