const db = require("../db");

const ROLE_ORDER = [
  "SUPER_ADMIN",
  "ADMIN",
  "TEACHER",
  "EXAM_HEAD",
  "CAMPUS_CHIEF",
  "ASSISTANT_CAMPUS_CHIEF",
  "FINANCE",
  "STUDENT",
  "PUBLIC",
  "GENERAL_PUBLIC",
];

const PERMISSION_DEFINITIONS = [
  { key: "dashboard.view", label: "Dashboard", group: "Core", description: "View the dashboard and summary widgets." },
  { key: "college.manage", label: "College Setup", group: "College", description: "Manage campuses, academic years, batches, faculties, and sections." },
  { key: "students.view", label: "View Students", group: "Students", description: "View student lists and profiles." },
  { key: "students.manage", label: "Manage Students", group: "Students", description: "Create, edit, and delete student records and enrollments." },
  { key: "academics.view", label: "View Academics", group: "Academics", description: "View subject catalog and academic setup used by exams and marks." },
  { key: "academics.manage", label: "Manage Academics", group: "Academics", description: "Change academic structures such as subject-code organization." },
  { key: "exams.view", label: "View Exams", group: "Exams", description: "View exam list and exam component setup." },
  { key: "exams.manage", label: "Manage Exams", group: "Exams", description: "Create, configure, and delete exams." },
  { key: "marks.view", label: "View Marks", group: "Marks", description: "Open marks entry and bulk grid in read-only mode." },
  { key: "marks.entry", label: "Enter Marks", group: "Marks", description: "Save marks through student-wise marks entry." },
  { key: "marks.bulk", label: "Bulk Marks", group: "Marks", description: "Use bulk grid import and save operations." },
  { key: "results.view", label: "View Results Workflow", group: "Results", description: "Preview generated results and workflow state." },
  { key: "results.manage", label: "Generate Results", group: "Results", description: "Generate and submit exam results for workflow." },
  { key: "results.verify", label: "Verify Results", group: "Results", description: "Verify submitted exam results." },
  { key: "results.approve", label: "Approve Results", group: "Results", description: "Approve verified exam results." },
  { key: "results.publish", label: "Publish Results", group: "Results", description: "Publish or unpublish results." },
  { key: "results.marksheet", label: "Marksheet Print", group: "Results", description: "Access marksheet printing and export student lists." },
  { key: "results.sms", label: "Bulk SMS", group: "Results", description: "Send result messages through SMS integration." },
  { key: "reports.view", label: "Reports", group: "Results", description: "View tabulation, merit, statistics, and OT reports." },
  { key: "corrections.request", label: "Request Corrections", group: "Results", description: "Create and view personal correction requests." },
  { key: "corrections.review", label: "Review Corrections", group: "Results", description: "Approve or reject correction requests." },
  { key: "public.portal", label: "Public Portal", group: "Portal", description: "Access the public portal and published result search." },
  { key: "my_results.view", label: "My Results", group: "Portal", description: "Access the student result view." },
  { key: "users.manage", label: "Manage Users", group: "Users", description: "View users, change roles, passwords, status, and delete accounts." },
  { key: "users.invites", label: "User Invites", group: "Users", description: "Create and manage user invitation links." },
  { key: "users.add", label: "Add User", group: "Users", description: "Create a new user directly from the app." },
  { key: "roles.manage", label: "Roles & Access", group: "Users", description: "Change role descriptions and permission matrix." },
  { key: "settings.manage", label: "App Settings", group: "Admin", description: "Update branding, theme, notice bar, and app settings." },
  { key: "ot.claims", label: "OT Claims", group: "Operations", description: "Access OT claims workflow." },
  { key: "ot.reports", label: "OT Reports", group: "Operations", description: "View OT reports and summaries." },
  { key: "ot.policy.manage", label: "OT Policy", group: "Operations", description: "Update OT policy settings." },
  { key: "seat_planner.manage", label: "Seat Planner", group: "Exams", description: "Plan exam seating and print desk seat cards." },
];

