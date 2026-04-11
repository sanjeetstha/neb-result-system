const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const {
  createRequest,
  listRequests,
  approveRequest,
  rejectRequest,
  listMyRequests,
} = require("../controllers/corrections.controller");

router.post("/", requireAuth, requirePermission("corrections.request"), createRequest);
router.get("/", requireAuth, requirePermission("corrections.review"), listRequests);
router.post("/:id/approve", requireAuth, requirePermission("corrections.review"), approveRequest);
router.post("/:id/reject", requireAuth, requirePermission("corrections.review"), rejectRequest);
router.get("/mine", requireAuth, requirePermission("corrections.request", "corrections.review"), listMyRequests);

module.exports = router;
