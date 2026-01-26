const db = require("../db");
const { previewResult } = require("../services/result.service");

async function preview(req, res) {
  try {
    const examId = Number(req.params.examId);
    const enrollmentId = Number(req.params.enrollmentId);
    const data = await previewResult({ examId, enrollmentId });
    res.json({ ok: true, result: data });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message || "Error" });
  }
}

// Save snapshot for ONE student (Option A workflow)
async function generate(req, res) {
  try {
    const examId = Number(req.params.examId);
    const enrollmentId = Number(req.params.enrollmentId);

    const [[exam]] = await db.query(
      `SELECT id, is_locked FROM exams WHERE id=? LIMIT 1`,
      [examId]
    );
    if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
    // if (exam.is_locked) return res.status(423).json({ ok: false, message: "Exam is locked (published)" });
    if (exam.is_locked && req.user.role !== "SUPER_ADMIN") {
      return res.status(423).json({ ok: false, message: "Exam is locked (published)" });
    }


    const result = await previewResult({ examId, enrollmentId });

    const payload = JSON.stringify(result);

    // Upsert snapshot (if exists, update)
    await db.query(
      `INSERT INTO result_snapshots
        (exam_id, enrollment_id, overall_gpa, final_grade, result_status, payload_json, generated_by, generated_at)
       VALUES (?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE
         overall_gpa=VALUES(overall_gpa),
         final_grade=VALUES(final_grade),
         result_status=VALUES(result_status),
         payload_json=VALUES(payload_json),
         generated_by=VALUES(generated_by),
         generated_at=NOW()`,
         
      [examId, enrollmentId, result.overall_gpa, result.final_grade, result.result_status, payload, req.user.uid]
    );
    
    await db.query(
  `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
   VALUES (?,?,?,?,?,?,?)`,
  [
    req.user.uid,
    "RESULT_SNAPSHOT_GENERATED",
    "result_snapshots",
    `${examId}:${enrollmentId}`,
    req.ip || null,
    req.headers["user-agent"] || null,
    JSON.stringify({ exam_id: examId, enrollment_id: enrollmentId })
  ]
  );



    await db.query(
      `INSERT INTO result_actions (exam_id, enrollment_id, action, done_by, done_at)
       VALUES (?,?,?,?,NOW())`,
      [examId, enrollmentId, "GENERATE", req.user.uid]
    );

    res.json({ ok: true, message: "Snapshot generated", exam_id: examId, enrollment_id: enrollmentId });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message || "Error" });
  }
}

// Read saved snapshot (stable output)
async function getSnapshot(req, res) {
  const examId = Number(req.params.examId);
  const enrollmentId = Number(req.params.enrollmentId);

  const [rows] = await db.query(
    `SELECT exam_id, enrollment_id, overall_gpa, final_grade, result_status, payload_json, generated_at, published_at
     FROM result_snapshots
     WHERE exam_id=? AND enrollment_id=? LIMIT 1`,
    [examId, enrollmentId]
  );

  if (!rows.length) return res.status(404).json({ ok: false, message: "Snapshot not found. Generate first." });

  const row = rows[0];
  let payload = null;
  try { payload = JSON.parse(row.payload_json); } catch { payload = null; }

  res.json({
    ok: true,
    snapshot: {
      exam_id: row.exam_id,
      enrollment_id: row.enrollment_id,
      overall_gpa: Number(row.overall_gpa),
      final_grade: row.final_grade,
      result_status: row.result_status,
      generated_at: row.generated_at,
      published_at: row.published_at,
      payload
    }
  });
}

// Publish ALL generated snapshots for the exam and lock it (Option A)
async function publishExam(req, res) {
  const examId = Number(req.params.examId);

  const [[exam]] = await db.query(
    `SELECT id, is_locked FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
  if (exam.is_locked) return res.status(409).json({ ok: false, message: "Exam already published/locked" });

  // publish only those snapshots that exist
  const [r] = await db.query(
    `UPDATE result_snapshots
     SET published_at=NOW()
     WHERE exam_id=? AND published_at IS NULL`,
    [examId]
  );

  if (r.affectedRows === 0) {
    return res.status(400).json({ ok: false, message: "No generated snapshots to publish" });
  }

  // lock exam
  await db.query(
    `UPDATE exams SET published_at=NOW(), is_locked=1 WHERE id=?`,
    [examId]
  );

  // log exam-level publish action
  await db.query(
    `INSERT INTO result_actions (exam_id, enrollment_id, action, done_by, done_at, note)
     VALUES (?,NULL,'PUBLISH',?,NOW(),?)`,
    [examId, req.user.uid, `Published ${r.affectedRows} snapshots`]
  );

  res.json({ ok: true, message: "Exam published and locked", published_count: r.affectedRows });
}

module.exports = { preview, generate, getSnapshot, publishExam };
