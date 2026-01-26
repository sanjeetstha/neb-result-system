const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { marksheetPdf } = require("../controllers/export.controller");

router.get("/marksheet.pdf", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), marksheetPdf);

module.exports = router;
