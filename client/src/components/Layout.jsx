// client/src/components/Layout.jsx - เทียบเท่า public/js/layout.js (renderLayout)
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ROLE_TH, canAccessVisit } from '../lib/api';
import { getPinnedAdminTools } from '../lib/pinnedTools';

// เครื่องมือผู้ดูแลระบบทั้งหมด - อยู่ที่หน้า "ตั้งค่า" เป็นหลัก เลือกปักหมุดบางอันให้โชว์ในเมนูซ้ายได้ (ดู pinnedTools.js)
export const ADMIN_TOOLS = [
  { href: '/admin-users', icon: '\uD83D\uDEE1', label: 'จัดการผู้ใช้งาน', desc: 'เพิ่ม/แก้ไข/ลบผู้ใช้ และกำหนดสิทธิ์' },
  { href: '/admin-leave-balances', icon: '\uD83C\uDF34', label: 'จัดการสิทธิ์วันลา', desc: 'ปรับโควตาวันลาแต่ละประเภทรายบุคคล' },
  { href: '/admin-profile-permissions', icon: '\uD83C\uDFC5', label: 'มอบสิทธิ์ผู้ประเมิน', desc: 'ให้ใครประเมิน/แก้โปรไฟล์คนอื่นได้เป็นพิเศษ' },
  { href: '/admin-form-builder', icon: '\uD83E\uDDF1', label: 'Form Builder', desc: 'เพิ่ม/ลบ/แก้ไข Field ในฟอร์ม Visit' },
  { href: '/admin-page-content', icon: '\uD83D\uDCC4', label: 'จัดการหน้า/หัวข้อ', desc: 'แก้ข้อความหัวข้อของแต่ละหน้าเว็บ' },
  { href: '/admin-approval-templates', icon: '\uD83D\uDDC2', label: 'Template อนุมัติ', desc: 'ตั้ง workflow การอนุมัติ ลา/OT/Visit' },
  { href: '/admin-data-retention', icon: '\uD83D\uDDD1', label: 'ลบข้อมูลอัตโนมัติ', desc: 'กำหนดระยะเวลาเก็บข้อมูลก่อนลบ' },
  { href: '/admin-system-logs', icon: '\uD83D\uDCDC', label: 'System Logs', desc: 'Audit trail การกระทำสำคัญของระบบ' },
  { href: '/admin-email-settings', icon: '\uD83D\uDCE7', label: 'ตั้งค่าอีเมล', desc: 'เลือกข้อมูลที่แสดงในอีเมลแจ้งอนุมัติ' },
  { href: '/admin-pdf-settings', icon: '\uD83C\uDFA8', label: 'ออกแบบ PDF', desc: 'ปรับสี/โลโก้/หัวเอกสารของใบ PDF' },
];

