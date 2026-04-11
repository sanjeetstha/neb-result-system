const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const { tabulation, meritList, passStats } = require("../controllers/reports.controller");

router.get("/tabulation", requireAuth, requirePermission("reports.view"), tabulation);
router.get("/merit", requireAuth, requirePermission("reports.view"), meritList);
router.get("/pass-stats", requireAuth, requirePermission("reports.view"), passStats);

module.exports = router;
