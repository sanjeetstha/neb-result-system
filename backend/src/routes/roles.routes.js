const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const { getRolesAccess, saveRoleAccess } = require("../controllers/roles.controller");

router.get("/access", requireAuth, requirePermission("roles.manage"), getRolesAccess);
router.put("/:roleId/access", requireAuth, requirePermission("roles.manage"), saveRoleAccess);

module.exports = router;
