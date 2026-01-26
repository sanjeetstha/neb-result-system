const router = require("express").Router();
const { bootstrapSuperAdmin, login, createUser } = require("../controllers/auth.controller");
const { requireAuth, requireRole } = require("../middlewares/auth");

router.post("/bootstrap-superadmin", bootstrapSuperAdmin);
router.post("/login", login);

// SUPER_ADMIN can create ADMIN/TEACHER/STUDENT
router.post("/users", requireAuth, requireRole("SUPER_ADMIN"), createUser);

module.exports = router;
