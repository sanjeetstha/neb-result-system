const db = require("../db");

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

async function listAcademicYears(req, res) {
  const [rows] = await db.query(`SELECT * FROM academic_years ORDER BY year_bs DESC`);
  res.json({ ok: true, academic_years: rows });
}

async function createAcademicYear(req, res) {
  const { year_bs, year_ad, is_current } = req.body || {};
  if (!year_bs) return res.status(400).json({ ok: false, message: "year_bs required" });

  // If setting current, first unset others
  if (is_current === true) {
    await db.query(`UPDATE academic_years SET is_current=0`);
  }

  try {
    const [r] = await db.query(
      `INSERT INTO academic_years (year_bs, year_ad, is_current) VALUES (?,?,?)`,
      [String(year_bs), year_ad || null, is_current ? 1 : 0]
    );
    res.json({ ok: true, id: r.insertId });
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

async function listClasses(req, res) {
  const [rows] = await db.query(`SELECT * FROM classes ORDER BY name ASC`);
  res.json({ ok: true, classes: rows });
}

async function listSections(req, res) {
  const [rows] = await db.query(
    `SELECT s.id,s.name,s.is_active,
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
  listCampuses, createCampus,
  listAcademicYears, createAcademicYear,
  listFaculties, createFaculty,
  listClasses,
  listSections, createSection,
  getSubjectCatalog, getSubjectById
};


