const db = require("../db");

let schemaReadyPromise = null;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function boolToTiny(value, fallback = 0) {
  if (typeof value === "undefined") return fallback ? 1 : 0;
  return value ? 1 : 0;
}

function seatLabelFromIndex(index) {
  const n = Number(index || 1);
  if (n >= 1 && n <= 26) return String.fromCharCode(64 + n);
  return String(n);
}

async function ensureColumnExists(tableName, columnName, columnDefinitionSql) {
  const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
  if (!rows.length) {
    await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinitionSql}`);
  }
}

function normalizeSymbol(value) {
  return String(value ?? "").trim();
}

function parseSymbolListText(value) {
  const raw = String(value || "");
  if (!raw.trim()) return [];
  const tokens = raw
    .split(/[\r\n,;\t]+/)
    .map((item) => normalizeSymbol(item))
    .filter(Boolean);

  return [...new Set(tokens)].filter((item) => {
    const lower = item.toLowerCase();
    return lower !== "symbol" && lower !== "symbol_no" && lower !== "symbol number";
  });
}

function compareSymbols(a, b) {
  const left = normalizeSymbol(a);
  const right = normalizeSymbol(b);
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const ln = Number(left);
    const rn = Number(right);
    if (Number.isFinite(ln) && Number.isFinite(rn)) return ln - rn;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function filterStudentsByPlanSettings(students, planLike) {
  const mode = String(planLike?.symbol_filter_mode || "ALL").trim().toUpperCase();
  if (mode === "RANGE") {
    const start = normalizeSymbol(planLike?.symbol_start);
    const end = normalizeSymbol(planLike?.symbol_end);
    if (!start && !end) return students;
    return students.filter((student) => {
      const symbol = normalizeSymbol(student?.symbol_no);
      if (!symbol) return false;
      if (start && compareSymbols(symbol, start) < 0) return false;
      if (end && compareSymbols(symbol, end) > 0) return false;
      return true;
    });
  }

  if (mode === "LIST") {
    const list = parseSymbolListText(planLike?.symbol_list_text);
    if (!list.length) return [];
    const allowed = new Set(list.map((item) => normalizeSymbol(item)));
    return students.filter((student) => allowed.has(normalizeSymbol(student?.symbol_no)));
  }

  return students;
}

async function ensureSeatPlannerSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS seat_plans (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        exam_id BIGINT NOT NULL,
        plan_name VARCHAR(160) NOT NULL,
        seating_mode VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
        show_symbol_no TINYINT(1) NOT NULL DEFAULT 1,
        show_regd_no TINYINT(1) NOT NULL DEFAULT 0,
        show_student_name TINYINT(1) NOT NULL DEFAULT 1,
        seats_per_desk INT NOT NULL DEFAULT 2,
        note TEXT NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_seat_plans_exam (exam_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS seat_plan_rooms (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        plan_id BIGINT NOT NULL,
        room_name VARCHAR(120) NOT NULL,
        room_code VARCHAR(50) NULL,
        row_count INT NOT NULL DEFAULT 5,
        desks_per_row INT NOT NULL DEFAULT 5,
        seats_per_desk INT NOT NULL DEFAULT 2,
        starting_desk_no INT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        note VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_seat_plan_rooms_plan (plan_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS seat_plan_assignments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        plan_id BIGINT NOT NULL,
        room_id BIGINT NOT NULL,
        desk_no INT NOT NULL,
        row_no INT NOT NULL,
        col_no INT NOT NULL,
        seat_index INT NOT NULL,
        seat_label VARCHAR(8) NOT NULL,
        seat_no INT NOT NULL,
        student_id BIGINT NULL,
        enrollment_id BIGINT NULL,
        student_name_snapshot VARCHAR(200) NULL,
        symbol_no_snapshot VARCHAR(50) NULL,
        regd_no_snapshot VARCHAR(50) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_seat_plan_slot (plan_id, room_id, desk_no, seat_index),
        UNIQUE KEY uq_seat_plan_serial (plan_id, seat_no),
        KEY idx_seat_plan_assignments_plan (plan_id),
        KEY idx_seat_plan_assignments_room (room_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS seat_room_templates (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        room_name VARCHAR(120) NOT NULL,
        room_code VARCHAR(50) NULL,
        row_count INT NOT NULL DEFAULT 5,
        desks_per_row INT NOT NULL DEFAULT 5,
        seats_per_desk INT NOT NULL DEFAULT 2,
        starting_desk_no INT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        note VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_seat_room_templates_active (is_active),
        KEY idx_seat_room_templates_sort (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureColumnExists(
      "seat_plans",
      "symbol_filter_mode",
      "symbol_filter_mode VARCHAR(20) NOT NULL DEFAULT 'ALL' AFTER seats_per_desk"
    );
    await ensureColumnExists(
      "seat_plans",
      "symbol_start",
      "symbol_start VARCHAR(50) NULL AFTER symbol_filter_mode"
    );
    await ensureColumnExists(
      "seat_plans",
      "symbol_end",
      "symbol_end VARCHAR(50) NULL AFTER symbol_start"
    );
    await ensureColumnExists(
      "seat_plans",
      "symbol_list_text",
      "symbol_list_text LONGTEXT NULL AFTER symbol_end"
    );
  })();
  return schemaReadyPromise;
}

async function loadExam(examId) {
  const [[exam]] = await db.query(
    `SELECT e.*, c.name AS campus_name, ay.year_bs, cl.name AS class_name, f.name AS faculty_name
     FROM exams e
     JOIN campuses c ON c.id=e.campus_id
     JOIN academic_years ay ON ay.id=e.academic_year_id
     JOIN classes cl ON cl.id=e.class_id
     LEFT JOIN faculties f ON f.id=e.faculty_id
     WHERE e.id=? LIMIT 1`,
    [examId]
  );
  return exam || null;
}

async function loadPlanWithExam(planId) {
  const [[plan]] = await db.query(
    `SELECT p.*, e.name AS exam_name, e.campus_id, e.academic_year_id, e.class_id, e.faculty_id,
            c.name AS campus_name, ay.year_bs, cl.name AS class_name, f.name AS faculty_name
     FROM seat_plans p
     JOIN exams e ON e.id=p.exam_id
     JOIN campuses c ON c.id=e.campus_id
     JOIN academic_years ay ON ay.id=e.academic_year_id
     JOIN classes cl ON cl.id=e.class_id
     LEFT JOIN faculties f ON f.id=e.faculty_id
     WHERE p.id=? LIMIT 1`,
    [planId]
  );
  return plan || null;
}

async function loadPlanRooms(planId) {
  const [rooms] = await db.query(
    `SELECT *
     FROM seat_plan_rooms
     WHERE plan_id=?
     ORDER BY sort_order ASC, id ASC`,
    [planId]
  );
  return rooms;
}

async function loadPlanAssignments(planId) {
  const [rows] = await db.query(
    `SELECT *
     FROM seat_plan_assignments
     WHERE plan_id=?
     ORDER BY seat_no ASC, room_id ASC, desk_no ASC, seat_index ASC`,
    [planId]
  );
  return rows;
}

async function loadExamStudents(exam) {
  const sql = `
    SELECT e.id AS enrollment_id,
           s.id AS student_id,
           s.full_name,
           s.symbol_no,
           s.regd_no,
           s.roll_no,
           sec.name AS section_name
    FROM student_enrollments e
    JOIN students s ON s.id=e.student_id
    LEFT JOIN sections sec ON sec.id=e.section_id
    WHERE e.campus_id=?
      AND e.academic_year_id=?
      AND e.class_id=?
      AND (? IS NULL OR e.faculty_id=?)
      AND COALESCE(e.enrollment_status, 'ACTIVE')='ACTIVE'
    ORDER BY
      CASE WHEN s.symbol_no IS NULL OR s.symbol_no='' THEN 1 ELSE 0 END,
      s.symbol_no ASC,
      CASE WHEN s.roll_no IS NULL OR s.roll_no='' THEN 1 ELSE 0 END,
      s.roll_no ASC,
      s.full_name ASC
  `;
  const [rows] = await db.query(sql, [
    exam.campus_id,
    exam.academic_year_id,
    exam.class_id,
    exam.faculty_id || null,
    exam.faculty_id || null,
  ]);
  return filterStudentsByPlanSettings(rows, exam);
}

async function buildPlanPayload(planId) {
  const plan = await loadPlanWithExam(planId);
  if (!plan) return null;
  const rooms = await loadPlanRooms(planId);
  const assignments = await loadPlanAssignments(planId);
  const exam = {
    id: plan.exam_id,
    name: plan.exam_name,
    campus_name: plan.campus_name,
    year_bs: plan.year_bs,
    class_name: plan.class_name,
    faculty_name: plan.faculty_name,
  };
  const studentPool = await loadExamStudents(plan);

  const assignmentsByRoom = new Map();
  for (const row of assignments) {
    if (!assignmentsByRoom.has(row.room_id)) assignmentsByRoom.set(row.room_id, []);
    assignmentsByRoom.get(row.room_id).push(row);
  }

  const roomsOut = rooms.map((room) => {
    const roomAssignments = assignmentsByRoom.get(room.id) || [];
    const desks = new Map();
    for (const row of roomAssignments) {
      if (!desks.has(row.desk_no)) {
        desks.set(row.desk_no, {
          desk_no: row.desk_no,
          row_no: row.row_no,
          col_no: row.col_no,
          seats: [],
        });
      }
      desks.get(row.desk_no).seats.push({
        id: row.id,
        seat_no: row.seat_no,
        seat_index: row.seat_index,
        seat_label: row.seat_label,
        enrollment_id: row.enrollment_id,
        student_id: row.student_id,
        student_name: row.student_name_snapshot,
        symbol_no: row.symbol_no_snapshot,
        regd_no: row.regd_no_snapshot,
      });
    }
    return {
      ...room,
      desks: Array.from(desks.values()).sort((a, b) => a.desk_no - b.desk_no),
      assignments: roomAssignments,
    };
  });

  return {
    plan: {
      id: plan.id,
      exam_id: plan.exam_id,
      plan_name: plan.plan_name,
      seating_mode: plan.seating_mode,
      show_symbol_no: !!plan.show_symbol_no,
      show_regd_no: !!plan.show_regd_no,
      show_student_name: !!plan.show_student_name,
      seats_per_desk: Number(plan.seats_per_desk || 2),
      symbol_filter_mode: String(plan.symbol_filter_mode || "ALL").trim().toUpperCase(),
      symbol_start: plan.symbol_start || "",
      symbol_end: plan.symbol_end || "",
      symbol_list_text: plan.symbol_list_text || "",
      symbol_list_count: parseSymbolListText(plan.symbol_list_text).length,
      note: plan.note || "",
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    },
    exam,
    rooms: roomsOut,
    assignments,
    stats: {
      room_count: rooms.length,
      desk_count: assignments.reduce((set, row) => set.add(`${row.room_id}:${row.desk_no}`), new Set()).size,
      seat_count: assignments.length,
      assigned_count: assignments.filter((row) => !!row.enrollment_id).length,
      unassigned_count: assignments.filter((row) => !row.enrollment_id).length,
      available_student_count: studentPool.length,
    },
  };
}

async function listSeatPlans(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const examId = Number(req.query?.exam_id || 0);
    const params = [];
    let where = "";
    if (examId) {
      where = "WHERE p.exam_id=?";
      params.push(examId);
    }
    const [rows] = await db.query(
      `SELECT p.*, e.name AS exam_name,
              COUNT(DISTINCT r.id) AS room_count,
              COUNT(a.id) AS seat_count,
              SUM(CASE WHEN a.enrollment_id IS NULL THEN 0 ELSE 1 END) AS assigned_count
       FROM seat_plans p
       JOIN exams e ON e.id=p.exam_id
       LEFT JOIN seat_plan_rooms r ON r.plan_id=p.id
       LEFT JOIN seat_plan_assignments a ON a.plan_id=p.id
       ${where}
       GROUP BY p.id, e.name
       ORDER BY p.updated_at DESC, p.id DESC`,
      params
    );
    return res.json({ ok: true, plans: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to load seat plans" });
  }
}

async function createSeatPlan(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const examId = Number(req.body?.exam_id || 0);
    const planName = String(req.body?.plan_name || "").trim();
    if (!examId || !planName) {
      return res.status(400).json({ ok: false, message: "exam_id and plan_name are required" });
    }
    const exam = await loadExam(examId);
    if (!exam) {
      return res.status(404).json({ ok: false, message: "Exam not found" });
    }

    const [result] = await db.query(
      `INSERT INTO seat_plans
       (exam_id, plan_name, seating_mode, show_symbol_no, show_regd_no, show_student_name, seats_per_desk,
        symbol_filter_mode, symbol_start, symbol_end, symbol_list_text, note, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        examId,
        planName,
        String(req.body?.seating_mode || "ASSIGNED").trim().toUpperCase() === "BLANK" ? "BLANK" : "ASSIGNED",
        boolToTiny(req.body?.show_symbol_no, 1),
        boolToTiny(req.body?.show_regd_no, 0),
        boolToTiny(req.body?.show_student_name, 1),
        toPositiveInt(req.body?.seats_per_desk, 2),
        String(req.body?.symbol_filter_mode || "ALL").trim().toUpperCase(),
        normalizeSymbol(req.body?.symbol_start) || null,
        normalizeSymbol(req.body?.symbol_end) || null,
        String(req.body?.symbol_list_text || "").trim() || null,
        String(req.body?.note || "").trim() || null,
        req.user?.uid || null,
      ]
    );

    const payload = await buildPlanPayload(result.insertId);
    return res.json({ ok: true, message: "Seat plan created", ...payload });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to create seat plan" });
  }
}

