const db = require("../db");

function norm(s) {
  return String(s ?? "").trim();
}

async function listPublishedExams(req, res) {
  const [rows] = await db.query(
    `SELECT e.id AS exam_id, e.name, e.exam_type, e.published_at,
            c.name AS campus, ay.year_bs AS academic_year, cl.name AS class,
            COALESCE(f.name, 'All Faculties') AS faculty
     FROM exams e
     JOIN campuses c ON c.id=e.campus_id
     JOIN academic_years ay ON ay.id=e.academic_year_id
     JOIN classes cl ON cl.id=e.class_id
     LEFT JOIN faculties f ON f.id=e.faculty_id
     WHERE e.published_at IS NOT NULL AND e.is_locked=1
     ORDER BY e.published_at DESC, e.id DESC`
  );

  res.json({ ok: true, exams: rows });
}

async function searchPublishedResult(req, res) {
  const exam_id = Number(req.body?.exam_id);
  const symbol_no = norm(req.body?.symbol_no);
  const dob = norm(req.body?.dob); // expect YYYY-MM-DD

  if (!exam_id || !symbol_no || !dob) {
    return res.status(400).json({ ok: false, message: "exam_id, symbol_no, dob (YYYY-MM-DD) required" });
  }

  // ensure exam is published/locked
  const [[exam]] = await db.query(
    `SELECT id FROM exams WHERE id=? AND published_at IS NOT NULL AND is_locked=1 LIMIT 1`,
    [exam_id]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Published exam not found" });

  // find published snapshot for this student (symbol + dob)
  const [rows] = await db.query(
    `SELECT rs.payload_json, rs.overall_gpa, rs.final_grade, rs.result_status, rs.published_at,
            s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob
     FROM result_snapshots rs
     JOIN student_enrollments e ON e.id=rs.enrollment_id
     JOIN students s ON s.id=e.student_id
     WHERE rs.exam_id=? AND rs.published_at IS NOT NULL
       AND s.symbol_no=? AND DATE(s.dob)=DATE(?)
     LIMIT 1`,
    [exam_id, symbol_no, dob]
  );

  if (!rows.length) {
    return res.status(404).json({ ok: false, message: "Result not found (check symbol no / DOB / exam)" });
  }

  const r = rows[0];
  let payload = null;
  try { payload = JSON.parse(r.payload_json); } catch { payload = null; }

  // Return minimal, safe info + full payload
  return res.json({
    ok: true,
    student: {
      full_name: r.full_name,
      symbol_no: r.symbol_no,
      regd_no: r.regd_no,
      roll_no: r.roll_no,
      dob: r.dob
    },
    published_at: r.published_at,
    summary: {
      overall_gpa: Number(r.overall_gpa),
      final_grade: r.final_grade,
      result_status: r.result_status
    },
    result: payload
  });
}

async function getPublishedResultByPath(req, res) {
  const exam_id = Number(req.params.examId);
  const symbol_no = norm(req.params.symbolNo);
  const dob = norm(req.query.dob);

  req.body = { exam_id, symbol_no, dob };
  return searchPublishedResult(req, res);
}

module.exports = { listPublishedExams, searchPublishedResult, getPublishedResultByPath };
