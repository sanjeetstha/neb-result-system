const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { marksheetPdf, listMarksheetStudents } = require("../controllers/export.controller");

router.get(
  "/marksheet.pdf",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  marksheetPdf
);
router.get(
  "/marksheet/students",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  listMarksheetStudents
);

module.exports = router;