async function getSeatPlan(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const planId = Number(req.params.planId || 0);
    if (!planId) return res.status(400).json({ ok: false, message: "Invalid plan id" });
    const payload = await buildPlanPayload(planId);
    if (!payload) return res.status(404).json({ ok: false, message: "Seat plan not found" });
    return res.json({ ok: true, ...payload });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to load seat plan" });
  }
}

async function updateSeatPlan(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const planId = Number(req.params.planId || 0);
    if (!planId) return res.status(400).json({ ok: false, message: "Invalid plan id" });

    const updates = [];
    const params = [];
    if (typeof req.body?.plan_name === "string") {
      updates.push("plan_name=?");
      params.push(String(req.body.plan_name).trim() || "Seat Plan");
    }
    if (typeof req.body?.seating_mode !== "undefined") {
      updates.push("seating_mode=?");
      params.push(String(req.body.seating_mode || "ASSIGNED").trim().toUpperCase() === "BLANK" ? "BLANK" : "ASSIGNED");
    }
    if (typeof req.body?.show_symbol_no !== "undefined") {
      updates.push("show_symbol_no=?");
      params.push(boolToTiny(req.body.show_symbol_no, 1));
    }
    if (typeof req.body?.show_regd_no !== "undefined") {
      updates.push("show_regd_no=?");
      params.push(boolToTiny(req.body.show_regd_no, 0));
    }
    if (typeof req.body?.show_student_name !== "undefined") {
      updates.push("show_student_name=?");
      params.push(boolToTiny(req.body.show_student_name, 1));
    }
    if (typeof req.body?.seats_per_desk !== "undefined") {
      updates.push("seats_per_desk=?");
      params.push(toPositiveInt(req.body.seats_per_desk, 2));
    }
    if (typeof req.body?.symbol_filter_mode !== "undefined") {
      const nextMode = String(req.body.symbol_filter_mode || "ALL").trim().toUpperCase();
      updates.push("symbol_filter_mode=?");
      params.push(["ALL", "RANGE", "LIST"].includes(nextMode) ? nextMode : "ALL");
    }
    if (typeof req.body?.symbol_start !== "undefined") {
      updates.push("symbol_start=?");
      params.push(normalizeSymbol(req.body.symbol_start) || null);
    }
    if (typeof req.body?.symbol_end !== "undefined") {
      updates.push("symbol_end=?");
      params.push(normalizeSymbol(req.body.symbol_end) || null);
    }
    if (typeof req.body?.symbol_list_text !== "undefined") {
      updates.push("symbol_list_text=?");
      params.push(String(req.body.symbol_list_text || "").trim() || null);
    }
    if (typeof req.body?.note !== "undefined") {
      updates.push("note=?");
      params.push(String(req.body.note || "").trim() || null);
    }

    if (!updates.length) {
      return res.status(400).json({ ok: false, message: "No changes provided" });
    }

    params.push(planId);
    await db.query(`UPDATE seat_plans SET ${updates.join(", ")} WHERE id=?`, params);
    const payload = await buildPlanPayload(planId);
    return res.json({ ok: true, message: "Seat plan updated", ...payload });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to update seat plan" });
  }
}

