const db = require("../db");

let otSchemaReady = null;

const INTERNAL_STAFF_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "TEACHER",
  "EXAM_HEAD",
  "CAMPUS_CHIEF",
  "ASSISTANT_CAMPUS_CHIEF",
]);
const VERIFY_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "EXAM_HEAD"]);
const APPROVE_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "CAMPUS_CHIEF",
  "ASSISTANT_CAMPUS_CHIEF",
]);

function roleOf(req) {
  return String(req.user?.role || "").trim().toUpperCase();
}

function norm(v) {
  return String(v ?? "").trim();
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round2(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

function parseMonth(value) {
  const s = norm(value);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : null;
}

function currentMonthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseHmToMinutes(hm) {
  const s = norm(hm);
  const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function getNepalWeekendFlag(workDate) {
  // Nepal weekly holiday is Saturday.
  const d = new Date(`${workDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getDay() === 6;
}

async function writeAudit(req, action, entity, entityId, meta) {
  try {
    if (!req.user?.uid) return;
    await db.query(
      `INSERT INTO audit_logs
       (actor_user_id, action, entity, entity_id, ip_address, user_agent, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.uid,
        action,
        entity,
        entityId != null ? String(entityId) : null,
        req.ip || null,
        req.headers["user-agent"] || null,
        meta ? JSON.stringify(meta) : null,
      ]
    );
  } catch {
    // silent audit failure
  }
}

async function ensureOtSchema() {
  if (otSchemaReady) return otSchemaReady;
  otSchemaReady = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ot_staff_profiles (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL UNIQUE,
        employee_code VARCHAR(50) NULL,
        department VARCHAR(120) NULL,
        designation VARCHAR(120) NULL,
        hourly_rate_override DECIMAL(10,2) NULL,
        is_ot_eligible TINYINT(1) NOT NULL DEFAULT 1,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ot_policies (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        campus_id BIGINT NULL,
        policy_name VARCHAR(120) NOT NULL DEFAULT 'Default OT Policy',
        hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 250.00,
        weekend_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1.50,
        holiday_multiplier DECIMAL(6,2) NOT NULL DEFAULT 2.00,
        rounding_minutes INT NOT NULL DEFAULT 15,
        daily_cap_hours DECIMAL(6,2) NOT NULL DEFAULT 8.00,
        effective_from DATE NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ot_policies_lookup (campus_id, is_active, effective_from)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ot_claims (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        claim_no VARCHAR(40) NULL UNIQUE,
        staff_user_id BIGINT NOT NULL,
        campus_id BIGINT NULL,
        claim_month CHAR(7) NOT NULL,
        status ENUM('DRAFT','SUBMITTED','VERIFIED','APPROVED','REJECTED','PAID') NOT NULL DEFAULT 'DRAFT',
        note TEXT NULL,
        total_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        submitted_at DATETIME NULL,
        verified_at DATETIME NULL,
        approved_at DATETIME NULL,
        rejected_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ot_claims_staff_month (staff_user_id, claim_month),
        INDEX idx_ot_claims_status (status, updated_at)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ot_claim_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        claim_id BIGINT NOT NULL,
        work_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        break_minutes INT NOT NULL DEFAULT 0,
        is_weekend TINYINT(1) NOT NULL DEFAULT 0,
        is_holiday TINYINT(1) NOT NULL DEFAULT 0,
        reason VARCHAR(255) NOT NULL,
        ot_minutes INT NOT NULL DEFAULT 0,
        ot_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
        hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
        multiplier DECIMAL(6,2) NOT NULL DEFAULT 1.00,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ot_claim_items_claim (claim_id),
        INDEX idx_ot_claim_items_date (work_date)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ot_approvals (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        claim_id BIGINT NOT NULL,
        step_no INT NOT NULL DEFAULT 0,
        action VARCHAR(30) NOT NULL,
        action_by BIGINT NULL,
        note VARCHAR(255) NULL,
        action_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ot_approvals_claim (claim_id, action_at)
      )
    `);

    const [seed] = await db.query(
      `SELECT id FROM ot_policies
       WHERE campus_id IS NULL AND is_active=1
       ORDER BY effective_from DESC, id DESC
       LIMIT 1`
    );
    if (!seed.length) {
      await db.query(
        `INSERT INTO ot_policies
         (campus_id, policy_name, hourly_rate, weekend_multiplier, holiday_multiplier, rounding_minutes, daily_cap_hours, effective_from, is_active)
         VALUES (NULL, 'Default OT Policy', 250, 1.5, 2.0, 15, 8, CURDATE(), 1)`
      );
    }
  })();
  return otSchemaReady;
}

async function loadMe(uid) {
  const [[me]] = await db.query(
    `SELECT id, campus_id, full_name, email FROM users WHERE id=? LIMIT 1`,
    [uid]
  );
  return me || null;
}

async function getOrCreateStaffProfile(uid) {
  await db.query(
    `INSERT IGNORE INTO ot_staff_profiles (user_id, is_ot_eligible)
     VALUES (?, 1)`,
    [uid]
  );
  const [[profile]] = await db.query(
    `SELECT * FROM ot_staff_profiles WHERE user_id=? LIMIT 1`,
    [uid]
  );
  return profile || null;
}

async function getActivePolicy(campusId, forDate = null) {
  const date = norm(forDate) || new Date().toISOString().slice(0, 10);
  const [rows] = await db.query(
    `SELECT *
     FROM ot_policies
     WHERE is_active=1
       AND effective_from <= DATE(?)
       AND (campus_id IS NULL OR campus_id=?)
     ORDER BY CASE WHEN campus_id=? THEN 1 ELSE 0 END DESC, effective_from DESC, id DESC
     LIMIT 1`,
    [date, campusId || null, campusId || null]
  );
  if (rows.length) return rows[0];
  const [globalRows] = await db.query(
    `SELECT *
     FROM ot_policies
     WHERE is_active=1
     ORDER BY effective_from DESC, id DESC
     LIMIT 1`
  );
  return globalRows[0] || null;
}

function computeItemMetrics(input, policy, hourlyRateOverride = null) {
  const workDate = norm(input.work_date);
  const start = parseHmToMinutes(input.start_time);
  const end = parseHmToMinutes(input.end_time);
  if (!workDate) throw new Error("work_date is required");
  if (start == null || end == null) throw new Error("start_time/end_time format must be HH:mm");
  if (end <= start) throw new Error("end_time must be greater than start_time");

  const breakMinutes = Math.max(0, Math.floor(toNum(input.break_minutes, 0)));
  const rawMinutes = end - start - breakMinutes;
  if (rawMinutes <= 0) throw new Error("Invalid time range after break deduction");

  const rounding = Math.max(1, Math.floor(toNum(policy?.rounding_minutes, 15)));
  const roundedMinutes = Math.max(0, Math.round(rawMinutes / rounding) * rounding);

  const capHours = Math.max(0.5, toNum(policy?.daily_cap_hours, 8));
  const cappedMinutes = Math.min(roundedMinutes, Math.floor(capHours * 60));

  const autoWeekend = getNepalWeekendFlag(workDate);
  const isHoliday = !!input.is_holiday;
  const isWeekend = isHoliday ? false : (input.is_weekend != null ? !!input.is_weekend : autoWeekend);

  const hasOverride =
    hourlyRateOverride != null && String(hourlyRateOverride).trim() !== "";
  const baseRate = Math.max(
    0,
    hasOverride ? Number(hourlyRateOverride) : Number(policy?.hourly_rate ?? 250)
  );
  const weekendMultiplier = Math.max(1, toNum(policy?.weekend_multiplier, 1.5));
  const holidayMultiplier = Math.max(1, toNum(policy?.holiday_multiplier, 2.0));
  const multiplier = isHoliday ? holidayMultiplier : isWeekend ? weekendMultiplier : 1;

  const otHours = round2(cappedMinutes / 60);
  const amount = round2(otHours * baseRate * multiplier);

  return {
    work_date: workDate,
    start_time: norm(input.start_time),
    end_time: norm(input.end_time),
    break_minutes: breakMinutes,
    is_weekend: isWeekend ? 1 : 0,
    is_holiday: isHoliday ? 1 : 0,
    ot_minutes: cappedMinutes,
    ot_hours: otHours,
    hourly_rate: round2(baseRate),
    multiplier: round2(multiplier),
    amount,
  };
}

async function recalcClaimTotals(claimId) {
  const [[sum]] = await db.query(
    `SELECT
       COALESCE(SUM(ot_hours), 0) AS total_hours,
       COALESCE(SUM(amount), 0) AS total_amount
     FROM ot_claim_items
     WHERE claim_id=?`,
    [claimId]
  );
  await db.query(
    `UPDATE ot_claims
     SET total_hours=?, total_amount=?
     WHERE id=?`,
    [round2(sum?.total_hours || 0), round2(sum?.total_amount || 0), claimId]
  );
}

function canCreateClaim(role) {
  return INTERNAL_STAFF_ROLES.has(role);
}

function canViewAll(role) {
  return ["SUPER_ADMIN", "ADMIN", "EXAM_HEAD", "CAMPUS_CHIEF", "ASSISTANT_CAMPUS_CHIEF"].includes(
    role
  );
}

function canVerify(role) {
  return VERIFY_ROLES.has(role);
}

function canApprove(role) {
  return APPROVE_ROLES.has(role);
}

function canManagePolicy(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(role);
}

async function fetchClaimById(claimId) {
  const [rows] = await db.query(
    `SELECT c.*,
            u.full_name AS staff_name,
            u.email AS staff_email,
            u.phone AS staff_phone
     FROM ot_claims c
     JOIN users u ON u.id=c.staff_user_id
     WHERE c.id=?
     LIMIT 1`,
    [claimId]
  );
  if (!rows.length) return null;

  const claim = rows[0];
  const [items] = await db.query(
    `SELECT *
     FROM ot_claim_items
     WHERE claim_id=?
     ORDER BY work_date DESC, start_time DESC, id DESC`,
    [claimId]
  );
  const [approvals] = await db.query(
    `SELECT a.*, u.full_name AS action_by_name
     FROM ot_approvals a
     LEFT JOIN users u ON u.id=a.action_by
     WHERE a.claim_id=?
     ORDER BY a.id ASC`,
    [claimId]
  );
  return { claim, items, approvals };
}

function buildClaimPermissions(role, uid, claim) {
  const isOwner = Number(claim.staff_user_id) === Number(uid);
  const editable = ["DRAFT", "REJECTED"].includes(String(claim.status || ""));
  return {
    can_edit: editable && (isOwner || canViewAll(role)),
    can_submit: editable && isOwner,
    can_verify: String(claim.status) === "SUBMITTED" && canVerify(role),
    can_approve: String(claim.status) === "VERIFIED" && canApprove(role),
    can_reject:
      ["SUBMITTED", "VERIFIED"].includes(String(claim.status)) &&
      (canVerify(role) || canApprove(role)),
    can_reopen:
      ["REJECTED", "APPROVED"].includes(String(claim.status)) &&
      ["SUPER_ADMIN", "ADMIN", "CAMPUS_CHIEF", "ASSISTANT_CAMPUS_CHIEF"].includes(role),
  };
}

async function listClaims(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    if (!uid || !canCreateClaim(role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const scope = norm(req.query?.scope || "my").toLowerCase();
    const status = norm(req.query?.status || "").toUpperCase();
    const month = parseMonth(req.query?.month);

    const where = [];
    const params = [];

    if (scope === "pending_verify" && canVerify(role)) {
      where.push(`c.status='SUBMITTED'`);
    } else if (scope === "pending_approve" && canApprove(role)) {
      where.push(`c.status='VERIFIED'`);
    } else if (scope === "all" && canViewAll(role)) {
      // no owner restriction
    } else {
      where.push(`c.staff_user_id=?`);
      params.push(uid);
    }

    if (status) {
      where.push(`c.status=?`);
      params.push(status);
    }
    if (month) {
      where.push(`c.claim_month=?`);
      params.push(month);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await db.query(
      `SELECT c.*,
              u.full_name AS staff_name,
              (SELECT COUNT(*) FROM ot_claim_items i WHERE i.claim_id=c.id) AS item_count
       FROM ot_claims c
       JOIN users u ON u.id=c.staff_user_id
       ${whereSql}
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT 300`,
      params
    );

    return res.json({ ok: true, claims: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to load OT claims" });
  }
}

async function dashboard(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    if (!uid || !canCreateClaim(role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const [myRows] = await db.query(
      `SELECT status, COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS amount
       FROM ot_claims
       WHERE staff_user_id=?
       GROUP BY status`,
      [uid]
    );
    const summary = {
      DRAFT: 0,
      SUBMITTED: 0,
      VERIFIED: 0,
      APPROVED: 0,
      REJECTED: 0,
      PAID: 0,
      my_total_amount: 0,
    };
    for (const r of myRows) {
      summary[String(r.status)] = Number(r.c || 0);
      summary.my_total_amount += Number(r.amount || 0);
    }
    summary.my_total_amount = round2(summary.my_total_amount);

    let pending_verify = 0;
    let pending_approve = 0;
    if (canVerify(role)) {
      const [[x]] = await db.query(
        `SELECT COUNT(*) AS c FROM ot_claims WHERE status='SUBMITTED'`
      );
      pending_verify = Number(x?.c || 0);
    }
    if (canApprove(role)) {
      const [[y]] = await db.query(
        `SELECT COUNT(*) AS c FROM ot_claims WHERE status='VERIFIED'`
      );
      pending_approve = Number(y?.c || 0);
    }

    return res.json({
      ok: true,
      summary: {
        ...summary,
        pending_verify,
        pending_approve,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to load OT dashboard" });
  }
}

async function createClaim(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    if (!uid || !canCreateClaim(role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const claimMonth = parseMonth(req.body?.claim_month) || currentMonthKey();
    const note = norm(req.body?.note);
    const me = await loadMe(uid);
    if (!me) return res.status(401).json({ ok: false, message: "User not found" });

    const [ins] = await db.query(
      `INSERT INTO ot_claims
       (staff_user_id, campus_id, claim_month, status, note)
       VALUES (?, ?, ?, 'DRAFT', ?)`,
      [uid, me.campus_id || null, claimMonth, note || null]
    );
    const claimId = Number(ins.insertId);
    const claimNo = `OT-${claimMonth.replace("-", "")}-${String(claimId).padStart(4, "0")}`;
    await db.query(`UPDATE ot_claims SET claim_no=? WHERE id=?`, [claimNo, claimId]);
    await writeAudit(req, "OT_CREATE_CLAIM", "OT_CLAIM", claimId, { claim_no: claimNo });

    const data = await fetchClaimById(claimId);
    return res.json({ ok: true, claim: data.claim, items: data.items, approvals: data.approvals });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to create OT claim" });
  }
}

async function getClaim(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    const claimId = Number(req.params?.id);
    if (!uid || !claimId) {
      return res.status(400).json({ ok: false, message: "Invalid claim id" });
    }

    const data = await fetchClaimById(claimId);
    if (!data) return res.status(404).json({ ok: false, message: "OT claim not found" });
    if (!canViewAll(role) && Number(data.claim.staff_user_id) !== uid) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const perms = buildClaimPermissions(role, uid, data.claim);
    return res.json({ ok: true, ...data, permissions: perms });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to load OT claim" });
  }
}

async function updateClaim(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    const claimId = Number(req.params?.id);
    if (!uid || !claimId) {
      return res.status(400).json({ ok: false, message: "Invalid claim id" });
    }

    const data = await fetchClaimById(claimId);
    if (!data) return res.status(404).json({ ok: false, message: "OT claim not found" });
    const perms = buildClaimPermissions(role, uid, data.claim);
    if (!perms.can_edit) {
      return res.status(403).json({ ok: false, message: "Claim is locked for editing" });
    }

    const month = parseMonth(req.body?.claim_month) || data.claim.claim_month;
    const note = norm(req.body?.note);
    await db.query(`UPDATE ot_claims SET claim_month=?, note=? WHERE id=?`, [
      month,
      note || null,
      claimId,
    ]);
    await writeAudit(req, "OT_UPDATE_CLAIM", "OT_CLAIM", claimId, { claim_month: month });

    const refreshed = await fetchClaimById(claimId);
    return res.json({ ok: true, claim: refreshed.claim, items: refreshed.items, approvals: refreshed.approvals });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to update OT claim" });
  }
}

async function addItem(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    const claimId = Number(req.params?.id);
    if (!uid || !claimId) {
      return res.status(400).json({ ok: false, message: "Invalid claim id" });
    }

    const data = await fetchClaimById(claimId);
    if (!data) return res.status(404).json({ ok: false, message: "OT claim not found" });
    const perms = buildClaimPermissions(role, uid, data.claim);
    if (!perms.can_edit) {
      return res.status(403).json({ ok: false, message: "Claim is locked for editing" });
    }

    const reason = norm(req.body?.reason);
    if (!reason) return res.status(400).json({ ok: false, message: "reason is required" });

    const profile = await getOrCreateStaffProfile(Number(data.claim.staff_user_id));
    if (profile && !Number(profile.is_ot_eligible || 0)) {
      return res.status(400).json({ ok: false, message: "Staff is not eligible for OT claims" });
    }
    const policy = await getActivePolicy(data.claim.campus_id, req.body?.work_date);
    if (!policy) {
      return res.status(400).json({ ok: false, message: "No active OT policy found" });
    }

    const computed = computeItemMetrics(
      req.body || {},
      policy,
      profile?.hourly_rate_override
    );

    const [ins] = await db.query(
      `INSERT INTO ot_claim_items
       (claim_id, work_date, start_time, end_time, break_minutes, is_weekend, is_holiday, reason, ot_minutes, ot_hours, hourly_rate, multiplier, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        claimId,
        computed.work_date,
        computed.start_time,
        computed.end_time,
        computed.break_minutes,
        computed.is_weekend,
        computed.is_holiday,
        reason,
        computed.ot_minutes,
        computed.ot_hours,
        computed.hourly_rate,
        computed.multiplier,
        computed.amount,
      ]
    );

    await recalcClaimTotals(claimId);
    await writeAudit(req, "OT_ADD_ITEM", "OT_CLAIM_ITEM", ins.insertId, {
      claim_id: claimId,
      work_date: computed.work_date,
      ot_hours: computed.ot_hours,
      amount: computed.amount,
    });

    const refreshed = await fetchClaimById(claimId);
    return res.json({ ok: true, claim: refreshed.claim, items: refreshed.items, approvals: refreshed.approvals });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to add OT item" });
  }
}

async function removeItem(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    const claimId = Number(req.params?.id);
    const itemId = Number(req.params?.itemId);
    if (!uid || !claimId || !itemId) {
      return res.status(400).json({ ok: false, message: "Invalid request" });
    }

    const data = await fetchClaimById(claimId);
    if (!data) return res.status(404).json({ ok: false, message: "OT claim not found" });
    const perms = buildClaimPermissions(role, uid, data.claim);
    if (!perms.can_edit) {
      return res.status(403).json({ ok: false, message: "Claim is locked for editing" });
    }

    const [del] = await db.query(
      `DELETE FROM ot_claim_items
       WHERE id=? AND claim_id=?`,
      [itemId, claimId]
    );
    if (!del.affectedRows) {
      return res.status(404).json({ ok: false, message: "OT item not found" });
    }

    await recalcClaimTotals(claimId);
    await writeAudit(req, "OT_REMOVE_ITEM", "OT_CLAIM_ITEM", itemId, { claim_id: claimId });

    const refreshed = await fetchClaimById(claimId);
    return res.json({ ok: true, claim: refreshed.claim, items: refreshed.items, approvals: refreshed.approvals });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to remove OT item" });
  }
}

async function transitionClaim(req, res, action) {
  await ensureOtSchema();
  const uid = Number(req.user?.uid || 0);
  const role = roleOf(req);
  const claimId = Number(req.params?.id);
  if (!uid || !claimId) {
    return res.status(400).json({ ok: false, message: "Invalid claim id" });
  }

  const data = await fetchClaimById(claimId);
  if (!data) return res.status(404).json({ ok: false, message: "OT claim not found" });
  const claim = data.claim;
  const perms = buildClaimPermissions(role, uid, claim);

  let nextStatus = "";
  let allowed = false;
  let stepNo = 0;
  const note = norm(req.body?.note);

  if (action === "SUBMIT") {
    allowed = perms.can_submit;
    nextStatus = "SUBMITTED";
    stepNo = 0;
    if (!data.items.length) {
      return res.status(400).json({ ok: false, message: "Add at least one OT entry before submit" });
    }
  } else if (action === "VERIFY") {
    allowed = perms.can_verify;
    nextStatus = "VERIFIED";
    stepNo = 1;
  } else if (action === "APPROVE") {
    allowed = perms.can_approve;
    nextStatus = "APPROVED";
    stepNo = 2;
  } else if (action === "REJECT") {
    allowed = perms.can_reject;
    nextStatus = "REJECTED";
    stepNo = String(claim.status) === "VERIFIED" ? 2 : 1;
    if (!note) {
      return res.status(400).json({ ok: false, message: "note is required when rejecting a claim" });
    }
  } else if (action === "REOPEN") {
    allowed = perms.can_reopen;
    nextStatus = "DRAFT";
    stepNo = 9;
  }

  if (!allowed) {
    return res.status(403).json({ ok: false, message: "Action not allowed" });
  }

  await recalcClaimTotals(claimId);

  const setFields = [];
  const params = [];
  setFields.push(`status=?`);
  params.push(nextStatus);

  if (action === "SUBMIT") {
    setFields.push(`submitted_at=NOW()`);
  } else if (action === "VERIFY") {
    setFields.push(`verified_at=NOW()`);
  } else if (action === "APPROVE") {
    setFields.push(`approved_at=NOW()`);
  } else if (action === "REJECT") {
    setFields.push(`rejected_at=NOW()`);
  } else if (action === "REOPEN") {
    setFields.push(`submitted_at=NULL`, `verified_at=NULL`, `approved_at=NULL`, `rejected_at=NULL`);
  }

  params.push(claimId);
  await db.query(
    `UPDATE ot_claims SET ${setFields.join(", ")} WHERE id=?`,
    params
  );
  await db.query(
    `INSERT INTO ot_approvals (claim_id, step_no, action, action_by, note, action_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [claimId, stepNo, action, uid, note || null]
  );
  await writeAudit(req, `OT_${action}`, "OT_CLAIM", claimId, {
    from_status: claim.status,
    to_status: nextStatus,
    note: note || null,
  });

  const refreshed = await fetchClaimById(claimId);
  return res.json({ ok: true, claim: refreshed.claim, items: refreshed.items, approvals: refreshed.approvals });
}

async function submitClaim(req, res) {
  try {
    return await transitionClaim(req, res, "SUBMIT");
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to submit OT claim" });
  }
}

async function verifyClaim(req, res) {
  try {
    return await transitionClaim(req, res, "VERIFY");
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to verify OT claim" });
  }
}

async function approveClaim(req, res) {
  try {
    return await transitionClaim(req, res, "APPROVE");
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to approve OT claim" });
  }
}

async function rejectClaim(req, res) {
  try {
    return await transitionClaim(req, res, "REJECT");
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to reject OT claim" });
  }
}

async function reopenClaim(req, res) {
  try {
    return await transitionClaim(req, res, "REOPEN");
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to reopen OT claim" });
  }
}

async function getActivePolicyHandler(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    if (!uid || !canCreateClaim(role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    const me = await loadMe(uid);
    if (!me) return res.status(401).json({ ok: false, message: "User not found" });
    const policy = await getActivePolicy(me.campus_id || null);
    return res.json({ ok: true, policy });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to load OT policy" });
  }
}

async function upsertActivePolicy(req, res) {
  try {
    await ensureOtSchema();
    const uid = Number(req.user?.uid || 0);
    const role = roleOf(req);
    if (!uid || !canManagePolicy(role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    const me = await loadMe(uid);
    if (!me) return res.status(401).json({ ok: false, message: "User not found" });

    const campusId = me.campus_id || null;
    const policyName = norm(req.body?.policy_name) || "Campus OT Policy";
    const hourlyRate = Math.max(0, toNum(req.body?.hourly_rate, 250));
    const weekendMultiplier = Math.max(1, toNum(req.body?.weekend_multiplier, 1.5));
    const holidayMultiplier = Math.max(1, toNum(req.body?.holiday_multiplier, 2));
    const roundingMinutes = Math.max(1, Math.floor(toNum(req.body?.rounding_minutes, 15)));
    const dailyCapHours = Math.max(0.5, toNum(req.body?.daily_cap_hours, 8));
    const effectiveFrom = norm(req.body?.effective_from) || new Date().toISOString().slice(0, 10);

    await db.query(
      `UPDATE ot_policies
       SET is_active=0
       WHERE is_active=1
         AND (
           (campus_id IS NULL AND ? IS NULL) OR
           campus_id=?
         )`,
      [campusId, campusId]
    );

    const [ins] = await db.query(
      `INSERT INTO ot_policies
       (campus_id, policy_name, hourly_rate, weekend_multiplier, holiday_multiplier, rounding_minutes, daily_cap_hours, effective_from, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        campusId,
        policyName,
        round2(hourlyRate),
        round2(weekendMultiplier),
        round2(holidayMultiplier),
        roundingMinutes,
        round2(dailyCapHours),
        effectiveFrom,
        uid,
      ]
    );

    await writeAudit(req, "OT_POLICY_UPSERT", "OT_POLICY", ins.insertId, {
      campus_id: campusId,
      policy_name: policyName,
    });

    const policy = await getActivePolicy(campusId, effectiveFrom);
    return res.json({ ok: true, policy });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Failed to save OT policy" });
  }
}

module.exports = {
  dashboard,
  listClaims,
  createClaim,
  getClaim,
  updateClaim,
  addItem,
  removeItem,
  submitClaim,
  verifyClaim,
  approveClaim,
  rejectClaim,
  reopenClaim,
  getActivePolicy: getActivePolicyHandler,
  upsertActivePolicy,
};
