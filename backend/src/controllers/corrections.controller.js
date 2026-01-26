const db = require("../db");

// Teacher/Admin creates a request
async function createRequest(req, res) {
  const { exam_id, enrollment_id, component_code, new_marks, new_is_absent, reason } = req.body || {};
  if (!exam_id || !enrollment_id || !component_code || !reason) {
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
    [exam_id, enrollment_id, String(component_code)]
  );

  const old_marks = current?.marks_obtained != null ? Number(current.marks_obtained) : null;
  const old_is_absent = current?.is_absent ? 1 : 0;

  const newAbsent = new_is_absent ? 1 : 0;
  const newMarksValue = newAbsent ? null : (new_marks != null ? Number(new_marks) : null);

  await db.query(
    `INSERT INTO mark_change_requests
     (exam_id, enrollment_id, component_code,
      old_marks, new_marks, old_is_absent, new_is_absent,
      reason, status, requested_by, requested_at)
     VALUES (?,?,?,?,?,?,?, ?, 'PENDING', ?, NOW())`,
    [
      exam_id,
      enrollment_id,
      String(component_code),
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

  // Apply marks update:
  const obtained = reqRow.new_is_absent ? null : reqRow.new_marks;

  await db.query(
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
      String(reqRow.component_code),
      obtained,
      reqRow.new_is_absent ? 1 : 0,
      req.user.uid,
      req.user.uid,
    ]
  );

  // Mark request approved
  await db.query(
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
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
     VALUES (?,?,?,?,?,?,?)`,
    [
      req.user.uid,
      "MARK_CORRECTION_APPROVED",
      "marks",
      `${reqRow.exam_id}:${reqRow.enrollment_id}:${reqRow.component_code}`,
      req.ip || null,
      req.headers["user-agent"] || null,
      JSON.stringify({
        request_id: id,
        old_marks: reqRow.old_marks,
        new_marks: reqRow.new_marks,
        old_is_absent: !!reqRow.old_is_absent,
        new_is_absent: !!reqRow.new_is_absent,
        review_note: note || null,
      }),
    ]
  );

  return res.json({ ok: true, message: "Request approved and applied" });
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

