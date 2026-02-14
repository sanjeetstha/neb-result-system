const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { tabulation, meritList, passStats } = require("../controllers/reports.controller");

router.get(
  "/tabulation",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  tabulation
);
router.get(
  "/merit",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  meritList
);
router.get(
  "/pass-stats",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  passStats
);

module.exports = router;
