const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { createExam, listExams, setExamComponents } = require("../controllers/exams.controller");

router.get("/", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), listExams);
router.post("/", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), createExam);
router.post("/:examId/components", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), setExamComponents);

module.exports = router;
