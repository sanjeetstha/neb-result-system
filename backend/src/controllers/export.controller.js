const PDFDocument = require("pdfkit");
const db = require("../db");

function norm(s) {
  return String(s ?? "").trim();
}

async function marksheetPdf(req, res) {
  const exam_id = Number(req.query.exam_id);
  const symbol_no = norm(req.query.symbol_no);
  const dob = norm(req.query.dob);

  if (!exam_id || !symbol_no || !dob) {
    return res.status(400).json({ ok: false, message: "exam_id, symbol_no, dob required" });
  }

  // published snapshot only
  const [rows] = await db.query(
    `SELECT rs.payload_json, rs.overall_gpa, rs.final_grade, rs.result_status, rs.published_at,
            s.full_name, s.symbol_no, s.regd_no, s.roll_no, s.dob,
            e.campus_id, e.academic_year_id, e.class_id, e.faculty_id
     FROM result_snapshots rs
     JOIN student_enrollments e ON e.id=rs.enrollment_id
     JOIN students s ON s.id=e.student_id
     WHERE rs.exam_id=? AND rs.published_at IS NOT NULL
       AND s.symbol_no=? AND DATE(s.dob)=DATE(?)
     LIMIT 1`,
    [exam_id, symbol_no, dob]
  );

  if (!rows.length) return res.status(404).json({ ok: false, message: "Published result not found" });

  const r = rows[0];
  let payload = null;
  try { payload = JSON.parse(r.payload_json); } catch { payload = null; }

  const subjects = payload?.subjects || [];

  // ---- PDF setup ----
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="marksheet_${symbol_no}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  doc.pipe(res);

  const path = require("path");
  const fs = require("fs");

  function safeImage(doc, imgPath, x, y, opts) {
    try {
      if (fs.existsSync(imgPath)) doc.image(imgPath, x, y, opts);
    } catch {}
  }


  // Header
  const logoPath = path.join(__dirname, "../../assets/logo.png");

  // Logo + header
  safeImage(doc, logoPath, 40, 35, { width: 60 });

  doc.fontSize(16).text("Gaurishankar Multiple Campus", 0, 40, { align: "center" });
  doc.fontSize(11).text("Charikot, Dolakha", { align: "center" });
  doc.fontSize(12).text("Marksheet", { align: "center" });
  doc.moveDown(1.2);


  // Student info
  doc.fontSize(11);
  doc.text(`Name: ${r.full_name}`);
  doc.text(`Symbol No: ${r.symbol_no}   Roll No: ${r.roll_no || ""}`);
  doc.text(`Regd No: ${r.regd_no || ""}   DOB: ${new Date(r.dob).toISOString().slice(0,10)}`);
  doc.text(`Exam ID: ${exam_id}   Published: ${new Date(r.published_at).toISOString().slice(0,10)}`);
  doc.moveDown(1);

  // Table header
  const startX = 40;
  let y = doc.y;

  const col1 = startX;
  const col2 = 250;
  const col3 = 340;
  const col4 = 400;
  const col5 = 460;

  doc.fontSize(10).text("Subject", col1, y);
  doc.text("Obtained", col2, y);
  doc.text("Full", col3, y);
  doc.text("Grade", col4, y);
  doc.text("GPA", col5, y);
  y += 16;

  doc.moveTo(startX, y).lineTo(555, y).stroke();
  y += 8;

  // Table rows
  doc.fontSize(10);
  for (const s of subjects) {
    doc.text(s.subject_name, col1, y, { width: 200 });
    doc.text(String(s.total_obtained ?? ""), col2, y);
    doc.text(String(s.total_full ?? ""), col3, y);
    doc.text(String(s.grade ?? ""), col4, y);
    doc.text(String(s.gpa ?? ""), col5, y);
    y += 16;

    if (y > 720) {
      doc.addPage();
      y = 60;
    }
  }

  doc.moveDown(1);
  doc.moveTo(startX, y).lineTo(555, y).stroke();
  y += 12;

  // Summary
  doc.fontSize(11);
  doc.text(`Overall GPA: ${Number(r.overall_gpa).toFixed(2)}`, startX, y);
  y += 16;
  doc.text(`Final Grade: ${r.final_grade}   Result: ${r.result_status}`, startX, y);

  // Footer
  doc.moveDown(3);
  const ySig = doc.y;

  doc.fontSize(10);
  doc.text("____________________", 60, ySig);
  doc.text("Exam Coordinator", 80, ySig + 15);

  doc.text("____________________", 350, ySig);
  doc.text("Principal", 400, ySig + 15);


  doc.end();
}


async function transcriptPdf(req, res) {
  const exam_ids = String(req.query.exam_ids || "").split(",").map(x => Number(x.trim())).filter(Boolean);
  const symbol_no = String(req.query.symbol_no || "").trim();
  const dob = String(req.query.dob || "").trim();

  if (!symbol_no || !dob || exam_ids.length === 0) {
    return res.status(400).json({ ok: false, message: "symbol_no, dob, exam_ids=1,2 required" });
  }

  // Pull published snapshots for those exams
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

  if (!rows.length) return res.status(404).json({ ok: false, message: "No published results found for given exam_ids" });

  // PDF setup
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="transcript_${symbol_no}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  doc.pipe(res);

  // Header
  doc.fontSize(16).text("Gaurishankar Multiple Campus", { align: "center" });
  doc.fontSize(12).text("Transcript", { align: "center" });
  doc.moveDown(1);

  // Student info from first row
  const r0 = rows[0];
  doc.fontSize(11);
  doc.text(`Name: ${r0.full_name}`);
  doc.text(`Symbol No: ${r0.symbol_no}   Regd No: ${r0.regd_no || ""}`);
  doc.text(`DOB: ${new Date(r0.dob).toISOString().slice(0,10)}`);
  doc.moveDown(1);

  // For each exam snapshot (Class 11 / Class 12)
  for (const r of rows) {
    let payload = null;
    try { payload = JSON.parse(r.payload_json); } catch { payload = null; }
    const subjects = payload?.subjects || [];

    doc.fontSize(12).text(`Class: ${r.class_name}  |  Exam: ${r.exam_name}`, { underline: true });
    doc.fontSize(10).text(`Published: ${new Date(r.published_at).toISOString().slice(0,10)}`);
    doc.moveDown(0.5);

    // Table header
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

      if (y > 720) {
        doc.addPage();
        y = 60;
      }
    }

    y += 6;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 10;
    doc.fontSize(11).text(`Overall GPA: ${Number(r.overall_gpa).toFixed(2)}   Final Grade: ${r.final_grade}   Result: ${r.result_status}`, 40, y);

    doc.moveDown(2);
  }

  // Sign lines
  doc.moveDown(2);
  const ySig = doc.y;
  doc.fontSize(10);
  doc.text("____________________", 60, ySig);
  doc.text("Exam Section", 90, ySig + 15);
  doc.text("____________________", 350, ySig);
  doc.text("Principal", 400, ySig + 15);

  doc.end();
}


module.exports = { marksheetPdf, transcriptPdf };

