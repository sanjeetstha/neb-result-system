const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const ot = require("../controllers/ot.controller");

router.get("/dashboard", requireAuth, requirePermission("ot.claims", "ot.reports", "ot.policy.manage"), ot.dashboard);
router.get("/reports", requireAuth, requirePermission("ot.reports"), ot.otReports);
router.get("/claims", requireAuth, requirePermission("ot.claims"), ot.listClaims);
router.post("/claims", requireAuth, requirePermission("ot.claims"), ot.createClaim);
router.get("/claims/:id", requireAuth, requirePermission("ot.claims"), ot.getClaim);
router.put("/claims/:id", requireAuth, requirePermission("ot.claims"), ot.updateClaim);
router.post("/claims/:id/items", requireAuth, requirePermission("ot.claims"), ot.addItem);
router.delete("/claims/:id/items/:itemId", requireAuth, requirePermission("ot.claims"), ot.removeItem);
router.post("/claims/:id/submit", requireAuth, requirePermission("ot.claims"), ot.submitClaim);
router.post("/claims/:id/verify", requireAuth, requirePermission("ot.claims"), ot.verifyClaim);
router.post("/claims/:id/approve", requireAuth, requirePermission("ot.claims"), ot.approveClaim);
router.post("/claims/:id/reject", requireAuth, requirePermission("ot.claims"), ot.rejectClaim);
router.post("/claims/:id/reopen", requireAuth, requirePermission("ot.claims"), ot.reopenClaim);
router.get("/policy/active", requireAuth, requirePermission("ot.claims", "ot.policy.manage"), ot.getActivePolicy);
router.put("/policy/active", requireAuth, requirePermission("ot.policy.manage"), ot.upsertActivePolicy);

module.exports = router;
