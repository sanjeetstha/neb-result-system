const db = require("../db");
const { verifyPassword } = require("../utils/crypto");

async function listCampuses(req, res) {
  const [rows] = await db.query(`SELECT * FROM campuses ORDER BY id DESC`);
  res.json({ ok: true, campuses: rows });
}

async function createCampus(req, res) {
  const { code, name, address, phone, email } = req.body || {};
  if (!code || !name) return res.status(400).json({ ok: false, message: "code and name required" });

  try {
    const [r] = await db.query(
      `INSERT INTO campuses (code, name, address, phone, email) VALUES (?,?,?,?,?)`,
      [code, name, address || null, phone || null, email || null]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Campus code already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function updateCampus(req, res) {
  const id = Number(req.params.id);
  const { code, name, address, phone, email } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid campus id" });
  if (!code || !name) return res.status(400).json({ ok: false, message: "code and name required" });

  try {
    await db.query(
      `UPDATE campuses SET code=?, name=?, address=?, phone=?, email=? WHERE id=?`,
      [code, name, address || null, phone || null, email || null, id]
    );
    res.json({ ok: true, message: "Campus updated" });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Campus code already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function deleteCampus(req, res) {
  const id = Number(req.params.id);
  const password = String(req.body?.password || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "Invalid campus id" });
  if (!password) return res.status(400).json({ ok: false, message: "password required" });

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

    const [[campus]] = await conn.query(
      `SELECT id, code, name FROM campuses WHERE id=? LIMIT 1`,
      [id]
    );
    if (!campus) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Campus not found" });
    }

    const [result] = await conn.query(`DELETE FROM campuses WHERE id=?`, [id]);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Campus not found" });
    }

    await conn.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.user.uid,
        "CAMPUS_DELETED",
        "campuses",
        String(id),
        req.ip || null,
        req.headers["user-agent"] || null,
        JSON.stringify({
          campus: { id: campus.id, code: campus.code, name: campus.name },
        }),
      ]
    );

    await conn.commit();
    res.json({ ok: true, message: "Campus deleted" });
  } catch (e) {
    await conn.rollback();
    if (String(e.message).toLowerCase().includes("foreign key")) {
      return res.status(409).json({
        ok: false,
        message: "Campus is in use and cannot be deleted",
      });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  } finally {
    conn.release();
  }
}

async function listAcademicYears(req, res) {
  const [rows] = await db.query(
    `SELECT ay.*, b.name AS batch_name, b.year_bs AS batch_year_bs
     FROM academic_years ay
     LEFT JOIN batches b ON b.id=ay.batch_id
     ORDER BY ay.year_bs DESC`
  );
  res.json({ ok: true, academic_years: rows });
}

