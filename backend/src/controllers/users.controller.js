const db = require("../db");
const { hashPassword, verifyPassword } = require("../utils/crypto");
const { sendPasswordChangedEmail } = require("../services/mailer");
const { normalizePhone, sendSms } = require("../services/sms.service");

function isUnknownColumn(err, column) {
  return String(err?.message || "").toLowerCase().includes(`unknown column '${column.toLowerCase()}'`);
}

let cachedUserColumns = null;

async function getUserColumns() {
  if (cachedUserColumns) return cachedUserColumns;
  const [rows] = await db.query(`SHOW COLUMNS FROM users`);
  cachedUserColumns = new Set(rows.map((row) => row.Field));
  return cachedUserColumns;
}

async function hasContactColumn() {
  try {
    const cols = await getUserColumns();
    return cols.has("contact_number");
  } catch (e) {
    try {
      await db.query(`SELECT contact_number FROM users LIMIT 0`);
      return true;
    } catch (err) {
      if (isUnknownColumn(err, "contact_number")) return false;
      throw err;
    }
  }
}

async function hasPhoneColumn() {
  try {
    const cols = await getUserColumns();
    return cols.has("phone");
  } catch (e) {
    try {
      await db.query(`SELECT phone FROM users LIMIT 0`);
      return true;
    } catch (err) {
      if (isUnknownColumn(err, "phone")) return false;
      throw err;
    }
  }
}

async function selectUsers() {
  try {
    const cols = await getUserColumns();
    const selectParts = ["u.id", "u.full_name", "u.email"];

    if (cols.has("contact_number")) {
      selectParts.push("u.contact_number");
    } else if (cols.has("phone")) {
      selectParts.push("u.phone AS contact_number");
    }

    if (cols.has("is_active")) {
      selectParts.push("u.is_active");
    } else {
      selectParts.push("1 AS is_active");
    }

    if (cols.has("created_at")) {
      selectParts.push("u.created_at");
    } else {
      selectParts.push("NULL AS created_at");
    }

    if (cols.has("last_login_at")) {
      selectParts.push("u.last_login_at");
    } else {
      selectParts.push("NULL AS last_login_at");
    }

    return await db.query(
      `SELECT ${selectParts.join(", ")}, r.name AS role
       FROM users u
       JOIN roles r ON r.id=u.role_id
       ORDER BY u.id DESC`
    );
  } catch (e) {
    try {
      return await db.query(
        `SELECT u.id, u.full_name, u.email, r.name AS role
         FROM users u
         JOIN roles r ON r.id=u.role_id
         ORDER BY u.id DESC`
      );
    } catch (err) {
      return db.query(
        `SELECT u.id, u.full_name, u.email, 'UNKNOWN' AS role
         FROM users u
         ORDER BY u.id DESC`
      );
    }
  }
}