const MENU = {
  common: [{ href: '/dashboard', icon: '\u2302', label: 'Dashboard' }],
  // จัดกลุ่ม "สร้างคำขอ + ดูของฉัน" ของแต่ละประเภทไว้ด้วยกัน กดหัวข้อกลุ่มเพื่อขยาย/ย่อ (กันเมนูซ้ายยาวเป็นเส้นตรง)
  Employee: [
    { group: 'visit', icon: '\uD83D\uDCDD', label: 'Visit', items: [
      { href: '/visit-request', icon: '\uD83D\uDCDD', label: 'สร้างคำขอ' },
      { href: '/my-requests', icon: '\uD83D\uDCCB', label: 'My Requests' },
    ] },
    { group: 'leave', icon: '\uD83C\uDFD6', label: 'ลา', items: [
      { href: '/leave-request', icon: '\uD83C\uDFD6', label: 'สร้างคำขอลา' },
      { href: '/my-leave', icon: '\uD83D\uDCC6', label: 'การลาของฉัน' },
    ] },
    { group: 'ot', icon: '\u23F0', label: 'OT', items: [
      { href: '/ot-request', icon: '\u23F0', label: 'สร้างคำขอ OT' },
      { href: '/my-ot', icon: '\uD83D\uDDD2', label: 'OT ของฉัน' },
    ] },
  ],
  ApproverAdmin: [
    { group: 'visit', icon: '\uD83D\uDCDD', label: 'Visit', items: [
      { href: '/visit-request', icon: '\uD83D\uDCDD', label: 'สร้างคำขอ' },
      { href: '/my-requests', icon: '\uD83D\uDCCB', label: 'My Requests' },
    ] },
    { group: 'leave', icon: '\uD83C\uDFD6', label: 'ลา', items: [
      { href: '/leave-request', icon: '\uD83C\uDFD6', label: 'สร้างคำขอลา' },
      { href: '/my-leave', icon: '\uD83D\uDCC6', label: 'การลาของฉัน' },
    ] },
    { group: 'ot', icon: '\u23F0', label: 'OT', items: [
      { href: '/ot-request', icon: '\u23F0', label: 'สร้างคำขอ OT' },
      { href: '/my-ot', icon: '\uD83D\uDDD2', label: 'OT ของฉัน' },
    ] },
  ],
  tail: [
    { href: '/calendar', icon: '\uD83D\uDCC5', label: 'ปฏิทิน' },
    { href: '/customers', icon: '\uD83D\uDC65', label: 'Customer' },
    { href: '/report', icon: '\uD83D\uDCCA', label: 'Report' },
    { href: '/notifications', icon: '\uD83D\uDD14', label: 'Notifications', badgeKey: 'unread' },
    { href: '/settings', icon: '\u2699', label: 'ตั้งค่า' },
  ],
};

// รวมรายการ "รออนุมัติ" ทั้งหมด (Visit/ลา/OT) ไว้เป็นกลุ่มเดียวกันเสมอ แยกจากกลุ่มคำขอของตัวเอง
// เพื่อให้เห็นชัดว่าอันไหนคือ "งานที่ต้องอนุมัติ" อันไหนคือ "คำขอของฉัน"
function buildApprovalGroup(me) {
  const items = [];
  if (me.role === 'Approver' || me.role === 'Admin') {
    items.push({ href: '/approve-requests', icon: '\u2705', label: 'Approve Requests', badgeKey: 'pending' });
    items.push({ href: '/approve-ot', icon: '\u2611', label: 'อนุมัติ OT', badgeKey: 'pendingOT' });
  }
  if (me.can_approve_leave) items.push({ href: '/approve-leave', icon: '\uD83D\uDDD3', label: 'อนุมัติการลา', badgeKey: 'pendingLeave' });
  return items;
}

function buildMenu(me) {
  let items = [...MENU.common];
  let roleMenu = (me.role === 'Employee' ? MENU.Employee : MENU.ApproverAdmin).map(g => ({ ...g, items: [...g.items] }));
  if (!canAccessVisit(me)) {
    // เฉพาะ Engineer หรือระดับหัวหน้าเท่านั้นที่ไป Visit ลูกค้าได้ พนักงานแผนกอื่นไม่ต้องเห็นกลุ่มนี้เลย
    roleMenu = roleMenu.filter(g => g.group !== 'visit');
  }
  items = items.concat(roleMenu);

  // กลุ่ม "รออนุมัติ" แยกต่างหาก รวม Visit/ลา/OT ไว้ด้วยกัน โชว์เฉพาะเมื่อมีสิทธิ์อนุมัติอย่างน้อย 1 อย่าง
  const approvalItems = buildApprovalGroup(me);
  if (approvalItems.length) {
    items.push({ group: 'approvals', icon: '\u2705', label: 'รออนุมัติ', items: approvalItems });
  }

  // "ทีมของฉัน" โชว์ตามสิทธิ์จริง (can_evaluate) ไม่ใช่ role ตายตัว เพราะ Admin อาจมอบสิทธิ์พิเศษให้พนักงาน role Employee ก็ได้
  if (me.can_evaluate) items.push({ href: '/my-team', icon: '\uD83C\uDFC5', label: 'ทีมของฉัน' });
  items = items.concat(canAccessVisit(me) ? MENU.tail : MENU.tail.filter(item => item.href !== '/customers'));
  // เครื่องมือ Admin ย้ายไปรวมไว้ที่หน้า "ตั้งค่า" ทั้งหมดแล้ว (กันเมนูซ้ายยาวเกินไป)
  // จะโชว์ตรงนี้เฉพาะอันที่ผู้ใช้เลือกปักหมุดเองเท่านั้น (สูงสุด 4 อัน ดูหน้าตั้งค่า)
  if (me.role === 'Admin') {
    const pinned = getPinnedAdminTools(me.id);
    const pinnedItems = ADMIN_TOOLS.filter(t => pinned.includes(t.href));
    if (pinnedItems.length) {
      items.push({ divider: 'ปักหมุดไว้' });
      items = items.concat(pinnedItems);
    }
  }
  return items;
}

