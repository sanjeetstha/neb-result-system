const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const {
  preview,
  generate,
  getSnapshot,
  getWorkflow,
  submitForVerification,
  verifyExam,
  approveExam,
  publishExam,
  unpublishExam,
} = require("../controllers/results.controller");

router.get("/:examId/enrollments/:enrollmentId/preview", requireAuth, requirePermission("results.view"), preview);
router.post("/:examId/enrollments/:enrollmentId/generate", requireAuth, requirePermission("results.manage"), generate);
router.get("/:examId/enrollments/:enrollmentId", requireAuth, requirePermission("results.view"), getSnapshot);
router.get("/:examId/workflow", requireAuth, requirePermission("results.view"), getWorkflow);
router.post("/:examId/submit", requireAuth, requirePermission("results.manage"), submitForVerification);
router.post("/:examId/verify", requireAuth, requirePermission("results.verify"), verifyExam);
router.post("/:examId/approve", requireAuth, requirePermission("results.approve"), approveExam);
router.post("/:examId/publish", requireAuth, requirePermission("results.publish"), publishExam);
router.post("/:examId/unpublish", requireAuth, requirePermission("results.publish"), unpublishExam);

module.exports = router;
