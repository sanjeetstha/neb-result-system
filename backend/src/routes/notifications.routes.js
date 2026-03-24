const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth");
const { listMyNotifications, markNotificationsSeen } = require("../controllers/notifications.controller");

router.get("/", requireAuth, listMyNotifications);
router.post("/mark-seen", requireAuth, markNotificationsSeen);

module.exports = router;

