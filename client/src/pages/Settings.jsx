// client/src/pages/Settings.jsx - เทียบเท่า public/settings.html
import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../lib/AuthContext';

export default function Settings() {
  const { me } = useAuth();
  return (
    <Layout title="ตั้งค่า">
      <div className="grid-3">
        <Link className="card" style={{ padding: 20, display: 'block' }} to="/profile">
          <div style={{ fontSize: 22 }}>&#128100;</div>
          <div style={{ fontWeight: 700, marginTop: 8 }}>โปรไฟล์ของฉัน</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>แก้ไขข้อมูลส่วนตัวและรหัสผ่าน</div>
        </Link>
        {me.role === 'Admin' && (
          <Link className="card" style={{ padding: 20, display: 'block' }} to="/admin-users">
            <div style={{ fontSize: 22 }}>&#128737;</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>จัดการผู้ใช้งาน</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>เพิ่ม/แก้ไข/ลบผู้ใช้ และกำหนดสิทธิ์</div>
          </Link>
        )}
        {me.role === 'Admin' && (
          <Link className="card" style={{ padding: 20, display: 'block' }} to="/admin-form-builder">
            <div style={{ fontSize: 22 }}>&#129521;</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>จัดการแบบฟอร์ม Visit</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>เพิ่ม/ลบ/แก้ไข Field ในฟอร์มสร้างคำขอ Visit</div>
          </Link>
        )}
        {me.role === 'Admin' && (
          <Link className="card" style={{ padding: 20, display: 'block' }} to="/admin-page-content">
            <div style={{ fontSize: 22 }}>&#128196;</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>จัดการหน้า/หัวข้อของระบบ</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>แก้ไข Page Title ของแต่ละหน้าได้เอง</div>
          </Link>
        )}
        {me.role === 'Admin' && (
          <Link className="card" style={{ padding: 20, display: 'block' }} to="/admin-data-retention">
            <div style={{ fontSize: 22 }}>&#128465;</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>ตั้งค่าการลบข้อมูลอัตโนมัติ</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>กำหนดระยะเวลาเก็บข้อมูลก่อนลบอัตโนมัติ</div>
          </Link>
        )}
        {me.role === 'Admin' && (
          <Link className="card" style={{ padding: 20, display: 'block' }} to="/admin-email-settings">
            <div style={{ fontSize: 22 }}>&#128231;</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>ตั้งค่าอีเมล</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>เลือกข้อมูลที่จะแสดงในอีเมลแจ้งอนุมัติ</div>
          </Link>
        )}
        {me.role === 'Admin' && (
          <Link className="card" style={{ padding: 20, display: 'block' }} to="/admin-pdf-settings">
            <div style={{ fontSize: 22 }}>&#127912;</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>ออกแบบ PDF</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>ปรับสี/โลโก้/หัวเอกสาร/ลำดับหมวดของใบ PDF</div>
          </Link>
        )}
        <Link className="card" style={{ padding: 20, display: 'block' }} to="/customers">
          <div style={{ fontSize: 22 }}>&#127970;</div>
          <div style={{ fontWeight: 700, marginTop: 8 }}>ข้อมูลลูกค้า</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>จัดการรายชื่อลูกค้า/บริษัท</div>
        </Link>
      </div>
    </Layout>
  );
}
