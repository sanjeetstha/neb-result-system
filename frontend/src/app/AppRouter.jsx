import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import PublicPortalRoute from "./PublicPortalRoute";

import LoginPage from "../pages/auth/LoginPage";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage";
import DashboardLayout from "../layouts/DashboardLayout";
import DashboardHome from "../pages/dashboard/DashboardHome";

import MastersLayout from "../modules/masters/MastersLayout";
import CampusesPage from "../modules/masters/CampusesPage";
import AcademicYearsPage from "../modules/masters/AcademicYearsPage";
import FacultiesPage from "../modules/masters/FacultiesPage";
import BatchesPage from "../modules/masters/BatchesPage";

import StudentsPage from "../modules/students/StudentsPage";

import ExamsPage from "../modules/exams/ExamsPage";
import ExamComponentsPage from "../modules/exams/ExamComponentsPage";
import ExamWorkflowPage from "../modules/exams/ExamWorkflowPage";

import MarksEntryPage from "../modules/marks/MarksEntryPage";
import MarksGridPage from "../modules/marks/MarksGridPage";
import SubjectCodesPage from "../modules/academics/SubjectCodesPage";

import InvitesPage from "../pages/admin/InvitesPage";
import AddUserPage from "../pages/admin/AddUserPage";
import UsersPage from "../pages/admin/UsersPage";
import RolesAccessPage from "../pages/admin/RolesAccessPage";
import PublicResultsPage from "../pages/public/PublicResultsPage";
import PublicPortalAccessPage from "../pages/public/PublicPortalAccessPage";
import MyResultsPage from "../pages/student/MyResultsPage";
import SettingsPage from "../pages/admin/SettingsPage";
import ReportsPage from "../pages/reports/ReportsPage";
import CorrectionsPage from "../pages/corrections/CorrectionsPage";
import ProfilePage from "../pages/account/ProfilePage";
import BulkSmsPage from "../pages/results/BulkSmsPage";
import MarksheetPrintPage from "../pages/results/MarksheetPrintPage";
import OtClaimsPage from "../modules/operations/OtClaimsPage";
import OtPolicyPage from "../modules/operations/OtPolicyPage";
import OtReportsPage from "../modules/operations/OtReportsPage";
import ExamSeatPlannerPage from "../modules/exams/ExamSeatPlannerPage";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/public" element={<PublicPortalAccessPage />} />
      <Route
        path="/public/portal"
        element={
          <PublicPortalRoute>
            <PublicResultsPage />
          </PublicPortalRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />

        {/* Masters (nested tabs) */}
        <Route path="masters" element={<MastersLayout />}>
          <Route index element={<Navigate to="/masters/campuses" replace />} />
          <Route path="campuses" element={<CampusesPage />} />
          <Route path="academic-years" element={<AcademicYearsPage />} />
          <Route path="faculties" element={<FacultiesPage />} />
          <Route path="batches" element={<BatchesPage />} />
        </Route>

        {/* Students */}
        <Route path="students" element={<StudentsPage />} />

        {/* Exams */}
        <Route path="exams" element={<ExamWorkflowPage />} />
        <Route path="exams/workflow" element={<ExamWorkflowPage />} />
        <Route path="exams/manage" element={<ExamsPage />} />
        <Route path="exams/seat-planner" element={<ExamSeatPlannerPage />} />
        <Route path="exams/:examId/components" element={<ExamComponentsPage />} />

        {/* Marks */}
        <Route path="marks" element={<MarksEntryPage />} />
        <Route path="marks/grid" element={<MarksGridPage />} />
        <Route path="academics/subject-codes" element={<SubjectCodesPage />} />

        {/* Admin */}
        <Route path="admin/invites" element={<InvitesPage />} />
        <Route path="admin/users/new" element={<AddUserPage />} />
        <Route path="admin/users" element={<UsersPage />} />
        <Route path="admin/roles" element={<RolesAccessPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="account/profile" element={<ProfilePage />} />

        {/* Results */}
        <Route path="reports" element={<ReportsPage />} />
        <Route path="corrections" element={<CorrectionsPage />} />
        <Route path="results/sms" element={<BulkSmsPage />} />
        <Route path="results/marksheet" element={<MarksheetPrintPage />} />
        <Route path="operations/ot" element={<OtClaimsPage />} />
        <Route path="operations/ot/reports" element={<OtReportsPage />} />
        <Route path="operations/ot/policy" element={<OtPolicyPage />} />
        <Route path="public" element={<Navigate to="/public/portal" replace />} />
        <Route path="my-results" element={<MyResultsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
