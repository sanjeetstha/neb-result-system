const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { listUsers, updateUserStatus, updateUser } = require("../controllers/users.controller");

router.get("/", requireAuth, requireRole("SUPER_ADMIN"), listUsers);
router.put("/:id/status", requireAuth, requireRole("SUPER_ADMIN"), updateUserStatus);
router.put("/:id", requireAuth, requireRole("SUPER_ADMIN"), updateUser);

module.exports = router;
