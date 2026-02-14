const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { createExam, listExams, getExamComponents, setExamComponents, deleteExam } = require("../controllers/exams.controller");

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
  listExams
);
router.post("/", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), createExam);
router.get(
  "/:examId/components",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  getExamComponents
);
router.post("/:examId/components", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), setExamComponents);
router.delete("/:examId", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), deleteExam);

module.exports = router;
