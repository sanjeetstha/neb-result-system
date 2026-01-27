import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

import LoginPage from "../pages/auth/LoginPage";
import DashboardLayout from "../layouts/DashboardLayout";
import DashboardHome from "../pages/dashboard/DashboardHome";
import CampusesPage from "../modules/masters/CampusesPage";

import MastersLayout from "../modules/masters/MastersLayout";
import AcademicYearsPage from "../modules/masters/AcademicYearsPage";
import FacultiesPage from "../modules/masters/FacultiesPage";
import SectionsPage from "../modules/masters/SectionsPage";



export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />

        <Route path="masters" element={<MastersLayout />}>
          <Route index element={<Navigate to="/masters/campuses" replace />} />
          <Route path="campuses" element={<CampusesPage />} />
          <Route path="academic-years" element={<AcademicYearsPage />} />
          <Route path="faculties" element={<FacultiesPage />} />
          <Route path="sections" element={<SectionsPage />} />
        </Route>

        <Route path="students" element={<div>Students (next)</div>} />
        <Route path="exams" element={<div>Exams (next)</div>} />
        <Route path="marks" element={<div>Marks Entry (next)</div>} />
        <Route path="reports" element={<div>Reports (next)</div>} />
        <Route path="corrections" element={<div>Corrections (next)</div>} />
        <Route path="public" element={<div>Public Portal (later)</div>} />
        <Route path="my-results" element={<div>My Results (later)</div>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
