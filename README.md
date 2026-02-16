# NEB Result System

A full-stack NEB +2 & higher Education result management system for exam setup, bulk marks entry, result generation, reporting, and public/student portals.

## Highlights
- Terminal-wise exam setup with configurable full marks
- Bulk grid marks entry + Excel/CSV import template
- Result generation, publishing, corrections, and reports
- Public result portal + student “My Results” access
- PDF exports: marksheet and transcript
- Theme customization (colors, logos, notice bar, favicon)
- Role-based access for SUPER_ADMIN, ADMIN, FINANCE, TEACHER, CAMPUS_CHIEF, STUDENT
- Automatic DB backup system with retention + restore script

## Tech Stack
- **Frontend:** React + Vite, TailwindCSS, shadcn/ui, TanStack Query
- **Backend:** Node.js + Express
- **Database:** MySQL (schema expected by backend)
- **PDF Export:** pdfkit

## Project Structure
- `frontend/` — React app
- `backend/` — Express API
- `data/` — project data (if any)

## Environment
Create a `.env` file for backend and frontend based on `.env.example`.

Example (frontend):
```
VITE_API_BASE_URL=http://localhost:5050
```

Example (backend):
```
PORT=5050
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=secret
DB_NAME=neb_result_system
JWT_SECRET=your-secret
```

## Run Locally

### Backend
```
cd backend
npm install
npm run dev
```

### Frontend
```
cd frontend
npm install
npm run dev
```

## Deployment
- **Frontend (Vercel):** `https://your-app.vercel.app` (placeholder)
- **Backend:** Deploy to your preferred Node hosting (Render/Railway/VM)

## Database Backup (Auto)
- Backup script: `backend/scripts/db_backup.sh`
- Wrapper script (manual + cron): `backend/scripts/backup.sh`
- Restore script: `backend/scripts/db_restore.sh`
- Systemd units: `ops/systemd/neb-db-backup.service` + `ops/systemd/neb-db-backup.timer`
- Full setup guide: `ops/systemd/README.md`

Quick usage:
```bash
cd backend/scripts
./backup.sh run
./backup.sh install-cron "15 */6 * * *"
```

## Screenshots
Add your UI screenshots here:

```
frontend/public/screenshot.png
```

Then embed it below:

![Dashboard Preview](frontend/public/screenshot.png)

## Key Features Implemented
- Exam creation with component presets
- Bulk marks entry grid + import
- Report and corrections pages
- Public portal + My Results page
- Marksheet/Transcript PDF exports
- App theme settings (logo, small logo, favicon, notice bar)

## Notes
- Bulk SMS feature is prepared for integration with a 3rd‑party gateway.
- For large datasets (1000+ students), enable server pagination and caching.

## License
MIT — see `LICENSE`
