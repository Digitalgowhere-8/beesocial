import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import Profile from './pages/Profile';
import Maintenance from './pages/Maintenance';
import SocialMediaStudio from './pages/BlogStudio';
import BlogLibrary from './pages/BlogLibrary';
import Premium from './pages/Premium';
import useAnalyticsTracking from './hooks/useAnalyticsTracking';

function HomeRedirect() {
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  useAnalyticsTracking();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/maintenance" element={<Maintenance />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/intel-desk"
        element={
          <ProtectedRoute>
            <Dashboard initialTab="feed" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminPanel />
          </ProtectedRoute>
        }
      />
      <Route
        path="/social-media-studio"
        element={
          <ProtectedRoute requireAccess="canUseBlogStudio">
            <SocialMediaStudio />
          </ProtectedRoute>
        }
      />
      <Route
        path="/content-studio"
        element={<Navigate to="/social-media-studio" replace />}
      />
      <Route
        path="/blog-studio"
        element={<Navigate to="/social-media-studio" replace />}
      />
      <Route
        path="/blogs"
        element={
          <ProtectedRoute requireAccess="canUseContentRepository">
            <BlogLibrary />
          </ProtectedRoute>
        }
      />
      <Route
        path="/premium"
        element={
          <ProtectedRoute>
            <Premium />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
