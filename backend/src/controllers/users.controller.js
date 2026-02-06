const db = require("../db");

async function listUsers(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.full_name, u.email, u.is_active, u.created_at, u.last_login_at,
              r.name AS role
       FROM users u
       JOIN roles r ON r.id=u.role_id
       ORDER BY u.id DESC`
    );
    res.json({ ok: true, users: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to load users" });
  }
}

async function updateUserStatus(req, res) {
  const id = Number(req.params.id);
  const { is_active } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid user id" });

  try {
    await db.query(`UPDATE users SET is_active=? WHERE id=?`, [is_active ? 1 : 0, id]);
    res.json({ ok: true, message: "User status updated" });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to update user status" });
  }
}

async function updateUser(req, res) {
  const id = Number(req.params.id);
  const { full_name, email } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid user id" });
  if (!full_name || !email) {
    return res.status(400).json({ ok: false, message: "full_name and email required" });
  }

  const [[existing]] = await db.query(
    `SELECT id FROM users WHERE email=? AND id<>? LIMIT 1`,
    [email, id]
  );
  if (existing) {
    return res.status(409).json({ ok: false, message: "Email already exists" });
  }

  try {
    await db.query(`UPDATE users SET full_name=?, email=? WHERE id=?`, [full_name, email, id]);
    res.json({ ok: true, message: "User updated" });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to update user" });
  }
}

module.exports = { listUsers, updateUserStatus, updateUser };
