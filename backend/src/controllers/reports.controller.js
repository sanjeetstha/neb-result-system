const db = require("../db");

async function tabulation(req, res) {
  const examId = Number(req.query.exam_id);
  const sectionId = Number(req.query.section_id);

  if (!examId || !sectionId) {
    return res.status(400).json({ ok: false, message: "exam_id and section_id required" });
  }

  // Only published snapshots (stable)
  const [rows] = await db.query(
    `SELECT rs.enrollment_id, rs.overall_gpa, rs.final_grade, rs.result_status, rs.payload_json,
            s.full_name, s.roll_no, s.symbol_no, s.regd_no
     FROM result_snapshots rs
     JOIN student_enrollments e ON e.id=rs.enrollment_id
     JOIN students s ON s.id=e.student_id
     WHERE rs.exam_id=? AND rs.published_at IS NOT NULL AND e.section_id=?
     ORDER BY CAST(s.roll_no AS UNSIGNED), s.full_name ASC`,
    [examId, sectionId]
  );

  const table = rows.map(r => {
    let payload = null;
    try { payload = JSON.parse(r.payload_json); } catch { payload = null; }

    return {
      enrollment_id: r.enrollment_id,
      roll_no: r.roll_no,
      symbol_no: r.symbol_no,
      regd_no: r.regd_no,
      full_name: r.full_name,
      overall_gpa: Number(r.overall_gpa),
      final_grade: r.final_grade,
      result_status: r.result_status,
      subjects: payload?.subjects || []
    };
  });

  res.json({ ok: true, exam_id: examId, section_id: sectionId, count: table.length, table });
}

async function meritList(req, res) {
  const examId = Number(req.query.exam_id);
  const sectionId = req.query.section_id ? Number(req.query.section_id) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 10;

  if (!examId) return res.status(400).json({ ok: false, message: "exam_id required" });

  let sql =
    `SELECT rs.enrollment_id, rs.overall_gpa, rs.final_grade, rs.result_status,
            s.full_name, s.roll_no, s.symbol_no
     FROM result_snapshots rs
     JOIN student_enrollments e ON e.id=rs.enrollment_id
     JOIN students s ON s.id=e.student_id
     WHERE rs.exam_id=? AND rs.published_at IS NOT NULL`;
  const params = [examId];

  if (sectionId) {
    sql += ` AND e.section_id=?`;
    params.push(sectionId);
  }

  sql += ` ORDER BY rs.overall_gpa DESC, s.full_name ASC LIMIT ?`;
  params.push(limit);

  const [rows] = await db.query(sql, params);

  res.json({ ok: true, exam_id: examId, section_id: sectionId, limit, merit: rows });
}

async function passStats(req, res) {
  const examId = Number(req.query.exam_id);
  const sectionId = req.query.section_id ? Number(req.query.section_id) : null;

  if (!examId) return res.status(400).json({ ok: false, message: "exam_id required" });

  let where = `WHERE rs.exam_id=? AND rs.published_at IS NOT NULL`;
  const params = [examId];

  if (sectionId) {
    where += ` AND e.section_id=?`;
    params.push(sectionId);
  }

  const [[stats]] = await db.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN rs.result_status='PASS' THEN 1 ELSE 0 END) AS passed,
       SUM(CASE WHEN rs.result_status='FAIL' THEN 1 ELSE 0 END) AS failed
     FROM result_snapshots rs
     JOIN student_enrollments e ON e.id=rs.enrollment_id
     ${where}`,
    params
  );

  const total = Number(stats.total || 0);
  const passed = Number(stats.passed || 0);
  const failed = Number(stats.failed || 0);
  const pass_percent = total > 0 ? Math.round((passed / total) * 10000) / 100 : 0;

  res.json({ ok: true, exam_id: examId, section_id: sectionId, total, passed, failed, pass_percent });
}

module.exports = { tabulation, meritList, passStats };
