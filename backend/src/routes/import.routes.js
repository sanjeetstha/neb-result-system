const router = require("express").Router();
const multer = require("multer");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { importMarks, downloadMarksLedgerTemplate } = require("../controllers/import.controller");

// store in memory (no server file clutter)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

router.post(
  "/marks",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"),
  upload.single("file"),
  importMarks
);

router.get(
  "/marks-ledger-template",
  downloadMarksLedgerTemplate
);

module.exports = router;
