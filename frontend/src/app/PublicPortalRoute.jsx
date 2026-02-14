import { Navigate, useLocation } from "react-router-dom";
import { isAuthed } from "../lib/auth";
import { hasPublicSession } from "../lib/publicAuth";

export default function PublicPortalRoute({ children }) {
  const location = useLocation();
  if (isAuthed() || hasPublicSession()) return children;
  return <Navigate to="/public" replace state={{ from: location.pathname }} />;
}
