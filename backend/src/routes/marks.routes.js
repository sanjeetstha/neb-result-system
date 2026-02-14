const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { upsertMarks, getStudentMarkLedger } = require("../controllers/marks.controller");

router.post("/:examId/enrollments/:enrollmentId", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), upsertMarks);
router.get(
  "/:examId/enrollments/:enrollmentId",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  getStudentMarkLedger
);

module.exports = router;
