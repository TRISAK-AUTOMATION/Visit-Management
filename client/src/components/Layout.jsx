// client/src/components/Layout.jsx - เทียบเท่า public/js/layout.js (renderLayout)
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ROLE_TH, canAccessVisit } from '../lib/api';

const MENU = {
  common: [{ href: '/dashboard', icon: '\u2302', label: 'Dashboard' }],
  Employee: [
    { href: '/visit-request', icon: '\uD83D\uDCDD', label: 'สร้างคำขอ Visit' },
    { href: '/my-requests', icon: '\uD83D\uDCCB', label: 'My Requests' },
    { href: '/leave-request', icon: '\uD83C\uDFD6', label: 'สร้างคำขอลา' },
    { href: '/my-leave', icon: '\uD83D\uDCC6', label: 'การลาของฉัน' },
    { href: '/ot-request', icon: '\u23F0', label: 'สร้างคำขอ OT' },
    { href: '/my-ot', icon: '\uD83D\uDDD2', label: 'OT ของฉัน' },
  ],
  ApproverAdmin: [
    { href: '/visit-request', icon: '\uD83D\uDCDD', label: 'สร้างคำขอ Visit' },
    { href: '/my-requests', icon: '\uD83D\uDCCB', label: 'My Requests' },
    { href: '/approve-requests', icon: '\u2705', label: 'Approve Requests', badgeKey: 'pending' },
    { href: '/leave-request', icon: '\uD83C\uDFD6', label: 'สร้างคำขอลา' },
    { href: '/my-leave', icon: '\uD83D\uDCC6', label: 'การลาของฉัน' },
    { href: '/approve-leave', icon: '\uD83D\uDDD3', label: 'อนุมัติการลา', badgeKey: 'pendingLeave' },
    { href: '/ot-request', icon: '\u23F0', label: 'สร้างคำขอ OT' },
    { href: '/my-ot', icon: '\uD83D\uDDD2', label: 'OT ของฉัน' },
    { href: '/approve-ot', icon: '\u2611', label: 'อนุมัติ OT', badgeKey: 'pendingOT' },
    { href: '/my-team', icon: '\uD83C\uDFC5', label: 'ทีมของฉัน' },
  ],
  tail: [
    { href: '/calendar', icon: '\uD83D\uDCC5', label: 'ปฏิทิน' },
    { href: '/customers', icon: '\uD83D\uDC65', label: 'Customer' },
    { href: '/report', icon: '\uD83D\uDCCA', label: 'Report' },
    { href: '/notifications', icon: '\uD83D\uDD14', label: 'Notifications', badgeKey: 'unread' },
    { href: '/settings', icon: '\u2699', label: 'ตั้งค่า' },
  ],
  admin: [
    { href: '/admin-users', icon: '\uD83D\uDEE1', label: 'จัดการผู้ใช้งาน' },
    { href: '/admin-leave-balances', icon: '\uD83C\uDF34', label: 'จัดการสิทธิ์วันลา' },
    { href: '/admin-profile-permissions', icon: '\uD83C\uDFC5', label: 'มอบสิทธิ์ผู้ประเมิน' },
    { href: '/admin-form-builder', icon: '\uD83E\uDDF1', label: 'Form Builder' },
    { href: '/admin-page-content', icon: '\uD83D\uDCC4', label: 'จัดการหน้า/หัวข้อ' },
    { href: '/admin-data-retention', icon: '\uD83D\uDDD1', label: 'ตั้งค่าการลบข้อมูลอัตโนมัติ' },
    { href: '/admin-system-logs', icon: '\uD83D\uDCDC', label: 'System Logs' }
  ]
};

function buildMenu(me) {
  let items = [...MENU.common];
  let roleMenu = me.role === 'Employee' ? MENU.Employee : MENU.ApproverAdmin;
  if (!canAccessVisit(me)) {
    // เฉพาะ Engineer หรือระดับหัวหน้าเท่านั้นที่ไป Visit ลูกค้าได้ พนักงานแผนกอื่นไม่ต้องเห็นเมนูนี้
    roleMenu = roleMenu.filter(item => item.href !== '/visit-request' && item.href !== '/my-requests');
  }
  items = items.concat(roleMenu);
  items = items.concat(canAccessVisit(me) ? MENU.tail : MENU.tail.filter(item => item.href !== '/customers'));
  if (me.role === 'Admin') items = items.concat(MENU.admin);
  return items;
}

export default function Layout({ title, children }) {
  const { me, badgeCounts, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!me) return null; // ProtectedRoute จัดการ redirect ให้แล้ว

  const items = buildMenu(me);
  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app">
      <div className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">T</div>
          <div className="brand-text"><b>TRISAK</b><span>VISIT MANAGEMENT</span></div>
        </div>
        <ul className="nav">
          {items.map(it => {
            const active = location.pathname === it.href ? 'active' : '';
            const badge = it.badgeKey && badgeCounts[it.badgeKey] > 0;
            return (
              <li key={it.href}>
                <Link to={it.href} className={active} onClick={closeSidebar}>
                  <span className="icon" dangerouslySetInnerHTML={{ __html: it.icon }} />
                  {it.label}
                  {badge && <span className="badge" style={{ background: 'var(--red-600)', color: '#fff' }}>{badgeCounts[it.badgeKey]}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="side-user">
          <img src={me.avatar_url || '/img/avatar1.png'} onError={(e) => { e.target.style.display = 'none'; }} />
          <div>
            <b>{me.full_name}</b>
            <span>{me.position || ROLE_TH[me.role]}</span>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} title="เมนู">
              {'\u2630'}
            </button>
            <h1>{title}</h1>
          </div>
          <div className="topbar-right">
            <button className="icon-btn" onClick={() => navigate('/notifications')} title="การแจ้งเตือน">
              {'\uD83D\uDD14'}
              {badgeCounts.unread > 0 && <span className="dot">{badgeCounts.unread}</span>}
            </button>
            <div className="topbar-user" style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>
              <img src={me.avatar_url || '/img/avatar1.png'} onError={(e) => { e.target.style.display = 'none'; }} />
              <div>
                <b>{me.full_name}</b>
                <span>{me.position || ROLE_TH[me.role]}</span>
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>ออกจากระบบ</button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
