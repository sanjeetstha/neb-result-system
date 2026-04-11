const router = require("express").Router();
const { requireAuth, requirePermission } = require("../middlewares/auth");
const seatPlanner = require("../controllers/seatPlanner.controller");

router.get("/", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.listSeatPlans);
router.post("/", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.createSeatPlan);
router.get("/templates", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.listRoomTemplates);
router.post("/templates", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.createRoomTemplate);
router.put("/templates/:templateId", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.updateRoomTemplate);
router.delete("/templates/:templateId", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.deleteRoomTemplate);
router.get("/:planId", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.getSeatPlan);
router.put("/:planId", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.updateSeatPlan);
router.delete("/:planId", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.deleteSeatPlan);
router.post("/:planId/rooms", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.addSeatPlanRoom);
router.post("/:planId/rooms/bulk", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.bulkCreateSeatPlanRooms);
router.put("/rooms/:roomId", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.updateSeatPlanRoom);
router.delete("/rooms/:roomId", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.deleteSeatPlanRoom);
router.post("/:planId/generate", requireAuth, requirePermission("seat_planner.manage"), seatPlanner.generateSeatPlan);

module.exports = router;
