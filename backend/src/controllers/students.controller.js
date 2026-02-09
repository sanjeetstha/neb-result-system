const db = require("../db");
const { verifyPassword } = require("../utils/crypto");

async function createStudent(req, res) {
  const {
    full_name, dob, symbol_no, regd_no, roll_no,
    campus_id, academic_year_id, class_id, faculty_id, batch_id
  } = req.body || {};

  if (!full_name || !class_id || !batch_id) {
    return res.status(400).json({ ok: false, message: "full_name + class_id + batch_id required" });
  }

  // Resolve academic year from batch if not provided
  let resolvedAcademicYearId = academic_year_id ? Number(academic_year_id) : null;
  if (!resolvedAcademicYearId) {
    const [[ay]] = await db.query(
      `SELECT id FROM academic_years WHERE batch_id=? ORDER BY id DESC LIMIT 1`,
      [batch_id]
    );
    resolvedAcademicYearId = ay?.id || null;
  }
  if (!resolvedAcademicYearId) {
    return res.status(400).json({ ok: false, message: "academic_year_id not found for batch" });
  }

  // Resolve campus/faculty if not provided
  let resolvedCampusId = campus_id ? Number(campus_id) : null;
  if (!resolvedCampusId) {
    const [[campus]] = await db.query(`SELECT id FROM campuses ORDER BY id ASC LIMIT 1`);
    resolvedCampusId = campus?.id || null;
  }
  if (!resolvedCampusId) {
    return res.status(400).json({ ok: false, message: "campus_id required" });
  }

  let resolvedFacultyId = faculty_id ? Number(faculty_id) : null;
  if (!resolvedFacultyId) {
    const [[fac]] = await db.query(`SELECT id FROM faculties ORDER BY id ASC LIMIT 1`);
    resolvedFacultyId = fac?.id || null;
  }
  if (!resolvedFacultyId) {
    return res.status(400).json({ ok: false, message: "faculty_id required" });
  }

  // create student
  const [r1] = await db.query(
    `INSERT INTO students (full_name, dob, symbol_no, regd_no, roll_no)
     VALUES (?,?,?,?,?)`,
    [full_name, dob || null, symbol_no || null, regd_no || null, roll_no || null]
  );

  // enrollment
  const [r2] = await db.query(
    `INSERT INTO student_enrollments (student_id, campus_id, academic_year_id, class_id, faculty_id, batch_id)
     VALUES (?,?,?,?,?,?)`,
    [r1.insertId, resolvedCampusId, resolvedAcademicYearId, class_id, resolvedFacultyId, batch_id]
  );

  res.json({ ok: true, student_id: r1.insertId, enrollment_id: r2.insertId });
}

