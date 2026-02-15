const router = require("express").Router();
const { requirePublicPortalAccess } = require("../middlewares/auth");

const {
  listPublishedExams,
  listPublishedStudentsByExam,
  searchPublishedResult,
  getPublishedResultByPath,
} = require("../controllers/public.controller");
const {
  requestPublicOtp,
  verifyPublicOtp,
  getPublicSession,
} = require("../controllers/publicAuth.controller");

const {
  marksheetPdf,
  marksheetJpg,
  transcriptPdf,
  transcriptJpg,
} = require("../controllers/export.controller");

// No auth (public)
router.post("/auth/request-otp", requestPublicOtp);
router.post("/auth/verify-otp", verifyPublicOtp);
router.get("/auth/session", requirePublicPortalAccess, getPublicSession);

// Public discovery (session protected)
router.get("/exams", requirePublicPortalAccess, listPublishedExams);
router.get("/students", requirePublicPortalAccess, listPublishedStudentsByExam);
router.post("/results/search", requirePublicPortalAccess, searchPublishedResult);
router.get(
  "/results/:examId/:symbolNo",
  requirePublicPortalAccess,
  getPublishedResultByPath
);

// Public PDF exports (OTP/session protected)
router.get("/marksheet.pdf", requirePublicPortalAccess, marksheetPdf);
router.get("/transcript.pdf", requirePublicPortalAccess, transcriptPdf);

// Public JPG exports (first page; OTP/session protected)
router.get("/marksheet.jpg", requirePublicPortalAccess, marksheetJpg);
router.get("/transcript.jpg", requirePublicPortalAccess, transcriptJpg);

module.exports = router;