const ROLE_DEFAULTS = {
  SUPER_ADMIN: PERMISSION_DEFINITIONS.map((item) => item.key),
  ADMIN: [
    "dashboard.view",
    "college.manage",
    "students.view",
    "students.manage",
    "academics.view",
    "exams.view",
    "exams.manage",
    "marks.view",
    "marks.entry",
    "marks.bulk",
    "results.view",
    "results.manage",
    "results.publish",
    "results.marksheet",
    "results.sms",
    "reports.view",
    "corrections.request",
    "corrections.review",
    "public.portal",
    "settings.manage",
    "ot.claims",
    "ot.reports",
    "ot.policy.manage",
    "seat_planner.manage",
  ],
  TEACHER: [
    "dashboard.view",
    "students.view",
    "academics.view",
    "exams.view",
    "marks.view",
    "marks.entry",
    "marks.bulk",
    "results.view",
    "reports.view",
    "corrections.request",
    "results.sms",
    "public.portal",
    "ot.claims",
  ],
  EXAM_HEAD: [
    "dashboard.view",
    "academics.view",
    "exams.view",
    "marks.view",
    "results.view",
    "results.verify",
    "results.marksheet",
    "reports.view",
    "public.portal",
    "seat_planner.manage",
  ],
  CAMPUS_CHIEF: [
    "dashboard.view",
    "academics.view",
    "exams.view",
    "marks.view",
    "results.view",
    "results.approve",
    "results.marksheet",
    "reports.view",
    "public.portal",
    "ot.claims",
    "ot.reports",
    "seat_planner.manage",
  ],
  ASSISTANT_CAMPUS_CHIEF: [
    "dashboard.view",
    "academics.view",
    "exams.view",
    "marks.view",
    "results.view",
    "results.approve",
    "results.marksheet",
    "reports.view",
    "public.portal",
    "seat_planner.manage",
  ],
  FINANCE: [
    "dashboard.view",
    "ot.claims",
    "ot.reports",
  ],
  STUDENT: [
    "dashboard.view",
    "my_results.view",
    "public.portal",
  ],
  PUBLIC: ["public.portal"],
  GENERAL_PUBLIC: ["public.portal"],
};

const ROLE_DESCRIPTIONS = {
  SUPER_ADMIN: "Full system control with role and permission management.",
  ADMIN: "Administrative role for exam operations, students, reports, and settings.",
  TEACHER: "Marks entry, reports, corrections, and OT workflow access.",
  EXAM_HEAD: "Verification-oriented exam workflow role.",
  CAMPUS_CHIEF: "Chief-level approval role for results and OT.",
  ASSISTANT_CAMPUS_CHIEF: "Assistant approval role for results.",
  FINANCE: "Finance and OT verification/reporting access.",
  STUDENT: "Student result viewing access.",
  PUBLIC: "Public portal session role.",
  GENERAL_PUBLIC: "General public portal session role.",
};

const permissionCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function normalizeRoleName(value) {
  return String(value || "").trim().toUpperCase();
}

function permissionKeySet() {
  return new Set(PERMISSION_DEFINITIONS.map((item) => item.key));
}

