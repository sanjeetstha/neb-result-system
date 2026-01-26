const db = require("../db");

// Upsert marks list for one student enrollment in one exam
async function upsertMarks(req, res) {
  const examId = Number(req.params.examId);
  const enrollmentId = Number(req.params.enrollmentId);
  const { marks } = req.body || {};
  const [[exam]] = await db.query(`SELECT is_locked FROM exams WHERE id=? LIMIT 1`, [examId]);
  if (exam?.is_locked) return res.status(423).json({ ok: false, message: "Exam is locked (published)" });

  // marks = [{ component_code:"21", marks_obtained:55, is_absent:false }, ...]
  if (!Array.isArray(marks) || marks.length === 0) {
    return res.status(400).json({ ok: false, message: "marks array required" });
  }

  for (const m of marks) {
    if (!m.component_code) continue;

    const code = String(m.component_code);
    const is_absent = m.is_absent ? 1 : 0;
    const obtained = is_absent ? null : (m.marks_obtained != null ? Number(m.marks_obtained) : null);

    await db.query(
      `INSERT INTO marks (exam_id, enrollment_id, component_code, marks_obtained, is_absent, entered_by, entered_at, updated_by, updated_at)
       VALUES (?,?,?,?,?,?,NOW(),?,NOW())
       ON DUPLICATE KEY UPDATE
         marks_obtained=VALUES(marks_obtained),
         is_absent=VALUES(is_absent),
         updated_by=VALUES(updated_by),
         updated_at=NOW()`,
      [examId, enrollmentId, code, obtained, is_absent, req.user.uid, req.user.uid]
    );
  }

  res.json({ ok: true, message: "Marks saved" });
}

// Get mark ledger view for a student in an exam (uses student profile subjects)
async function getStudentMarkLedger(req, res) {
  const examId = Number(req.params.examId);
  const enrollmentId = Number(req.params.enrollmentId);

  // fetch all components relevant to student (compulsory + optionals)
  const [profileRows] = await db.query(
    `SELECT e.academic_year_id, e.class_id
     FROM student_enrollments e WHERE e.id=? LIMIT 1`,
    [enrollmentId]
  );
  if (profileRows.length === 0) return res.status(404).json({ ok: false, message: "Enrollment not found" });

  // get compulsory subjects
  const [[cg]] = await db.query(
    `SELECT id FROM catalog_groups
     WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL AND name='COMPULSORY'
     LIMIT 1`,
    [profileRows[0].academic_year_id, profileRows[0].class_id]
  );

  let subjectIds = [];
  if (cg) {
    const [cs] = await db.query(`SELECT subject_id FROM catalog_group_subjects WHERE catalog_group_id=?`, [cg.id]);
    subjectIds.push(...cs.map(x => x.subject_id));
  }

  // optionals
  const [ops] = await db.query(`SELECT subject_id FROM student_optional_choices WHERE enrollment_id=?`, [enrollmentId]);
  subjectIds.push(...ops.map(x => x.subject_id));
  subjectIds = [...new Set(subjectIds)];

  const [components] = await db.query(
    `SELECT sc.subject_id, s.name AS subject_name, sc.component_type, sc.component_code, sc.component_title, sc.credit_hour
     FROM subject_components sc
     JOIN subjects s ON s.id=sc.subject_id
     WHERE sc.subject_id IN (?)
     ORDER BY s.name ASC, FIELD(sc.component_type,'TH','PR','IN')`,
    [subjectIds]
  );

  const [configs] = await db.query(
    `SELECT component_code, full_marks, is_enabled
     FROM exam_component_configs
     WHERE exam_id=?`,
    [examId]
  );
  const cfgByCode = new Map(configs.map(c => [c.component_code, c]));

  const [saved] = await db.query(
    `SELECT component_code, marks_obtained, is_absent
     FROM marks
     WHERE exam_id=? AND enrollment_id=?`,
    [examId, enrollmentId]
  );
  const markByCode = new Map(saved.map(m => [m.component_code, m]));

  const out = components.map(c => {
    const cfg = cfgByCode.get(c.component_code) || null;
    const mk = markByCode.get(c.component_code) || null;
    return {
      subject_id: c.subject_id,
      subject_name: c.subject_name,
      component_type: c.component_type,
      component_code: c.component_code,
      title: c.component_title,
      credit_hour: c.credit_hour,
      full_marks: cfg ? Number(cfg.full_marks) : null,
      enabled_in_exam: cfg ? !!cfg.is_enabled : false,
      marks_obtained: mk ? mk.marks_obtained : null,
      is_absent: mk ? !!mk.is_absent : false
    };
  });

  res.json({ ok: true, exam_id: examId, enrollment_id: enrollmentId, ledger: out });
}

module.exports = { upsertMarks, getStudentMarkLedger };
