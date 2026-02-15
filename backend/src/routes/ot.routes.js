const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const ot = require("../controllers/ot.controller");

const INTERNAL_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "TEACHER",
  "EXAM_HEAD",
  "CAMPUS_CHIEF",
  "ASSISTANT_CAMPUS_CHIEF",
];

router.get("/dashboard", requireAuth, requireRole(...INTERNAL_ROLES), ot.dashboard);
router.get("/claims", requireAuth, requireRole(...INTERNAL_ROLES), ot.listClaims);
router.post("/claims", requireAuth, requireRole(...INTERNAL_ROLES), ot.createClaim);
router.get("/claims/:id", requireAuth, requireRole(...INTERNAL_ROLES), ot.getClaim);
router.put("/claims/:id", requireAuth, requireRole(...INTERNAL_ROLES), ot.updateClaim);
router.post("/claims/:id/items", requireAuth, requireRole(...INTERNAL_ROLES), ot.addItem);
router.delete(
  "/claims/:id/items/:itemId",
  requireAuth,
  requireRole(...INTERNAL_ROLES),
  ot.removeItem
);

router.post("/claims/:id/submit", requireAuth, requireRole(...INTERNAL_ROLES), ot.submitClaim);
router.post("/claims/:id/verify", requireAuth, requireRole(...INTERNAL_ROLES), ot.verifyClaim);
router.post("/claims/:id/approve", requireAuth, requireRole(...INTERNAL_ROLES), ot.approveClaim);
router.post("/claims/:id/reject", requireAuth, requireRole(...INTERNAL_ROLES), ot.rejectClaim);
router.post("/claims/:id/reopen", requireAuth, requireRole(...INTERNAL_ROLES), ot.reopenClaim);

router.get("/policy/active", requireAuth, requireRole(...INTERNAL_ROLES), ot.getActivePolicy);
router.put(
  "/policy/active",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  ot.upsertActivePolicy
);

module.exports = router;
