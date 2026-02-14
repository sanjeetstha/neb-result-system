const crypto = require("crypto");
const db = require("../db");
const { signJwt } = require("../utils/jwt");
const { sendPublicPortalOtpEmail } = require("../services/mailer");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = Number(process.env.PUBLIC_OTP_TTL_MINUTES || 10);
const OTP_RESEND_SECONDS = Number(process.env.PUBLIC_OTP_RESEND_SECONDS || 60);
const OTP_MAX_ATTEMPTS = Number(process.env.PUBLIC_OTP_MAX_ATTEMPTS || 5);
const PUBLIC_SESSION_TTL = String(process.env.PUBLIC_PORTAL_SESSION_TTL || "20m");

let storageReady = null;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function norm(value) {
  return String(value || "").trim();
}

function normEmail(value) {
  return norm(value).toLowerCase();
}

function normMobile(value) {
  return norm(value).replace(/\s+/g, "");
}

function parseDurationSeconds(input, fallbackSeconds = 1200) {
  const raw = String(input || "").trim().toLowerCase();
  const m = raw.match(/^(\d+)\s*([smhd])?$/);
  if (!m) return fallbackSeconds;
  const n = Number(m[1]);
  const unit = m[2] || "s";
  if (!Number.isFinite(n) || n <= 0) return fallbackSeconds;
  if (unit === "m") return n * 60;
  if (unit === "h") return n * 3600;
  if (unit === "d") return n * 86400;
  return n;
}

function maskContact(email, mobile) {
  if (email) {
    const [name = "", domain = ""] = String(email).split("@");
    const visible = name.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
  }
  if (mobile) {
    const s = String(mobile);
    if (s.length <= 4) return `**${s.slice(-2)}`;
    return `${s.slice(0, 2)}${"*".repeat(Math.max(2, s.length - 4))}${s.slice(-2)}`;
  }
  return "";
}

function maybeDebugOtp(payload, otp) {
  const allowDebug =
    String(process.env.PUBLIC_OTP_DEBUG || "").toLowerCase() === "true" ||
    process.env.NODE_ENV !== "production";
  if (!allowDebug) return payload;
  return { ...payload, debug_otp: otp };
}

async function ensurePublicAuthStorage() {
  if (storageReady) return storageReady;
  storageReady = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public_portal_otps (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(200) NOT NULL,
        email VARCHAR(255) NULL,
        mobile VARCHAR(32) NULL,
        otp_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        verified_at DATETIME NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_public_portal_otps_created_at (created_at),
        INDEX idx_public_portal_otps_email (email),
        INDEX idx_public_portal_otps_mobile (mobile)
      )
    `);
    await db.query(`INSERT IGNORE INTO roles (name) VALUES ('GENERAL_PUBLIC')`);
  })();
  return storageReady;
}

async function requestPublicOtp(req, res) {
  try {
    await ensurePublicAuthStorage();

    const fullName = norm(req.body?.full_name);
    const email = normEmail(req.body?.email);
    const mobile = normMobile(req.body?.mobile);

    if (!fullName || fullName.length < 2) {
      return res.status(400).json({ ok: false, message: "Valid full_name is required" });
    }
    if (!email && !mobile) {
      return res
        .status(400)
        .json({ ok: false, message: "Provide at least one contact: email or mobile" });
    }

    const where = [];
    const params = [];
    if (email) {
      where.push(`email=?`);
      params.push(email);
    }
    if (mobile) {
      where.push(`mobile=?`);
      params.push(mobile);
    }

    if (where.length) {
      const [recentRows] = await db.query(
        `SELECT id, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds
         FROM public_portal_otps
         WHERE ${where.join(" OR ")}
         ORDER BY id DESC
         LIMIT 1`,
        params
      );

      if (recentRows.length) {
        const age = Number(recentRows[0].age_seconds || 0);
        if (age < OTP_RESEND_SECONDS) {
          const wait = OTP_RESEND_SECONDS - age;
          return res.status(429).json({
            ok: false,
            message: `Please wait ${wait} second(s) before requesting a new OTP.`,
          });
        }
      }
    }

    const minOtp = 10 ** (OTP_LENGTH - 1);
    const maxOtp = 10 ** OTP_LENGTH - 1;
    const otp = String(Math.floor(minOtp + Math.random() * (maxOtp - minOtp + 1)));
    const otpHash = sha256(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    const [ins] = await db.query(
      `INSERT INTO public_portal_otps
       (full_name, email, mobile, otp_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fullName,
        email || null,
        mobile || null,
        otpHash,
        expiresAt,
        norm(req.ip) || null,
        norm(req.headers["user-agent"]).slice(0, 255) || null,
      ]
    );

    let delivery = "email";
    let deliveryStatus = "sent";

    if (email) {
      try {
        await sendPublicPortalOtpEmail({
          to: email,
          name: fullName,
          otp,
          ttlMinutes: OTP_TTL_MINUTES,
        });
      } catch (err) {
        deliveryStatus = "failed";
        if (process.env.NODE_ENV === "production") {
          return res.status(500).json({
            ok: false,
            message: "Failed to send OTP email. Please try again.",
          });
        }
      }
    } else {
      delivery = "mobile";
      if (process.env.NODE_ENV === "production") {
        return res.status(501).json({
          ok: false,
          message: "SMS OTP delivery is not configured. Please use email.",
        });
      }
      deliveryStatus = "simulated";
    }

    // Cleanup old OTP records (best-effort)
    db.query(`DELETE FROM public_portal_otps WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)`).catch(
      () => {}
    );

    const response = {
      ok: true,
      request_id: ins.insertId,
      message: "OTP sent. Please verify to continue.",
      delivery,
      delivery_status: deliveryStatus,
      contact_hint: maskContact(email, mobile),
      expires_in_seconds: OTP_TTL_MINUTES * 60,
    };
    return res.json(maybeDebugOtp(response, otp));
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
}

