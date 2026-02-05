const db = require("../db");
const crypto = require("crypto");

// ---------- helpers ----------
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}
function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}
function safeRole(r) {
  return String(r || "").trim().toUpperCase();
}
function randToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex"); // 64 chars
}

// NOTE: token is stored only as hash in DB.
// We return the raw token ONCE at creation time.
async function createInvite(req, res) {
  try {
    // SUPER_ADMIN only (enforce in routes middleware)
    const email = normEmail(req.body?.email);
    const role = safeRole(req.body?.role);
    const expires_in_hours = Number(req.body?.expires_in_hours || 48);

    if (!email || !role) {
      return res.status(400).json({ ok: false, message: "email and role required" });
    }

    const allowedRoles = ["ADMIN", "TEACHER", "STUDENT"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ ok: false, message: "Invalid role for invite" });
    }

    // If user already exists, block
    const [[existing]] = await db.query(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
    if (existing) {
      return res.status(409).json({ ok: false, message: "User already exists with this email" });
    }

    // If there is already a pending invite for same email+role, block (optional but helpful)
    const [[pending]] = await db.query(
      `SELECT id FROM user_invites
       WHERE email=? AND role=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [email, role]
    );
    if (pending) {
      return res.status(409).json({ ok: false, message: "A valid invite already exists for this email/role" });
    }

    const token = randToken(24); // shorter but still strong
    const token_hash = sha256(token);

    // expires_at
    const expiresHours = Number.isFinite(expires_in_hours) && expires_in_hours > 0 ? expires_in_hours : 48;

    const [ins] = await db.query(
      `INSERT INTO user_invites (email, role, token_hash, expires_at, created_by, created_at)
       VALUES (?,?,?,?,?,NOW())`,
      [
        email,
        role,
        token_hash,
        // MySQL interval: use DATE_ADD(NOW(), INTERVAL ? HOUR) via query
        // But easier: store expires_at as NOW() + hours in SQL:
        // We'll do it in SQL to avoid timezone issues:
        // (so here we pass hours separately in another query)
        // For compatibility, we will do a second UPDATE below.
        new Date(), // placeholder; will be overwritten
        req.user.uid,
      ]
    );

    // overwrite expires_at precisely in DB
    await db.query(
      `UPDATE user_invites SET expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id=?`,
      [expiresHours, ins.insertId]
    );

    // You can later email this link. For now return it.
    // FRONTEND later can use /accept-invite page.
    const invite_link = `/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    return res.json({
      ok: true,
      message: "Invite created",
      invite: {
        id: ins.insertId,
        email,
        role,
        expires_in_hours: expiresHours,
      },
      token, // return ONCE
      invite_link,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Create invite failed", error: String(e.message || e) });
  }
}

async function listInvites(req, res) {
  try {
    // Optional filters: status=pending|used|revoked|expired|all
    const status = String(req.query.status || "pending").trim().toLowerCase();

    let where = "1=1";
    if (status === "pending") {
      where = "used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()";
    } else if (status === "used") {
      where = "used_at IS NOT NULL";
    } else if (status === "revoked") {
      where = "revoked_at IS NOT NULL";
    } else if (status === "expired") {
      where = "used_at IS NULL AND revoked_at IS NULL AND expires_at <= NOW()";
    } else if (status === "all") {
      where = "1=1";
    } else {
      return res.status(400).json({ ok: false, message: "Invalid status filter" });
    }

    const [rows] = await db.query(
      `SELECT ui.id, ui.email, ui.role, ui.expires_at, ui.used_at, ui.revoked_at,
              ui.created_by, ui.created_at,
              u.full_name AS created_by_name
       FROM user_invites ui
       LEFT JOIN users u ON u.id=ui.created_by
       WHERE ${where}
       ORDER BY ui.id DESC
       LIMIT 200`
    );

    return res.json({ ok: true, status, invites: rows });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "List invites failed", error: String(e.message || e) });
  }
}

async function revokeInvite(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, message: "Invalid invite id" });
    }

    const [[inv]] = await db.query(`SELECT * FROM user_invites WHERE id=? LIMIT 1`, [id]);
    if (!inv) return res.status(404).json({ ok: false, message: "Invite not found" });

    if (inv.used_at) return res.status(409).json({ ok: false, message: "Invite already used" });
    if (inv.revoked_at) return res.status(409).json({ ok: false, message: "Invite already revoked" });

    await db.query(`UPDATE user_invites SET revoked_at=NOW() WHERE id=?`, [id]);

    return res.json({ ok: true, message: "Invite revoked" });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Revoke invite failed", error: String(e.message || e) });
  }
}

module.exports = { createInvite, listInvites, revokeInvite };
