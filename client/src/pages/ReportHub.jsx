// pages/ReportHub.jsx - หน้า Reports ย้ายไปรวมกับ Dashboard แล้ว (เปิด /report จะพากลับไป Dashboard)
import { Navigate } from 'react-router-dom';

export default function ReportHub() {
  return <Navigate to="/dashboard" replace />;
}
