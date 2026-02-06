const db = require("../db");

async function createStudent(req, res) {
  const {
    full_name, dob, symbol_no, regd_no, roll_no,
    campus_id, academic_year_id, class_id, faculty_id, section_id
  } = req.body || {};

  if (!full_name || !campus_id || !academic_year_id || !class_id || !faculty_id || !section_id) {
    return res.status(400).json({ ok: false, message: "full_name + campus_id + academic_year_id + class_id + faculty_id + section_id required" });
  }

  // create student
  const [r1] = await db.query(
    `INSERT INTO students (full_name, dob, symbol_no, regd_no, roll_no)
     VALUES (?,?,?,?,?)`,
    [full_name, dob || null, symbol_no || null, regd_no || null, roll_no || null]
  );

  // enrollment
  const [r2] = await db.query(
    `INSERT INTO student_enrollments (student_id, campus_id, academic_year_id, class_id, faculty_id, section_id)
     VALUES (?,?,?,?,?,?)`,
    [r1.insertId, campus_id, academic_year_id, class_id, faculty_id, section_id]
  );

  res.json({ ok: true, student_id: r1.insertId, enrollment_id: r2.insertId });
}

async function listStudents(req, res) {
  const section_id = req.query.section_id ? Number(req.query.section_id) : null;

  let sql = `
    SELECT e.id AS enrollment_id, s.id AS student_id, s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob,
           ay.year_bs AS academic_year, c.name AS class, f.name AS faculty, sec.name AS section
    FROM student_enrollments e
    JOIN students s ON s.id=e.student_id
    JOIN academic_years ay ON ay.id=e.academic_year_id
    JOIN classes c ON c.id=e.class_id
    JOIN faculties f ON f.id=e.faculty_id
    JOIN sections sec ON sec.id=e.section_id
  `;
  const params = [];

  if (section_id) {
    sql += ` WHERE e.section_id=? `;
    params.push(section_id);
  }

  sql += ` ORDER BY s.full_name ASC`;

  const [rows] = await db.query(sql, params);
  res.json({ ok: true, students: rows });
}

async function updateStudent(req, res) {
  const id = Number(req.params.studentId);
  if (!id) return res.status(400).json({ ok: false, message: "Invalid student id" });

  const { full_name, dob, symbol_no, regd_no, roll_no } = req.body || {};
  if (!full_name || !symbol_no) {
    return res.status(400).json({ ok: false, message: "full_name and symbol_no required" });
  }

  try {
    await db.query(
      `UPDATE students
       SET full_name=?, dob=?, symbol_no=?, regd_no=?, roll_no=?
       WHERE id=?`,
      [full_name, dob || null, symbol_no, regd_no || null, roll_no || null, id]
    );
    res.json({ ok: true, message: "Student updated" });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Duplicate student record" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function setOptionalChoices(req, res) {
  const enrollmentId = Number(req.params.enrollmentId);
  const { choices } = req.body || {};
  // choices = [{ group_name: "Opt. 1st", subject_id: 4 }, ...]
  if (!Array.isArray(choices) || choices.length === 0) {
    return res.status(400).json({ ok: false, message: "choices array required" });
  }

  // Upsert: delete existing then insert new
  await db.query(`DELETE FROM student_optional_choices WHERE enrollment_id=?`, [enrollmentId]);

  for (const ch of choices) {
    if (!ch.group_name || !ch.subject_id) continue;
    await db.query(
      `INSERT INTO student_optional_choices (enrollment_id, group_name, subject_id)
       VALUES (?,?,?)`,
      [enrollmentId, ch.group_name, ch.subject_id]
    );
  }

  res.json({ ok: true, message: "Optional choices saved" });
}

async function getStudentProfile(req, res) {
  const enrollmentId = Number(req.params.enrollmentId);

  const [[en]] = await db.query(
    `SELECT e.id AS enrollment_id, s.id AS student_id, s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob,
            e.campus_id, e.academic_year_id, e.class_id, e.faculty_id, e.section_id
     FROM student_enrollments e
     JOIN students s ON s.id=e.student_id
     WHERE e.id=? LIMIT 1`,
    [enrollmentId]
  );
  if (!en) return res.status(404).json({ ok: false, message: "Enrollment not found" });

  // catalog groups for that year/class (faculty is NULL currently)
  const [groups] = await db.query(
    `SELECT id, name, sort_order
     FROM catalog_groups
     WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL
     ORDER BY sort_order ASC`,
    [en.academic_year_id, en.class_id]
  );

  const groupByName = new Map(groups.map(g => [g.name, g]));

  // compulsory subjects
  const compulsory = groupByName.get("COMPULSORY");
  let compulsorySubjects = [];
  if (compulsory) {
    const [rows] = await db.query(
      `SELECT s.id, s.name
       FROM catalog_group_subjects cgs
       JOIN subjects s ON s.id=cgs.subject_id
       WHERE cgs.catalog_group_id=?
       ORDER BY cgs.sort_order ASC`,
      [compulsory.id]
    );
    compulsorySubjects = rows;
  }

  // optional choices selected
  const [choices] = await db.query(
    `SELECT group_name, subject_id FROM student_optional_choices WHERE enrollment_id=?`,
    [enrollmentId]
  );

  const chosenSubjectIds = choices.map(c => c.subject_id);
  const [chosenSubjects] = chosenSubjectIds.length
    ? await db.query(`SELECT id, name FROM subjects WHERE id IN (?) ORDER BY name ASC`, [chosenSubjectIds])
    : [[], null];

  // components for all subjects (compulsory + chosen)
  const allSubjectIds = [...new Set([...compulsorySubjects.map(s => s.id), ...chosenSubjectIds])];
  const [components] = allSubjectIds.length
    ? await db.query(
        `SELECT subject_id, component_type, component_code, component_title, credit_hour
         FROM subject_components
         WHERE subject_id IN (?)
         ORDER BY subject_id ASC, FIELD(component_type,'TH','PR','IN')`,
        [allSubjectIds]
      )
    : [[], null];

  const compsBySubject = new Map();
  for (const c of components) {
    if (!compsBySubject.has(c.subject_id)) compsBySubject.set(c.subject_id, []);
    compsBySubject.get(c.subject_id).push(c);
  }

  res.json({
    ok: true,
    enrollment: en,
    compulsory_subjects: compulsorySubjects.map(s => ({ ...s, components: compsBySubject.get(s.id) || [] })),
    optional_choices: choices,
    optional_subjects: chosenSubjects.map(s => ({ ...s, components: compsBySubject.get(s.id) || [] }))
  });
}





module.exports = { createStudent, listStudents, updateStudent, setOptionalChoices, getStudentProfile };
