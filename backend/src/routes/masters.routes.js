const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const {
  listCampuses, createCampus,
  listAcademicYears, createAcademicYear,
  listFaculties, createFaculty,
  listClasses,
  listSections, createSection,
  getSubjectCatalog, getSubjectById
} = require("../controllers/masters.controller");

// Campuses
router.get("/campuses", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listCampuses);
router.post("/campuses", requireAuth, requireRole("SUPER_ADMIN"), createCampus);

// Academic years
router.get("/academic-years", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listAcademicYears);
router.post("/academic-years", requireAuth, requireRole("SUPER_ADMIN"), createAcademicYear);

// Faculties
router.get("/faculties", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listFaculties);
router.post("/faculties", requireAuth, requireRole("SUPER_ADMIN"), createFaculty);

// Classes
router.get("/classes", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listClasses);

// Sections
router.get("/sections", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), listSections);
router.post("/sections", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), createSection);

router.get("/subject-catalog", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"), getSubjectCatalog);
router.get("/subjects/:id", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "TEACHER"), getSubjectById);


module.exports = router;
