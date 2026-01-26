const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { upsertMarks, getStudentMarkLedger } = require("../controllers/marks.controller");

router.post("/:examId/enrollments/:enrollmentId", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), upsertMarks);
router.get("/:examId/enrollments/:enrollmentId", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), getStudentMarkLedger);

module.exports = router;
