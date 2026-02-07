const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const PDFDocument = require("pdfkit");
const db = require("../db");

function norm(s) {
  return String(s ?? "").trim();
}

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve({ stdout, stderr });
    });
  });
}

function safeImage(doc, imgPath, x, y, opts) {
  try {
    if (fs.existsSync(imgPath)) doc.image(imgPath, x, y, opts);
  } catch {}
}

function padCode(code) {
  const s = String(code ?? "").trim();
  if (!s) return "";
  if (s.length >= 4) return s;
  return s.padStart(4, "0");
}

/**
 * IMPORTANT FIX:
 * Prevent "ERR_STREAM_WRITE_AFTER_END" by stopping PDFKit
 * if client disconnects / response closes.
 */
function pipePdfToResponse({ res, doc }) {
  const onCloseOrError = () => {
    try {
      doc.removeAllListeners("data");
      doc.removeAllListeners("end");
    } catch {}
    try {
      doc.destroy?.();
    } catch {}
  };

  res.on("close", onCloseOrError);
  res.on("error", onCloseOrError);

  doc.on("error", () => {
    // If headers not sent we can still send JSON, otherwise just abort
    if (!res.headersSent) {
      try {
        res.status(500).json({ ok: false, message: "PDF generation failed" });
      } catch {}
    }
    onCloseOrError();
  });

  doc.pipe(res);

  // return cleanup function
  return () => {
    res.off("close", onCloseOrError);
    res.off("error", onCloseOrError);
  };
}

// --------------- DB fetch helpers (async) ----------------
async function fetchPublishedSnapshot({ exam_id, symbol_no, dob }) {
  const [rows] = await db.query(
    `SELECT rs.enrollment_id, rs.payload_json, rs.overall_gpa, rs.final_grade, rs.result_status, rs.published_at,
            s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob
     FROM result_snapshots rs
     JOIN student_enrollments e ON e.id=rs.enrollment_id
     JOIN students s ON s.id=e.student_id
     WHERE rs.exam_id=? AND rs.published_at IS NOT NULL
       AND s.symbol_no=? AND DATE(s.dob)=DATE(?)
     LIMIT 1`,
    [exam_id, symbol_no, dob]
  );

  if (!rows.length) return null;

  const r = rows[0];
  let payload = null;
  try {
    payload = JSON.parse(r.payload_json);
  } catch {
    payload = null;
  }

  return { row: r, payload };
}

async function fetchExamHeader(exam_id) {
  const [[ex]] = await db.query(
    `SELECT e.name AS exam_name, e.published_at,
            ay.year_bs, cl.name AS class_name, f.name AS faculty_name,
            c.name AS campus_name, c.address AS campus_address
     FROM exams e
     JOIN academic_years ay ON ay.id=e.academic_year_id
     JOIN classes cl ON cl.id=e.class_id
     LEFT JOIN faculties f ON f.id=e.faculty_id
     JOIN campuses c ON c.id=e.campus_id
     WHERE e.id=? LIMIT 1`,
    [exam_id]
  );
  return ex || null;
}

async function fetchSubjectCodeMap(subjectIds) {
  const map = new Map();
  if (!subjectIds || subjectIds.length === 0) return map;

  const [rows] = await db.query(
    `SELECT subject_id,
            MAX(CASE WHEN component_type='TH' THEN component_code ELSE NULL END) AS th_code,
            MIN(component_code) AS any_code
     FROM subject_components
     WHERE subject_id IN (?)
     GROUP BY subject_id`,
    [subjectIds]
  );

  for (const x of rows) {
    map.set(Number(x.subject_id), x.th_code || x.any_code || "");
  }
  return map;
}

async function fetchSubjectCreditMap(subjectIds) {
  const map = new Map();
  if (!subjectIds || subjectIds.length === 0) return map;

  const [rows] = await db.query(
    `SELECT subject_id, SUM(credit_hour) AS total_credit
     FROM subject_components
     WHERE subject_id IN (?)
     GROUP BY subject_id`,
    [subjectIds]
  );

  for (const x of rows) {
    map.set(Number(x.subject_id), Number(x.total_credit || 0));
  }
  return map;
}

function pickByMinValue(rules, value) {
  for (const r of rules) {
    if (value >= Number(r.min_value)) return r;
  }
  return rules[rules.length - 1] || null;
}

