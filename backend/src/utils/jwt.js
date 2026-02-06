const jwt = require("jsonwebtoken");

function signJwt(payload, options = {}) {
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || "8h";
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function verifyJwt(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signJwt, verifyJwt };
