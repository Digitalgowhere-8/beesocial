import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

export default function ProtectedRoute({ children, requireAdmin = false, requireAccess = '' }) {
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  const loc = useLocation();
  const ownerOnlyPaths = ['/admin', '/profile'];

  if (loading) return <Loader label="Authenticating" />;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  const memberHasFetchOrSchedule = user?.access?.canFetch === true || user?.access?.canUseScheduler === true;
  if (requireAdmin && !isAdmin && !memberHasFetchOrSchedule) return <Navigate to="/dashboard" replace />;
  if (requireAccess && !isSuperAdmin && user?.access?.[requireAccess] !== true && !(isAdmin && user?.access?.[requireAccess] !== false)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (isSuperAdmin && !ownerOnlyPaths.some((path) => loc.pathname.startsWith(path))) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}
