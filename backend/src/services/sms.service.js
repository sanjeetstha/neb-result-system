const https = require("https");
const { URL } = require("url");

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("977")) digits = digits.slice(3);
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

function getSmsProvider() {
  return String(
    process.env.SMS_PROVIDER || (process.env.AAKASH_SMS_AUTH_TOKEN ? "aakash" : "simulation")
  ).toLowerCase();
}

async function postForm(url, payload) {
  const body = new URLSearchParams(payload).toString();

  if (typeof fetch === "function") {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) {
      throw new Error(typeof data === "string" ? data : data?.message || "SMS request failed");
    }
    return data;
  }

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch {
            // keep as string
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(typeof data === "string" ? data : data?.message || "SMS request failed")
            );
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendAakashSms({ to, text }) {
  const authToken = process.env.AAKASH_SMS_AUTH_TOKEN;
  const baseUrl = process.env.AAKASH_SMS_BASE_URL || "https://sms.aakashsms.com/sms/v3/send";
  if (!authToken) {
    throw new Error("AAKASH_SMS_AUTH_TOKEN not configured");
  }

  return postForm(baseUrl, {
    auth_token: authToken,
    to,
    text,
  });
}

async function sendSms({ to, text }) {
  const provider = getSmsProvider();
  if (provider === "aakash") {
    await sendAakashSms({ to, text });
    return { ok: true, provider };
  }
  if (provider === "simulation") {
    return { ok: true, provider };
  }
  throw new Error(`Unsupported SMS provider: ${provider}`);
}

module.exports = {
  normalizePhone,
  getSmsProvider,
  sendAakashSms,
  sendSms,
};
