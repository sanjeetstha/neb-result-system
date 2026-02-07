const db = require("../db");
const { hashPassword, verifyPassword } = require("../utils/crypto");
const { signJwt, verifyJwt } = require("../utils/jwt");
const { sendPasswordResetEmail } = require("../services/mailer");

const crypto = require("crypto");
// const bcrypt = require("bcryptjs");


// One-time endpoint: create first SUPER_ADMIN if none exists
async function bootstrapSuperAdmin(req, res) {
  const { full_name, email, password } = req.body || {};
  if (!full_name || !email || !password) {
    return res.status(400).json({ ok: false, message: "full_name, email, password required" });
  }

  // check if any super admin exists
  const [existing] = await db.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='SUPER_ADMIN' LIMIT 1`
  );
  if (existing.length > 0) {
    return res.status(409).json({ ok: false, message: "SUPER_ADMIN already exists" });
  }

  // get role id
  const [[roleRow]] = await db.query(`SELECT id FROM roles WHERE name='SUPER_ADMIN' LIMIT 1`);
  if (!roleRow) return res.status(500).json({ ok: false, message: "Role not found" });

  const password_hash = await hashPassword(password);

  await db.query(
    `INSERT INTO users (role_id, full_name, email, password_hash) VALUES (?,?,?,?)`,
    [roleRow.id, full_name, email, password_hash]
  );

  return res.json({ ok: true, message: "SUPER_ADMIN created" });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  const identifier = String(email || "").trim();
  if (!identifier || !password) {
    return res.status(400).json({ ok: false, message: "email/username and password required" });
  }

  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.is_active, r.name AS role
     FROM users u JOIN roles r ON r.id=u.role_id
     WHERE LOWER(u.email)=LOWER(?) OR LOWER(u.full_name)=LOWER(?) LIMIT 1`,
    [identifier, identifier]
  );

  if (rows.length === 0) return res.status(401).json({ ok: false, message: "Invalid credentials" });

  const user = rows[0];
  if (!user.is_active) return res.status(403).json({ ok: false, message: "User disabled" });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ ok: false, message: "Invalid credentials" });

  await db.query(`UPDATE users SET last_login_at=NOW() WHERE id=?`, [user.id]);

  const token = signJwt({ uid: user.id, role: user.role, email: user.email, name: user.full_name });

  return res.json({
    ok: true,
    token,
    user: { id: user.id, name: user.full_name, email: user.email, role: user.role },
  });
}


async function createUser(req, res) {
  const { full_name, email, password, role } = req.body || {};
  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ ok: false, message: "full_name, email, password, role required" });
  }

  // only allow these roles to be created via this endpoint
  const allowed = ["ADMIN", "TEACHER", "STUDENT"];
  if (!allowed.includes(role)) {
    return res.status(400).json({ ok: false, message: "Role not allowed here" });
  }

  const [[roleRow]] = await db.query(`SELECT id FROM roles WHERE name=? LIMIT 1`, [role]);
  if (!roleRow) return res.status(400).json({ ok: false, message: "Invalid role" });

  const password_hash = await hashPassword(password);

  try {
    const [result] = await db.query(
      `INSERT INTO users (role_id, full_name, email, password_hash) VALUES (?,?,?,?)`,
      [roleRow.id, full_name, email, password_hash]
    );

    return res.json({ ok: true, message: "User created", user_id: result.insertId });
  } catch (e) {
    if (String(e.message).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, message: "Email already exists" });
    }
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ ok: false, message: "email required" });
  }

  const [[user]] = await db.query(
    `SELECT id, full_name, email FROM users WHERE email=? LIMIT 1`,
    [email]
  );

  if (user) {
    const token = signJwt(
      { uid: user.id, purpose: "password_reset" },
      { expiresIn: process.env.RESET_TOKEN_TTL || "1h" }
    );

    const baseUrl =
      process.env.APP_WEB_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173";
    const resetUrl = `${String(baseUrl).replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(
      token
    )}`;

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.full_name,
        resetUrl,
      });
    } catch (e) {
      console.error("Password reset email failed", e);
      return res.status(500).json({
        ok: false,
        message:
          "Failed to send reset email. Check SMTP configuration (Gmail may require an App Password).",
      });
    }
  }

  // Always respond with success to avoid account enumeration.
  return res.json({
    ok: true,
    message: "If the account exists, reset instructions were sent.",
  });
}

async function resetPassword(req, res) {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ ok: false, message: "token and password required" });
  }

  let payload;
  try {
    payload = verifyJwt(token);
  } catch (e) {
    return res.status(400).json({ ok: false, message: "Invalid or expired token" });
  }

  if (!payload?.uid || payload?.purpose !== "password_reset") {
    return res.status(400).json({ ok: false, message: "Invalid token" });
  }

  const password_hash = await hashPassword(password);
  await db.query(`UPDATE users SET password_hash=? WHERE id=?`, [
    password_hash,
    payload.uid,
  ]);

  return res.json({ ok: true, message: "Password reset successful" });
}
// invitation controller-------------------------
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}
function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}

async function acceptInvite(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    const full_name = String(req.body?.full_name || "").trim();
    const password = String(req.body?.password || "").trim();

    if (!token || !full_name || !password) {
      return res.status(400).json({ ok: false, message: "token, full_name, password required" });
    }

    const tokenHash = sha256(token);

    const [[inv]] = await db.query(
      `SELECT * FROM user_invites
       WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL
       LIMIT 1`,
      [tokenHash]
    );

    if (!inv) return res.status(404).json({ ok: false, message: "Invalid invite token" });
    if (new Date(inv.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ ok: false, message: "Invite expired" });
    }

    const email = normEmail(inv.email);

    // user already exists?
    const [[existingUser]] = await db.query(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
    if (existingUser) {
      return res.status(409).json({ ok: false, message: "User already exists with this email" });
    }

    // ✅ find role_id from roles table (inv.role is like "TEACHER")
    const [[roleRow]] = await db.query(`SELECT id FROM roles WHERE name=? LIMIT 1`, [inv.role]);
    if (!roleRow) return res.status(400).json({ ok: false, message: "Invalid role in invite" });

    const hash = await hashPassword(password);


    // ✅ insert user with role_id (NOT role)
    // const [ins] = await db.query(
    //   `INSERT INTO users (role_id, full_name, email, password_hash, is_active, created_by, created_at)
    //    VALUES (?,?,?,?,1,?,NOW())`,
    //   [roleRow.id, full_name, email, hash, inv.created_by]
    // );
    const [ins] = await db.query(
      `INSERT INTO users (role_id, full_name, email, password_hash, is_active)
      VALUES (?,?,?,?,1)`,
      [roleRow.id, full_name, email, hash]
    );


    // mark invite used
    await db.query(`UPDATE user_invites SET used_at=NOW() WHERE id=?`, [inv.id]);

    return res.json({ ok: true, message: "Account created", user_id: ins.insertId });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Accept invite failed", error: String(e.message || e) });
  }
}



module.exports = {
  bootstrapSuperAdmin,
  login,
  createUser,
  acceptInvite,
  forgotPassword,
  resetPassword,
};