async function deleteSeatPlan(req, res) {
  const conn = await db.getConnection();
  try {
    await ensureSeatPlannerSchema();
    const planId = Number(req.params.planId || 0);
    if (!planId) return res.status(400).json({ ok: false, message: "Invalid plan id" });

    await conn.beginTransaction();
    await conn.query(`DELETE FROM seat_plan_assignments WHERE plan_id=?`, [planId]);
    await conn.query(`DELETE FROM seat_plan_rooms WHERE plan_id=?`, [planId]);
    const [result] = await conn.query(`DELETE FROM seat_plans WHERE id=?`, [planId]);
    await conn.commit();

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, message: "Seat plan not found" });
    }
    return res.json({ ok: true, message: "Seat plan deleted" });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: "Failed to delete seat plan" });
  } finally {
    conn.release();
  }
}

async function addSeatPlanRoom(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const planId = Number(req.params.planId || 0);
    if (!planId) return res.status(400).json({ ok: false, message: "Invalid plan id" });
    const roomName = String(req.body?.room_name || "").trim();
    if (!roomName) {
      return res.status(400).json({ ok: false, message: "room_name is required" });
    }

    const [result] = await db.query(
      `INSERT INTO seat_plan_rooms
       (plan_id, room_name, room_code, row_count, desks_per_row, seats_per_desk, starting_desk_no, sort_order, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        planId,
        roomName,
        String(req.body?.room_code || "").trim() || null,
        toPositiveInt(req.body?.row_count, 5),
        toPositiveInt(req.body?.desks_per_row, 5),
        toPositiveInt(req.body?.seats_per_desk, 2),
        toPositiveInt(req.body?.starting_desk_no, 1),
        Number.isFinite(Number(req.body?.sort_order)) ? Math.floor(Number(req.body.sort_order)) : 0,
        String(req.body?.note || "").trim() || null,
      ]
    );

    const [[room]] = await db.query(`SELECT * FROM seat_plan_rooms WHERE id=? LIMIT 1`, [result.insertId]);
    return res.json({ ok: true, message: "Room added", room });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to add room" });
  }
}

async function updateSeatPlanRoom(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const roomId = Number(req.params.roomId || 0);
    if (!roomId) return res.status(400).json({ ok: false, message: "Invalid room id" });

    const updates = [];
    const params = [];
    const fields = [
      ["room_name", (v) => String(v || "").trim() || "Room"],
      ["room_code", (v) => String(v || "").trim() || null],
      ["row_count", (v) => toPositiveInt(v, 5)],
      ["desks_per_row", (v) => toPositiveInt(v, 5)],
      ["seats_per_desk", (v) => toPositiveInt(v, 2)],
      ["starting_desk_no", (v) => toPositiveInt(v, 1)],
      ["sort_order", (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0)],
      ["note", (v) => String(v || "").trim() || null],
    ];
    for (const [key, transform] of fields) {
      if (typeof req.body?.[key] !== "undefined") {
        updates.push(`${key}=?`);
        params.push(transform(req.body[key]));
      }
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, message: "No changes provided" });
    }
    params.push(roomId);
    await db.query(`UPDATE seat_plan_rooms SET ${updates.join(", ")} WHERE id=?`, params);
    const [[room]] = await db.query(`SELECT * FROM seat_plan_rooms WHERE id=? LIMIT 1`, [roomId]);
    return res.json({ ok: true, message: "Room updated", room });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to update room" });
  }
}

async function deleteSeatPlanRoom(req, res) {
  const conn = await db.getConnection();
  try {
    await ensureSeatPlannerSchema();
    const roomId = Number(req.params.roomId || 0);
    if (!roomId) return res.status(400).json({ ok: false, message: "Invalid room id" });

    await conn.beginTransaction();
    const [[room]] = await conn.query(`SELECT plan_id FROM seat_plan_rooms WHERE id=? LIMIT 1`, [roomId]);
    if (!room) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Room not found" });
    }
    await conn.query(`DELETE FROM seat_plan_assignments WHERE room_id=?`, [roomId]);
    await conn.query(`DELETE FROM seat_plan_rooms WHERE id=?`, [roomId]);
    await conn.commit();
    return res.json({ ok: true, message: "Room deleted", plan_id: room.plan_id });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: "Failed to delete room" });
  } finally {
    conn.release();
  }
}

async function listRoomTemplates(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const [rows] = await db.query(
      `SELECT *
       FROM seat_room_templates
       WHERE is_active=1
       ORDER BY sort_order ASC, room_name ASC, id ASC`
    );
    return res.json({ ok: true, templates: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to load room templates" });
  }
}

async function createRoomTemplate(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const roomName = String(req.body?.room_name || "").trim();
    if (!roomName) {
      return res.status(400).json({ ok: false, message: "room_name is required" });
    }

    const [result] = await db.query(
      `INSERT INTO seat_room_templates
       (room_name, room_code, row_count, desks_per_row, seats_per_desk, starting_desk_no, sort_order, note, is_active)
       VALUES (?,?,?,?,?,?,?,?,1)`,
      [
        roomName,
        String(req.body?.room_code || "").trim() || null,
        toPositiveInt(req.body?.row_count, 5),
        toPositiveInt(req.body?.desks_per_row, 5),
        toPositiveInt(req.body?.seats_per_desk, 2),
        toPositiveInt(req.body?.starting_desk_no, 1),
        Number.isFinite(Number(req.body?.sort_order)) ? Math.floor(Number(req.body.sort_order)) : 0,
        String(req.body?.note || "").trim() || null,
      ]
    );
    const [[template]] = await db.query(
      `SELECT * FROM seat_room_templates WHERE id=? LIMIT 1`,
      [result.insertId]
    );
    return res.json({ ok: true, message: "Room template saved", template });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to save room template" });
  }
}

async function updateRoomTemplate(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const templateId = Number(req.params.templateId || 0);
    if (!templateId) return res.status(400).json({ ok: false, message: "Invalid template id" });

    const updates = [];
    const params = [];
    const fields = [
      ["room_name", (v) => String(v || "").trim() || "Room"],
      ["room_code", (v) => String(v || "").trim() || null],
      ["row_count", (v) => toPositiveInt(v, 5)],
      ["desks_per_row", (v) => toPositiveInt(v, 5)],
      ["seats_per_desk", (v) => toPositiveInt(v, 2)],
      ["starting_desk_no", (v) => toPositiveInt(v, 1)],
      ["sort_order", (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0)],
      ["note", (v) => String(v || "").trim() || null],
    ];
    for (const [key, transform] of fields) {
      if (typeof req.body?.[key] !== "undefined") {
        updates.push(`${key}=?`);
        params.push(transform(req.body[key]));
      }
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, message: "No changes provided" });
    }
    params.push(templateId);
    await db.query(`UPDATE seat_room_templates SET ${updates.join(", ")} WHERE id=?`, params);
    const [[template]] = await db.query(
      `SELECT * FROM seat_room_templates WHERE id=? LIMIT 1`,
      [templateId]
    );
    return res.json({ ok: true, message: "Room template updated", template });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to update room template" });
  }
}

async function deleteRoomTemplate(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const templateId = Number(req.params.templateId || 0);
    if (!templateId) return res.status(400).json({ ok: false, message: "Invalid template id" });
    const [result] = await db.query(`DELETE FROM seat_room_templates WHERE id=?`, [templateId]);
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, message: "Room template not found" });
    }
    return res.json({ ok: true, message: "Room template deleted" });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to delete room template" });
  }
}

async function bulkCreateSeatPlanRooms(req, res) {
  try {
    await ensureSeatPlannerSchema();
    const planId = Number(req.params.planId || 0);
    if (!planId) return res.status(400).json({ ok: false, message: "Invalid plan id" });

    const roomPrefix = String(req.body?.room_prefix || "Room").trim() || "Room";
    const roomCodePrefix = String(req.body?.room_code_prefix || "").trim();
    const roomCount = toPositiveInt(req.body?.room_count, 0);
    const startNumber = Number.isFinite(Number(req.body?.start_number))
      ? Math.floor(Number(req.body.start_number))
      : 1;

    if (!roomCount) {
      return res.status(400).json({ ok: false, message: "room_count must be greater than zero" });
    }

    const [orderRows] = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM seat_plan_rooms WHERE plan_id=?`,
      [planId]
    );
    let sortOrder = Number(orderRows?.[0]?.max_sort_order || -1) + 1;

    const created = [];
    for (let i = 0; i < roomCount; i += 1) {
      const roomNumber = startNumber + i;
      const [result] = await db.query(
        `INSERT INTO seat_plan_rooms
         (plan_id, room_name, room_code, row_count, desks_per_row, seats_per_desk, starting_desk_no, sort_order, note)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          planId,
          `${roomPrefix} ${roomNumber}`.trim(),
          roomCodePrefix ? `${roomCodePrefix}${roomNumber}` : String(roomNumber),
          toPositiveInt(req.body?.row_count, 5),
          toPositiveInt(req.body?.desks_per_row, 5),
          toPositiveInt(req.body?.seats_per_desk, 2),
          toPositiveInt(req.body?.starting_desk_no, 1),
          sortOrder,
          String(req.body?.note || "").trim() || null,
        ]
      );
      sortOrder += 1;
      created.push(result.insertId);
    }

    const [rooms] = await db.query(
      `SELECT * FROM seat_plan_rooms WHERE id IN (${created.map(() => "?").join(",")}) ORDER BY sort_order ASC, id ASC`,
      created
    );
    return res.json({ ok: true, message: "Rooms created", rooms });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to create rooms" });
  }
}

async function generateSeatPlan(req, res) {
  const conn = await db.getConnection();
  try {
    await ensureSeatPlannerSchema();
    const planId = Number(req.params.planId || 0);
    if (!planId) return res.status(400).json({ ok: false, message: "Invalid plan id" });
    const plan = await loadPlanWithExam(planId);
    if (!plan) return res.status(404).json({ ok: false, message: "Seat plan not found" });
    const rooms = await loadPlanRooms(planId);
    if (!rooms.length) {
      return res.status(400).json({ ok: false, message: "Add at least one room before generating the plan" });
    }

    const requestedMode = String(req.body?.seating_mode || plan.seating_mode || "ASSIGNED").trim().toUpperCase();
    const seatingMode = requestedMode === "BLANK" ? "BLANK" : "ASSIGNED";
    const students = seatingMode === "BLANK" ? [] : await loadExamStudents(plan);

    await conn.beginTransaction();
    await conn.query(`UPDATE seat_plans SET seating_mode=? WHERE id=?`, [seatingMode, planId]);
    await conn.query(`DELETE FROM seat_plan_assignments WHERE plan_id=?`, [planId]);

    let seatNo = 1;
    let studentIndex = 0;
    for (const room of rooms) {
      let deskNo = toPositiveInt(room.starting_desk_no, 1);
      const seatsPerDesk = toPositiveInt(room.seats_per_desk || plan.seats_per_desk, 2);
      for (let rowNo = 1; rowNo <= toPositiveInt(room.row_count, 5); rowNo += 1) {
        for (let colNo = 1; colNo <= toPositiveInt(room.desks_per_row, 5); colNo += 1) {
          for (let seatIndex = 1; seatIndex <= seatsPerDesk; seatIndex += 1) {
            const student = students[studentIndex] || null;
            if (student) studentIndex += 1;
            await conn.query(
              `INSERT INTO seat_plan_assignments
               (plan_id, room_id, desk_no, row_no, col_no, seat_index, seat_label, seat_no,
                student_id, enrollment_id, student_name_snapshot, symbol_no_snapshot, regd_no_snapshot)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                planId,
                room.id,
                deskNo,
                rowNo,
                colNo,
                seatIndex,
                seatLabelFromIndex(seatIndex),
                seatNo,
                student?.student_id || null,
                student?.enrollment_id || null,
                student?.full_name || null,
                student?.symbol_no || null,
                student?.regd_no || null,
              ]
            );
            seatNo += 1;
          }
          deskNo += 1;
        }
      }
    }

    await conn.commit();
    const payload = await buildPlanPayload(planId);
    const assigned = payload?.stats?.assigned_count || 0;
    const totalStudents = students.length;
    return res.json({
      ok: true,
      message: seatingMode === "BLANK" ? "Blank seat plan generated" : "Seat plan generated",
      truncated_students: Math.max(0, totalStudents - assigned),
      ...payload,
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ ok: false, message: err?.message || "Failed to generate seat plan" });
  } finally {
    conn.release();
  }
}

module.exports = {
  listSeatPlans,
  createSeatPlan,
  getSeatPlan,
  updateSeatPlan,
  deleteSeatPlan,
  addSeatPlanRoom,
  updateSeatPlanRoom,
  deleteSeatPlanRoom,
  listRoomTemplates,
  createRoomTemplate,
  updateRoomTemplate,
  deleteRoomTemplate,
  bulkCreateSeatPlanRooms,
  generateSeatPlan,
};