async function verifyPublicOtp(req, res) {
  try {
    await ensurePublicAuthStorage();

    const requestId = Number(req.body?.request_id);
    const otp = norm(req.body?.otp);

    if (!requestId || !otp) {
      return res.status(400).json({ ok: false, message: "request_id and otp are required" });
    }

    const [rows] = await db.query(
      `SELECT id, full_name, email, mobile, otp_hash, expires_at, attempts, verified_at
       FROM public_portal_otps
       WHERE id=?
       LIMIT 1`,
      [requestId]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "OTP request not found" });
    }

    const row = rows[0];

    if (row.verified_at) {
      return res.status(409).json({ ok: false, message: "OTP already used. Request a new one." });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ ok: false, message: "OTP expired. Request a new one." });
    }
    if (Number(row.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({
        ok: false,
        message: "Maximum OTP attempts reached. Request a new OTP.",
      });
    }

    const incomingHash = sha256(otp);
    if (incomingHash !== row.otp_hash) {
      await db.query(`UPDATE public_portal_otps SET attempts=attempts+1 WHERE id=?`, [requestId]);
      return res.status(400).json({ ok: false, message: "Invalid OTP" });
    }

    await db.query(`UPDATE public_portal_otps SET attempts=attempts+1, verified_at=NOW() WHERE id=?`, [
      requestId,
    ]);

    const token = signJwt(
      {
        role: "GENERAL_PUBLIC",
        session_type: "PUBLIC_PORTAL",
        public_name: row.full_name,
        public_contact: row.email || row.mobile || null,
        otp_request_id: row.id,
      },
      { expiresIn: PUBLIC_SESSION_TTL }
    );

    return res.json({
      ok: true,
      token,
      role: "GENERAL_PUBLIC",
      session_type: "PUBLIC_PORTAL",
      expires_in_seconds: parseDurationSeconds(PUBLIC_SESSION_TTL, 20 * 60),
      user: {
        name: row.full_name,
        contact_hint: maskContact(row.email, row.mobile),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
}

async function getPublicSession(req, res) {
  const exp = req.user?.exp ? new Date(Number(req.user.exp) * 1000).toISOString() : null;
  return res.json({
    ok: true,
    session: {
      role: req.user?.role || "GENERAL_PUBLIC",
      session_type: req.user?.session_type || "",
      name: req.user?.public_name || req.user?.name || "Public User",
      expires_at: exp,
    },
  });
}

module.exports = {
  requestPublicOtp,
  verifyPublicOtp,
  getPublicSession,
};
