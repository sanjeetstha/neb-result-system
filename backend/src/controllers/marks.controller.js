const db = require("../db");
const {
  getCompulsorySubjectIds,
  getAllowedOptionalChoicesForEnrollment,
} = require("../services/subjectSelection.service");

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
    const raw =
      m.marks_obtained != null
        ? m.marks_obtained
        : m.marks != null
        ? m.marks
        : m.obtained != null
        ? m.obtained
        : m.value;
    const obtained =
      is_absent || raw == null || raw === "" ? null : Number(raw);

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

  try {
    // fetch all components relevant to student (compulsory + optionals)
    const [[enrollment]] = await db.query(
      `SELECT e.academic_year_id, e.class_id
       FROM student_enrollments e WHERE e.id=? LIMIT 1`,
      [enrollmentId]
    );
    if (!enrollment) return res.status(404).json({ ok: false, message: "Enrollment not found" });

    const compulsoryIds = await getCompulsorySubjectIds(
      enrollment.academic_year_id,
      enrollment.class_id
    );
    const [rawChoices] = await db.query(
      `SELECT group_name, subject_id
       FROM student_optional_choices
       WHERE enrollment_id=?`,
      [enrollmentId]
    );
    const normalizedOptional = await getAllowedOptionalChoicesForEnrollment(
      enrollmentId,
      rawChoices
    );
    const optionalIds = normalizedOptional.choices
      .map((c) => Number(c.subject_id))
      .filter(Boolean);
    const subjectIds = [...new Set([...compulsoryIds, ...optionalIds])];

    if (subjectIds.length === 0) {
      return res.json({
        ok: true,
        exam_id: examId,
        enrollment_id: enrollmentId,
        optional_choices: normalizedOptional.choices,
        optional_choice_codes: [],
        ledger: [],
      });
    }

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

    const thCodeBySubjectId = new Map();
    const subjectNameById = new Map();
    for (const c of components) {
      const sid = Number(c.subject_id);
      if (!sid) continue;
      if (!subjectNameById.has(sid)) subjectNameById.set(sid, c.subject_name || "");
      if (String(c.component_type || "").toUpperCase() === "TH" && !thCodeBySubjectId.has(sid)) {
        thCodeBySubjectId.set(sid, String(c.component_code || "").trim());
      }
    }

    const optionalChoiceCodes = normalizedOptional.choices.map((ch) => {
      const sid = Number(ch.subject_id);
      return {
        group_name: ch.group_name,
        subject_id: sid,
        subject_name: subjectNameById.get(sid) || "",
        component_code: thCodeBySubjectId.get(sid) || null,
      };
    });

    res.json({
      ok: true,
      exam_id: examId,
      enrollment_id: enrollmentId,
      optional_choices: normalizedOptional.choices,
      optional_choice_codes: optionalChoiceCodes,
      ledger: out,
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e?.message || "Failed to load ledger" });
  }
}

module.exports = { upsertMarks, getStudentMarkLedger };
