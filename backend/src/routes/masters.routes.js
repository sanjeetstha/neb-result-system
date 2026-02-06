const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const {
  listCampuses, createCampus,
  updateCampus,
  listAcademicYears, createAcademicYear,
  updateAcademicYear,
  listFaculties, createFaculty,
  updateFaculty,
  listClasses,
  listGradingSchemes,
  listSections, createSection,
  updateSection,
  getSubjectCatalog, getSubjectById
} = require("../controllers/masters.controller");

// Campuses
router.get("/campuses", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listCampuses);
router.post("/campuses", requireAuth, requireRole("SUPER_ADMIN"), createCampus);
router.put("/campuses/:id", requireAuth, requireRole("SUPER_ADMIN"), updateCampus);

// Academic years
router.get("/academic-years", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listAcademicYears);
router.post("/academic-years", requireAuth, requireRole("SUPER_ADMIN"), createAcademicYear);
router.put("/academic-years/:id", requireAuth, requireRole("SUPER_ADMIN"), updateAcademicYear);

// Faculties
router.get("/faculties", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listFaculties);
router.post("/faculties", requireAuth, requireRole("SUPER_ADMIN"), createFaculty);
router.put("/faculties/:id", requireAuth, requireRole("SUPER_ADMIN"), updateFaculty);

// Classes
router.get("/classes", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listClasses);

// Grading schemes
router.get("/grading-schemes", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"), listGradingSchemes);

// Sections
router.get("/sections", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listSections);
router.post("/sections", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), createSection);
router.put("/sections/:id", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), updateSection);

router.get("/subject-catalog", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"), getSubjectCatalog);
router.get("/subjects/:id", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"), getSubjectById);


module.exports = router;
