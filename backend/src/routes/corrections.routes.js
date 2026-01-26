const router = require("express").Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const { createRequest, listRequests, approveRequest, rejectRequest, listMyRequests } = require("../controllers/corrections.controller");

// Teacher/Admin can request
router.post("/", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), createRequest);

// Admin/Super Admin can review
router.get("/", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), listRequests);
router.post("/:id/approve", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), approveRequest);
router.post("/:id/reject", requireAuth, requireRole("SUPER_ADMIN","ADMIN"), rejectRequest);
router.get("/mine", requireAuth, requireRole("SUPER_ADMIN","ADMIN","TEACHER"), listMyRequests);


module.exports = router;
