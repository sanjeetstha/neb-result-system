const XLSX = require("xlsx");
const db = require("../db");
const { MAX_OPTIONAL_SUBJECTS } = require("../services/subjectSelection.service");

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

function normHeader(v) {
  return String(v ?? "").trim().toLowerCase();
}

function normalizeIdentity(v) {
  return String(v ?? "").trim().toUpperCase();
}

function formatImportErrorMessage(err) {
  const msg = String(err?.message || "Import error");
  const lower = msg.toLowerCase();
  if (lower.includes("duplicate entry")) {
    if (lower.includes("symbol_no")) {
      return "Duplicate symbol number conflicts with existing student record";
    }
    if (lower.includes("regd_no")) {
      return "Duplicate registration number conflicts with existing student record";
    }
    return "Duplicate value conflicts with existing records";
  }
  return msg;
}

function normalizeLabel(v) {
  return normHeader(v).replace(/[^a-z0-9]+/g, " ").trim();
}

function findLedgerHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const tokens = row.map(normHeader);
    const hasSymbol = tokens.some((t) => t.includes("symbol"));
    const hasName = tokens.some((t) => t.includes("name"));
    if (hasSymbol && hasName) return i;
  }
  return -1;
}

function excelDateToISO(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d || !d.y || !d.m || !d.d) return null;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

async function loadLedgerMaps(exam) {
  const [rows] = await db.query(
    `SELECT g.name AS group_name, g.sort_order,
            cgs.sort_order AS subject_sort,
            s.id AS subject_id, s.name AS subject_name,
            sc.component_code, sc.component_type,
            cfg.full_marks, cfg.is_enabled
     FROM catalog_groups g
     JOIN catalog_group_subjects cgs ON cgs.catalog_group_id=g.id
     JOIN subjects s ON s.id=cgs.subject_id
     JOIN subject_components sc ON sc.subject_id=s.id
     LEFT JOIN exam_component_configs cfg
       ON cfg.exam_id=? AND cfg.component_code=sc.component_code
     WHERE g.academic_year_id <=> ? AND g.class_id <=> ? AND g.faculty_id IS NULL
       AND sc.component_type='TH' AND cfg.is_enabled=1
     ORDER BY g.sort_order ASC, cgs.sort_order ASC, s.name ASC`,
    [exam.id, exam.academic_year_id, exam.class_id]
  );

  const groups = new Map();
  for (const r of rows) {
    const key = r.group_name;
    if (!groups.has(key)) {
      groups.set(key, { name: r.group_name, subjects: [] });
    }
    groups.get(key).subjects.push({
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      component_code: String(r.component_code),
      full_marks: r.full_marks != null ? Number(r.full_marks) : null,
    });
  }

  const compulsoryGroup = groups.get("COMPULSORY") || { subjects: [] };
  const optionalGroups = Array.from(groups.values()).filter((g) =>
    String(g.name || "").toLowerCase().startsWith("opt")
  );

  const optionalCodeMap = new Map();
  for (const g of optionalGroups) {
    for (const s of g.subjects) {
      optionalCodeMap.set(String(s.component_code), {
        subject_id: s.subject_id,
        subject_name: s.subject_name,
        group_name: g.name,
        full_marks: s.full_marks,
      });
    }
  }

  return {
    compulsorySubjects: compulsoryGroup.subjects,
    optionalGroups,
    optionalCodeMap,
  };
}