async function getExamGradeRules(exam_id) {
  const [[exam]] = await db.query(
    `SELECT grading_scheme_id FROM exams WHERE id=? LIMIT 1`,
    [exam_id]
  );
  if (!exam?.grading_scheme_id) {
    throw new Error("Exam grading scheme not set");
  }

  const [rows] = await db.query(
    `SELECT rule_type, min_value, grade, gpa
     FROM grading_rules
     WHERE scheme_id=?
     ORDER BY rule_type ASC, min_value DESC`,
    [exam.grading_scheme_id]
  );

  return {
    gpaRules: rows.filter((r) => r.rule_type === "SUBJECT_GPA"),
    gradeRules: rows.filter((r) => r.rule_type === "SUBJECT_GRADE"),
  };
}

// Builds TH/IN/PR rows for marksheet based on enabled exam components
async function buildMarksheetComponentRows(exam_id, enrollment_id, rules) {
  // enrollment context for compulsory group
  const [[enroll]] = await db.query(
    `SELECT academic_year_id, class_id
     FROM student_enrollments
     WHERE id=? LIMIT 1`,
    [enrollment_id]
  );
  if (!enroll) throw new Error("Enrollment not found");

  // subject ids = compulsory + chosen optionals
  const [[cg]] = await db.query(
    `SELECT id FROM catalog_groups
     WHERE academic_year_id <=> ? AND class_id <=> ? AND faculty_id IS NULL AND name='COMPULSORY'
     LIMIT 1`,
    [enroll.academic_year_id, enroll.class_id]
  );

  let subjectIds = [];
  if (cg) {
    const [cs] = await db.query(
      `SELECT subject_id FROM catalog_group_subjects WHERE catalog_group_id=?`,
      [cg.id]
    );
    subjectIds.push(...cs.map((x) => x.subject_id));
  }

  const [ops] = await db.query(
    `SELECT subject_id FROM student_optional_choices WHERE enrollment_id=?`,
    [enrollment_id]
  );
  subjectIds.push(...ops.map((x) => x.subject_id));
  subjectIds = [...new Set(subjectIds)];

  // components for these subjects
  const [components] = await db.query(
    `SELECT sc.subject_id, s.name AS subject_name,
            sc.component_type, sc.component_code, sc.component_title, sc.credit_hour
     FROM subject_components sc
     JOIN subjects s ON s.id=sc.subject_id
     WHERE sc.subject_id IN (?)
     ORDER BY s.name ASC, FIELD(sc.component_type,'TH','PR','IN')`,
    [subjectIds]
  );

  // enabled configs for this exam
  const [cfg] = await db.query(
    `SELECT component_code, full_marks
     FROM exam_component_configs
     WHERE exam_id=? AND is_enabled=1`,
    [exam_id]
  );
  const cfgByCode = new Map(
    cfg.map((x) => [String(x.component_code), Number(x.full_marks)])
  );

  // marks for this exam + enrollment
  const [marks] = await db.query(
    `SELECT component_code, marks_obtained, is_absent
     FROM marks
     WHERE exam_id=? AND enrollment_id=?`,
    [exam_id, enrollment_id]
  );
  const markByCode = new Map(marks.map((m) => [String(m.component_code), m]));

  // build rows only for enabled component codes
  const rowsOut = [];
  for (const c of components) {
    const code = String(c.component_code);
    const full = cfgByCode.get(code);
    if (full == null) continue; // not enabled in this exam

    const mk = markByCode.get(code);
    const is_absent = mk?.is_absent ? true : false;
    const obtained = is_absent
      ? null
      : mk?.marks_obtained != null
      ? Number(mk.marks_obtained)
      : null;

    let remark = "";
    if (is_absent) remark = "ABS";
    else if (obtained == null) remark = "W"; // withheld / missing

    // grade/gpa from percent
    const effectiveObtained = obtained == null ? 0 : obtained;
    let percent = 0;
    if (full > 0) percent = (effectiveObtained / full) * 100;

    const gpaRule = pickByMinValue(rules.gpaRules, percent);
    const gradeRule = pickByMinValue(rules.gradeRules, percent);

    const gpa = gpaRule?.gpa != null ? Number(gpaRule.gpa) : 0;
    const grade = gradeRule?.grade || "NG";

    rowsOut.push({
      subject_name: c.subject_name,
      component_type: c.component_type,
      subject_code_display: padCode(code),
      title: c.component_title,
      credit_hour: c.credit_hour != null ? String(c.credit_hour) : "",
      full_marks: full,
      marks_obtained: obtained,
      grade,
      gpa,
      remark,
    });
  }

  return rowsOut;
}

