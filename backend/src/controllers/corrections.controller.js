const db = require("../db");
const { previewResult } = require("../services/result.service");

function normalizeCode(v) {
  return String(v ?? "").trim();
}

function toNullableNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Teacher/Admin creates a request
async function createRequest(req, res) {
  const { exam_id, enrollment_id, component_code, new_marks, new_is_absent, reason } = req.body || {};
  const normalizedCode = normalizeCode(component_code);
  if (!exam_id || !enrollment_id || !normalizedCode || !reason) {
    return res.status(400).json({
      ok: false,
      message: "exam_id, enrollment_id, component_code, reason required",
    });
  }

  // get current mark (if exists)
  const [[current]] = await db.query(
    `SELECT marks_obtained, is_absent
     FROM marks
     WHERE exam_id=? AND enrollment_id=? AND component_code=? LIMIT 1`,
    [exam_id, enrollment_id, normalizedCode]
  );

  const old_marks = current?.marks_obtained != null ? Number(current.marks_obtained) : null;
  const old_is_absent = current?.is_absent ? 1 : 0;

  const newAbsent = !!new_is_absent ? 1 : 0;
  const newMarksValue = newAbsent ? null : toNullableNumber(new_marks);

  if (!newAbsent && newMarksValue == null) {
    return res.status(400).json({ ok: false, message: "new_marks required when not absent" });
  }

  const [[cfg]] = await db.query(
    `SELECT full_marks, is_enabled
     FROM exam_component_configs
     WHERE exam_id=? AND component_code=? LIMIT 1`,
    [exam_id, normalizedCode]
  );
  if (!cfg || !cfg.is_enabled) {
    return res.status(400).json({
      ok: false,
      message: "Component is not enabled in this exam",
    });
  }
  const full = cfg.full_marks != null ? Number(cfg.full_marks) : null;
  if (!newAbsent && full != null && (newMarksValue < 0 || newMarksValue > full)) {
    return res.status(400).json({
      ok: false,
      message: `new_marks must be within 0..${full}`,
    });
  }

  await db.query(
    `INSERT INTO mark_change_requests
     (exam_id, enrollment_id, component_code,
      old_marks, new_marks, old_is_absent, new_is_absent,
      reason, status, requested_by, requested_at)
     VALUES (?,?,?,?,?,?,?, ?, 'PENDING', ?, NOW())`,
    [
      exam_id,
      enrollment_id,
      normalizedCode,
      old_marks,
      newMarksValue,
      old_is_absent,
      newAbsent,
      String(reason),
      req.user.uid,
    ]
  );

  return res.json({ ok: true, message: "Correction request submitted" });
}

async function listMyRequests(req, res) {
  const [rows] = await db.query(
    `SELECT *
     FROM mark_change_requests
     WHERE requested_by=?
     ORDER BY id DESC`,
    [req.user.uid]
  );

  return res.json({ ok: true, requests: rows });
}


// List requests (Admin/Super Admin)
async function listRequests(req, res) {
  const status = req.query.status || "PENDING";

  const [rows] = await db.query(
    `SELECT mcr.*, u.full_name AS requested_by_name
     FROM mark_change_requests mcr
     JOIN users u ON u.id=mcr.requested_by
     WHERE mcr.status=?
     ORDER BY mcr.id DESC`,
    [status]
  );

  return res.json({ ok: true, status, requests: rows });
}

