const db = require("../db");
const { normalizePhone, getSmsProvider, sendSms } = require("../services/sms.service");

function renderTemplate(tpl, data) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (_, key) => {
    const v = data[key];
    return v == null ? "" : String(v);
  });
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

async function bulkSms(req, res) {
  const { exam_id, section_id, template, targets, preview_only } = req.body || {};
  const examId = Number(exam_id);
  const sectionId = section_id ? Number(section_id) : null;

  if (!examId) return res.status(400).json({ ok: false, message: "exam_id required" });
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ ok: false, message: "targets array required" });
  }
  if (!template) return res.status(400).json({ ok: false, message: "template required" });

  const symbolNos = targets.map((t) => String(t.symbol_no || "").trim()).filter(Boolean);
  if (symbolNos.length === 0) {
    return res.status(400).json({ ok: false, message: "No valid symbol numbers" });
  }

  const [[exam]] = await db.query(`SELECT name FROM exams WHERE id=? LIMIT 1`, [examId]);
  const examName = exam?.name || `#${examId}`;

  // Fetch enrollment + student
  let sql = `
    SELECT e.id AS enrollment_id, s.symbol_no, s.full_name
    FROM student_enrollments e
    JOIN students s ON s.id=e.student_id
    WHERE s.symbol_no IN (?)
  `;
  const params = [symbolNos];
  if (sectionId) {
    sql += ` AND e.section_id=?`;
    params.push(sectionId);
  }

  const [enrollRows] = await db.query(sql, params);
  const enrollBySymbol = new Map(enrollRows.map((r) => [String(r.symbol_no), r]));
  const enrollmentIds = enrollRows.map((r) => r.enrollment_id);

  const snapByEnroll = new Map();
  if (enrollmentIds.length) {
    const [snaps] = await db.query(
      `SELECT enrollment_id, overall_gpa, final_grade, result_status
       FROM result_snapshots
       WHERE exam_id=? AND enrollment_id IN (?)`,
      [examId, enrollmentIds]
    );
    for (const s of snaps) {
      snapByEnroll.set(Number(s.enrollment_id), s);
    }
  }

  const preview = [];
  const tasks = [];
  let matched = 0;
  let missing = 0;

  for (const t of targets) {
    const symbol_no = String(t.symbol_no || "").trim();
    const phone = normalizePhone(t.phone || "");
    const enr = enrollBySymbol.get(symbol_no);
    if (!enr || !phone) {
      missing++;
      continue;
    }

    matched++;
    const snap = snapByEnroll.get(Number(enr.enrollment_id)) || {};
    const message = renderTemplate(template, {
      name: enr.full_name,
      symbol_no: symbol_no,
      gpa: snap.overall_gpa ?? "N/A",
      grade: snap.final_grade ?? "N/A",
      result: snap.result_status ?? "N/A",
      exam: examName,
    });

    if (preview.length < 10) {
      preview.push({ symbol_no, phone, message });
    }

    tasks.push({ symbol_no, phone, message });
  }

  const provider = getSmsProvider();
  let sent = 0;
  let failed = 0;

  if (!preview_only && provider === "aakash") {
    const results = await mapWithConcurrency(tasks, 5, async (task) => {
      try {
        await sendSms({ to: task.phone, text: task.message });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    sent = results.filter((r) => r.ok).length;
    failed = results.length - sent;
  } else if (!preview_only && provider !== "simulation") {
    return res.status(400).json({ ok: false, message: `Unsupported SMS provider: ${provider}` });
  }

  return res.json({
    ok: true,
    provider,
    message: preview_only ? "Preview generated" : provider === "aakash" ? "SMS sent via Aakash" : "SMS queued (simulation)",
    total: targets.length,
    matched,
    missing,
    sent,
    failed,
    preview,
  });
}

module.exports = { bulkSms };
