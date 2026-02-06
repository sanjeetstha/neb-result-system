const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
// const { createStudent, listStudents, setOptionalChoices } = require("../controllers/students.controller");
const { createStudent, listStudents, updateStudent, setOptionalChoices, getStudentProfile } = require("../controllers/students.controller");


router.post("/", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), createStudent);
router.get("/", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"), listStudents);
router.put("/:studentId", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), updateStudent);
router.post("/:enrollmentId/optional-choices", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), setOptionalChoices);
router.get("/:enrollmentId/profile", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"), getStudentProfile);


module.exports = router;
