const router = require("express").Router();
const multer = require("multer");
const { requireAuth, requirePermission } = require("../middlewares/auth");
const { importMarks, downloadMarksLedgerTemplate } = require("../controllers/import.controller");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.post(
  "/marks",
  requireAuth,
  requirePermission("marks.bulk"),
  upload.single("file"),
  importMarks
);

router.get(
  "/marks-ledger-template",
  requireAuth,
  requirePermission("marks.bulk"),
  downloadMarksLedgerTemplate
);

module.exports = router;
