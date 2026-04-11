const { verifyJwt } = require("../utils/jwt");
const { hasAnyPermission } = require("../services/rbac.service");

const INTERNAL_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE",
  "TEACHER",
  "STUDENT",
  "EXAM_HEAD",
  "CAMPUS_CHIEF",
  "ASSISTANT_CAMPUS_CHIEF",
  "PUBLIC",
]);

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function isPublicPortalToken(payload) {
  if (!payload || typeof payload !== "object") return false;
  const role = String(payload.role || "").toUpperCase();
  const sessionType = String(payload.session_type || "").toUpperCase();
  return (
    (role === "GENERAL_PUBLIC" || role === "PUBLIC") &&
    sessionType === "PUBLIC_PORTAL"
  );
}

function isInternalToken(payload) {
  const role = String(payload?.role || "").toUpperCase();
  return INTERNAL_ROLES.has(role);
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) return res.status(401).json({ ok: false, message: "Missing token" });

  try {
    req.user = verifyJwt(token);
    if (!req.user?.uid || !isInternalToken(req.user)) {
      return res.status(401).json({ ok: false, message: "Invalid token" });
    }
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


function requirePermission(...permissionKeys) {
  return async (req, res, next) => {
    try {
      if (!req.user?.role) {
        return res.status(403).json({ ok: false, message: "No role" });
      }
      const allowed = await hasAnyPermission(req.user.role, permissionKeys);
      if (!allowed) {
        return res.status(403).json({ ok: false, message: "Forbidden" });
      }
      return next();
    } catch (e) {
      return res.status(500).json({ ok: false, message: "Permission check failed" });
    }
  };
}

function requirePublicPortalAccess(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, message: "Public portal session required" });
  }

  try {
    const payload = verifyJwt(token);
    if (!isInternalToken(payload) && !isPublicPortalToken(payload)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: "Invalid/expired token" });
  }
}

module.exports = { requireAuth, requireRole, requirePermission, requirePublicPortalAccess };
