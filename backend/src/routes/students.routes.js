const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const {
  createStudent,
  listStudents,
  updateStudent,
  setOptionalChoices,
  getStudentProfile,
  deleteStudentsBulk,
  deleteStudentEnrollment,
} = require("../controllers/students.controller");

router.post("/", requireAuth, requirePermission("students.manage"), createStudent);
router.get("/", requireAuth, requirePermission("students.view"), listStudents);
router.put("/:studentId", requireAuth, requirePermission("students.manage"), updateStudent);
router.post("/:enrollmentId/optional-choices", requireAuth, requirePermission("students.manage"), setOptionalChoices);
router.get("/:enrollmentId/profile", requireAuth, requirePermission("students.view"), getStudentProfile);
router.delete("/bulk", requireAuth, requirePermission("students.manage"), deleteStudentsBulk);
router.delete("/enrollments/:enrollmentId", requireAuth, requirePermission("students.manage"), deleteStudentEnrollment);

module.exports = router;
