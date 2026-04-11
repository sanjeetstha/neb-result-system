const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const {
  listUsers,
  listActiveUsers,
  updateUserStatus,
  updateUser,
  updateUserPassword,
  deleteUser,
} = require("../controllers/users.controller");

router.get("/", requireAuth, requirePermission("users.manage"), listUsers);
router.get("/active", requireAuth, requirePermission("users.manage"), listActiveUsers);
router.put("/:id/status", requireAuth, requirePermission("users.manage"), updateUserStatus);
router.put("/:id", requireAuth, requirePermission("users.manage"), updateUser);
router.put("/:id/password", requireAuth, requirePermission("users.manage"), updateUserPassword);
router.delete("/:id", requireAuth, requirePermission("users.manage"), deleteUser);

module.exports = router;
