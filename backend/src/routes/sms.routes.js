const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const { bulkSms } = require("../controllers/sms.controller");

router.post("/bulk", requireAuth, requirePermission("results.sms"), bulkSms);

module.exports = router;
