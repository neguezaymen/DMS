import { Navigate, Route, Routes } from 'react-router-dom'
import AuthLayout from './layouts/AuthLayout'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Verify2FAPage from './pages/Verify2FAPage'
import DashboardPage from './pages/DashboardPage'
import AdminUsersPage from './pages/AdminUsersPage'
import DocumentsListPage from './pages/DocumentsListPage'
import DocumentDetailPage from './pages/DocumentDetailPage'
import SearchResultsPage from './pages/SearchResultsPage'
import WorkflowTemplatesPage from './pages/WorkflowTemplatesPage'
import MyWorkflowTasksPage from './pages/MyWorkflowTasksPage'
import AdminDepartmentsPage from './pages/AdminDepartmentsPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AdminCustomFieldsPage from './pages/AdminCustomFieldsPage'
import ProfilePage from './pages/ProfilePage'
import PublicLinkPage from './pages/PublicLinkPage'
import RequestUploadPage from './pages/RequestUploadPage'
import UploadRequestsPage from './pages/UploadRequestsPage'
import NotificationsPage from './pages/NotificationsPage'
import AIStudioPage from './pages/AIStudioPage'
import AIBatchPage from './pages/AIBatchPage'
import AuditLogsPage from './pages/AuditLogsPage'
import TrashPage from './pages/TrashPage'
import { ProtectedRoute } from './routes/ProtectedRoute'
import AdminRoute from './routes/AdminRoute'

function App() {
  return (
    <Routes>
      <Route path="/public-link/:token" element={<PublicLinkPage />} />
      <Route path="/request-upload/:token" element={<RequestUploadPage />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-2fa" element={<Verify2FAPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            }
          />
          <Route path="/upload-requests" element={<UploadRequestsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/ai-studio" element={<AIStudioPage />} />
          <Route path="/ai-studio/batch" element={<AIBatchPage />} />
          <Route path="/documents" element={<DocumentsListPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route
            path="/workflows/templates"
            element={
              <AdminRoute>
                <WorkflowTemplatesPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <AdminRoute>
                <AdminDepartmentsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminRoute>
                <AdminSettingsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/custom-fields"
            element={
              <AdminRoute>
                <AdminCustomFieldsPage />
              </AdminRoute>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/workflows/tasks" element={<MyWorkflowTasksPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
