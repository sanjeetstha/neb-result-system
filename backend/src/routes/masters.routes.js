const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const {
  listCampuses, createCampus,
  updateCampus, deleteCampus,
  listAcademicYears, createAcademicYear,
  updateAcademicYear,
  listFaculties, createFaculty,
  updateFaculty,
  listClasses,
  listGradingSchemes,
  listBatches, createBatch,
  updateBatch, deleteBatch,
  listSections, createSection,
  updateSection,
  getSubjectCatalog, shiftOptionalSubjectGroup, getSubjectById
} = require("../controllers/masters.controller");

// Campuses
router.get("/campuses", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listCampuses);
router.post("/campuses", requireAuth, requireRole("SUPER_ADMIN"), createCampus);
router.put("/campuses/:id", requireAuth, requireRole("SUPER_ADMIN"), updateCampus);
router.delete("/campuses/:id", requireAuth, requireRole("SUPER_ADMIN"), deleteCampus);

// Academic years
router.get("/academic-years", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listAcademicYears);
router.post("/academic-years", requireAuth, requireRole("SUPER_ADMIN"), createAcademicYear);
router.put("/academic-years/:id", requireAuth, requireRole("SUPER_ADMIN"), updateAcademicYear);

// Faculties
router.get("/faculties", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listFaculties);
router.post("/faculties", requireAuth, requireRole("SUPER_ADMIN"), createFaculty);
router.put("/faculties/:id", requireAuth, requireRole("SUPER_ADMIN"), updateFaculty);

// Classes
router.get(
  "/classes",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  listClasses
);

// Grading schemes
router.get(
  "/grading-schemes",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  listGradingSchemes
);

// Batches
router.get(
  "/batches",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  listBatches
);
router.post("/batches", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), createBatch);
router.put("/batches/:id", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), updateBatch);
router.delete("/batches/:id", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), deleteBatch);

// Sections
router.get("/sections", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listSections);
router.post("/sections", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), createSection);
router.put("/sections/:id", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), updateSection);

router.get(
  "/subject-catalog",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  getSubjectCatalog
);
router.post("/subject-codes/shift", requireAuth, requireRole("SUPER_ADMIN"), shiftOptionalSubjectGroup);
router.get(
  "/subjects/:id",
  requireAuth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "EXAM_HEAD",
    "CAMPUS_CHIEF",
    "ASSISTANT_CAMPUS_CHIEF"
  ),
  getSubjectById
);


module.exports = router;
