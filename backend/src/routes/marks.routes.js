const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const { upsertMarks, getStudentMarkLedger } = require("../controllers/marks.controller");

router.post(
  "/:examId/enrollments/:enrollmentId",
  requireAuth,
  requirePermission("marks.entry", "marks.bulk"),
  upsertMarks
);
router.get(
  "/:examId/enrollments/:enrollmentId",
  requireAuth,
  requirePermission("marks.view"),
  getStudentMarkLedger
);

module.exports = router;