async function createAcademicYear(req, res) {
  const { year_bs, year_ad, is_current, batch_id } = req.body || {};
  if (!year_bs) return res.status(400).json({ ok: false, message: "year_bs required" });

  // If setting current, first unset others
  if (is_current === true) {
    await db.query(`UPDATE academic_years SET is_current=0`);
  }

  try {
    const [r] = await db.query(
      `INSERT INTO academic_years (year_bs, year_ad, is_current, batch_id) VALUES (?,?,?,?)`,
      [String(year_bs), year_ad || null, is_current ? 1 : 0, batch_id || null]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Academic year already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function updateAcademicYear(req, res) {
  const id = Number(req.params.id);
  const { year_bs, year_ad, is_current, batch_id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid academic year id" });
  if (!year_bs) return res.status(400).json({ ok: false, message: "year_bs required" });

  // If setting current, first unset others
  if (is_current === true) {
    await db.query(`UPDATE academic_years SET is_current=0`);
  }

  try {
    await db.query(
      `UPDATE academic_years SET year_bs=?, year_ad=?, is_current=?, batch_id=? WHERE id=?`,
      [String(year_bs), year_ad || null, is_current ? 1 : 0, batch_id || null, id]
    );
    res.json({ ok: true, message: "Academic year updated" });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Academic year already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function listFaculties(req, res) {
  const [rows] = await db.query(`SELECT * FROM faculties ORDER BY name ASC`);
  res.json({ ok: true, faculties: rows });
}

async function createFaculty(req, res) {
  const { code, name } = req.body || {};
  if (!code || !name) return res.status(400).json({ ok: false, message: "code and name required" });

  try {
    const [r] = await db.query(
      `INSERT INTO faculties (code, name) VALUES (?,?)`,
      [code, name]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Faculty code already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function updateFaculty(req, res) {
  const id = Number(req.params.id);
  const { code, name } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid faculty id" });
  if (!code || !name) return res.status(400).json({ ok: false, message: "code and name required" });

  try {
    await db.query(
      `UPDATE faculties SET code=?, name=? WHERE id=?`,
      [code, name, id]
    );
    res.json({ ok: true, message: "Faculty updated" });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Faculty code already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function listClasses(req, res) {
  const [rows] = await db.query(`SELECT * FROM classes ORDER BY name ASC`);
  res.json({ ok: true, classes: rows });
}

async function listGradingSchemes(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT id, name, overall_method FROM grading_schemes ORDER BY id DESC`
    );
    res.json({ ok: true, grading_schemes: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to load grading schemes" });
  }
}

async function listBatches(req, res) {
  const [rows] = await db.query(
    `SELECT id, name, year_bs, is_active
     FROM batches
     ORDER BY year_bs DESC, id DESC`
  );
  res.json({ ok: true, batches: rows });
}

async function createBatch(req, res) {
  const { name, year_bs } = req.body || {};
  if (!name) {
    return res.status(400).json({ ok: false, message: "name required" });
  }

  try {
    const [r] = await db.query(
      `INSERT INTO batches (name, year_bs)
       VALUES (?,?)`,
      [name, year_bs || null]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Batch already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function updateBatch(req, res) {
  const id = Number(req.params.id);
  const { name, year_bs, is_active } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid batch id" });
  if (!name) {
    return res.status(400).json({ ok: false, message: "name required" });
  }

  try {
    await db.query(
      `UPDATE batches
       SET name=?, year_bs=?, is_active=?
       WHERE id=?`,
      [name, year_bs || null, is_active ? 1 : 0, id]
    );
    res.json({ ok: true, message: "Batch updated" });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Batch already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function deleteBatch(req, res) {
  const id = Number(req.params.id);
  const password = String(req.body?.password || "").trim();
  if (!id) return res.status(400).json({ ok: false, message: "Invalid batch id" });
  if (!password) return res.status(400).json({ ok: false, message: "password required" });

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

    const [[batch]] = await conn.query(
      `SELECT id, name, year_bs FROM batches WHERE id=? LIMIT 1`,
      [id]
    );
    if (!batch) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Batch not found" });
    }

    const [[enr]] = await conn.query(
      `SELECT COUNT(*) AS c FROM student_enrollments WHERE batch_id=?`,
      [id]
    );
    if (Number(enr?.c || 0) > 0) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        message: "Batch has active student enrollments. Delete students first.",
      });
    }

    const [rDetachYears] = await conn.query(
      `UPDATE academic_years SET batch_id=NULL WHERE batch_id=?`,
      [id]
    );

    const [rDelete] = await conn.query(`DELETE FROM batches WHERE id=?`, [id]);
    if (!rDelete.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Batch not found" });
    }

    await conn.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.user.uid,
        "BATCH_DELETED",
        "batches",
        String(id),
        req.ip || null,
        req.headers["user-agent"] || null,
        JSON.stringify({
          batch: { id: batch.id, name: batch.name, year_bs: batch.year_bs },
          detached_academic_years: rDetachYears.affectedRows,
        }),
      ]
    );

    await conn.commit();
    return res.json({
      ok: true,
      message: "Batch deleted",
      detached_academic_years: rDetachYears.affectedRows,
    });
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: e?.message || "Delete failed" });
  } finally {
    conn.release();
  }
}

async function listSections(req, res) {
  const [rows] = await db.query(
    `SELECT s.id,s.name,s.is_active,
            s.campus_id, s.academic_year_id, s.class_id, s.faculty_id,
            c.name AS campus,
            ay.year_bs AS academic_year,
            cl.name AS class,
            f.name AS faculty
     FROM sections s
     JOIN campuses c ON c.id=s.campus_id
     JOIN academic_years ay ON ay.id=s.academic_year_id
     JOIN classes cl ON cl.id=s.class_id
     JOIN faculties f ON f.id=s.faculty_id
     ORDER BY s.id DESC`
  );
  res.json({ ok: true, sections: rows });
}

async function createSection(req, res) {
  const { campus_id, academic_year_id, class_id, faculty_id, name } = req.body || {};
  if (!campus_id || !academic_year_id || !class_id || !faculty_id || !name) {
    return res.status(400).json({ ok: false, message: "campus_id, academic_year_id, class_id, faculty_id, name required" });
  }

  try {
    const [r] = await db.query(
      `INSERT INTO sections (campus_id, academic_year_id, class_id, faculty_id, name)
       VALUES (?,?,?,?,?)`,
      [campus_id, academic_year_id, class_id, faculty_id, name]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Section already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function updateSection(req, res) {
  const id = Number(req.params.id);
  const { campus_id, academic_year_id, class_id, faculty_id, name, is_active } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid section id" });
  if (!campus_id || !academic_year_id || !class_id || !faculty_id || !name) {
    return res.status(400).json({ ok: false, message: "campus_id, academic_year_id, class_id, faculty_id, name required" });
  }

  try {
    await db.query(
      `UPDATE sections
       SET campus_id=?, academic_year_id=?, class_id=?, faculty_id=?, name=?, is_active=?
       WHERE id=?`,
      [campus_id, academic_year_id, class_id, faculty_id, name, is_active ? 1 : 0, id]
    );
    res.json({ ok: true, message: "Section updated" });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Section already exists" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
}


async function getSubjectCatalog(req, res) {
  const academic_year_id = Number(req.query.academic_year_id || 1);
  const class_id = Number(req.query.class_id || 2);

  // 1) Groups
  const [groups] = await db.query(
    `SELECT id, name, sort_order
     FROM catalog_groups
     WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL
     ORDER BY sort_order ASC, id ASC`,
    [academic_year_id, class_id]
  );

  // 2) Subjects in those groups
  const groupIds = groups.map(g => g.id);
  if (groupIds.length === 0) {
    return res.json({ ok: true, groups: [] });
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

  // 3) Components for all subjects
  const subjectIds = [...new Set(groupSubjects.map(x => x.subject_id))];
  const [components] = await db.query(
    `SELECT subject_id, component_type, component_code, component_title, credit_hour
     FROM subject_components
     WHERE subject_id IN (?)
     ORDER BY subject_id ASC, FIELD(component_type,'TH','PR','IN'), component_code ASC`,
    [subjectIds]
  );

  const compsBySubject = new Map();
  for (const c of components) {
    if (!compsBySubject.has(c.subject_id)) compsBySubject.set(c.subject_id, []);
    compsBySubject.get(c.subject_id).push(c);
  }

  // Build response
  const groupsOut = groups.map(g => {
    const subs = groupSubjects
      .filter(gs => gs.catalog_group_id === g.id)
      .map(gs => ({
        id: gs.subject_id,
        name: gs.subject_name,
        components: compsBySubject.get(gs.subject_id) || []
      }));

    return { id: g.id, name: g.name, sort_order: g.sort_order, subjects: subs };
  });

  res.json({ ok: true, academic_year_id, class_id, groups: groupsOut });
}

async function shiftOptionalSubjectGroup(req, res) {
  const academic_year_id = Number(req.body?.academic_year_id);
  const class_id = Number(req.body?.class_id);
  const subject_id = Number(req.body?.subject_id);
  const to_group_name = String(req.body?.to_group_name || "").trim();

  if (!academic_year_id || !class_id || !subject_id || !to_group_name) {
    return res.status(400).json({
      ok: false,
      message: "academic_year_id, class_id, subject_id, to_group_name required",
    });
  }
  if (!to_group_name.toLowerCase().startsWith("opt")) {
    return res.status(400).json({
      ok: false,
      message: "Target group must be an optional group (name starts with Opt)",
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[targetGroup]] = await conn.query(
      `SELECT id, name
       FROM catalog_groups
       WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL AND name=?
       LIMIT 1`,
      [academic_year_id, class_id, to_group_name]
    );
    if (!targetGroup) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Target optional group not found" });
    }

    const [currentRows] = await conn.query(
      `SELECT cgs.catalog_group_id, cg.name
       FROM catalog_group_subjects cgs
       JOIN catalog_groups cg ON cg.id=cgs.catalog_group_id
       WHERE cg.academic_year_id <=> ?
         AND cg.class_id <=> ?
         AND cg.faculty_id IS NULL
         AND cgs.subject_id=?
         AND LOWER(cg.name) LIKE 'opt%'
       ORDER BY cg.sort_order ASC, cgs.sort_order ASC`,
      [academic_year_id, class_id, subject_id]
    );

    if (!currentRows.length) {
      await conn.rollback();
      return res.status(404).json({
        ok: false,
        message: "Subject is not currently assigned to any optional group",
      });
    }

    if (currentRows.some((r) => Number(r.catalog_group_id) === Number(targetGroup.id))) {
      await conn.rollback();
      return res.json({
        ok: true,
        message: "Subject already in target optional group",
      });
    }

    const currentGroupNames = [...new Set(currentRows.map((r) => r.name).filter(Boolean))];
    const currentGroupIds = [...new Set(currentRows.map((r) => Number(r.catalog_group_id)))];

    await conn.query(
      `DELETE FROM catalog_group_subjects
       WHERE subject_id=? AND catalog_group_id IN (?)`,
      [subject_id, currentGroupIds]
    );

    const [[maxSortRow]] = await conn.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_sort
       FROM catalog_group_subjects
       WHERE catalog_group_id=?`,
      [targetGroup.id]
    );
    const nextSort = Number(maxSortRow?.max_sort || 0) + 1;

    await conn.query(
      `INSERT INTO catalog_group_subjects (catalog_group_id, subject_id, sort_order)
       VALUES (?,?,?)`,
      [targetGroup.id, subject_id, nextSort]
    );

    await conn.query(
      `UPDATE student_optional_choices soc
       JOIN student_enrollments e ON e.id=soc.enrollment_id
       SET soc.group_name=?
       WHERE soc.subject_id=?
         AND e.academic_year_id <=> ?
         AND e.class_id <=> ?
         AND soc.group_name IN (?)`,
      [targetGroup.name, subject_id, academic_year_id, class_id, currentGroupNames]
    );

    await conn.commit();

    res.json({
      ok: true,
      message: "Subject moved to target optional group",
      moved: {
        subject_id,
        from_groups: currentGroupNames,
        to_group: targetGroup.name,
      },
    });
  } catch (e) {
    await conn.rollback();
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Subject already mapped in target group" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  } finally {
    conn.release();
  }
}

async function getSubjectById(req, res) {
  const id = Number(req.params.id);
  const [[subject]] = await db.query(`SELECT id,name,is_active FROM subjects WHERE id=? LIMIT 1`, [id]);
  if (!subject) return res.status(404).json({ ok: false, message: "Subject not found" });

  const [components] = await db.query(
    `SELECT component_type, component_code, component_title, credit_hour
     FROM subject_components
     WHERE subject_id=?
     ORDER BY FIELD(component_type,'TH','PR','IN'), component_code ASC`,
    [id]
  );

  res.json({ ok: true, subject, components });
}


// module.exports = { listCampuses, createCampus, listAcademicYears, createAcademicYear };

module.exports = {
  listCampuses,
  createCampus,
  updateCampus,
  deleteCampus,
  listAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  listFaculties,
  createFaculty,
  updateFaculty,
  listClasses,
  listGradingSchemes,
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  listSections,
  createSection,
  updateSection,
  getSubjectCatalog,
  shiftOptionalSubjectGroup,
  getSubjectById,
};