async function listUsers(req, res) {
  try {
    const [rows] = await selectUsers();
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
  const { full_name, email, role, contact_number } = req.body || {};
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

  let roleId = null;
  if (role) {
    const allowed = ["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"];
    if (!allowed.includes(role)) {
      return res.status(400).json({ ok: false, message: "Invalid role" });
    }
    const [[roleRow]] = await db.query(`SELECT id FROM roles WHERE name=? LIMIT 1`, [role]);
    if (!roleRow) return res.status(400).json({ ok: false, message: "Role not found" });
    roleId = roleRow.id;
  }

  const updates = ["full_name=?", "email=?"];
  const params = [full_name, email];
  if (roleId) {
    updates.push("role_id=?");
    params.push(roleId);
  }
  if (typeof contact_number !== "undefined") {
    let hasContact = false;
    let hasPhone = false;
    try {
      hasContact = await hasContactColumn();
      if (!hasContact) {
        hasPhone = await hasPhoneColumn();
      }
    } catch (e) {
      return res.status(500).json({ ok: false, message: "Failed to check contact column" });
    }
    if (!hasContact && !hasPhone) {
      return res.status(400).json({
        ok: false,
        message:
          "contact_number/phone column missing. Run the migration or add the phone column to enable contact numbers.",
      });
    }
    updates.push(hasContact ? "contact_number=?" : "phone=?");
    params.push(contact_number ? String(contact_number) : null);
  }

  params.push(id);

  try {
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id=?`, params);
    res.json({ ok: true, message: "User updated" });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to update user" });
  }
}

async function updateUserPassword(req, res) {
  const id = Number(req.params.id);
  const { password, notify_email = true, notify_sms = false } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid user id" });
  if (!password || String(password).length < 6) {
    return res.status(400).json({ ok: false, message: "Password must be at least 6 characters" });
  }

  let user = null;
  try {
    const hasContact = await hasContactColumn();
    const hasPhone = hasContact ? false : await hasPhoneColumn();
    const [[row]] = hasContact
      ? await db.query(
          `SELECT id, full_name, email, contact_number FROM users WHERE id=? LIMIT 1`,
          [id]
        )
      : hasPhone
      ? await db.query(
          `SELECT id, full_name, email, phone AS contact_number FROM users WHERE id=? LIMIT 1`,
          [id]
        )
      : await db.query(`SELECT id, full_name, email FROM users WHERE id=? LIMIT 1`, [id]);
    user = row ? (row.contact_number !== undefined ? row : { ...row, contact_number: null }) : null;
  } catch (e) {
    return res.status(500).json({ ok: false, message: "Failed to load user" });
  }

  if (!user) return res.status(404).json({ ok: false, message: "User not found" });

  const phone = notify_sms ? normalizePhone(user.contact_number || "") : "";
  if (notify_sms) {
    let hasContact = false;
    let hasPhone = false;
    try {
      hasContact = await hasContactColumn();
      if (!hasContact) {
        hasPhone = await hasPhoneColumn();
      }
    } catch (e) {
      return res.status(500).json({ ok: false, message: "Failed to check contact column" });
    }
    if (!hasContact && !hasPhone) {
      return res.status(400).json({
        ok: false,
        message:
          "contact_number/phone column missing. Run the migration or add the phone column to enable SMS notifications.",
      });
    }
    if (!phone) {
      return res.status(400).json({ ok: false, message: "User contact number missing" });
    }
  }

  const password_hash = await hashPassword(password);
  await db.query(`UPDATE users SET password_hash=? WHERE id=?`, [password_hash, id]);

  const warnings = [];
  if (notify_email) {
    try {
      await sendPasswordChangedEmail({ to: user.email, name: user.full_name });
    } catch (e) {
      warnings.push("Email notification failed");
    }
  }

  if (notify_sms && phone) {
    try {
      await sendSms({
        to: phone,
        text: "Your NEB Result System password was changed by an administrator. If this was not you, contact the campus office.",
      });
    } catch (e) {
      warnings.push("SMS notification failed");
    }
  }

  return res.json({ ok: true, message: "Password updated", warnings });
}

async function deleteUser(req, res) {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "Invalid user id" });
  if (!password) {
    return res.status(400).json({ ok: false, message: "Password required to delete user" });
  }
  if (req.user?.uid && Number(req.user.uid) === id) {
    return res.status(400).json({ ok: false, message: "You cannot delete your own account" });
  }

  try {
    const [[admin]] = await db.query(`SELECT password_hash FROM users WHERE id=? LIMIT 1`, [
      req.user?.uid,
    ]);
    if (!admin) {
      return res.status(401).json({ ok: false, message: "Invalid session" });
    }
    const ok = await verifyPassword(password, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, message: "Incorrect password" });
    }

    await db.query(`DELETE FROM users WHERE id=?`, [id]);
    return res.json({ ok: true, message: "User deleted" });
  } catch (e) {
    if (String(e.code || "") === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        ok: false,
        message: "Cannot delete user with related records. Disable the user instead.",
      });
    }
    return res.status(500).json({ ok: false, message: "Failed to delete user" });
  }
}

module.exports = {
  listUsers,
  updateUserStatus,
  updateUser,
  updateUserPassword,
  deleteUser,
};
