const db = require("../db");
const { hashPassword, verifyPassword } = require("../utils/crypto");
const { signJwt } = require("../utils/jwt");

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
  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "email and password required" });
  }

  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.is_active, r.name AS role
     FROM users u JOIN roles r ON r.id=u.role_id
     WHERE u.email=? LIMIT 1`,
    [email]
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




module.exports = { bootstrapSuperAdmin, login, createUser };
