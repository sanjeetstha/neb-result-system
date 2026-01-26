const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { tabulation, meritList, passStats } = require("../controllers/reports.controller");

router.get("/tabulation", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), tabulation);
router.get("/merit", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), meritList);
router.get("/pass-stats", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), passStats);

module.exports = router;
