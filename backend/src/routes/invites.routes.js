const router = require("express").Router();
const invites = require("../controllers/invites.controller");
const { requireAuth, requirePermission } = require("../middlewares/auth");

router.post("/", requireAuth, requirePermission("users.invites"), invites.createInvite);
router.get("/", requireAuth, requirePermission("users.invites"), invites.listInvites);
router.post("/:id/revoke", requireAuth, requirePermission("users.invites"), invites.revokeInvite);

module.exports = router;
