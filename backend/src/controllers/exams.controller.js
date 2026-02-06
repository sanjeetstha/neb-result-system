const db = require("../db");

// Create exam
async function createExam(req, res) {
  const {
    campus_id,
    academic_year_id,
    class_id,
    faculty_id,
    name,
    exam_type,
    start_date,
    end_date,
    grading_scheme_id,
  } = req.body || {};

  if (!campus_id || !academic_year_id || !class_id || !name) {
    return res
      .status(400)
      .json({ ok: false, message: "campus_id, academic_year_id, class_id, name required" });
  }

  let schemeId = grading_scheme_id ? Number(grading_scheme_id) : null;
  if (!schemeId) {
    const [[gs]] = await db.query(
      `SELECT id FROM grading_schemes ORDER BY id ASC LIMIT 1`
    );
    schemeId = gs?.id || null;
  }

  let facultyId = faculty_id ? Number(faculty_id) : null;
  if (!facultyId) {
    const [[f]] = await db.query(`SELECT id FROM faculties ORDER BY id ASC LIMIT 1`);
    facultyId = f?.id || null;
  }

  try {
    const [r] = await db.query(
      `INSERT INTO exams (campus_id, academic_year_id, class_id, faculty_id, name, exam_type, start_date, end_date, grading_scheme_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        campus_id,
        academic_year_id,
        class_id,
        facultyId,
        name,
        exam_type || "INTERNAL",
        start_date || null,
        end_date || null,
        schemeId,
        req.user.uid,
      ]
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
     LEFT JOIN faculties f ON f.id=e.faculty_id
     ORDER BY e.id DESC`
  );
  res.json({ ok: true, exams: rows });
}

// Get components catalog + current config for one exam
async function getExamComponents(req, res) {
  const examId = Number(req.params.examId);
  if (!Number.isFinite(examId)) {
    return res.status(400).json({ ok: false, message: "Invalid examId" });
  }

  const [[exam]] = await db.query(
    `SELECT id, name, campus_id, academic_year_id, class_id, faculty_id, is_locked, published_at
     FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });

  // catalog groups for that year/class (faculty is NULL currently)
  const [groups] = await db.query(
    `SELECT id, name, sort_order
     FROM catalog_groups
     WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL
     ORDER BY sort_order ASC, id ASC`,
    [exam.academic_year_id, exam.class_id]
  );

  const groupIds = groups.map((g) => g.id);
  if (groupIds.length === 0) {
    return res.json({ ok: true, exam, groups: [] });
  }

  const [groupSubjects] = await db.query(
    `SELECT cgs.catalog_group_id, cgs.sort_order,
            s.id AS subject_id, s.name AS subject_name
     FROM catalog_group_subjects cgs
     JOIN subjects s ON s.id=cgs.subject_id
     WHERE cgs.catalog_group_id IN (?)
     ORDER BY cgs.catalog_group_id ASC, cgs.sort_order ASC`,
    [groupIds]
  );

  const subjectIds = [...new Set(groupSubjects.map((x) => x.subject_id))];
  if (subjectIds.length === 0) {
    return res.json({ ok: true, exam, groups: [] });
  }

  const [components] = await db.query(
    `SELECT subject_id, component_type, component_code, component_title, credit_hour
     FROM subject_components
     WHERE subject_id IN (?)
     ORDER BY subject_id ASC, FIELD(component_type,'TH','PR','IN'), component_code ASC`,
    [subjectIds]
  );

  const [configs] = await db.query(
    `SELECT component_code, full_marks, pass_marks, is_enabled
     FROM exam_component_configs
     WHERE exam_id=?`,
    [examId]
  );
  const cfgByCode = new Map(configs.map((c) => [String(c.component_code), c]));

  const compsBySubject = new Map();
  for (const c of components) {
    if (!compsBySubject.has(c.subject_id)) compsBySubject.set(c.subject_id, []);
    const cfg = cfgByCode.get(String(c.component_code)) || null;
    compsBySubject.get(c.subject_id).push({
      component_type: c.component_type,
      component_code: String(c.component_code),
      component_title: c.component_title,
      credit_hour: c.credit_hour,
      full_marks: cfg ? Number(cfg.full_marks) : null,
      pass_marks: cfg ? (cfg.pass_marks != null ? Number(cfg.pass_marks) : null) : null,
      is_enabled: cfg ? !!cfg.is_enabled : false,
    });
  }

  const groupsOut = groups.map((g) => {
    const subs = groupSubjects
      .filter((gs) => gs.catalog_group_id === g.id)
      .map((gs) => ({
        id: gs.subject_id,
        name: gs.subject_name,
        components: compsBySubject.get(gs.subject_id) || [],
      }));

    return { id: g.id, name: g.name, sort_order: g.sort_order, subjects: subs };
  });

  res.json({ ok: true, exam, groups: groupsOut });
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


module.exports = { createExam, listExams, getExamComponents, setExamComponents };
