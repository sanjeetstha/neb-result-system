require("dotenv").config();
const path = require("path");
const XLSX = require("xlsx");
const db = require("../src/db");

// Helpers
function normalizeSpaces(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function parseComponent(name) {
  const raw = normalizeSpaces(name);
  const m = raw.match(/\((TH|IN|PR)\)/i);
  const componentType = m ? m[1].toUpperCase() : "TH";
  const baseTitle = normalizeSpaces(raw.replace(/\((TH|IN|PR)\)/i, ""));
  return { componentType, baseTitle, rawTitle: raw };
}

// Grouping rule: each TH starts a new "subject", IN/PR following belongs to last subject in same group.
function groupRows(rows) {
  const grouped = [];
  let currentGroup = null;
  let currentSubject = null;

  for (const r of rows) {
    if (r.group !== currentGroup) {
      currentGroup = r.group;
      currentSubject = null;
    }

    const { componentType, baseTitle, rawTitle } = parseComponent(r.title);

    const shouldStartNew =
      componentType === "TH" &&
      (currentSubject === null || currentSubject.components.some(c => c.component_type === "TH"));

    if (shouldStartNew) {
      currentSubject = {
        group: r.group,
        subject_name: baseTitle, // use TH title as main subject name
        components: [],
      };
      grouped.push(currentSubject);
    }

    if (!currentSubject) {
      currentSubject = { group: r.group, subject_name: baseTitle, components: [] };
      grouped.push(currentSubject);
    }

    currentSubject.components.push({
      component_type: componentType,
      component_code: String(r.code),
      component_title: rawTitle,   // keep original title
      credit_hour: r.credit != null ? Number(r.credit) : null,
    });
  }

  return grouped;
}

async function ensureCatalogGroup({ academic_year_id, class_id, faculty_id, name, sort_order }) {
  const [existing] = await db.query(
    `SELECT id FROM catalog_groups WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id <=> ? AND name=? LIMIT 1`,
    [academic_year_id, class_id, faculty_id, name]
  );
  if (existing.length) return existing[0].id;

  const [r] = await db.query(
    `INSERT INTO catalog_groups (academic_year_id, class_id, faculty_id, name, sort_order)
     VALUES (?,?,?,?,?)`,
    [academic_year_id, class_id, faculty_id, name, sort_order]
  );
  return r.insertId;
}

async function getOrCreateSubject(subject_name) {
  const [found] = await db.query(`SELECT id FROM subjects WHERE name=? LIMIT 1`, [subject_name]);
  if (found.length) return found[0].id;

  const [r] = await db.query(`INSERT INTO subjects (name) VALUES (?)`, [subject_name]);
  return r.insertId;
}

async function insertComponent(subject_id, c) {
  // idempotent by component_code unique
  const [found] = await db.query(
    `SELECT id FROM subject_components WHERE component_code=? LIMIT 1`,
    [c.component_code]
  );
  if (found.length) return found[0].id;

  const [r] = await db.query(
    `INSERT INTO subject_components (subject_id, component_type, component_code, component_title, credit_hour)
     VALUES (?,?,?,?,?)`,
    [subject_id, c.component_type, c.component_code, c.component_title, c.credit_hour]
  );
  return r.insertId;
}

async function linkGroupSubject(group_id, subject_id, sort_order) {
  const [found] = await db.query(
    `SELECT id FROM catalog_group_subjects WHERE catalog_group_id=? AND subject_id=? LIMIT 1`,
    [group_id, subject_id]
  );
  if (found.length) return;

  await db.query(
    `INSERT INTO catalog_group_subjects (catalog_group_id, subject_id, sort_order)
     VALUES (?,?,?)`,
    [group_id, subject_id, sort_order]
  );
}

async function main() {
  const filePath = process.argv[2];
  const academic_year_id = Number(process.argv[3] || 1); // default 1 = 2082
  const class_id = Number(process.argv[4] || 2);         // default 2 = class 12
  const faculty_id = null;                               // keep NULL for now (shared catalog)

  if (!filePath) {
    console.log("Usage: node scripts/import_subjects_from_excel.js <xlsx_path> [academic_year_id] [class_id]");
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  const wb = XLSX.readFile(abs);
  const sheet = wb.Sheets["Subjects"];
  if (!sheet) {
    console.error("Sheet 'Subjects' not found.");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Build flat list with group headers
  let group = "COMPULSORY";
  const flat = [];
  for (let i = 0; i < rows.length; i++) {
    const [code, title, credit] = rows[i];

    // skip empty
    if (code == null && title == null) continue;

    // skip header row
    if (String(code).toLowerCase().includes("sub. code")) continue;

    // group header rows like "Opt. 1st"
    if (code == null && typeof title === "string" && title.trim().toLowerCase().startsWith("opt.")) {
      group = title.trim();
      continue;
    }

    if (code == null || title == null) continue;

    flat.push({
      group,
      code: String(code).trim(),
      title: String(title).trim(),
      credit: credit,
    });
  }

  const groupedSubjects = groupRows(flat);

  // Ensure catalog groups exist (sort order based on our known names)
  const groupOrder = { "COMPULSORY": 1, "Opt. 1st": 2, "Opt. 2nd": 3, "Opt. 3rd": 4, "Opt. 4th": 5 };
  const groupIdByName = {};
  for (const gName of Object.keys(groupOrder)) {
    groupIdByName[gName] = await ensureCatalogGroup({
      academic_year_id,
      class_id,
      faculty_id,
      name: gName,
      sort_order: groupOrder[gName],
    });
  }

  // Insert subjects + components + group links
  let insertedSubjects = 0;
  for (const s of groupedSubjects) {
    const subject_id = await getOrCreateSubject(s.subject_name);
    insertedSubjects++;

    // link subject to group
    const group_id = groupIdByName[s.group] || await ensureCatalogGroup({
      academic_year_id, class_id, faculty_id, name: s.group, sort_order: 99
    });
    await linkGroupSubject(group_id, subject_id, insertedSubjects);

    // insert components
    for (const c of s.components) {
      await insertComponent(subject_id, c);
    }
  }

  console.log("✅ Import complete!");
  console.log("Subjects grouped:", groupedSubjects.length);
  process.exit(0);
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
