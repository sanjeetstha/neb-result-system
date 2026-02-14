const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
// const { createStudent, listStudents, setOptionalChoices } = require("../controllers/students.controller");
const { createStudent, listStudents, updateStudent, setOptionalChoices, getStudentProfile, deleteStudentsBulk, deleteStudentEnrollment } = require("../controllers/students.controller");


router.post("/", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), createStudent);
router.get(
  "/",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  listStudents
);
router.put("/:studentId", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), updateStudent);
router.post("/:enrollmentId/optional-choices", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), setOptionalChoices);
router.get(
  "/:enrollmentId/profile",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  getStudentProfile
);
router.delete("/bulk", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), deleteStudentsBulk);
router.delete("/enrollments/:enrollmentId", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), deleteStudentEnrollment);


module.exports = router;
