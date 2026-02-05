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

router.post("/bootstrap-super-admin", authController.bootstrapSuperAdmin);
router.post("/login", authController.login);
router.post("/create-user", authController.createUser);

// public (invite accept)
router.post("/accept-invite", authController.acceptInvite);

module.exports = router;