// POST /api/import/marks?exam_id=1
async function importMarks(req, res) {
  const examId = Number(req.query.exam_id);
  const requestedBatchId = req.query.batch_id ? Number(req.query.batch_id) : null;
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

  // batch + faculty defaults for enrollment resolution
  const [[ayRow]] = await db.query(
    `SELECT batch_id FROM academic_years WHERE id=? LIMIT 1`,
    [exam.academic_year_id]
  );
  const targetBatchId = requestedBatchId || ayRow?.batch_id || null;

  // 3) Load symbol_no -> enrollment_id map (for this exam's campus/year/class/faculty/batch)
  let enrollSql =
    `SELECT e.id AS enrollment_id, s.id AS student_id, s.symbol_no, s.regd_no
     FROM student_enrollments e
     JOIN students s ON s.id=e.student_id
     WHERE e.campus_id=? AND e.academic_year_id=? AND e.class_id=?`;
  const enrollParams = [exam.campus_id, exam.academic_year_id, exam.class_id];
  if (exam.faculty_id) {
    enrollSql += ` AND e.faculty_id=?`;
    enrollParams.push(exam.faculty_id);
  }
  if (targetBatchId) {
    enrollSql += ` AND e.batch_id=?`;
    enrollParams.push(targetBatchId);
  }

  const [enrollRows] = await db.query(enrollSql, enrollParams);
  const enrollmentBySymbol = new Map();
  const enrollmentByRegd = new Map();
  for (const r of enrollRows) {
    const payload = {
      enrollment_id: Number(r.enrollment_id),
      student_id: Number(r.student_id),
      symbol_no: r.symbol_no ? String(r.symbol_no).trim() : "",
      regd_no: r.regd_no ? String(r.regd_no).trim() : "",
    };
    const symbolKey = normalizeIdentity(r.symbol_no);
    const regdKey = normalizeIdentity(r.regd_no);
    if (symbolKey) enrollmentBySymbol.set(symbolKey, payload);
    if (regdKey && !enrollmentByRegd.has(regdKey)) {
      enrollmentByRegd.set(regdKey, payload);
    }
  }

  // faculty defaults for auto-enrollment
  let defaultFacultyId = exam.faculty_id || null;
  if (!defaultFacultyId) {
    const [[f]] = await db.query(`SELECT id FROM faculties ORDER BY id ASC LIMIT 1`);
    defaultFacultyId = f?.id || null;
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
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerRowIdx = findLedgerHeaderRow(rows);

  const errors = [];
  let imported = 0;
  let skipped = 0;
  let totalRows = 0;

  // Use transaction for speed/consistency
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (headerRowIdx === -1) {
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      totalRows = json.length;
      const seenSimpleRows = new Map();

      // Expect columns: symbol_no, component_code, marks_obtained, is_absent
      for (let i = 0; i < json.length; i++) {
        const row = json[i];
        const rowNo = i + 2; // excel row number (header is row 1)

        const symbol_no = String(row.symbol_no ?? "").trim();
        const symbolKey = normalizeIdentity(symbol_no);
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

        const dupKey = `${symbolKey}::${component_code}`;
        if (seenSimpleRows.has(dupKey)) {
          skipped++;
          errors.push({
            row: rowNo,
            reason: `Duplicate symbol/component in file (first seen at row ${seenSimpleRows.get(dupKey)}); row skipped to avoid overwrite`,
          });
          continue;
        }
        seenSimpleRows.set(dupKey, rowNo);

        const enrollment = enrollmentBySymbol.get(symbolKey);
        if (!enrollment) {
          skipped++;
          errors.push({
            row: rowNo,
            reason: `No enrollment found for symbol_no ${symbol_no} in this exam context`,
          });
          continue;
        }

        const full = cfgByCode.get(component_code);
        if (full == null) {
          skipped++;
          errors.push({
            row: rowNo,
            reason: `component_code ${component_code} not enabled/configured for this exam`,
          });
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
            errors.push({
              row: rowNo,
              reason: `marks_obtained missing for symbol_no ${symbol_no}, code ${component_code}`,
            });
            continue;
          }
          if (marks_obtained < 0 || marks_obtained > full) {
            skipped++;
            errors.push({
              row: rowNo,
              reason: `marks_obtained ${marks_obtained} out of range (0..${full}) for code ${component_code}`,
            });
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
          [
            examId,
            enrollment.enrollment_id,
            component_code,
            obtained,
            absentFlag,
            req.user.uid,
            req.user.uid,
          ]
        );

        imported++;
      }
    } else {
      const { compulsorySubjects, optionalGroups, optionalCodeMap } =
        await loadLedgerMaps(exam);

      const header = (rows[headerRowIdx] || []).map(normHeader);
      const sub = (rows[headerRowIdx + 1] || []).map(normHeader);

      const symbolIdx = header.findIndex((h) => h.includes("symbol"));
      const regdIdx = header.findIndex((h) => h.includes("reg"));
      const dobIdx = header.findIndex((h) => h.includes("dob"));
      const nameIdx = header.findIndex((h) => h.includes("name"));

      if (symbolIdx === -1 || nameIdx === -1) {
        throw new Error("Invalid ledger template: missing Symbol No. or Name header");
      }

      const compColIdxs = [];
      for (let i = nameIdx + 1; i < header.length; i++) {
        const h = header[i];
        if (!h) continue;
        if (h.includes("opt") || h.includes("grand total") || h.includes("attendance")) {
          break;
        }
        compColIdxs.push(i);
      }

      const compMappings = compColIdxs
        .map((idx, i) => {
          const subj = compulsorySubjects[i];
          if (!subj) return null;
          return {
            idx,
            component_code: String(subj.component_code),
            full_marks: subj.full_marks != null ? Number(subj.full_marks) : null,
          };
        })
        .filter(Boolean);

      if (compMappings.length === 0) {
        throw new Error("No compulsory components resolved for ledger import");
      }

      const optHeaderIdxs = [];
      for (let i = 0; i < header.length; i++) {
        if (header[i] && header[i].includes("opt")) optHeaderIdxs.push(i);
      }

      const optMappings = optHeaderIdxs.map((idx, i) => {
        const group = optionalGroups[i] || {
          name: String(rows[headerRowIdx]?.[idx] || `Opt ${i + 1}`),
        };
        return { group_name: group.name, code_idx: idx, mark_idx: idx + 1 };
      });
      const seenLedgerSymbols = new Map();
      const seenLedgerRegd = new Map();

      totalRows = Math.max(0, rows.length - (headerRowIdx + 2));

      const ensureEnrollment = async ({
        symbol_no,
        symbol_key,
        nameVal,
        regdVal,
        regd_key,
        dobVal,
      }) => {
        let existing = enrollmentBySymbol.get(symbol_key);
        if (existing) return existing;
        if (regd_key) {
          const regdExisting = enrollmentByRegd.get(regd_key);
          if (regdExisting) return regdExisting;
        }

        // try find student by symbol_no
        let student = null;
        if (symbol_no) {
          const [[bySymbol]] = await conn.query(
            `SELECT id, regd_no FROM students WHERE symbol_no=? LIMIT 1`,
            [symbol_no]
          );
          student = bySymbol || null;
        }
        let studentId = student?.id || null;
        let studentRegdNo = student?.regd_no ? String(student.regd_no).trim() : "";
        if (!studentId && regdVal) {
          const [[byRegd]] = await conn.query(
            `SELECT id, symbol_no FROM students WHERE regd_no=? LIMIT 1`,
            [regdVal]
          );
          if (byRegd?.id) {
            return {
              conflict: `Registration no ${regdVal} already used by symbol ${byRegd.symbol_no || "another student"}`,
            };
          }
        }
        if (studentId && regdVal && !studentRegdNo) {
          const [[byRegdOwner]] = await conn.query(
            `SELECT id FROM students WHERE regd_no=? LIMIT 1`,
            [regdVal]
          );
          if (byRegdOwner?.id && Number(byRegdOwner.id) !== Number(studentId)) {
            return {
              conflict: `Registration no ${regdVal} already belongs to another student`,
            };
          }
        }
        if (!studentId) {
          const [ins] = await conn.query(
            `INSERT INTO students (full_name, dob, symbol_no, regd_no)
             VALUES (?,?,?,?)`,
            [nameVal || regdVal || "Student", dobVal || null, symbol_no || null, regdVal || null]
          );
          studentId = ins.insertId;
          studentRegdNo = regdVal || "";
        } else if (nameVal || regdVal || dobVal) {
          await conn.query(
            `UPDATE students
             SET full_name=CASE
                              WHEN full_name IS NULL OR TRIM(full_name)='' THEN COALESCE(NULLIF(?,''), full_name)
                              ELSE full_name
                            END,
                 regd_no=CASE
                           WHEN regd_no IS NULL OR TRIM(regd_no)='' THEN COALESCE(NULLIF(?,''), regd_no)
                           ELSE regd_no
                         END,
                 dob=COALESCE(dob, ?)
             WHERE id=?`,
            [nameVal, regdVal, dobVal, studentId]
          );
          if (!studentRegdNo && regdVal) studentRegdNo = regdVal;
        }

        // ensure enrollment
        const [[enr]] = await conn.query(
          `SELECT id, batch_id FROM student_enrollments
           WHERE student_id=? AND academic_year_id=? AND class_id=?
           LIMIT 1`,
          [studentId, exam.academic_year_id, exam.class_id]
        );
        let enrollmentId = enr?.id || null;
        if (enrollmentId && targetBatchId && Number(enr.batch_id || 0) !== Number(targetBatchId)) {
          await conn.query(
            `UPDATE student_enrollments
             SET batch_id=?
             WHERE id=?`,
            [targetBatchId, enrollmentId]
          );
        }
        if (!enrollmentId) {
          const [insE] = await conn.query(
            `INSERT INTO student_enrollments
               (student_id, campus_id, academic_year_id, class_id, faculty_id, batch_id)
             VALUES (?,?,?,?,?,?)`,
            [
              studentId,
              exam.campus_id,
              exam.academic_year_id,
              exam.class_id,
              defaultFacultyId,
              targetBatchId,
            ]
          );
          enrollmentId = insE.insertId;
        }

        const payload = {
          enrollment_id: enrollmentId,
          student_id: studentId,
          symbol_no,
          regd_no: studentRegdNo || regdVal || "",
        };
        if (symbol_key) {
          enrollmentBySymbol.set(symbol_key, payload);
        }
        const finalRegdKey = normalizeIdentity(payload.regd_no);
        if (finalRegdKey && !enrollmentByRegd.has(finalRegdKey)) {
          enrollmentByRegd.set(finalRegdKey, payload);
        }
        return payload;
      };

      for (let r = headerRowIdx + 2; r < rows.length; r++) {
        const row = rows[r] || [];
        const rowNo = r + 1;
        await conn.query("SAVEPOINT row_import");

        try {
          let symbol_no = String(row[symbolIdx] ?? "").trim();
          let symbol_key = normalizeIdentity(symbol_no);
          const originalSymbol = symbol_no;

          const nameVal = String(row[nameIdx] ?? "").trim();
          const regdVal = regdIdx >= 0 ? String(row[regdIdx] ?? "").trim() : "";
          const regd_key = normalizeIdentity(regdVal);

          const hasMarks =
            compMappings.some((cm) => row[cm.idx] !== "" && row[cm.idx] != null) ||
            optMappings.some((om) => row[om.code_idx] || row[om.mark_idx]);
          const hasRowContent = !!(nameVal || symbol_key || regd_key || hasMarks);
          if (!hasRowContent) {
            // Ignore fully empty rows in template (common in partially filled sheets).
            await conn.query("RELEASE SAVEPOINT row_import");
            continue;
          }

          // If symbol is duplicated in this file, blank it for this row and continue by regd mapping.
          if (symbol_key && seenLedgerSymbols.has(symbol_key)) {
            symbol_no = "";
            symbol_key = "";
            errors.push({
              row: rowNo,
              reason: `Duplicate symbol_no ${originalSymbol} in file; symbol cleared for this row and continued by registration`,
            });
          } else if (symbol_key) {
            seenLedgerSymbols.set(symbol_key, rowNo);
          }

          if (!symbol_key && !regd_key) {
            skipped++;
            errors.push({
              row: rowNo,
              reason: "Missing symbol_no and registration no; row skipped",
            });
            await conn.query("ROLLBACK TO SAVEPOINT row_import");
            await conn.query("RELEASE SAVEPOINT row_import");
            continue;
          }

          if (regd_key) {
            if (seenLedgerRegd.has(regd_key)) {
              skipped++;
              errors.push({
                row: rowNo,
                reason: `Duplicate registration no ${regdVal} in file (first seen at row ${seenLedgerRegd.get(regd_key)}); row skipped to avoid overwrite`,
              });
              await conn.query("ROLLBACK TO SAVEPOINT row_import");
              await conn.query("RELEASE SAVEPOINT row_import");
              continue;
            }
            seenLedgerRegd.set(regd_key, rowNo);
          }

          if (!nameVal && !hasMarks) {
            await conn.query("RELEASE SAVEPOINT row_import");
            continue;
          }

          let dobVal = null;
          if (dobIdx >= 0) {
            const adIdx = sub[dobIdx + 1] && sub[dobIdx + 1].includes("ad") ? dobIdx + 1 : dobIdx;
            dobVal = excelDateToISO(row[adIdx]);
          }

          let enrollment = symbol_key ? enrollmentBySymbol.get(symbol_key) : null;
          if (!enrollment && regd_key) {
            enrollment = enrollmentByRegd.get(regd_key) || null;
          }
          if (!enrollment) {
            enrollment = await ensureEnrollment({
              symbol_no,
              symbol_key,
              nameVal,
              regdVal,
              regd_key,
              dobVal,
            });
          }
          if (enrollment?.conflict || !enrollment?.enrollment_id) {
            skipped++;
            errors.push({
              row: rowNo,
              reason: enrollment?.conflict || "Unable to resolve enrollment for row",
            });
            await conn.query("ROLLBACK TO SAVEPOINT row_import");
            await conn.query("RELEASE SAVEPOINT row_import");
            continue;
          }

          if (symbol_key && !enrollmentBySymbol.has(symbol_key)) {
            enrollmentBySymbol.set(symbol_key, enrollment);
          }

          if (regd_key) {
            const regdOwner = enrollmentByRegd.get(regd_key);
            if (regdOwner && Number(regdOwner.student_id) !== Number(enrollment.student_id)) {
              skipped++;
              errors.push({
                row: rowNo,
                reason: `Registration no ${regdVal} maps to a different student; row skipped`,
              });
              await conn.query("ROLLBACK TO SAVEPOINT row_import");
              await conn.query("RELEASE SAVEPOINT row_import");
              continue;
            }
            if (!regdOwner) enrollmentByRegd.set(regd_key, enrollment);
          }

          if (nameVal || regdVal || dobVal) {
            await conn.query(
              `UPDATE students
               SET full_name=CASE
                                WHEN full_name IS NULL OR TRIM(full_name)='' THEN COALESCE(NULLIF(?,''), full_name)
                                ELSE full_name
                              END,
                   regd_no=CASE
                             WHEN regd_no IS NULL OR TRIM(regd_no)='' THEN COALESCE(NULLIF(?,''), regd_no)
                             ELSE regd_no
                           END,
                   dob=COALESCE(dob, ?)
               WHERE id=?`,
              [nameVal, regdVal, dobVal, enrollment.student_id]
            );
          }

          const choices = [];
          const optionalMarks = new Map();

          for (const om of optMappings) {
            let code = String(row[om.code_idx] ?? "").trim();
            code = code.replace(/^0+(?=\d)/, "");
            if (!code) continue;

            const meta = optionalCodeMap.get(code);
            if (!meta) {
              skipped++;
              errors.push({ row: rowNo, reason: `Unknown optional code ${code}` });
              continue;
            }
            choices.push({ group_name: meta.group_name, subject_id: meta.subject_id });

            const mk = toNum(row[om.mark_idx]);
            if (mk != null) optionalMarks.set(code, mk);
          }

          if (choices.length) {
            const normalizedChoices = [];
            const seenGroups = new Set();
            const seenSubjects = new Set();
            for (const ch of choices) {
              if (!ch?.group_name || !ch?.subject_id) continue;
              if (seenGroups.has(ch.group_name) || seenSubjects.has(ch.subject_id)) continue;
              seenGroups.add(ch.group_name);
              seenSubjects.add(ch.subject_id);
              normalizedChoices.push(ch);
              if (normalizedChoices.length >= MAX_OPTIONAL_SUBJECTS) break;
            }

            const allowedSubjectIds = new Set(normalizedChoices.map((c) => Number(c.subject_id)));
            for (const code of Array.from(optionalMarks.keys())) {
              const meta = optionalCodeMap.get(String(code));
              if (!meta?.subject_id || !allowedSubjectIds.has(Number(meta.subject_id))) {
                optionalMarks.delete(code);
              }
            }

            await conn.query(
              `DELETE FROM student_optional_choices WHERE enrollment_id=?`,
              [enrollment.enrollment_id]
            );
            for (const ch of normalizedChoices) {
              await conn.query(
                `INSERT INTO student_optional_choices (enrollment_id, group_name, subject_id)
                 VALUES (?,?,?)`,
                [enrollment.enrollment_id, ch.group_name, ch.subject_id]
              );
            }
          }

          const markItems = [];
          for (const cm of compMappings) {
            const mk = toNum(row[cm.idx]);
            if (mk == null) continue;
            markItems.push({ component_code: cm.component_code, marks: mk });
          }
          for (const [code, mk] of optionalMarks.entries()) {
            markItems.push({ component_code: code, marks: mk });
          }

          for (const item of markItems) {
            const full = cfgByCode.get(item.component_code);
            if (full == null) {
              skipped++;
              errors.push({
                row: rowNo,
                reason: `component_code ${item.component_code} not enabled/configured for this exam`,
              });
              continue;
            }
            if (item.marks < 0 || item.marks > full) {
              skipped++;
              errors.push({
                row: rowNo,
                reason: `marks ${item.marks} out of range (0..${full}) for code ${item.component_code}`,
              });
              continue;
            }

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
              [
                examId,
                enrollment.enrollment_id,
                item.component_code,
                item.marks,
                0,
                req.user.uid,
                req.user.uid,
              ]
            );
            imported++;
          }

          await conn.query("RELEASE SAVEPOINT row_import");
        } catch (rowErr) {
          skipped++;
          errors.push({
            row: rowNo,
            reason: formatImportErrorMessage(rowErr),
          });
          try {
            await conn.query("ROLLBACK TO SAVEPOINT row_import");
            await conn.query("RELEASE SAVEPOINT row_import");
          } catch (_e) {
            // ignore savepoint cleanup failures
          }
        }
      }
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    return res
      .status(500)
      .json({ ok: false, message: "Import failed", error: String(e.message || e) });
  } finally {
    conn.release();
  }

  // Limit errors list in response (avoid huge payload)
  const errorsLimited = errors.slice(0, 200);

  return res.json({
    ok: true,
    exam_id: examId,
    batch_id: targetBatchId,
    sheet: sheetName,
    total_rows: totalRows,
    imported,
    skipped,
    errors_count: errors.length,
    errors: errorsLimited,
  });
}

