const db = require("../db");
const { previewResult } = require("../services/result.service");

const WORKFLOW_STATES = new Set([
  "DRAFT",
  "SUBMITTED",
  "VERIFIED",
  "APPROVED",
  "PUBLISHED",
]);

function normalizeWorkflowState(examRow) {
  if (examRow?.published_at || Number(examRow?.is_locked || 0) === 1) return "PUBLISHED";
  const raw = String(examRow?.workflow_status || "").trim().toUpperCase();
  return WORKFLOW_STATES.has(raw) ? raw : "DRAFT";
}

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
      `SELECT id, is_locked, workflow_status FROM exams WHERE id=? LIMIT 1`,
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

    await db.query(
      `UPDATE exams
       SET workflow_status='DRAFT',
           submitted_at=NULL, submitted_by=NULL,
           verified_at=NULL, verified_by=NULL,
           approved_at=NULL, approved_by=NULL
       WHERE id=? AND is_locked=0 AND COALESCE(workflow_status,'DRAFT')<>'DRAFT'`,
      [examId]
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
    `SELECT id, is_locked, published_at, workflow_status FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
  if (exam.is_locked) return res.status(409).json({ ok: false, message: "Exam already published/locked" });
  const state = normalizeWorkflowState(exam);
  if (state !== "APPROVED") {
    return res.status(409).json({
      ok: false,
      message: "Exam must be approved by chief/assistant chief before publish",
      workflow_status: state,
    });
  }

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
    `UPDATE exams
     SET published_at=NOW(), is_locked=1, workflow_status='PUBLISHED'
     WHERE id=?`,
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

// Unpublish ALL results for the exam and unlock it (SUPER_ADMIN only)
async function unpublishExam(req, res) {
  const examId = Number(req.params.examId);

  const [[exam]] = await db.query(
    `SELECT id, is_locked, published_at FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
  if (!exam.published_at && !exam.is_locked) {
    return res.status(409).json({ ok: false, message: "Exam is not published/locked" });
  }

  await db.query(
    `UPDATE result_snapshots SET published_at=NULL WHERE exam_id=?`,
    [examId]
  );

  await db.query(
    `UPDATE exams
     SET published_at=NULL, is_locked=0,
         workflow_status='DRAFT',
         submitted_at=NULL, submitted_by=NULL,
         verified_at=NULL, verified_by=NULL,
         approved_at=NULL, approved_by=NULL
     WHERE id=?`,
    [examId]
  );

  await db.query(
    `INSERT INTO result_actions (exam_id, enrollment_id, action, done_by, done_at, note)
     VALUES (?,NULL,'UNPUBLISH',?,NOW(),?)`,
    [examId, req.user.uid, "Exam unpublished and unlocked"]
  );

  res.json({ ok: true, message: "Exam unpublished and unlocked" });
}

async function getWorkflow(req, res) {
  const examId = Number(req.params.examId);
  const [[exam]] = await db.query(
    `SELECT id, name, is_locked, published_at, workflow_status,
            submitted_at, submitted_by, verified_at, verified_by, approved_at, approved_by
     FROM exams
     WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });

  const [[counts]] = await db.query(
    `SELECT
        COUNT(*) AS snapshots_total,
        SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END) AS snapshots_published
     FROM result_snapshots
     WHERE exam_id=?`,
    [examId]
  );

  res.json({
    ok: true,
    workflow: {
      status: normalizeWorkflowState(exam),
      submitted_at: exam.submitted_at || null,
      submitted_by: exam.submitted_by || null,
      verified_at: exam.verified_at || null,
      verified_by: exam.verified_by || null,
      approved_at: exam.approved_at || null,
      approved_by: exam.approved_by || null,
      published_at: exam.published_at || null,
      snapshots_total: Number(counts?.snapshots_total || 0),
      snapshots_published: Number(counts?.snapshots_published || 0),
    },
  });
}

async function submitForVerification(req, res) {
  const examId = Number(req.params.examId);
  const [[exam]] = await db.query(
    `SELECT id, is_locked, published_at, workflow_status FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
  if (exam.is_locked || exam.published_at) {
    return res.status(409).json({ ok: false, message: "Exam already published/locked" });
  }

  const [[snap]] = await db.query(
    `SELECT COUNT(*) AS c FROM result_snapshots WHERE exam_id=?`,
    [examId]
  );
  if (!Number(snap?.c || 0)) {
    return res.status(400).json({
      ok: false,
      message: "No finalized snapshots found. Run Finalize All first.",
    });
  }

  await db.query(
    `UPDATE exams
     SET workflow_status='SUBMITTED',
         submitted_at=NOW(), submitted_by=?,
         verified_at=NULL, verified_by=NULL,
         approved_at=NULL, approved_by=NULL
     WHERE id=?`,
    [req.user.uid, examId]
  );

  await db.query(
    `INSERT INTO result_actions (exam_id, enrollment_id, action, done_by, done_at, note)
     VALUES (?,NULL,'SUBMIT_VERIFY',?,NOW(),?)`,
    [examId, req.user.uid, "Submitted to exam head for verification"]
  );

  res.json({ ok: true, message: "Submitted for verification" });
}

async function verifyExam(req, res) {
  const examId = Number(req.params.examId);
  const [[exam]] = await db.query(
    `SELECT id, is_locked, published_at, workflow_status FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
  if (exam.is_locked || exam.published_at) {
    return res.status(409).json({ ok: false, message: "Exam already published/locked" });
  }

  const state = normalizeWorkflowState(exam);
  if (state !== "SUBMITTED") {
    return res.status(409).json({
      ok: false,
      message: "Exam must be submitted before verification",
      workflow_status: state,
    });
  }

  await db.query(
    `UPDATE exams
     SET workflow_status='VERIFIED',
         verified_at=NOW(), verified_by=?
     WHERE id=?`,
    [req.user.uid, examId]
  );

  await db.query(
    `INSERT INTO result_actions (exam_id, enrollment_id, action, done_by, done_at, note)
     VALUES (?,NULL,'VERIFY',?,NOW(),?)`,
    [examId, req.user.uid, "Verified by exam head"]
  );

  res.json({ ok: true, message: "Exam verified" });
}

async function approveExam(req, res) {
  const examId = Number(req.params.examId);
  const [[exam]] = await db.query(
    `SELECT id, is_locked, published_at, workflow_status FROM exams WHERE id=? LIMIT 1`,
    [examId]
  );
  if (!exam) return res.status(404).json({ ok: false, message: "Exam not found" });
  if (exam.is_locked || exam.published_at) {
    return res.status(409).json({ ok: false, message: "Exam already published/locked" });
  }

  const state = normalizeWorkflowState(exam);
  if (state !== "VERIFIED") {
    return res.status(409).json({
      ok: false,
      message: "Exam must be verified before approval",
      workflow_status: state,
    });
  }

  await db.query(
    `UPDATE exams
     SET workflow_status='APPROVED',
         approved_at=NOW(), approved_by=?
     WHERE id=?`,
    [req.user.uid, examId]
  );

  await db.query(
    `INSERT INTO result_actions (exam_id, enrollment_id, action, done_by, done_at, note)
     VALUES (?,NULL,'APPROVE',?,NOW(),?)`,
    [examId, req.user.uid, "Approved by chief/assistant chief"]
  );

  res.json({ ok: true, message: "Exam approved for publish" });
}

module.exports = {
  preview,
  generate,
  getSnapshot,
  getWorkflow,
  submitForVerification,
  verifyExam,
  approveExam,
  publishExam,
  unpublishExam,
};
