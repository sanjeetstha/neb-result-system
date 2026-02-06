const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { bulkSms } = require("../controllers/sms.controller");

router.post(
  "/bulk",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"),
  bulkSms
);

module.exports = router;
