const db = require("../db");

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function push(arr, item) {
  arr.push({
    id: String(item.id || `${item.type}:${Date.now()}:${arr.length}`),
    type: String(item.type || "INFO"),
    title: String(item.title || "Notification"),
    message: String(item.message || ""),
    action_path: String(item.action_path || ""),
    action_label: String(item.action_label || "Open"),
    created_at: item.created_at || new Date(),
    priority: String(item.priority || "normal"),
  });
}

async function listMyNotifications(req, res) {
  try {
    const uid = Number(req.user?.uid || 0);
    const role = String(req.user?.role || "").trim().toUpperCase();
    if (!uid || !role) {
      return res.status(401).json({ ok: false, message: "Invalid session" });
    }

    const limit = Math.max(1, Math.min(50, toInt(req.query?.limit, 12)));

    const [[me]] = await db.query(
      `SELECT id, campus_id FROM users WHERE id=? LIMIT 1`,
      [uid]
    );
    if (!me) return res.status(401).json({ ok: false, message: "User not found" });
    const campusId = me.campus_id ? Number(me.campus_id) : null;

    const notifications = [];

    // Exam Head: waiting verification
    if (role === "EXAM_HEAD") {
      const params = [];
      let campusWhere = "";
      if (campusId) {
        campusWhere = "AND e.campus_id=?";
        params.push(campusId);
      }
      params.push(limit);

      const [rows] = await db.query(
        `SELECT e.id AS exam_id, e.name, e.submitted_at
         FROM exams e
         WHERE e.is_locked=0
           AND e.published_at IS NULL
           AND COALESCE(e.workflow_status,'DRAFT')='SUBMITTED'
           ${campusWhere}
         ORDER BY COALESCE(e.submitted_at, e.created_at) DESC, e.id DESC
         LIMIT ?`,
        params
      );

      for (const r of rows) {
        push(notifications, {
          id: `verify:${r.exam_id}`,
          type: "WORKFLOW_VERIFY",
          title: "Result Verification Required",
          message: `${r.name} has been submitted for verification.`,
          action_path: `/marks/grid?exam_id=${r.exam_id}`,
          action_label: "Open Verification",
          created_at: r.submitted_at,
          priority: "high",
        });
      }
    }

    // Campus Chief roles: waiting approval
    if (role === "CAMPUS_CHIEF" || role === "ASSISTANT_CAMPUS_CHIEF") {
      const params = [];
      let campusWhere = "";
      if (campusId) {
        campusWhere = "AND e.campus_id=?";
        params.push(campusId);
      }
      params.push(limit);

      const [rows] = await db.query(
        `SELECT e.id AS exam_id, e.name, e.verified_at
         FROM exams e
         WHERE e.is_locked=0
           AND e.published_at IS NULL
           AND COALESCE(e.workflow_status,'DRAFT')='VERIFIED'
           ${campusWhere}
         ORDER BY COALESCE(e.verified_at, e.created_at) DESC, e.id DESC
         LIMIT ?`,
        params
      );

      for (const r of rows) {
        push(notifications, {
          id: `approve:${r.exam_id}`,
          type: "WORKFLOW_APPROVE",
          title: "Result Approval Required",
          message: `${r.name} is verified and waiting for approval.`,
          action_path: `/marks/grid?exam_id=${r.exam_id}`,
          action_label: "Open Approval",
          created_at: r.verified_at,
          priority: "high",
        });
      }
    }

    // Admin/Super Admin: ready to publish + pending correction reviews
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      const params = [];
      let campusWhere = "";
      if (campusId) {
        campusWhere = "AND e.campus_id=?";
        params.push(campusId);
      }
      params.push(limit);

      const [publishRows] = await db.query(
        `SELECT e.id AS exam_id, e.name, e.approved_at
         FROM exams e
         WHERE e.is_locked=0
           AND e.published_at IS NULL
           AND COALESCE(e.workflow_status,'DRAFT')='APPROVED'
           ${campusWhere}
         ORDER BY COALESCE(e.approved_at, e.created_at) DESC, e.id DESC
         LIMIT ?`,
        params
      );

      for (const r of publishRows) {
        push(notifications, {
          id: `publish:${r.exam_id}`,
          type: "WORKFLOW_PUBLISH",
          title: "Ready To Publish",
          message: `${r.name} is approved and ready for publishing.`,
          action_path: `/marks/grid?exam_id=${r.exam_id}`,
          action_label: "Open Publish",
          created_at: r.approved_at,
          priority: "high",
        });
      }

      const corrParams = [];
      let corrCampusWhere = "";
      if (campusId) {
        corrCampusWhere = "AND ex.campus_id=?";
        corrParams.push(campusId);
      }
      corrParams.push(limit);

      const [corrRows] = await db.query(
        `SELECT mcr.id, mcr.requested_at, mcr.component_code,
                ex.name AS exam_name, s.full_name, s.symbol_no
         FROM mark_change_requests mcr
         JOIN exams ex ON ex.id=mcr.exam_id
         JOIN student_enrollments e ON e.id=mcr.enrollment_id
         JOIN students s ON s.id=e.student_id
         WHERE mcr.status='PENDING'
           ${corrCampusWhere}
         ORDER BY mcr.requested_at DESC, mcr.id DESC
         LIMIT ?`,
        corrParams
      );

      for (const r of corrRows) {
        push(notifications, {
          id: `corr:${r.id}`,
          type: "CORRECTION_REVIEW",
          title: "Correction Request Pending",
          message: `${r.exam_name} • ${r.symbol_no || "—"} ${r.full_name || ""} (${r.component_code})`,
          action_path: "/corrections",
          action_label: "Review Request",
          created_at: r.requested_at,
          priority: "normal",
        });
      }
    }

    // Teacher: reviewed outcomes for own correction requests
    if (role === "TEACHER") {
      const [rows] = await db.query(
        `SELECT mcr.id, mcr.status, mcr.reviewed_at, mcr.component_code,
                ex.name AS exam_name, s.full_name, s.symbol_no
         FROM mark_change_requests mcr
         JOIN exams ex ON ex.id=mcr.exam_id
         JOIN student_enrollments e ON e.id=mcr.enrollment_id
         JOIN students s ON s.id=e.student_id
         WHERE mcr.requested_by=?
           AND mcr.status IN ('APPROVED','REJECTED')
           AND mcr.reviewed_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
         ORDER BY mcr.reviewed_at DESC, mcr.id DESC
         LIMIT ?`,
        [uid, limit]
      );

      for (const r of rows) {
        const statusText =
          String(r.status).toUpperCase() === "APPROVED" ? "approved" : "rejected";
        push(notifications, {
          id: `mycorr:${r.id}`,
          type: "CORRECTION_STATUS",
          title: `Correction ${statusText}`,
          message: `${r.exam_name} • ${r.symbol_no || "—"} ${r.full_name || ""} (${r.component_code})`,
          action_path: "/corrections",
          action_label: "View",
          created_at: r.reviewed_at,
          priority: "normal",
        });
      }
    }

    // OT Claim workflow notifications
    try {
      if (role === "EXAM_HEAD" || role === "ADMIN" || role === "SUPER_ADMIN") {
        const params = [];
        let campusWhere = "";
        if (campusId) {
          campusWhere = "AND (c.campus_id=? OR c.campus_id IS NULL)";
          params.push(campusId);
        }
        params.push(limit);
        const [rows] = await db.query(
          `SELECT c.id, c.claim_no, c.claim_month, c.submitted_at, c.updated_at, u.full_name
           FROM ot_claims c
           JOIN users u ON u.id=c.staff_user_id
           WHERE c.status='SUBMITTED'
             ${campusWhere}
           ORDER BY COALESCE(c.submitted_at, c.updated_at) DESC, c.id DESC
           LIMIT ?`,
          params
        );
        for (const r of rows) {
          push(notifications, {
            id: `otverify:${r.id}`,
            type: "OT_VERIFY",
            title: "OT Verification Required",
            message: `${r.claim_no || `Claim #${r.id}`} • ${r.full_name} (${r.claim_month})`,
            action_path: `/operations/ot?scope=pending_verify&claim_id=${r.id}`,
            action_label: "Review OT",
            created_at: r.submitted_at || r.updated_at,
            priority: "high",
          });
        }
      }
    } catch {
      // OT module not initialized yet.
    }

    try {
      if (
        role === "CAMPUS_CHIEF" ||
        role === "ASSISTANT_CAMPUS_CHIEF" ||
        role === "ADMIN" ||
        role === "SUPER_ADMIN"
      ) {
        const params = [];
        let campusWhere = "";
        if (campusId) {
          campusWhere = "AND (c.campus_id=? OR c.campus_id IS NULL)";
          params.push(campusId);
        }
        params.push(limit);
        const [rows] = await db.query(
          `SELECT c.id, c.claim_no, c.claim_month, c.verified_at, c.updated_at, u.full_name
           FROM ot_claims c
           JOIN users u ON u.id=c.staff_user_id
           WHERE c.status='VERIFIED'
             ${campusWhere}
           ORDER BY COALESCE(c.verified_at, c.updated_at) DESC, c.id DESC
           LIMIT ?`,
          params
        );
        for (const r of rows) {
          push(notifications, {
            id: `otapprove:${r.id}`,
            type: "OT_APPROVE",
            title: "OT Approval Required",
            message: `${r.claim_no || `Claim #${r.id}`} • ${r.full_name} (${r.claim_month})`,
            action_path: `/operations/ot?scope=pending_approve&claim_id=${r.id}`,
            action_label: "Approve OT",
            created_at: r.verified_at || r.updated_at,
            priority: "high",
          });
        }
      }
    } catch {
      // OT module not initialized yet.
    }

    try {
      if (role === "TEACHER") {
        const [rows] = await db.query(
          `SELECT c.id, c.claim_no, c.claim_month, c.status, c.updated_at
           FROM ot_claims c
           WHERE c.staff_user_id=?
             AND c.status IN ('APPROVED','REJECTED')
             AND c.updated_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
           ORDER BY c.updated_at DESC
           LIMIT ?`,
          [uid, limit]
        );
        for (const r of rows) {
          push(notifications, {
            id: `otmine:${r.id}`,
            type: "OT_STATUS",
            title: `OT Claim ${String(r.status).toLowerCase()}`,
            message: `${r.claim_no || `Claim #${r.id}`} (${r.claim_month})`,
            action_path: `/operations/ot?scope=my&claim_id=${r.id}`,
            action_label: "Open Claim",
            created_at: r.updated_at,
            priority: "normal",
          });
        }
      }
    } catch {
      // OT module not initialized yet.
    }

    notifications.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const out = notifications.slice(0, limit);

    return res.json({
      ok: true,
      count: out.length,
      notifications: out,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e?.message || "Failed to load notifications",
    });
  }
}

module.exports = { listMyNotifications };