// กลุ่มไหนควรกางออกโดย default: กลุ่มที่มีหน้าปัจจุบันอยู่ข้างใน (ผู้ใช้กดขยาย/ย่อกลุ่มอื่นเองได้ทีหลัง)
function initialOpenGroups(items, pathname) {
  const open = {};
  for (const it of items) {
    if (it.group) open[it.group] = it.items.some(sub => sub.href === pathname);
  }
  return open;
}

export default function Layout({ title, children }) {
  const { me, badgeCounts, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // items ต้องคำนวณก่อน return null (เพื่อให้ useState ถัดไปถูกเรียกลำดับเดิมทุกครั้ง ตามกฎของ React Hooks)
  const items = me ? buildMenu(me) : [];
  const [openGroups, setOpenGroups] = useState(() => initialOpenGroups(items, location.pathname));

  if (!me) return null; // ProtectedRoute จัดการ redirect ให้แล้ว

  const closeSidebar = () => setSidebarOpen(false);
  const toggleGroup = (g) => setOpenGroups(prev => ({ ...prev, [g]: !prev[g] }));

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
          {items.map((it, i) => {
            if (it.divider) return <li key={`div-${i}`} className="nav-divider">{it.divider}</li>;

            if (it.group) {
              const isOpen = !!openGroups[it.group];
              const activeInside = it.items.some(sub => sub.href === location.pathname);
              const groupBadge = it.items.reduce((sum, sub) => sum + (sub.badgeKey ? (badgeCounts[sub.badgeKey] || 0) : 0), 0);
              return (
                <li key={it.group} className="nav-group">
                  <a className={`nav-group-head ${activeInside ? 'active-inside' : ''}`} onClick={() => toggleGroup(it.group)}>
                    <span className="icon" dangerouslySetInnerHTML={{ __html: it.icon }} />
                    {it.label}
                    {groupBadge > 0 && <span className="badge" style={{ background: 'var(--red-600)', color: '#fff' }}>{groupBadge}</span>}
                    <span className={`chev ${isOpen ? 'open' : ''}`}>{'\u203A'}</span>
                  </a>
                  <ul className={`nav-subitems ${isOpen ? 'open' : ''}`}>
                    {it.items.map(sub => {
                      const subActive = location.pathname === sub.href ? 'active' : '';
                      const subBadge = sub.badgeKey && badgeCounts[sub.badgeKey] > 0;
                      return (
                        <li key={sub.href}>
                          <Link to={sub.href} className={subActive} onClick={closeSidebar}>
                            <span className="icon" dangerouslySetInnerHTML={{ __html: sub.icon }} />
                            {sub.label}
                            {subBadge && <span className="badge" style={{ background: 'var(--red-600)', color: '#fff' }}>{badgeCounts[sub.badgeKey]}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            }

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
