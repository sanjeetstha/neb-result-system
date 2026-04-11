const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const { marksheetPdf, listMarksheetStudents } = require("../controllers/export.controller");

router.get("/marksheet.pdf", requireAuth, requirePermission("results.marksheet"), marksheetPdf);
router.get("/marksheet/students", requireAuth, requirePermission("results.marksheet"), listMarksheetStudents);

module.exports = router;
