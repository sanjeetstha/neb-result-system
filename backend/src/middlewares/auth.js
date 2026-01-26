const { verifyJwt } = require("../utils/jwt");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ ok: false, message: "Missing token" });

  try {
    req.user = verifyJwt(token);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: "Invalid/expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(403).json({ ok: false, message: "No role" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
