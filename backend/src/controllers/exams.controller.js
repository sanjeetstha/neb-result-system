const db = require("../db");

// Create exam
async function createExam(req, res) {
  const { campus_id, academic_year_id, class_id, faculty_id, name, exam_type, start_date, end_date } = req.body || {};
  if (!campus_id || !academic_year_id || !class_id || !faculty_id || !name) {
    return res.status(400).json({ ok: false, message: "campus_id, academic_year_id, class_id, faculty_id, name required" });
  }

  try {
    const [r] = await db.query(
      `INSERT INTO exams (campus_id, academic_year_id, class_id, faculty_id, name, exam_type, start_date, end_date, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [campus_id, academic_year_id, class_id, faculty_id, name, exam_type || "INTERNAL", start_date || null, end_date || null, req.user.uid]
    );
    res.json({ ok: true, exam_id: r.insertId });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Exam already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

// List exams
async function listExams(req, res) {
  const [rows] = await db.query(
    `SELECT e.*, c.name AS campus_name, ay.year_bs, cl.name AS class_name, f.name AS faculty_name
     FROM exams e
     JOIN campuses c ON c.id=e.campus_id
     JOIN academic_years ay ON ay.id=e.academic_year_id
     JOIN classes cl ON cl.id=e.class_id
     JOIN faculties f ON f.id=e.faculty_id
     ORDER BY e.id DESC`
  );
  res.json({ ok: true, exams: rows });
}

// Configure full marks for component codes in an exam
// async function setExamComponents(req, res) {
//   const [[exam]] = await db.query(`SELECT is_locked FROM exams WHERE id=? LIMIT 1`, [examId]);
//   if (exam?.is_locked) return res.status(423).json({ ok: false, message: "Exam is locked (published)" });
//   const examId = Number(req.params.examId);
//   const { components } = req.body || {};
//   // components = [{ component_code:"21", full_marks:75 }, ...]
//   if (!Array.isArray(components) || components.length === 0) {
//     return res.status(400).json({ ok: false, message: "components array required" });
//   }

//   // delete then insert (simple)
//   await db.query(`DELETE FROM exam_component_configs WHERE exam_id=?`, [examId]);

//   for (const c of components) {
//     if (!c.component_code || c.full_marks == null) continue;
//     await db.query(
//       `INSERT INTO exam_component_configs (exam_id, component_code, full_marks, pass_marks, is_enabled)
//        VALUES (?,?,?,?,?)`,
//       [examId, String(c.component_code), Number(c.full_marks), c.pass_marks != null ? Number(c.pass_marks) : null, c.is_enabled === false ? 0 : 1]
//     );
//   }

//   res.json({ ok: true, message: "Exam components configured" });
// }

async function setExamComponents(req, res) {
  const examId = Number(req.params.examId);
  if (!Number.isFinite(examId)) {
    return res.status(400).json({ ok: false, message: "Invalid examId" });
  }

  // lock check (must be AFTER examId is defined)
  const [[exam]] = await db.query(`SELECT is_locked FROM exams WHERE id=? LIMIT 1`, [examId]);
  if (exam?.is_locked) {
    return res.status(423).json({ ok: false, message: "Exam is locked (published)" });
  }

  const { components } = req.body || {};
  // components = [{ component_code:"21", full_marks:75 }, ...]
  if (!Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ ok: false, message: "components array required" });
  }

  // delete then insert (simple)
  await db.query(`DELETE FROM exam_component_configs WHERE exam_id=?`, [examId]);

  for (const c of components) {
    if (!c.component_code || c.full_marks == null) continue;

    await db.query(
      `INSERT INTO exam_component_configs (exam_id, component_code, full_marks, pass_marks, is_enabled)
       VALUES (?,?,?,?,?)`,
      [
        examId,
        String(c.component_code).trim(),
        Number(c.full_marks),
        c.pass_marks != null ? Number(c.pass_marks) : null,
        c.is_enabled === false ? 0 : 1,
      ]
    );
  }

  res.json({ ok: true, message: "Exam components configured" });
}


module.exports = { createExam, listExams, setExamComponents };
