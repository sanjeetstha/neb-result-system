const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth");
const { listMyNotifications } = require("../controllers/notifications.controller");

router.get("/", requireAuth, listMyNotifications);

module.exports = router;

