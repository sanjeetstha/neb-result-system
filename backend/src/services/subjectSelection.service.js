const db = require("../db");

const MAX_OPTIONAL_SUBJECTS = 3;

function parseOptionalRank(name) {
  const raw = String(name || "").trim().toLowerCase();
  const num = raw.match(/(\d+)/);
  if (num) return Number(num[1]);
  if (raw.includes("first")) return 1;
  if (raw.includes("second")) return 2;
  if (raw.includes("third")) return 3;
  if (raw.includes("fourth")) return 4;
  return 999;
}

function isOptionalGroupName(name) {
  return /^\s*opt/i.test(String(name || ""));
}

async function getEnrollmentContext(enrollmentId) {
  const [[enrollment]] = await db.query(
    `SELECT id, academic_year_id, class_id
     FROM student_enrollments
     WHERE id=? LIMIT 1`,
    [enrollmentId]
  );
  return enrollment || null;
}

async function getCompulsorySubjectIds(academic_year_id, class_id) {
  const [[group]] = await db.query(
    `SELECT id
     FROM catalog_groups
     WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL AND UPPER(name)='COMPULSORY'
     LIMIT 1`,
    [academic_year_id, class_id]
  );
  if (!group?.id) return [];

  const [rows] = await db.query(
    `SELECT subject_id
     FROM catalog_group_subjects
     WHERE catalog_group_id=?
     ORDER BY sort_order ASC`,
    [group.id]
  );
  return rows.map((r) => Number(r.subject_id)).filter(Boolean);
}

async function getOptionalSubjectMetaMap(academic_year_id, class_id) {
  const [rows] = await db.query(
    `SELECT cgs.subject_id, cg.name AS group_name, cg.sort_order AS group_sort, cgs.sort_order AS subject_sort
     FROM catalog_group_subjects cgs
     JOIN catalog_groups cg ON cg.id=cgs.catalog_group_id
     WHERE cg.academic_year_id <=> ?
       AND cg.class_id <=> ?
       AND cg.faculty_id IS NULL
       AND LOWER(cg.name) LIKE 'opt%'
     ORDER BY cg.sort_order ASC, cgs.sort_order ASC, cgs.subject_id ASC`,
    [academic_year_id, class_id]
  );

  const bySubject = new Map();
  for (const r of rows) {
    const subjectId = Number(r.subject_id);
    if (!subjectId) continue;
    const next = {
      subject_id: subjectId,
      group_name: String(r.group_name || "").trim(),
      group_rank: parseOptionalRank(r.group_name),
      group_sort: Number(r.group_sort || 0),
      subject_sort: Number(r.subject_sort || 0),
    };
    const prev = bySubject.get(subjectId);
    if (!prev) {
      bySubject.set(subjectId, next);
      continue;
    }
    const prevKey = [prev.group_rank, prev.group_sort, prev.subject_sort, prev.subject_id].join(":");
    const nextKey = [next.group_rank, next.group_sort, next.subject_sort, next.subject_id].join(":");
    if (nextKey < prevKey) bySubject.set(subjectId, next);
  }
  return bySubject;
}

function normalizeAndLimitOptionalChoices(rawChoices, optionalMetaMap, maxCount = MAX_OPTIONAL_SUBJECTS) {
  const invalidSubjectIds = [];
  const seenSubjects = new Set();
  const collected = [];

  for (const ch of Array.isArray(rawChoices) ? rawChoices : []) {
    const subjectId = Number(ch?.subject_id || 0);
    if (!subjectId || seenSubjects.has(subjectId)) continue;
    const meta = optionalMetaMap.get(subjectId);
    if (!meta || !isOptionalGroupName(meta.group_name)) {
      invalidSubjectIds.push(subjectId);
      continue;
    }
    seenSubjects.add(subjectId);
    collected.push({
      group_name: meta.group_name,
      subject_id: subjectId,
      group_rank: meta.group_rank,
      group_sort: meta.group_sort,
      subject_sort: meta.subject_sort,
    });
  }

  collected.sort((a, b) => {
    if (a.group_rank !== b.group_rank) return a.group_rank - b.group_rank;
    if (a.group_sort !== b.group_sort) return a.group_sort - b.group_sort;
    if (a.subject_sort !== b.subject_sort) return a.subject_sort - b.subject_sort;
    return a.subject_id - b.subject_id;
  });

  const out = [];
  const usedGroups = new Set();
  for (const c of collected) {
    if (out.length >= maxCount) break;
    if (usedGroups.has(c.group_name)) continue;
    usedGroups.add(c.group_name);
    out.push({ group_name: c.group_name, subject_id: c.subject_id });
  }

  return {
    choices: out,
    invalidSubjectIds,
    truncated: collected.length > out.length,
  };
}

async function getAllowedOptionalChoicesForEnrollment(enrollmentId, rawChoices, maxCount = MAX_OPTIONAL_SUBJECTS) {
  const enrollment = await getEnrollmentContext(enrollmentId);
  if (!enrollment) throw new Error("Enrollment not found");
  const optionalMetaMap = await getOptionalSubjectMetaMap(enrollment.academic_year_id, enrollment.class_id);
  return normalizeAndLimitOptionalChoices(rawChoices, optionalMetaMap, maxCount);
}

async function getSelectedOptionalSubjectIds(enrollmentId, maxCount = MAX_OPTIONAL_SUBJECTS) {
  const [rows] = await db.query(
    `SELECT subject_id
     FROM student_optional_choices
     WHERE enrollment_id=?`,
    [enrollmentId]
  );
  const raw = rows.map((r) => ({ subject_id: Number(r.subject_id) })).filter((r) => r.subject_id > 0);
  const normalized = await getAllowedOptionalChoicesForEnrollment(enrollmentId, raw, maxCount);
  return normalized.choices.map((c) => Number(c.subject_id)).filter(Boolean);
}

module.exports = {
  MAX_OPTIONAL_SUBJECTS,
  isOptionalGroupName,
  parseOptionalRank,
  getCompulsorySubjectIds,
  getAllowedOptionalChoicesForEnrollment,
  getSelectedOptionalSubjectIds,
};

