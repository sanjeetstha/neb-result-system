const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { preview, generate, getSnapshot, publishExam } = require("../controllers/results.controller");

// Preview (live)
router.get("/:examId/enrollments/:enrollmentId/preview",
  requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), preview);

// Generate snapshot (save)
router.post("/:examId/enrollments/:enrollmentId/generate",
  requireAuth, requireRole("SUPER_ADMIN","ADMIN"), generate);

// Get snapshot (stable)
router.get("/:examId/enrollments/:enrollmentId",
  requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), getSnapshot);

// Publish exam (Option A: publish generated snapshots only)
router.post("/:examId/publish",
  requireAuth, requireRole("SUPER_ADMIN","ADMIN"), publishExam);

module.exports = router;
