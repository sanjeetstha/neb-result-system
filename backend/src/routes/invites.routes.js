const router = require("express").Router();
const invites = require("../controllers/invites.controller");
const { requireAuth, requireRole } = require("../middlewares/auth");

// SUPER_ADMIN only
router.post("/", requireAuth, requireRole("SUPER_ADMIN"), invites.createInvite);
router.get("/", requireAuth, requireRole("SUPER_ADMIN"), invites.listInvites);
router.post("/:id/revoke", requireAuth, requireRole("SUPER_ADMIN"), invites.revokeInvite);

module.exports = router;
