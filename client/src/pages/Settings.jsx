// client/src/pages/Settings.jsx - เทียบเท่า public/settings.html
// การ์ด Admin ดึงจาก ADMIN_TOOLS ใน Layout.jsx (ครบทุกอัน) + ปุ่มปักหมุดไปเมนูซ้าย (สูงสุด 4 อัน)
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout, { ADMIN_TOOLS } from '../components/Layout';
import { useAuth } from '../lib/AuthContext';
import { canAccessVisit } from '../lib/api';
import { getPinnedAdminTools, togglePinnedAdminTool, MAX_PINNED } from '../lib/pinnedTools';

const cardStyle = { padding: 20, display: 'block', position: 'relative' };

// การ์ดทั่วไปที่ทุกคนเห็น
const COMMON_CARDS = [
  { href: '/profile', icon: '\uD83D\uDC64', label: 'โปรไฟล์ของฉัน', desc: 'แก้ไขข้อมูลส่วนตัวและรหัสผ่าน' },
  { href: '/customers', icon: '\uD83C\uDFE2', label: 'ข้อมูลลูกค้า', desc: 'จัดการรายชื่อลูกค้า/บริษัท', adminOnly: true },
  { href: '/my-leave', icon: '\uD83D\uDCC6', label: 'การลาของฉัน', desc: 'สร้างคำขอลา ดูสถานะและประวัติการลา' },
  { href: '/my-ot', icon: '\u23F0', label: 'OT ของฉัน', desc: 'สร้างคำขอ OT ดูสถานะและพิมพ์ PDF' },
];

export default function Settings() {
  const { me } = useAuth();
  const isAdmin = me && me.role === 'Admin';
  const [pinned, setPinned] = useState(() => (isAdmin ? getPinnedAdminTools(me.id) : []));

  const handlePin = (e, href) => {
    e.preventDefault(); // กันไม่ให้ Link นำทางไปหน้านั้นตอนกดปุ่มหมุด
    e.stopPropagation();
    setPinned(togglePinnedAdminTool(me.id, href));
  };

  const full = pinned.length >= MAX_PINNED;

  return (
    <Layout title="ตั้งค่า">
      {(
        <div className="grid-3">
          {COMMON_CARDS.filter(c => !c.adminOnly || me.role === 'Admin').map(c => (
            <Link key={c.href} className="card" style={cardStyle} to={c.href}>
              <div style={{ fontSize: 22 }}>{c.icon}</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>{c.label}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{c.desc}</div>
            </Link>
          ))}
        </div>
      )}

      {isAdmin && (
        <>
          <div style={{ margin: '24px 0 4px', fontWeight: 700 }}>เครื่องมือผู้ดูแลระบบ</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            กดปุ่ม {'\uD83D\uDCCC'} เพื่อปักหมุดไว้ที่เมนูซ้าย ({pinned.length}/{MAX_PINNED})
          </div>
          <div className="grid-3">
            {ADMIN_TOOLS.map(t => {
              const isPinned = pinned.includes(t.href);
              const disabled = !isPinned && full;
              return (
                <Link key={t.href} className="card" style={cardStyle} to={t.href}>
                  <button
                    type="button"
                    onClick={(e) => handlePin(e, t.href)}
                    disabled={disabled}
                    title={isPinned ? 'ยกเลิกปักหมุด' : disabled ? `ปักได้สูงสุด ${MAX_PINNED} อัน` : 'ปักหมุดไว้ที่เมนูซ้าย'}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: 15,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      background: isPinned ? '#dbeafe' : 'transparent',
                      opacity: isPinned ? 1 : disabled ? 0.25 : 0.5,
                    }}
                  >
                    {'\uD83D\uDCCC'}
                  </button>
                  <div style={{ fontSize: 22 }}>{t.icon}</div>
                  <div style={{ fontWeight: 700, marginTop: 8 }}>{t.label}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t.desc}</div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </Layout>
  );
}