async function ensureRbacSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      role_id INT NOT NULL,
      permission_key VARCHAR(120) NOT NULL,
      is_allowed TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_role_permission (role_id, permission_key),
      KEY idx_role_permissions_role (role_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureRolesSeeded() {
  await ensureRbacSchema();
  for (const roleName of ROLE_ORDER) {
    await db.query(
      `INSERT IGNORE INTO roles (name, description) VALUES (?, ?)` ,
      [roleName, ROLE_DESCRIPTIONS[roleName] || null]
    );
    await db.query(
      `UPDATE roles SET description=COALESCE(NULLIF(description,''), ?) WHERE name=?`,
      [ROLE_DESCRIPTIONS[roleName] || null, roleName]
    );
  }
}

async function ensureRolePermissions(roleRow) {
  if (!roleRow?.id || !roleRow?.name) return;
  await ensureRbacSchema();
  const normalizedRole = normalizeRoleName(roleRow.name);
  const defaultSet = new Set(ROLE_DEFAULTS[normalizedRole] || []);
  for (const perm of PERMISSION_DEFINITIONS) {
    await db.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_key, is_allowed) VALUES (?,?,?)`,
      [roleRow.id, perm.key, defaultSet.has(perm.key) ? 1 : 0]
    );
  }
}

async function ensureAllRolePermissions() {
  await ensureRolesSeeded();
  const [roles] = await db.query(
    `SELECT id, name, description FROM roles ORDER BY FIELD(name, ${ROLE_ORDER.map(() => "?").join(",")}) DESC, name ASC`,
    ROLE_ORDER
  );
  for (const role of roles) {
    await ensureRolePermissions(role);
  }
}

function invalidatePermissionCache(roleName) {
  if (!roleName) {
    permissionCache.clear();
    return;
  }
  permissionCache.delete(normalizeRoleName(roleName));
}

async function getRoleRowByName(roleName) {
  const normalized = normalizeRoleName(roleName);
  if (!normalized) return null;
  await ensureRolesSeeded();
  await db.query(`INSERT IGNORE INTO roles (name, description) VALUES (?, ?)`, [normalized, null]);
  const [[role]] = await db.query(
    `SELECT id, name, description FROM roles WHERE name=? LIMIT 1`,
    [normalized]
  );
  if (!role) return null;
  await ensureRolePermissions(role);
  return role;
}

async function getRolePermissionKeys(roleName) {
  const normalized = normalizeRoleName(roleName);
  if (!normalized) return [];
  if (normalized === "SUPER_ADMIN") {
    return PERMISSION_DEFINITIONS.map((item) => item.key);
  }

  const cached = permissionCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return [...cached.keys];
  }

  const role = await getRoleRowByName(normalized);
  if (!role) return [];

  const [rows] = await db.query(
    `SELECT permission_key
     FROM role_permissions
     WHERE role_id=? AND is_allowed=1
     ORDER BY permission_key ASC`,
    [role.id]
  );
  const keys = rows.map((row) => String(row.permission_key || "")).filter(Boolean);
  permissionCache.set(normalized, {
    keys,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return keys;
}

async function listRolesAccess() {
  await ensureAllRolePermissions();
  const [roles] = await db.query(
    `SELECT r.id, r.name, r.description, COUNT(u.id) AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role_id=r.id
     GROUP BY r.id, r.name, r.description
     ORDER BY FIELD(r.name, ${ROLE_ORDER.map(() => "?").join(",")}) DESC, r.name ASC`,
    ROLE_ORDER
  );

  const [permissionRows] = await db.query(
    `SELECT rp.role_id, rp.permission_key, rp.is_allowed
     FROM role_permissions rp
     ORDER BY rp.role_id ASC, rp.permission_key ASC`
  );
  const byRoleId = new Map();
  for (const row of permissionRows) {
    if (!byRoleId.has(row.role_id)) byRoleId.set(row.role_id, new Map());
    byRoleId.get(row.role_id).set(String(row.permission_key), Number(row.is_allowed) === 1);
  }

  return {
    permissions: PERMISSION_DEFINITIONS,
    roles: roles.map((role) => {
      const permissionMap = byRoleId.get(role.id) || new Map();
      return {
        id: role.id,
        name: role.name,
        description: role.description || "",
        user_count: Number(role.user_count || 0),
        permissions: PERMISSION_DEFINITIONS.map((perm) => ({
          key: perm.key,
          allowed: !!permissionMap.get(perm.key),
        })),
      };
    }),
  };
}

async function updateRoleAccess(roleId, payload = {}) {
  await ensureAllRolePermissions();
  const [[role]] = await db.query(
    `SELECT id, name FROM roles WHERE id=? LIMIT 1`,
    [roleId]
  );
  if (!role) {
    const err = new Error("Role not found");
    err.statusCode = 404;
    throw err;
  }

  const validKeys = permissionKeySet();
  const nextPermissions = Array.isArray(payload.permissions)
    ? payload.permissions
        .map((item) => ({
          key: String(item?.key || "").trim(),
          allowed: !!item?.allowed,
        }))
        .filter((item) => validKeys.has(item.key))
    : [];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (typeof payload.description === "string") {
      await conn.query(
        `UPDATE roles SET description=? WHERE id=?`,
        [payload.description.trim(), role.id]
      );
    }

    if (nextPermissions.length > 0) {
      for (const perm of nextPermissions) {
        await conn.query(
          `INSERT INTO role_permissions (role_id, permission_key, is_allowed)
           VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE is_allowed=VALUES(is_allowed), updated_at=CURRENT_TIMESTAMP`,
          [role.id, perm.key, perm.allowed ? 1 : 0]
        );
      }
    }

    await conn.commit();
    invalidatePermissionCache(role.name);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return listRolesAccess();
}

async function hasAnyPermission(roleName, requiredKeys = []) {
  const normalizedRole = normalizeRoleName(roleName);
  if (!normalizedRole) return false;
  if (normalizedRole === "SUPER_ADMIN") return true;
  const required = Array.isArray(requiredKeys)
    ? requiredKeys.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!required.length) return true;
  const userKeys = new Set(await getRolePermissionKeys(normalizedRole));
  return required.some((key) => userKeys.has(key));
}

module.exports = {
  ROLE_ORDER,
  PERMISSION_DEFINITIONS,
  ROLE_DEFAULTS,
  normalizeRoleName,
  ensureRbacSchema,
  ensureRolesSeeded,
  ensureAllRolePermissions,
  getRolePermissionKeys,
  hasAnyPermission,
  listRolesAccess,
  updateRoleAccess,
  invalidatePermissionCache,
};
