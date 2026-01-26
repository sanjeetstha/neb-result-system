const XLSX = require("xlsx");
const db = require("../db");

// Helper
function toBool(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST /api/import/marks?exam_id=1
async function importMarks(req, res) {
  const examId = Number(req.query.exam_id);
  if (!examId) return res.status(400).json({ ok: false, message: "exam_id query param required" });

  if (!req.file?.buffer) {
    return res.status(400).json({ ok: false, message: "No file uploaded (field name must be 'file')" });
  }

  // 1) Check exam lock + context
  const [[exam]] = await db.query(
    `SELECT id, campus_id, academic_year_id, class_id, faculty_id, is_locked
     FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
  if (exam.is_locked) return res.status(423).json({ ok: false, message: "Exam is locked (published). Import not allowed." });

  // 2) Load enabled component configs for exam
  const [cfgRows] = await db.query(
    `SELECT component_code, full_marks
     FROM exam_component_configs
     WHERE exam_id=? AND is_enabled=1`,
    [examId]
  );
  const cfgByCode = new Map(cfgRows.map(r => [String(r.component_code), Number(r.full_marks)]));
  if (cfgByCode.size === 0) {
    return res.status(400).json({ ok: false, message: "No enabled component configs found for this exam" });
  }

  // 3) Load symbol_no -> enrollment_id map (for this exam's campus/year/class/faculty)
  const [enrollRows] = await db.query(
    `SELECT e.id AS enrollment_id, s.symbol_no
     FROM student_enrollments e
     JOIN students s ON s.id=e.student_id
     WHERE e.campus_id=? AND e.academic_year_id=? AND e.class_id=? AND e.faculty_id=?`,
    [exam.campus_id, exam.academic_year_id, exam.class_id, exam.faculty_id]
  );
  const enrollmentBySymbol = new Map();
  for (const r of enrollRows) {
    if (r.symbol_no) enrollmentBySymbol.set(String(r.symbol_no).trim(), Number(r.enrollment_id));
  }

  // 4) Read Excel from buffer
  let wb;
  try {
    wb = XLSX.read(req.file.buffer, { type: "buffer" });
  } catch (e) {
    return res.status(400).json({ ok: false, message: "Invalid Excel file" });
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  // Expect columns: symbol_no, component_code, marks_obtained, is_absent
  const errors = [];
  let imported = 0;
  let skipped = 0;

  // Use transaction for speed/consistency
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (let i = 0; i < json.length; i++) {
      const row = json[i];
      const rowNo = i + 2; // excel row number (header is row 1)

      const symbol_no = String(row.symbol_no ?? "").trim();
      let component_code = String(row.component_code ?? "").trim();
      component_code = component_code.replace(/^0+(?=\d)/, "");
      const marks_obtained = toNum(row.marks_obtained);
      const is_absent = toBool(row.is_absent);

      // Basic validation
      if (!symbol_no || !component_code) {
        skipped++;
        errors.push({ row: rowNo, reason: "Missing symbol_no or component_code" });
        continue;
      }

      const enrollment_id = enrollmentBySymbol.get(symbol_no);
      if (!enrollment_id) {
        skipped++;
        errors.push({ row: rowNo, reason: `No enrollment found for symbol_no ${symbol_no} in this exam context` });
        continue;
      }

      const full = cfgByCode.get(component_code);
      if (full == null) {
        skipped++;
        errors.push({ row: rowNo, reason: `component_code ${component_code} not enabled/configured for this exam` });
        continue;
      }

      // If absent, store null marks
      let obtained = null;
      let absentFlag = 0;

      if (is_absent) {
        obtained = null;
        absentFlag = 1;
      } else {
        if (marks_obtained == null) {
          skipped++;
          errors.push({ row: rowNo, reason: `marks_obtained missing for symbol_no ${symbol_no}, code ${component_code}` });
          continue;
        }
        if (marks_obtained < 0 || marks_obtained > full) {
          skipped++;
          errors.push({ row: rowNo, reason: `marks_obtained ${marks_obtained} out of range (0..${full}) for code ${component_code}` });
          continue;
        }
        obtained = marks_obtained;
        absentFlag = 0;
      }

      // Upsert marks
      await conn.query(
        `INSERT INTO marks
           (exam_id, enrollment_id, component_code, marks_obtained, is_absent, entered_by, entered_at, updated_by, updated_at)
         VALUES
           (?,?,?,?,?,?,NOW(),?,NOW())
         ON DUPLICATE KEY UPDATE
           marks_obtained=VALUES(marks_obtained),
           is_absent=VALUES(is_absent),
           updated_by=VALUES(updated_by),
           updated_at=NOW()`,
        [examId, enrollment_id, component_code, obtained, absentFlag, req.user.uid, req.user.uid]
      );

      imported++;
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: "Import failed", error: String(e.message || e) });
  } finally {
    conn.release();
  }

  // Limit errors list in response (avoid huge payload)
  const errorsLimited = errors.slice(0, 200);

  return res.json({
    ok: true,
    exam_id: examId,
    sheet: sheetName,
    total_rows: json.length,
    imported,
    skipped,
    errors_count: errors.length,
    errors: errorsLimited,
  });
}

module.exports = { importMarks };
