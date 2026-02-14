const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
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

// Preview (live)
router.get("/:examId/enrollments/:enrollmentId/preview",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  preview
);

// Generate snapshot (save)
router.post("/:examId/enrollments/:enrollmentId/generate",
  requireAuth, requireRole("SUPER_ADMIN","ADMIN"), generate);

// Get snapshot (stable)
router.get("/:examId/enrollments/:enrollmentId",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  getSnapshot
);

router.get(
  "/:examId/workflow",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  getWorkflow
);
router.post(
  "/:examId/submit",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"),
  submitForVerification
);
router.post(
  "/:examId/verify",
  requireAuth,
  requireRole("SUPER_ADMIN", "EXAM_HEAD"),
  verifyExam
);
router.post(
  "/:examId/approve",
  requireAuth,
  requireRole("SUPER_ADMIN", "CAMPUS_CHIEF", "ASSISTANT_CAMPUS_CHIEF"),
  approveExam
);

// Publish exam (Option A: publish generated snapshots only)
router.post("/:examId/publish",
  requireAuth, requireRole("SUPER_ADMIN","ADMIN"), publishExam);

// Unpublish exam (SUPER_ADMIN only)
router.post("/:examId/unpublish",
  requireAuth, requireRole("SUPER_ADMIN"), unpublishExam);

module.exports = router;