// GET /api/import/marks-ledger-template?exam_id=1
async function downloadMarksLedgerTemplate(req, res) {
  const examId = Number(req.query.exam_id);
  let exam = null;

  if (examId) {
    const [[row]] = await db.query(
      `SELECT e.id, e.name, e.academic_year_id, e.class_id, c.name AS campus_name, ay.year_bs, cl.name AS class_name
       FROM exams e
       JOIN campuses c ON c.id=e.campus_id
       JOIN academic_years ay ON ay.id=e.academic_year_id
       JOIN classes cl ON cl.id=e.class_id
       WHERE e.id=? LIMIT 1`,
      [examId]
    );
    exam = row || null;
  }

  const maps = exam ? await loadLedgerMaps(exam) : { compulsorySubjects: [], optionalGroups: [] };
  const compulsorySubjects = maps.compulsorySubjects || [];
  const optionalGroups = maps.optionalGroups || [];

  const headerRow = ["SN", "Symbol No.", "Regd. No.", "DOB", "", "Name of Student"];
  const subRow = ["", "", "", "BS", "AD", ""];
  const fullRow = ["", "", "", "", "", ""];

  for (const s of compulsorySubjects) {
    headerRow.push(s.subject_name);
    subRow.push("TH");
    fullRow.push(s.full_marks != null ? s.full_marks : "");
  }

  for (const g of optionalGroups) {
    headerRow.push(g.name);
    headerRow.push("");
    subRow.push("Sub. Code");
    subRow.push("TH");
    fullRow.push("");
    fullRow.push("");
  }

  headerRow.push("Grand Total", "Attendance");
  subRow.push("TH", "");
  fullRow.push("", "");

  const titleCampus = exam?.campus_name || "NEB Result System";
  const titleClass = exam?.class_name ? `${exam.class_name}` : "Grade";
  const titleYear = exam?.year_bs ? ` ${exam.year_bs}` : "";
  const titleExam = exam?.name ? `${exam.name}` : "Exam";

  const data = [
    [titleCampus],
    [titleClass + titleYear],
    [`${titleExam} Mark Ledger`],
    [],
    headerRow,
    subRow,
    fullRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mark Ledger");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"marks_ledger_template.xlsx\"`
  );
  return res.send(buf);
}

module.exports = { importMarks, downloadMarksLedgerTemplate };
