const db = require("../db");

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function pickByMinValue(rules, value) {
  for (const r of rules) {
    if (value >= Number(r.min_value)) return r;
  }
  return rules[rules.length - 1] || null;
}

async function loadSchemeRules(schemeId) {
  const [rules] = await db.query(
    `SELECT rule_type, min_value, grade, gpa
     FROM grading_rules
     WHERE scheme_id=?
     ORDER BY rule_type ASC, min_value DESC`,
    [schemeId]
  );

  return {
    subjectGpa: rules.filter(r => r.rule_type === "SUBJECT_GPA"),
    subjectGrade: rules.filter(r => r.rule_type === "SUBJECT_GRADE"),
    finalGrade: rules.filter(r => r.rule_type === "FINAL_GRADE"),
  };
}

async function previewResult({ examId, enrollmentId }) {
  const [[exam]] = await db.query(
    `SELECT id, grading_scheme_id FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) throw new Error("Exam not found");
  if (!exam.grading_scheme_id) throw new Error("Exam grading scheme not set");

  const [[scheme]] = await db.query(
    `SELECT overall_method FROM grading_schemes WHERE id=? LIMIT 1`,
    [exam.grading_scheme_id]
  );
  const overallMethod = scheme?.overall_method || "SIMPLE_AVG";

  const rules = await loadSchemeRules(exam.grading_scheme_id);

  const [enrollRows] = await db.query(
    `SELECT academic_year_id, class_id FROM student_enrollments WHERE id=? LIMIT 1`,
    [enrollmentId]
  );
  if (!enrollRows.length) throw new Error("Enrollment not found");

  const { academic_year_id, class_id } = enrollRows[0];

  const [[cg]] = await db.query(
    `SELECT id FROM catalog_groups
     WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL AND name='COMPULSORY'
     LIMIT 1`,
    [academic_year_id, class_id]
  );

  let subjectIds = [];
  if (cg) {
    const [cs] = await db.query(
      `SELECT subject_id FROM catalog_group_subjects WHERE catalog_group_id=?`,
      [cg.id]
    );
    subjectIds.push(...cs.map(x => x.subject_id));
  }

  const [ops] = await db.query(
    `SELECT subject_id FROM student_optional_choices WHERE enrollment_id=?`,
    [enrollmentId]
  );
  subjectIds.push(...ops.map(x => x.subject_id));
  subjectIds = [...new Set(subjectIds)];

  const [components] = await db.query(
    `SELECT sc.subject_id, s.name AS subject_name, sc.component_type, sc.component_code, sc.credit_hour
     FROM subject_components sc
     JOIN subjects s ON s.id=sc.subject_id
     WHERE sc.subject_id IN (?)
     ORDER BY sc.subject_id ASC, FIELD(sc.component_type,'TH','PR','IN')`,
    [subjectIds]
  );

  const [cfgRows] = await db.query(
    `SELECT component_code, full_marks, is_enabled
     FROM exam_component_configs
     WHERE exam_id=?`,
    [examId]
  );
  const cfgByCode = new Map(cfgRows.map(c => [String(c.component_code), c]));

  const [markRows] = await db.query(
    `SELECT component_code, marks_obtained, is_absent
     FROM marks
     WHERE exam_id=? AND enrollment_id=?`,
    [examId, enrollmentId]
  );
  const markByCode = new Map(markRows.map(m => [String(m.component_code), m]));

  const bySubject = new Map();

  for (const c of components) {
    const code = String(c.component_code);
    const cfg = cfgByCode.get(code);

    if (!cfg || !cfg.is_enabled) continue;

    const mk = markByCode.get(code);
    const full = Number(cfg.full_marks);
    const obtained = mk?.is_absent ? null : (mk?.marks_obtained != null ? Number(mk.marks_obtained) : null);

    if (!bySubject.has(c.subject_id)) {
      bySubject.set(c.subject_id, {
        subject_id: c.subject_id,
        subject_name: c.subject_name,
        total_obtained: 0,
        total_full: 0,
        total_credit: 0,
        any_missing: false,
        any_absent: false
      });
    }

    const agg = bySubject.get(c.subject_id);
    agg.total_full += full;

    const credit = c.credit_hour != null ? Number(c.credit_hour) : 0;
    agg.total_credit += credit;

    if (mk?.is_absent) {
      agg.any_absent = true;
      agg.any_missing = true;
    } else if (obtained == null) {
      agg.any_missing = true;
    } else {
      agg.total_obtained += obtained;
    }
  }

  const subjects = [];
  let gpaSum = 0;
  let gpaCount = 0;
  let weightedSum = 0;
  let creditSum = 0;

  let failed = false;

  for (const agg of bySubject.values()) {
    const percent = agg.total_full > 0 ? (agg.total_obtained / agg.total_full) * 100 : 0;
    const percentR = round2(percent);

    const gpaRule = pickByMinValue(rules.subjectGpa, percentR);
    const gradeRule = pickByMinValue(rules.subjectGrade, percentR);

    const gpa = gpaRule?.gpa != null ? Number(gpaRule.gpa) : 0;
    const grade = gradeRule?.grade || "NG";

    const status = agg.any_missing ? "INCOMPLETE" : (gpa <= 0 ? "FAIL" : "PASS");
    if (!agg.any_missing && gpa <= 0) failed = true;

    if (!agg.any_missing) {
      gpaSum += gpa;
      gpaCount += 1;

      const credit = agg.total_credit > 0 ? agg.total_credit : 1;
      weightedSum += gpa * credit;
      creditSum += credit;
    }

    subjects.push({
      subject_id: agg.subject_id,
      subject_name: agg.subject_name,
      total_obtained: round2(agg.total_obtained),
      total_full: round2(agg.total_full),
      percent: percentR,
      grade,
      gpa: round2(gpa),
      status
    });
  }

  let overallGpa = 0;
  if (overallMethod === "CREDIT_WEIGHTED") {
    overallGpa = creditSum > 0 ? round2(weightedSum / creditSum) : 0;
  } else {
    overallGpa = gpaCount > 0 ? round2(gpaSum / gpaCount) : 0;
  }

  const finalGradeRule = pickByMinValue(rules.finalGrade, overallGpa);
  const finalGrade = finalGradeRule?.grade || "NG";

  return {
    exam_id: examId,
    enrollment_id: enrollmentId,
    subjects: subjects.sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
    overall_gpa: overallGpa,
    final_grade: finalGrade,
    result_status: failed ? "FAIL" : "PASS"
  };
}

module.exports = { previewResult };