// Approve request (Admin or Super Admin)
async function approveRequest(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, message: "Invalid request id" });
  }

  const { note } = req.body || {};

  const [[reqRow]] = await db.query(`SELECT * FROM mark_change_requests WHERE id=? LIMIT 1`, [id]);
  if (!reqRow) return res.status(404).json({ ok: false, message: "Request not found" });
  if (reqRow.status !== "PENDING") return res.status(409).json({ ok: false, message: "Already reviewed" });

  const [[exam]] = await db.query(`SELECT is_locked FROM exams WHERE id=? LIMIT 1`, [reqRow.exam_id]);
  if (exam?.is_locked && req.user.role !== "SUPER_ADMIN") {
    return res.status(423).json({
      ok: false,
      message: "Exam is locked. Only SUPER_ADMIN can approve and apply changes.",
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Apply marks update:
    const obtained = reqRow.new_is_absent ? null : reqRow.new_marks;
    const normalizedCode = normalizeCode(reqRow.component_code);

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
        reqRow.exam_id,
        reqRow.enrollment_id,
        normalizedCode,
        obtained,
        reqRow.new_is_absent ? 1 : 0,
        req.user.uid,
        req.user.uid,
      ]
    );

    const [[appliedMark]] = await conn.query(
      `SELECT marks_obtained, is_absent
       FROM marks
       WHERE exam_id=? AND enrollment_id=? AND component_code=? LIMIT 1`,
      [reqRow.exam_id, reqRow.enrollment_id, normalizedCode]
    );

    // Track snapshot existence; refresh after commit on a fresh read.
    const [[snapshot]] = await conn.query(
      `SELECT exam_id, enrollment_id, published_at
       FROM result_snapshots
       WHERE exam_id=? AND enrollment_id=? LIMIT 1`,
      [reqRow.exam_id, reqRow.enrollment_id]
    );
    const hasSnapshot = !!snapshot;

    // Mark request approved
    await conn.query(
      `UPDATE mark_change_requests
       SET status='APPROVED',
           reviewed_by=?,
           reviewed_at=NOW(),
           review_note=?,
           applied_at=NOW()
       WHERE id=?`,
      [req.user.uid, note || null, id]
    );

    // Audit log
    await conn.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.user.uid,
        "MARK_CORRECTION_APPROVED",
        "marks",
        `${reqRow.exam_id}:${reqRow.enrollment_id}:${normalizedCode}`,
        req.ip || null,
        req.headers["user-agent"] || null,
        JSON.stringify({
          request_id: id,
          old_marks: reqRow.old_marks,
          new_marks: reqRow.new_marks,
          old_is_absent: !!reqRow.old_is_absent,
          new_is_absent: !!reqRow.new_is_absent,
          applied_marks: appliedMark?.marks_obtained ?? null,
          applied_absent: !!appliedMark?.is_absent,
          snapshot_refreshed: false,
          review_note: note || null,
        }),
      ]
    );

    await conn.commit();

    let snapshotRefreshed = false;
    let snapshotRefreshError = null;
    if (hasSnapshot) {
      try {
        const result = await previewResult({
          examId: reqRow.exam_id,
          enrollmentId: reqRow.enrollment_id,
        });
        await db.query(
          `UPDATE result_snapshots
           SET overall_gpa=?, final_grade=?, result_status=?, payload_json=?, generated_by=?, generated_at=NOW()
           WHERE exam_id=? AND enrollment_id=?`,
          [
            result.overall_gpa,
            result.final_grade,
            result.result_status,
            JSON.stringify(result),
            req.user.uid,
            reqRow.exam_id,
            reqRow.enrollment_id,
          ]
        );
        snapshotRefreshed = true;
      } catch (e) {
        snapshotRefreshError = e?.message || "Snapshot refresh failed";
      }
    }

    return res.json({
      ok: true,
      message: "Request approved and applied",
      applied: {
        exam_id: reqRow.exam_id,
        enrollment_id: reqRow.enrollment_id,
        component_code: normalizedCode,
        marks_obtained: appliedMark?.marks_obtained ?? null,
        is_absent: !!appliedMark?.is_absent,
      },
      snapshot_refreshed: snapshotRefreshed,
      snapshot_refresh_error: snapshotRefreshError,
    });
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({
      ok: false,
      message: e?.message || "Failed to approve correction",
    });
  } finally {
    conn.release();
  }
}

// Reject request
async function rejectRequest(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, message: "Invalid request id" });
  }

  const { note } = req.body || {};

  const [[reqRow]] = await db.query(`SELECT * FROM mark_change_requests WHERE id=? LIMIT 1`, [id]);
  if (!reqRow) return res.status(404).json({ ok: false, message: "Request not found" });
  if (reqRow.status !== "PENDING") return res.status(409).json({ ok: false, message: "Already reviewed" });

  await db.query(
    `UPDATE mark_change_requests
     SET status='REJECTED',
         reviewed_by=?,
         reviewed_at=NOW(),
         review_note=?
     WHERE id=?`,
    [req.user.uid, note || null, id]
  );

  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
     VALUES (?,?,?,?,?,?,?)`,
    [
      req.user.uid,
      "MARK_CORRECTION_REJECTED",
      "mark_change_requests",
      String(id),
      req.ip || null,
      req.headers["user-agent"] || null,
      JSON.stringify({ note: note || null }),
    ]
  );

  return res.json({ ok: true, message: "Request rejected" });
}

module.exports = { createRequest, listRequests, listMyRequests, approveRequest, rejectRequest };
