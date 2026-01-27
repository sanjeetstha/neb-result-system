const router = require("express").Router();

const {
  listPublishedExams,
  searchPublishedResult,
  getPublishedResultByPath,
} = require("../controllers/public.controller");

const {
  marksheetPdf,
  marksheetJpg,
  transcriptPdf,
  transcriptJpg,
} = require("../controllers/export.controller");

// No auth (public)
router.get("/exams", listPublishedExams);
router.post("/results/search", searchPublishedResult);
router.get("/results/:examId/:symbolNo", getPublishedResultByPath);

// Public PDF exports
router.get("/marksheet.pdf", marksheetPdf);
router.get("/transcript.pdf", transcriptPdf);

// Public JPG exports (first page)
router.get("/marksheet.jpg", marksheetJpg);
router.get("/transcript.jpg", transcriptJpg);

module.exports = router;