// --------------- SYNC renderer (NO await inside) ----------------
function renderMarksheetDoc(doc, r, payload, exam_id, ex, codeBySubject, creditBySubject) {
  const logoPath = path.join(__dirname, "../../assets/logo_for_neb.png");

  const subjects = payload?.subjects || [];

  // Outer border
  doc.lineWidth(1).rect(30, 25, 535, 785).stroke();

  // Header
  safeImage(doc, logoPath, 45, 35, { width: 60 });

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text((ex?.campus_name || "GAURI SHANKAR CAMPUS").toUpperCase(), 0, 40, {
      align: "center",
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(
      (ex?.campus_address ||
        "BHIMESHWAR MUNICIPALITY-03, CHARIKOT, DOLAKHA").toUpperCase(),
      { align: "center" }
    );

  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(13).text("GRADE-SHEET", { align: "center" });
  const gradeLineY = doc.y + 2;
  doc.moveTo(250, gradeLineY).lineTo(345, gradeLineY).stroke();
  doc.moveDown(0.6);

  const leftX = 50;
  const rightX = 320;
  const y0 = doc.y + 4;
  const dobAd = r.dob ? new Date(r.dob).toISOString().slice(0, 10) : "";

  doc.font("Helvetica").fontSize(10);
  doc.text("THE GRADE(S) SECURED BY:", leftX, y0);
  doc.font("Helvetica-Bold").text(r.full_name || "", leftX + 165, y0);
  doc.font("Helvetica").fontSize(10);

  doc.text(`DATE OF BIRTH: ${"—"}  B.S.  ( ${dobAd}  A.D. )`, leftX, y0 + 14);
  doc.text(`REGISTRATION NO.: ${r.regd_no || ""}`, leftX, y0 + 28);
  doc.text(`SYMBOL NO.: ${r.symbol_no || ""}`, rightX, y0 + 28);
  doc.text(`GRADE : ${ex?.class_name || ""}`, rightX, y0 + 42);

  const yearBS = ex?.year_bs || "";
  const yearAD = ex?.published_at ? new Date(ex.published_at).getUTCFullYear() : "";
  doc.text(
    `IN THE ANNUAL EXAMINATION CONDUCTED IN ${yearBS} B.S. (${yearAD} A.D.) ARE GIVEN BELOW.`,
    leftX,
    y0 + 56
  );

  // Table layout
  const startX = 45;
  const tableWidth = 520;
  const headerH = 28;
  const rowH = 18;
  const gpaRowH = 18;
  const minRows = 12;
  const rows = Math.max(subjects.length, minRows);

  const colWidths = [25, 60, 180, 55, 55, 45, 55, 45]; // total 520
  const colX = colWidths.reduce(
    (acc, w, i) => (acc.push(i === 0 ? startX : acc[i - 1] + colWidths[i - 1]), acc),
    []
  );

  let y = y0 + 80;

  const tableHeight = headerH + rows * rowH + gpaRowH;
  doc.rect(startX, y, tableWidth, tableHeight).stroke();

  // Vertical lines
  let vx = startX;
  for (const w of colWidths) {
    vx += w;
    doc.moveTo(vx, y).lineTo(vx, y + tableHeight).stroke();
  }

  // Header row
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("SN", colX[0] + 6, y + 8);
  doc.text("Subject Code", colX[1] + 4, y + 6, { width: colWidths[1] - 8, align: "center" });
  doc.text("SUBJECTS", colX[2] + 4, y + 8);
  doc.text("CREDIT\nHOUR (CH)", colX[3] + 2, y + 4, { width: colWidths[3] - 4, align: "center" });
  doc.text("GRADE\nPOINT (GP)", colX[4] + 2, y + 4, { width: colWidths[4] - 4, align: "center" });
  doc.text("GRADE", colX[5] + 2, y + 8, { width: colWidths[5] - 4, align: "center" });
  doc.text("FINAL\nGRADE (FG)", colX[6] + 2, y + 4, { width: colWidths[6] - 4, align: "center" });
  doc.text("REMARKS", colX[7] + 2, y + 8, { width: colWidths[7] - 4, align: "center" });

  // Header line
  doc.moveTo(startX, y + headerH).lineTo(startX + tableWidth, y + headerH).stroke();

  // Rows
  doc.font("Helvetica").fontSize(9);
  for (let i = 0; i < rows; i++) {
    const rowY = y + headerH + i * rowH;
    doc.moveTo(startX, rowY + rowH).lineTo(startX + tableWidth, rowY + rowH).stroke();

    doc.text(String(i + 1), colX[0] + 6, rowY + 5);

    const s = subjects[i];
    if (!s) continue;

    const subjId = Number(s.subject_id);
    const code = codeBySubject.get(subjId) || "";
    const credit = creditBySubject?.get(subjId);

    doc.text(padCode(code), colX[1] + 4, rowY + 5, { width: colWidths[1] - 8, align: "center" });
    doc.text(String(s.subject_name || ""), colX[2] + 4, rowY + 5, {
      width: colWidths[2] - 8,
    });
    doc.text(credit != null && !Number.isNaN(credit) ? String(credit) : "", colX[3] + 2, rowY + 5, {
      width: colWidths[3] - 4,
      align: "center",
    });
    doc.text(
      s.gpa != null && s.gpa !== "" ? Number(s.gpa).toFixed(2) : "",
      colX[4] + 2,
      rowY + 5,
      { width: colWidths[4] - 4, align: "center" }
    );
    doc.text(String(s.grade ?? ""), colX[5] + 2, rowY + 5, { width: colWidths[5] - 4, align: "center" });
    doc.text(String(s.final_grade ?? s.grade ?? ""), colX[6] + 2, rowY + 5, { width: colWidths[6] - 4, align: "center" });
    doc.text(s.status === "PASS" ? "" : String(s.status || ""), colX[7] + 2, rowY + 5, { width: colWidths[7] - 4, align: "center" });
  }

  // GPA row
  const gpaY = y + headerH + rows * rowH;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Grade Point Average (GPA):", colX[3] + 10, gpaY + 5, { width: 200 });
  doc.text(
    Number(r.overall_gpa || payload?.overall_gpa || 0).toFixed(2),
    colX[6] + 2,
    gpaY + 5,
    { width: colWidths[6] - 4, align: "center" }
  );

  // Extra credit section
  let yExtra = y + tableHeight + 10;
  doc.font("Helvetica-Bold").fontSize(9).text("EXTRA CREDIT SUBJECT", startX + 2, yExtra);
  yExtra += 8;
  const extraRows = 2;
  const extraHeight = extraRows * rowH;
  doc.rect(startX, yExtra, tableWidth, extraHeight).stroke();
  vx = startX;
  for (const w of colWidths) {
    vx += w;
    doc.moveTo(vx, yExtra).lineTo(vx, yExtra + extraHeight).stroke();
  }
  for (let i = 0; i < extraRows; i++) {
    const rowY = yExtra + i * rowH;
    doc.moveTo(startX, rowY + rowH).lineTo(startX + tableWidth, rowY + rowH).stroke();
    doc.font("Helvetica").fontSize(9);
    doc.text(String(rows + i + 1), colX[0] + 6, rowY + 5);
  }

  // Signatures
  const ySig = yExtra + extraHeight + 30;
  doc.font("Helvetica-Bold").fontSize(9).text("PREPARED BY:", 60, ySig);
  doc.moveTo(135, ySig + 12).lineTo(290, ySig + 12).stroke();

  doc.font("Helvetica-Bold").fontSize(9).text("CHECKED BY:", 320, ySig);
  doc.moveTo(395, ySig + 12).lineTo(535, ySig + 12).stroke();

  const yIssue = ySig + 32;
  doc.font("Helvetica-Bold").fontSize(9).text("DATE OF ISSUE:", 60, yIssue);
  doc.moveTo(150, yIssue + 10).lineTo(290, yIssue + 10).stroke();
  doc.font("Helvetica").fontSize(9).text(`${yearBS ? yearBS : ""}  B.S.`, 190, yIssue + 12);
  doc.font("Helvetica-Bold").fontSize(9).text("CAMPUS CHIEF", 380, yIssue + 10);

  const yNote = yIssue + 28;
  doc.font("Helvetica").fontSize(7);
  doc.text("NOTE : ONE CREDIT HOUR EQUALS TO 32 WORKING HOURS", 45, yNote);
  doc.text(
    "INTERNAL (IN) : THIS COVERS THE PARTICIPATION, PRACTICAL/PROJECT WORKS, COMMUNITY WORKS,",
    45,
    yNote + 10
  );
  doc.text("INTERNSHIP, PRESENTATION, TERMINAL EXAMINATIONS.", 45, yNote + 20);
  doc.text("THEORY (TH) : THIS COVERS WRITTEN EXTERNAL EXAMINATION", 45, yNote + 30);
  doc.text("ABS= ABSENT   W= WITHHELD", 45, yNote + 40);
}

// -------------------- PUBLIC/ADMIN PDF: Marksheet --------------------
async function marksheetPdf(req, res) {
  try {
    const exam_id = Number(req.query.exam_id);
    const symbol_no = norm(req.query.symbol_no);
    const dob = norm(req.query.dob);

    if (!exam_id || !symbol_no || !dob) {
      return res.status(400).json({ ok: false, message: "exam_id, symbol_no, dob required" });
    }

    const found = await fetchPublishedSnapshot({ exam_id, symbol_no, dob });
    if (!found) return res.status(404).json({ ok: false, message: "Published result not found" });

    const ex = await fetchExamHeader(exam_id);
    const subjects = found.payload?.subjects || [];
    const subjectIds = subjects.map((s) => Number(s.subject_id)).filter(Boolean);
    const codeBySubject = await fetchSubjectCodeMap(subjectIds);
    const creditBySubject = await fetchSubjectCreditMap(subjectIds);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="marksheet_${symbol_no}.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const cleanup = pipePdfToResponse({ res, doc });

    // If already closed, stop
    if (res.destroyed || res.writableEnded) {
      cleanup();
      try { doc.destroy?.(); } catch {}
      return;
    }

    renderMarksheetDoc(doc, found.row, found.payload, exam_id, ex, codeBySubject, creditBySubject);
    doc.end();
    cleanup();
  } catch (err) {
    // Don't write JSON if streaming already started
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    return res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
}

// -------------------- PUBLIC JPG: Marksheet (page 1) --------------------
async function marksheetJpg(req, res) {
  let tmpDir = null;

  try {
    const exam_id = Number(req.query.exam_id);
    const symbol_no = norm(req.query.symbol_no);
    const dob = norm(req.query.dob);

    if (!exam_id || !symbol_no || !dob) {
      return res.status(400).json({ ok: false, message: "exam_id, symbol_no, dob required" });
    }

    const found = await fetchPublishedSnapshot({ exam_id, symbol_no, dob });
    if (!found) return res.status(404).json({ ok: false, message: "Published result not found" });

    const ex = await fetchExamHeader(exam_id);
    const subjects = found.payload?.subjects || [];
    const subjectIds = subjects.map((s) => Number(s.subject_id)).filter(Boolean);
    const codeBySubject = await fetchSubjectCodeMap(subjectIds);
    const creditBySubject = await fetchSubjectCreditMap(subjectIds);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neb-"));
    const pdfPath = path.join(tmpDir, `marksheet_${symbol_no}_${exam_id}.pdf`);
    const outBase = path.join(tmpDir, `marksheet_${symbol_no}_${exam_id}`);

    // Build PDF to disk (NOT to res)
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const ws = fs.createWriteStream(pdfPath);

      ws.on("finish", resolve);
      ws.on("error", reject);
      doc.on("error", reject);

      doc.pipe(ws);
      renderMarksheetDoc(doc, found.row, found.payload, exam_id, ex, codeBySubject, creditBySubject);
      doc.end();
    });

    await execFileAsync("pdftoppm", ["-jpeg", "-f", "1", "-l", "1", "-singlefile", pdfPath, outBase]);

    const jpgPath = `${outBase}.jpg`;
    if (!fs.existsSync(jpgPath)) {
      throw new Error("JPG generation failed");
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename="marksheet_${symbol_no}.jpg"`);

    const rs = fs.createReadStream(jpgPath);

    const cleanup = () => {
      try { rs.destroy(); } catch {}
      if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
    rs.on("error", cleanup);

    rs.pipe(res);
  } catch (err) {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    return res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
}

// -------------------- PUBLIC/ADMIN PDF: Transcript --------------------
async function transcriptPdf(req, res) {
  try {
    const exam_ids = String(req.query.exam_ids || "")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter(Boolean);

    const symbol_no = norm(req.query.symbol_no);
    const dob = norm(req.query.dob);

    if (!symbol_no || !dob || exam_ids.length === 0) {
      return res.status(400).json({ ok: false, message: "symbol_no, dob, exam_ids=1,2 required" });
    }

    const [rows] = await db.query(
      `SELECT rs.payload_json, rs.overall_gpa, rs.final_grade, rs.result_status, rs.published_at,
              e.class_id, cl.name AS class_name,
              ex.name AS exam_name,
              s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob
       FROM result_snapshots rs
       JOIN exams ex ON ex.id=rs.exam_id
       JOIN student_enrollments e ON e.id=rs.enrollment_id
       JOIN classes cl ON cl.id=e.class_id
       JOIN students s ON s.id=e.student_id
       WHERE rs.exam_id IN (?) AND rs.published_at IS NOT NULL
         AND s.symbol_no=? AND DATE(s.dob)=DATE(?)
       ORDER BY e.class_id ASC`,
      [exam_ids, symbol_no, dob]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "No published results found for given exam_ids" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="transcript_${symbol_no}.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const cleanup = pipePdfToResponse({ res, doc });

    doc.fontSize(16).text("Gauri Shankar Campus", { align: "center" });
    doc.fontSize(12).text("Transcript", { align: "center" });
    doc.moveDown(1);

    const r0 = rows[0];
    doc.fontSize(11);
    doc.text(`Name: ${r0.full_name}`);
    doc.text(`Symbol No: ${r0.symbol_no}   Regd No: ${r0.regd_no || ""}`);
    doc.text(`DOB: ${new Date(r0.dob).toISOString().slice(0, 10)}`);
    doc.moveDown(1);

    for (const r of rows) {
      let payload = null;
      try { payload = JSON.parse(r.payload_json); } catch { payload = null; }
      const subjects = payload?.subjects || [];

      doc.fontSize(12).text(`Class: ${r.class_name}  |  Exam: ${r.exam_name}`, { underline: true });
      doc.fontSize(10).text(`Published: ${new Date(r.published_at).toISOString().slice(0, 10)}`);
      doc.moveDown(0.5);

      let y = doc.y;
      doc.fontSize(10);
      doc.text("Subject", 40, y);
      doc.text("Obt", 280, y);
      doc.text("Full", 330, y);
      doc.text("Grade", 390, y);
      doc.text("GPA", 450, y);
      y += 14;
      doc.moveTo(40, y).lineTo(555, y).stroke();
      y += 6;

      for (const s of subjects) {
        doc.text(s.subject_name, 40, y, { width: 230 });
        doc.text(String(s.total_obtained ?? ""), 280, y);
        doc.text(String(s.total_full ?? ""), 330, y);
        doc.text(String(s.grade ?? ""), 390, y);
        doc.text(String(s.gpa ?? ""), 450, y);
        y += 14;

        if (y > 720) { doc.addPage(); y = 60; }
      }

      y += 6;
      doc.moveTo(40, y).lineTo(555, y).stroke();
      y += 10;
      doc.fontSize(11).text(
        `Overall GPA: ${Number(r.overall_gpa).toFixed(2)}   Final Grade: ${r.final_grade}   Result: ${r.result_status}`,
        40, y
      );

      doc.moveDown(2);
    }

    doc.end();
    cleanup();
  } catch (err) {
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    return res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
}

// -------------------- PUBLIC JPG: Transcript (page 1) --------------------
async function transcriptJpg(req, res) {
  let tmpDir = null;

  try {
    const exam_ids = String(req.query.exam_ids || "")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter(Boolean);

    const symbol_no = norm(req.query.symbol_no);
    const dob = norm(req.query.dob);

    if (!symbol_no || !dob || exam_ids.length === 0) {
      return res.status(400).json({ ok: false, message: "symbol_no, dob, exam_ids=1,2 required" });
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neb-"));
    const pdfPath = path.join(tmpDir, `transcript_${symbol_no}.pdf`);
    const outBase = path.join(tmpDir, `transcript_${symbol_no}`);

    const [rows] = await db.query(
      `SELECT rs.payload_json, rs.overall_gpa, rs.final_grade, rs.result_status, rs.published_at,
              e.class_id, cl.name AS class_name,
              ex.name AS exam_name,
              s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob
       FROM result_snapshots rs
       JOIN exams ex ON ex.id=rs.exam_id
       JOIN student_enrollments e ON e.id=rs.enrollment_id
       JOIN classes cl ON cl.id=e.class_id
       JOIN students s ON s.id=e.student_id
       WHERE rs.exam_id IN (?) AND rs.published_at IS NOT NULL
         AND s.symbol_no=? AND DATE(s.dob)=DATE(?)
       ORDER BY e.class_id ASC`,
      [exam_ids, symbol_no, dob]
    );

    if (!rows.length) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return res.status(404).json({ ok: false, message: "No published results found for given exam_ids" });
    }

    // Build PDF to disk
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const ws = fs.createWriteStream(pdfPath);

      ws.on("finish", resolve);
      ws.on("error", reject);
      doc.on("error", reject);

      doc.pipe(ws);

      doc.fontSize(16).text("Gauri Shankar Campus", { align: "center" });
      doc.fontSize(12).text("Transcript", { align: "center" });
      doc.moveDown(1);

      const r0 = rows[0];
      doc.fontSize(11);
      doc.text(`Name: ${r0.full_name}`);
      doc.text(`Symbol No: ${r0.symbol_no}   Regd No: ${r0.regd_no || ""}`);
      doc.text(`DOB: ${new Date(r0.dob).toISOString().slice(0, 10)}`);
      doc.moveDown(1);

      for (const r of rows) {
        let payload = null;
        try { payload = JSON.parse(r.payload_json); } catch { payload = null; }
        const subjects = payload?.subjects || [];

        doc.fontSize(12).text(`Class: ${r.class_name}  |  Exam: ${r.exam_name}`, { underline: true });
        doc.fontSize(10).text(`Published: ${new Date(r.published_at).toISOString().slice(0, 10)}`);
        doc.moveDown(0.5);

        let y = doc.y;
        doc.fontSize(10);
        doc.text("Subject", 40, y);
        doc.text("Obt", 280, y);
        doc.text("Full", 330, y);
        doc.text("Grade", 390, y);
        doc.text("GPA", 450, y);
        y += 14;
        doc.moveTo(40, y).lineTo(555, y).stroke();
        y += 6;

        for (const s of subjects) {
          doc.text(s.subject_name, 40, y, { width: 230 });
          doc.text(String(s.total_obtained ?? ""), 280, y);
          doc.text(String(s.total_full ?? ""), 330, y);
          doc.text(String(s.grade ?? ""), 390, y);
          doc.text(String(s.gpa ?? ""), 450, y);
          y += 14;

          if (y > 720) { doc.addPage(); y = 60; }
        }

        y += 6;
        doc.moveTo(40, y).lineTo(555, y).stroke();
        y += 10;
        doc.fontSize(11).text(
          `Overall GPA: ${Number(r.overall_gpa).toFixed(2)}   Final Grade: ${r.final_grade}   Result: ${r.result_status}`,
          40, y
        );

        doc.moveDown(2);
      }

      doc.end();
    });

    await execFileAsync("pdftoppm", ["-jpeg", "-f", "1", "-l", "1", "-singlefile", pdfPath, outBase]);

    const jpgPath = `${outBase}.jpg`;
    if (!fs.existsSync(jpgPath)) {
      throw new Error("JPG generation failed");
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename="transcript_${symbol_no}.jpg"`);

    const rs = fs.createReadStream(jpgPath);

    const cleanup = () => {
      try { rs.destroy(); } catch {}
      if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
    rs.on("error", cleanup);

    rs.pipe(res);
  } catch (err) {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    return res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
}

module.exports = { marksheetPdf, marksheetJpg, transcriptPdf, transcriptJpg };
