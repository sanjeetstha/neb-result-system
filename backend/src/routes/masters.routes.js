const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const {
  listCampuses,
  createCampus,
  updateCampus,
  deleteCampus,
  listAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  listFaculties,
  createFaculty,
  updateFaculty,
  listClasses,
  listGradingSchemes,
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  listSections,
  createSection,
  updateSection,
  getSubjectCatalog,
  shiftOptionalSubjectGroup,
  getSubjectById,
} = require("../controllers/masters.controller");

router.get("/campuses", requireAuth, requirePermission("college.manage"), listCampuses);
router.post("/campuses", requireAuth, requirePermission("college.manage"), createCampus);
router.put("/campuses/:id", requireAuth, requirePermission("college.manage"), updateCampus);
router.delete("/campuses/:id", requireAuth, requirePermission("college.manage"), deleteCampus);

router.get("/academic-years", requireAuth, requirePermission("college.manage"), listAcademicYears);
router.post("/academic-years", requireAuth, requirePermission("college.manage"), createAcademicYear);
router.put("/academic-years/:id", requireAuth, requirePermission("college.manage"), updateAcademicYear);

router.get("/faculties", requireAuth, requirePermission("college.manage"), listFaculties);
router.post("/faculties", requireAuth, requirePermission("college.manage"), createFaculty);
router.put("/faculties/:id", requireAuth, requirePermission("college.manage"), updateFaculty);

router.get(
  "/classes",
  requireAuth,
  requirePermission("college.manage", "academics.view", "exams.view", "marks.view", "seat_planner.manage"),
  listClasses
);

router.get(
  "/grading-schemes",
  requireAuth,
  requirePermission("college.manage", "academics.view", "exams.view", "marks.view", "seat_planner.manage"),
  listGradingSchemes
);

router.get(
  "/batches",
  requireAuth,
  requirePermission("college.manage", "academics.view", "exams.view", "marks.view", "students.view", "seat_planner.manage"),
  listBatches
);
router.post("/batches", requireAuth, requirePermission("college.manage"), createBatch);
router.put("/batches/:id", requireAuth, requirePermission("college.manage"), updateBatch);
router.delete("/batches/:id", requireAuth, requirePermission("college.manage"), deleteBatch);

router.get("/sections", requireAuth, requirePermission("college.manage"), listSections);
router.post("/sections", requireAuth, requirePermission("college.manage"), createSection);
router.put("/sections/:id", requireAuth, requirePermission("college.manage"), updateSection);

router.get("/subject-catalog", requireAuth, requirePermission("academics.view"), getSubjectCatalog);
router.post("/subject-codes/shift", requireAuth, requirePermission("academics.manage"), shiftOptionalSubjectGroup);
router.get("/subjects/:id", requireAuth, requirePermission("academics.view"), getSubjectById);

module.exports = router;
