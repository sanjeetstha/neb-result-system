// import { Routes, Route, Navigate } from "react-router-dom";
// import ProtectedRoute from "./ProtectedRoute";

// import LoginPage from "../pages/auth/LoginPage";
// import DashboardLayout from "../layouts/DashboardLayout";
// import DashboardHome from "../pages/dashboard/DashboardHome";

// import MastersLayout from "../modules/masters/MastersLayout";
// import CampusesPage from "../modules/masters/CampusesPage";
// import AcademicYearsPage from "../modules/masters/AcademicYearsPage";
// import FacultiesPage from "../modules/masters/FacultiesPage";
// import SectionsPage from "../modules/masters/SectionsPage";

// import StudentsPage from "../modules/students/StudentsPage";

// import ExamsPage from "../modules/exams/ExamsPage";
// import ExamComponentsPage from "../modules/exams/ExamComponentsPage";
// import MarksEntryPage from "../modules/marks/MarksEntryPage";
// import MarksGridPage from "../modules/marks/MarksGridPage";
// import InvitesPage from "../pages/admin/InvitesPage";




// export default function AppRouter() {
//   return (
//     <Routes>
//       <Route path="/login" element={<LoginPage />} />

//       <Route
//         path="/"
//         element={
//           <ProtectedRoute>
//             <DashboardLayout />
//           </ProtectedRoute>
//         }
//       >
//         <Route index element={<DashboardHome />} />

//         {/* Masters (nested tabs) */}
//         <Route path="masters" element={<MastersLayout />}>
//           <Route index element={<Navigate to="/masters/campuses" replace />} />
//           <Route path="campuses" element={<CampusesPage />} />
//           <Route path="academic-years" element={<AcademicYearsPage />} />
//           <Route path="faculties" element={<FacultiesPage />} />
//           <Route path="sections" element={<SectionsPage />} />
//         </Route>

//         {/* Students (top-level route) */}
//         <Route path="students" element={<StudentsPage />} />

//         {/* Next modules */}
//         {/* <Route path="exams" element={<div>Exams (next)</div>} /> */}
//         {/* <Route path="marks" element={<div>Marks Entry (next)</div>} /> */}
//         <Route path="marks" element={<MarksEntryPage />} />
//         <Route path="marks/grid" element={<MarksGridPage />} />
//         <Route path="reports" element={<div>Reports (next)</div>} />
//         <Route path="corrections" element={<div>Corrections (next)</div>} />
//         <Route path="public" element={<div>Public Portal (later)</div>} />
//         <Route path="my-results" element={<div>My Results (later)</div>} />

//         import InvitesPage from "../pages/admin/InvitesPage";

//         // ...
//         <Route
//           path="/admin/invites"
//           element={
//             <ProtectedRoute>
//               <InvitesPage />
//             </ProtectedRoute>
//           }
//         />

        

//         <Route path="exams" element={<ExamsPage />} />
//         <Route path="exams/:examId/components" element={<ExamComponentsPage />} />


//       </Route>

//       <Route path="*" element={<Navigate to="/" replace />} />
//     </Routes>
//   );
// }



import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

import LoginPage from "../pages/auth/LoginPage";
import DashboardLayout from "../layouts/DashboardLayout";
import DashboardHome from "../pages/dashboard/DashboardHome";

import MastersLayout from "../modules/masters/MastersLayout";
import CampusesPage from "../modules/masters/CampusesPage";
import AcademicYearsPage from "../modules/masters/AcademicYearsPage";
import FacultiesPage from "../modules/masters/FacultiesPage";
import SectionsPage from "../modules/masters/SectionsPage";

import StudentsPage from "../modules/students/StudentsPage";

import ExamsPage from "../modules/exams/ExamsPage";
import ExamComponentsPage from "../modules/exams/ExamComponentsPage";

import MarksEntryPage from "../modules/marks/MarksEntryPage";
import MarksGridPage from "../modules/marks/MarksGridPage";

import InvitesPage from "../pages/admin/InvitesPage";

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

        {/* Masters (nested tabs) */}
        <Route path="masters" element={<MastersLayout />}>
          <Route index element={<Navigate to="/masters/campuses" replace />} />
          <Route path="campuses" element={<CampusesPage />} />
          <Route path="academic-years" element={<AcademicYearsPage />} />
          <Route path="faculties" element={<FacultiesPage />} />
          <Route path="sections" element={<SectionsPage />} />
        </Route>

        {/* Students */}
        <Route path="students" element={<StudentsPage />} />

        {/* Exams */}
        <Route path="exams" element={<ExamsPage />} />
        <Route path="exams/:examId/components" element={<ExamComponentsPage />} />

        {/* Marks */}
        <Route path="marks" element={<MarksEntryPage />} />
        <Route path="marks/grid" element={<MarksGridPage />} />

        {/* Admin */}
        <Route path="admin/invites" element={<InvitesPage />} />

        {/* Placeholder */}
        <Route path="reports" element={<div>Reports (next)</div>} />
        <Route path="corrections" element={<div>Corrections (next)</div>} />
        <Route path="public" element={<div>Public Portal (later)</div>} />
        <Route path="my-results" element={<div>My Results (later)</div>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
