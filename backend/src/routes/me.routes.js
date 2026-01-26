const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth");

router.get("/", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

module.exports = router;
