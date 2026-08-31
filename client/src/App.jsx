// client/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VisitRequest from './pages/VisitRequest';
import MyRequests from './pages/MyRequests';
import ApproveRequests from './pages/ApproveRequests';
import CalendarPage from './pages/CalendarPage';
import Customers from './pages/Customers';
import Report from './pages/Report';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import AdminUsers from './pages/AdminUsers';
import AdminFormBuilder from './pages/AdminFormBuilder';
import AdminPageContent from './pages/AdminPageContent';
import AdminSystemLogs from './pages/AdminSystemLogs';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/visit-request" element={<ProtectedRoute><VisitRequest /></ProtectedRoute>} />
      <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
      <Route path="/approve-requests" element={<ProtectedRoute roles={['Approver', 'Admin']}><ApproveRequests /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/report" element={<ProtectedRoute><Report /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/admin-users" element={<ProtectedRoute roles={['Admin']}><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin-form-builder" element={<ProtectedRoute roles={['Admin']}><AdminFormBuilder /></ProtectedRoute>} />
      <Route path="/admin-page-content" element={<ProtectedRoute roles={['Admin']}><AdminPageContent /></ProtectedRoute>} />
      <Route path="/admin-system-logs" element={<ProtectedRoute roles={['Admin']}><AdminSystemLogs /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