async function listStudents(req, res) {
  const batch_id = req.query.batch_id ? Number(req.query.batch_id) : null;
  const class_id = req.query.class_id ? Number(req.query.class_id) : null;

  try {
    let sql = `
      SELECT e.id AS enrollment_id, s.id AS student_id, s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob,
             ay.year_bs AS academic_year, c.name AS class, f.name AS faculty, b.name AS batch
      FROM student_enrollments e
      JOIN students s ON s.id=e.student_id
      JOIN academic_years ay ON ay.id=e.academic_year_id
      JOIN classes c ON c.id=e.class_id
      JOIN faculties f ON f.id=e.faculty_id
      LEFT JOIN batches b ON b.id=e.batch_id
    `;
    const params = [];

    if (batch_id) {
      sql += ` WHERE e.batch_id=? `;
      params.push(batch_id);
    }
    if (class_id) {
      sql += batch_id ? ` AND e.class_id=? ` : ` WHERE e.class_id=? `;
      params.push(class_id);
    }

    sql += ` ORDER BY s.full_name ASC`;

    const [rows] = await db.query(sql, params);
    res.json({ ok: true, students: rows });
  } catch (e) {
    res.json({
      ok: false,
      message: e?.message || "Failed to load students",
      students: [],
    });
  }
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
            e.campus_id, e.academic_year_id, e.class_id, e.faculty_id, e.batch_id
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

// Delete a single student enrollment (Admin/Super Admin)
async function deleteStudentEnrollment(req, res) {
  const enrollmentId = Number(req.params.enrollmentId);
  const password = String(req.body?.password || "").trim();

  if (!enrollmentId) {
    return res.status(400).json({ ok: false, message: "Invalid enrollment id" });
  }
  if (!password) {
    return res.status(400).json({ ok: false, message: "password required" });
  }

  const [[user]] = await db.query(
    `SELECT password_hash FROM users WHERE id=? LIMIT 1`,
    [req.user.uid]
  );
  if (!user?.password_hash) {
    return res.status(401).json({ ok: false, message: "User not found" });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, message: "Invalid password" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[en]] = await conn.query(
      `SELECT id, student_id FROM student_enrollments WHERE id=? LIMIT 1`,
      [enrollmentId]
    );
    if (!en) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Enrollment not found" });
    }

    const [rOpts] = await conn.query(
      `DELETE FROM student_optional_choices WHERE enrollment_id=?`,
      [enrollmentId]
    );
    const [rMarks] = await conn.query(
      `DELETE FROM marks WHERE enrollment_id=?`,
      [enrollmentId]
    );
    const [rSnaps] = await conn.query(
      `DELETE FROM result_snapshots WHERE enrollment_id=?`,
      [enrollmentId]
    );
    const [rActs] = await conn.query(
      `DELETE FROM result_actions WHERE enrollment_id=?`,
      [enrollmentId]
    );
    const [rReq] = await conn.query(
      `DELETE FROM mark_change_requests WHERE enrollment_id=?`,
      [enrollmentId]
    );
    const [rEnroll] = await conn.query(
      `DELETE FROM student_enrollments WHERE id=?`,
      [enrollmentId]
    );
    const [rStudent] = await conn.query(
      `DELETE s FROM students s
       LEFT JOIN student_enrollments e ON e.student_id=s.id
       WHERE e.id IS NULL AND s.id=?`,
      [en.student_id]
    );

    await conn.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.user.uid,
        "STUDENT_ENROLLMENT_DELETED",
        "student_enrollments",
        String(enrollmentId),
        req.ip || null,
        req.headers["user-agent"] || null,
        JSON.stringify({
          enrollment_id: enrollmentId,
          student_id: en.student_id,
          deleted: {
            enrollments: rEnroll.affectedRows,
            students: rStudent.affectedRows,
            optional_choices: rOpts.affectedRows,
            marks: rMarks.affectedRows,
            snapshots: rSnaps.affectedRows,
            actions: rActs.affectedRows,
            corrections: rReq.affectedRows,
          },
        }),
      ]
    );

    await conn.commit();

    return res.json({
      ok: true,
      message: "Student deleted",
      deleted: {
        enrollments: rEnroll.affectedRows,
        students: rStudent.affectedRows,
        optional_choices: rOpts.affectedRows,
        marks: rMarks.affectedRows,
        snapshots: rSnaps.affectedRows,
        actions: rActs.affectedRows,
        corrections: rReq.affectedRows,
      },
    });
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: e?.message || "Delete failed" });
  } finally {
    conn.release();
  }
}
// Delete a set of students by batch + class (Admin/Super Admin)
async function deleteStudentsBulk(req, res) {
  const batch_id = Number(req.body?.batch_id || req.query?.batch_id || 0);
  const class_id = Number(req.body?.class_id || req.query?.class_id || 0);
  const password = String(req.body?.password || "").trim();

  if (!batch_id || !class_id) {
    return res.status(400).json({ ok: false, message: "batch_id and class_id required" });
  }
  if (!password) {
    return res.status(400).json({ ok: false, message: "password required" });
  }

  const [[user]] = await db.query(
    `SELECT password_hash FROM users WHERE id=? LIMIT 1`,
    [req.user.uid]
  );
  if (!user?.password_hash) {
    return res.status(401).json({ ok: false, message: "User not found" });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, message: "Invalid password" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [enrollments] = await conn.query(
      `SELECT id, student_id FROM student_enrollments WHERE batch_id=? AND class_id=?`,
      [batch_id, class_id]
    );

    if (enrollments.length === 0) {
      await conn.rollback();
      return res.json({ ok: true, message: "No students found for batch/class", deleted: {} });
    }

    const enrollmentIds = enrollments.map((e) => e.id);
    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];

    const [rOpts] = await conn.query(
      `DELETE FROM student_optional_choices WHERE enrollment_id IN (?)`,
      [enrollmentIds]
    );
    const [rMarks] = await conn.query(
      `DELETE FROM marks WHERE enrollment_id IN (?)`,
      [enrollmentIds]
    );
    const [rSnaps] = await conn.query(
      `DELETE FROM result_snapshots WHERE enrollment_id IN (?)`,
      [enrollmentIds]
    );
    const [rActs] = await conn.query(
      `DELETE FROM result_actions WHERE enrollment_id IN (?)`,
      [enrollmentIds]
    );
    const [rReq] = await conn.query(
      `DELETE FROM mark_change_requests WHERE enrollment_id IN (?)`,
      [enrollmentIds]
    );
    const [rEnroll] = await conn.query(
      `DELETE FROM student_enrollments WHERE id IN (?)`,
      [enrollmentIds]
    );
    const [rStudents] = await conn.query(
      `DELETE s FROM students s
       LEFT JOIN student_enrollments e ON e.student_id=s.id
       WHERE e.id IS NULL AND s.id IN (?)`,
      [studentIds]
    );

    await conn.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.user.uid,
        "STUDENTS_BULK_DELETED",
        "student_enrollments",
        `${batch_id}:${class_id}`,
        req.ip || null,
        req.headers["user-agent"] || null,
        JSON.stringify({
          batch_id,
          class_id,
          deleted: {
            enrollments: rEnroll.affectedRows,
            students: rStudents.affectedRows,
            optional_choices: rOpts.affectedRows,
            marks: rMarks.affectedRows,
            snapshots: rSnaps.affectedRows,
            actions: rActs.affectedRows,
            corrections: rReq.affectedRows,
          },
        }),
      ]
    );

    await conn.commit();

    return res.json({
      ok: true,
      message: "Students deleted",
      deleted: {
        enrollments: rEnroll.affectedRows,
        students: rStudents.affectedRows,
        optional_choices: rOpts.affectedRows,
        marks: rMarks.affectedRows,
        snapshots: rSnaps.affectedRows,
        actions: rActs.affectedRows,
        corrections: rReq.affectedRows,
      },
    });
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: e?.message || "Delete failed" });
  } finally {
    conn.release();
  }
}




module.exports = { createStudent, listStudents, updateStudent, setOptionalChoices, getStudentProfile, deleteStudentsBulk, deleteStudentEnrollment };
