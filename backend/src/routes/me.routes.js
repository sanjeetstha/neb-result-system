const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth");
const db = require("../db");
const { hashPassword, verifyPassword } = require("../utils/crypto");

async function loadUser(uid) {
  const [[row]] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.is_active, u.last_login_at, r.name AS role
     FROM users u
     JOIN roles r ON r.id=u.role_id
     WHERE u.id=? LIMIT 1`,
    [uid]
  );
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name,
    name: row.full_name,
    email: row.email,
    role: row.role,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const user = await loadUser(req.user.uid);
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to load profile" });
  }
});

router.put("/profile", requireAuth, async (req, res) => {
  try {
    const { full_name, email } = req.body || {};
    if (!full_name || !email) {
      return res.status(400).json({ ok: false, message: "full_name and email required" });
    }

    const [[existing]] = await db.query(
      `SELECT id FROM users WHERE email=? AND id<>? LIMIT 1`,
      [email, req.user.uid]
    );
    if (existing) {
      return res.status(409).json({ ok: false, message: "Email already exists" });
    }

    await db.query(
      `UPDATE users SET full_name=?, email=? WHERE id=?`,
      [full_name, email, req.user.uid]
    );

    const user = await loadUser(req.user.uid);
    return res.json({ ok: true, message: "Profile updated", user });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Profile update failed" });
  }
});

router.post("/password", requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res
        .status(400)
        .json({ ok: false, message: "current_password and new_password required" });
    }
    if (String(new_password).length < 6) {
      return res
        .status(400)
        .json({ ok: false, message: "New password must be at least 6 characters" });
    }

    const [[row]] = await db.query(
      `SELECT password_hash FROM users WHERE id=? LIMIT 1`,
      [req.user.uid]
    );
    if (!row) return res.status(404).json({ ok: false, message: "User not found" });

    const ok = await verifyPassword(current_password, row.password_hash);
    if (!ok) return res.status(401).json({ ok: false, message: "Current password is incorrect" });

    const hash = await hashPassword(new_password);
    await db.query(`UPDATE users SET password_hash=? WHERE id=?`, [hash, req.user.uid]);

    return res.json({ ok: true, message: "Password updated" });
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Password update failed" });
  }
});

module.exports = router;
