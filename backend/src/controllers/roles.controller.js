const { listRolesAccess, updateRoleAccess } = require("../services/rbac.service");

async function getRolesAccess(req, res) {
  try {
    const data = await listRolesAccess();
    return res.json({ ok: true, ...data });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to load roles access" });
  }
}

async function saveRoleAccess(req, res) {
  try {
    const roleId = Number(req.params.roleId);
    if (!roleId) {
      return res.status(400).json({ ok: false, message: "Invalid role id" });
    }

    const payload = {
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined,
      permissions: Array.isArray(req.body?.permissions) ? req.body.permissions : [],
    };

    const data = await updateRoleAccess(roleId, payload);
    return res.json({ ok: true, message: "Role access updated", ...data });
  } catch (err) {
    const status = Number(err?.statusCode || 500);
    return res.status(status).json({
      ok: false,
      message: err?.message || "Failed to update role access",
    });
  }
}

module.exports = {
  getRolesAccess,
  saveRoleAccess,
};
