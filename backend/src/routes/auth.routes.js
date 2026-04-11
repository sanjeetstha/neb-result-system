// const router = require("express").Router();
// const {
//   login,
//   acceptInvite,     // ✅ add this
//   // ...other exports if you have
// } = require("../controllers/auth.controller");

// // PUBLIC
// router.post("/login", login);
// router.post("/accept-invite", acceptInvite); // ✅

// // ... other routes you already have

// module.exports = router;


const router = require("express").Router();
const authController = require("../controllers/auth.controller");
const { requireAuth, requirePermission } = require("../middlewares/auth");

router.post("/bootstrap-super-admin", authController.bootstrapSuperAdmin);
router.post("/login", authController.login);
router.post("/create-user", requireAuth, requirePermission("users.add"), authController.createUser);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// public (invite accept)
router.post("/accept-invite", authController.acceptInvite);

module.exports = router;
