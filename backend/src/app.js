const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const db = require("./db");
const app = express();
const authRoutes = require("./routes/auth.routes");
// const meRoutes = require("./routes/me.routes");
const mastersRoutes = require("./routes/masters.routes");
const studentRoutes = require("./routes/students.routes");
const examsRoutes = require("./routes/exams.routes");
const marksRoutes = require("./routes/marks.routes");
const resultsRoutes = require("./routes/results.routes");
const reportsRoutes = require("./routes/reports.routes");
const correctionsRoutes = require("./routes/corrections.routes");
const importRoutes = require("./routes/import.routes");
const publicRoutes = require("./routes/public.routes");
const exportRoutes = require("./routes/export.routes");
const inviteRoutes = require("./routes/invites.routes");
const invitesRoutes = require("./routes/invites.routes");

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use("/api/auth", authRoutes);
// app.use("/api/me", meRoutes);
const meRoutes = require("./routes/me.routes");
app.use("/api/me", meRoutes);
app.use("/api/masters", mastersRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/exams", examsRoutes);
app.use("/api/marks", marksRoutes);
app.use("/api/results", resultsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/corrections", correctionsRoutes);
app.use("/api/import", importRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/invites", invitesRoutes);


app.get("/api/health", async (req, res) => {
  // also test DB connectivity
  const [rows] = await db.query("SELECT 1 AS ok");
  res.json({ ok: true, db: rows[0].ok, message: "Backend + DB OK" });
});

module.exports = app;
