const router = require("express").Router();
const { marksheetPdf } = require("../controllers/export.controller");
const { listPublishedExams, searchPublishedResult, getPublishedResultByPath } = require("../controllers/public.controller");
const { transcriptPdf } = require("../controllers/export.controller");

// No auth (public)
router.get("/exams", listPublishedExams);
router.post("/results/search", searchPublishedResult);
router.get("/results/:examId/:symbolNo", getPublishedResultByPath);
router.get("/marksheet.pdf", marksheetPdf);
router.get("/transcript.pdf", transcriptPdf);


module.exports = router;
