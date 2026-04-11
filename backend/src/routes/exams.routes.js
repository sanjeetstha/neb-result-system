const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const {
  createExam,
  listExams,
  getExamComponents,
  setExamComponents,
  deleteExam,
} = require("../controllers/exams.controller");

router.get("/", requireAuth, requirePermission("exams.view"), listExams);
router.post("/", requireAuth, requirePermission("exams.manage"), createExam);
router.get("/:examId/components", requireAuth, requirePermission("exams.view"), getExamComponents);
router.post("/:examId/components", requireAuth, requirePermission("exams.manage"), setExamComponents);
router.delete("/:examId", requireAuth, requirePermission("exams.manage"), deleteExam);

module.exports = router;
