// client/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { canAccessVisit } from './lib/api';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VisitRequest from './pages/VisitRequest';
import MyRequests from './pages/MyRequests';
import ApproveRequests from './pages/ApproveRequests';
import CalendarPage from './pages/CalendarPage';
import Customers from './pages/Customers';
import LeaveRequest from './pages/LeaveRequest';
import MyLeave from './pages/MyLeave';
import ApproveLeave from './pages/ApproveLeave';
import OTRequest from './pages/OTRequest';
import MyOT from './pages/MyOT';
import ApproveOT from './pages/ApproveOT';
import AdminLeaveBalances from './pages/AdminLeaveBalances';
import ReportHub from './pages/ReportHub';
import ReportList from './pages/ReportList';
import ReportSummary from './pages/ReportSummary';
import ReportEmployee from './pages/ReportEmployee';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import AdminUsers from './pages/AdminUsers';
import MyTeam from './pages/MyTeam';
import TeamMemberProfile from './pages/TeamMemberProfile';
import AdminProfilePermissions from './pages/AdminProfilePermissions';
import AdminFormBuilder from './pages/AdminFormBuilder';
import AdminPageContent from './pages/AdminPageContent';
import AdminSystemLogs from './pages/AdminSystemLogs';
import AdminDataRetention from './pages/AdminDataRetention';
import AdminEmailSettings from './pages/AdminEmailSettings';
import AdminPdfSettings from './pages/AdminPdfSettings';
import AdminBrands from './pages/AdminBrands';
import AdminApprovalTemplates from './pages/AdminApprovalTemplates';

// Employee Summary: เฉพาะ Approver/Admin (Backend ตรวจสิทธิ์ซ้ำอีกชั้น)
function ReportSummaryGuard() {
  const { me } = useAuth();
  if (me && me.role !== 'Approver' && me.role !== 'Admin') return <Navigate to={`/report/employee/${me.id}`} replace />;
  return <ReportSummary />;
}

function ReportEmployeeGuard() {
  const { me } = useAuth();
  const { id } = useParams();
  const ok = me && (me.role === 'Approver' || me.role === 'Admin' || String(me.id) === String(id));
  return ok ? <ReportEmployee /> : <div className="empty">คุณดูได้เฉพาะรายงานของตัวเอง</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/visit-request" element={<ProtectedRoute check={canAccessVisit}><VisitRequest /></ProtectedRoute>} />
      <Route path="/my-requests" element={<ProtectedRoute check={canAccessVisit}><MyRequests /></ProtectedRoute>} />
      <Route path="/approve-requests" element={<ProtectedRoute check={(me) => me.role === 'Approver' || me.role === 'Admin' || me.can_approve}><ApproveRequests /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute check={(m) => m && m.role === 'Admin'}><Customers /></ProtectedRoute>} />
      <Route path="/leave-request" element={<ProtectedRoute><LeaveRequest /></ProtectedRoute>} />
      <Route path="/my-leave" element={<ProtectedRoute><MyLeave /></ProtectedRoute>} />
      <Route path="/approve-leave" element={<ProtectedRoute check={(me) => me.can_approve_leave}><ApproveLeave /></ProtectedRoute>} />
      <Route path="/ot-request" element={<ProtectedRoute><OTRequest /></ProtectedRoute>} />
      <Route path="/my-ot" element={<ProtectedRoute><MyOT /></ProtectedRoute>} />
      <Route path="/approve-ot" element={<ProtectedRoute check={(me) => me.role === 'Approver' || me.role === 'Admin' || me.can_approve}><ApproveOT /></ProtectedRoute>} />
      <Route path="/admin-leave-balances" element={<ProtectedRoute roles={['Admin']}><AdminLeaveBalances /></ProtectedRoute>} />
      <Route path="/report" element={<ProtectedRoute><ReportHub /></ProtectedRoute>} />
      <Route path="/report/visit" element={<ProtectedRoute><ReportList key="visit" type="visit" /></ProtectedRoute>} />
      <Route path="/report/ot" element={<ProtectedRoute><ReportList key="ot" type="ot" /></ProtectedRoute>} />
      <Route path="/report/leave" element={<ProtectedRoute><ReportList key="leave" type="leave" /></ProtectedRoute>} />
      <Route path="/report/summary" element={<ProtectedRoute><ReportSummaryGuard /></ProtectedRoute>} />
      <Route path="/report/employee/:id" element={<ProtectedRoute><ReportEmployeeGuard /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/admin-users" element={<ProtectedRoute roles={['Admin']}><AdminUsers /></ProtectedRoute>} />
      <Route path="/my-team" element={<ProtectedRoute check={(me) => me.can_evaluate}><MyTeam /></ProtectedRoute>} />
      <Route path="/team/:id" element={<ProtectedRoute check={(me) => me.can_evaluate}><TeamMemberProfile /></ProtectedRoute>} />
      <Route path="/admin-profile-permissions" element={<ProtectedRoute roles={['Admin']}><AdminProfilePermissions /></ProtectedRoute>} />
      <Route path="/admin-form-builder" element={<ProtectedRoute roles={['Admin']}><AdminFormBuilder /></ProtectedRoute>} />
      <Route path="/admin-page-content" element={<ProtectedRoute roles={['Admin']}><AdminPageContent /></ProtectedRoute>} />
      <Route path="/admin-system-logs" element={<ProtectedRoute roles={['Admin']}><AdminSystemLogs /></ProtectedRoute>} />
      <Route path="/admin-data-retention" element={<ProtectedRoute roles={['Admin']}><AdminDataRetention /></ProtectedRoute>} />
      <Route path="/admin-email-settings" element={<ProtectedRoute roles={['Admin']}><AdminEmailSettings /></ProtectedRoute>} />
      <Route path="/admin-pdf-settings" element={<ProtectedRoute roles={['Admin']}><AdminPdfSettings /></ProtectedRoute>} />
      <Route path="/admin-brands" element={<ProtectedRoute roles={['Admin']}><AdminBrands /></ProtectedRoute>} />
      <Route path="/admin-approval-templates" element={<ProtectedRoute roles={['Admin']}><AdminApprovalTemplates /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/profile" replace />} />
      <Route path="*" element={<Navigate to="/profile" replace />} />
    </Routes>
  );
}
