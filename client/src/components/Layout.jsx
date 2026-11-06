// client/src/components/Layout.jsx - เทียบเท่า public/js/layout.js (renderLayout)
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ROLE_TH, canAccessVisit } from '../lib/api';
import { getPinnedAdminTools } from '../lib/pinnedTools';
import NotificationBell from './NotificationBell';
import { usePageContent } from '../lib/PageContentContext';

// เครื่องมือผู้ดูแลระบบทั้งหมด - อยู่ที่หน้า "ตั้งค่า" เป็นหลัก เลือกปักหมุดบางอันให้โชว์ในเมนูซ้ายได้ (ดู pinnedTools.js)
export const ADMIN_TOOLS = [
  { href: '/admin-users', icon: '\uD83D\uDEE1', label: 'จัดการผู้ใช้งาน', desc: 'เพิ่ม/แก้ไข/ลบผู้ใช้ และกำหนดสิทธิ์' },
  { href: '/admin-leave-balances', icon: '\uD83C\uDF34', label: 'จัดการสิทธิ์วันลา', desc: 'ปรับโควตาวันลาแต่ละประเภทรายบุคคล' },
  { href: '/admin-profile-permissions', icon: '\uD83C\uDFC5', label: 'มอบสิทธิ์ผู้ประเมิน', desc: 'ให้ใครประเมิน/แก้โปรไฟล์คนอื่นได้เป็นพิเศษ' },
  { href: '/admin-form-builder', icon: '\uD83E\uDDF1', label: 'Form Builder', desc: 'เพิ่ม/ลบ/แก้ไข Field ในฟอร์ม Visit' },
  { href: '/admin-brands', icon: '\uD83C\uDFF7', label: 'Brand Master', desc: 'จัดการรายการยี่ห้อในฟอร์ม Visit' },
  { href: '/admin-page-content', icon: '\uD83D\uDCC4', label: 'จัดการหน้า/หัวข้อ', desc: 'แก้ข้อความหัวข้อของแต่ละหน้าเว็บ' },
  { href: '/admin-approval-templates', icon: '\uD83D\uDDC2', label: 'Template อนุมัติ', desc: 'ตั้ง workflow การอนุมัติ ลา/OT/Visit' },
  { href: '/admin-data-retention', icon: '\uD83D\uDDD1', label: 'ลบข้อมูลอัตโนมัติ', desc: 'กำหนดระยะเวลาเก็บข้อมูลก่อนลบ' },
  { href: '/admin-system-logs', icon: '\uD83D\uDCDC', label: 'System Logs', desc: 'Audit trail การกระทำสำคัญของระบบ' },
  { href: '/admin-email-settings', icon: '\uD83D\uDCE7', label: 'ตั้งค่าอีเมล', desc: 'เลือกข้อมูลที่แสดงในอีเมลแจ้งอนุมัติ' },
  { href: '/admin-pdf-settings', icon: '\uD83C\uDFA8', label: 'ออกแบบ PDF', desc: 'ปรับสี/โลโก้/หัวเอกสารของใบ PDF' },
];

// เมนูย่อยของ Visit แยกตาม "ขั้นตอนของคำขอ" — คำขอแต่ละใบจะอยู่ในขั้นตอนเดียวตามสถานะปัจจุบัน
// สร้าง -> ฉบับร่าง -> (ส่งคำขอ) รออนุมัติ -> รอแก้ไข / อนุมัติแล้ว (กำลังดำเนินการ) -> Visit Completed (ผู้ขอกดเองหลังไปพบลูกค้า) / ไม่อนุมัติ ; My Requests = ดูทุกสถานะรวมกัน
// badgeKey = จำนวนคำขอของฉันในขั้นตอนนั้น (นับจาก /api/visit-requests/my-status-counts)
const VISIT_STAGES = [
  { href: '/visit-request', icon: '\uD83D\uDCDD', label: 'สร้างคำขอ' },
  { href: '/my-requests?status=draft', icon: '\u270F\uFE0F', label: 'ฉบับร่าง', badgeKey: 'vDraft', badgeTone: 'soft' },
  { href: '/my-requests?status=pending', icon: '\u23F3', label: 'รออนุมัติ', badgeKey: 'vPending', badgeTone: 'soft' },
  { href: '/my-requests?status=revision', icon: '\uD83D\uDD04', label: 'รอแก้ไข', badgeKey: 'vRevision', badgeTone: 'warn' },
  { href: '/my-requests?status=approved', icon: '\u2705', label: 'Approve@Visiting', badgeKey: 'vApproved', badgeTone: 'soft' },
  { href: '/my-requests?status=completed', icon: '\uD83C\uDFC1', label: 'Visit Completed', badgeKey: 'vCompleted', badgeTone: 'soft' },
  { href: '/my-requests?status=rejected', icon: '\u26D4', label: 'ไม่อนุมัติ', badgeKey: 'vRejected', badgeTone: 'soft' },
  { href: '/my-requests', icon: '\uD83D\uDCCB', label: 'My Requests' },
];

// เมนูย่อยของ ลา / OT แยกตามขั้นตอนเหมือน Visit (ไม่มีขั้น "เสร็จสิ้น" เพราะเป็นของ Visit เท่านั้น)
const requestStages = (create, createLabel, createIcon, listPath, listLabel, prefix) => [
  { href: create, icon: createIcon, label: createLabel },
  { href: `${listPath}?status=draft`, icon: '\u270F\uFE0F', label: 'ฉบับร่าง', badgeKey: `${prefix}Draft`, badgeTone: 'soft' },
  { href: `${listPath}?status=pending`, icon: '\u23F3', label: 'รออนุมัติ', badgeKey: `${prefix}Pending`, badgeTone: 'soft' },
  { href: `${listPath}?status=revision`, icon: '\uD83D\uDD04', label: 'รอแก้ไข', badgeKey: `${prefix}Revision`, badgeTone: 'warn' },
  { href: `${listPath}?status=approved`, icon: '\u2705', label: 'อนุมัติแล้ว', badgeKey: `${prefix}Approved`, badgeTone: 'soft' },
  { href: `${listPath}?status=rejected`, icon: '\u26D4', label: 'ไม่อนุมัติ', badgeKey: `${prefix}Rejected`, badgeTone: 'soft' },
  { href: listPath, icon: '\uD83D\uDCCB', label: listLabel },
];
const LEAVE_STAGES = requestStages('/leave-request', 'สร้างคำขอลา', '\uD83C\uDFD6', '/my-leave', 'การลาของฉัน', 'l');
const OT_STAGES = requestStages('/ot-request', 'สร้างคำขอ OT', '\u23F0', '/my-ot', 'OT ของฉัน', 'o');

// ลิงก์เมนูย่อยที่มี ?status= ต้องเทียบทั้ง path และ query ถึงจะไฮไลต์ถูกอัน
function isNavActive(href, location) {
  const [path, query] = href.split('?');
  if (location.pathname !== path) return false;
  const cur = new URLSearchParams(location.search);
  if (query) return cur.get('status') === new URLSearchParams(query).get('status');
  return !['/my-requests', '/my-leave', '/my-ot'].includes(path) || !cur.get('status');
}

const BADGE_STYLE = {
  soft: { background: 'rgba(255,255,255,.16)', color: '#fff' },
  warn: { background: '#f59e0b', color: '#fff' },
};

const MENU = {
  common: [{ href: '/profile', icon: '\uD83D\uDC64', label: 'โปรไฟล์ของฉัน' }, { href: '/dashboard', icon: '\u2302', label: 'Dashboard' }],
  // จัดกลุ่ม "สร้างคำขอ + ดูของฉัน" ของแต่ละประเภทไว้ด้วยกัน กดหัวข้อกลุ่มเพื่อขยาย/ย่อ (กันเมนูซ้ายยาวเป็นเส้นตรง)
  Employee: [
    { group: 'visit', icon: '\uD83D\uDCDD', label: 'Visit', items: VISIT_STAGES },
    { group: 'leave', icon: '\uD83C\uDFD6', label: 'ลา', items: LEAVE_STAGES },
    { group: 'ot', icon: '\u23F0', label: 'OT', items: OT_STAGES },
  ],
  ApproverAdmin: [
    { group: 'visit', icon: '\uD83D\uDCDD', label: 'Visit', items: VISIT_STAGES },
    { group: 'leave', icon: '\uD83C\uDFD6', label: 'ลา', items: LEAVE_STAGES },
    { group: 'ot', icon: '\u23F0', label: 'OT', items: OT_STAGES },
  ],
  tail: [
    { href: '/calendar', icon: '\uD83D\uDCC5', label: 'ปฏิทิน' },
    { href: '/customers', icon: '\uD83D\uDC65', label: 'Customer' },
    { href: '/notifications', icon: '\uD83D\uDD14', label: 'Notifications', badgeKey: 'unread' },
    { href: '/settings', icon: '\u2699', label: 'ตั้งค่า' },
  ],
};

// รวมรายการ "รออนุมัติ" ทั้งหมด (Visit/ลา/OT) ไว้เป็นกลุ่มเดียวกันเสมอ แยกจากกลุ่มคำขอของตัวเอง
// เพื่อให้เห็นชัดว่าอันไหนคือ "งานที่ต้องอนุมัติ" อันไหนคือ "คำขอของฉัน"
function buildApprovalGroup(me) {
  const items = [];
  // ผู้อนุมัติ = role Approver/Admin หรือคนที่ Admin ตั้งเป็นผู้อนุมัติใน Template (me.can_approve) แม้ role จะเป็นพนักงาน
  if (me.role === 'Approver' || me.role === 'Admin' || me.can_approve) {
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
  // Report: ทุกคนเห็นเมนู (Approver/Admin = ทุกคน, พนักงาน = ของตัวเอง)
  items = items.concat(MENU.tail.filter(item => (item.href !== '/customers' || me.role === 'Admin')));
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
    if (it.group) open[it.group] = it.items.some(sub => sub.href.split('?')[0] === pathname);
  }
  return open;
}

// รายการที่ Admin เปลี่ยนชื่อได้ที่ Settings > จัดการหน้า/หัวข้อ (key = menu.<href|group>) — ใช้เป็น catalog ของหน้า Admin ด้วย
export const MENU_CATALOG = [
  ...MENU.common.map(i => ({ key: `menu.${i.href}`, label: i.label, group: 'เมนูหลัก' })),
  { key: 'menu.visit', label: 'Visit', group: 'กลุ่มเมนู' }, { key: 'menu.leave', label: 'ลา', group: 'กลุ่มเมนู' }, { key: 'menu.ot', label: 'OT', group: 'กลุ่มเมนู' },
  { key: 'menu.approvals', label: 'รออนุมัติ', group: 'กลุ่มเมนู' },
  ...VISIT_STAGES.map(i => ({ key: `menu.${i.href}`, label: i.label, group: 'เมนูย่อย Visit' })),
  ...LEAVE_STAGES.map(i => ({ key: `menu.${i.href}`, label: i.label, group: 'เมนูย่อย ลา' })),
  ...OT_STAGES.map(i => ({ key: `menu.${i.href}`, label: i.label, group: 'เมนูย่อย OT' })),
  { key: 'menu./approve-requests', label: 'Approve Requests', group: 'เมนูรออนุมัติ' },
  { key: 'menu./approve-ot', label: 'อนุมัติ OT', group: 'เมนูรออนุมัติ' },
  { key: 'menu./approve-leave', label: 'อนุมัติการลา', group: 'เมนูรออนุมัติ' },
  { key: 'menu./my-team', label: 'ทีมของฉัน', group: 'เมนูหลัก' },
  ...MENU.tail.map(i => ({ key: `menu.${i.href}`, label: i.label, group: 'เมนูหลัก' })),
];

export default function Layout({ title, children }) {
  const { pc } = usePageContent();
  const menuLabel = (it) => pc(`menu.${it.group || it.href}`, it.label);
  const { me, badgeCounts, logout, refreshMyVisit } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // items ต้องคำนวณก่อน return null (เพื่อให้ useState ถัดไปถูกเรียกลำดับเดิมทุกครั้ง ตามกฎของ React Hooks)
  const items = me ? buildMenu(me) : [];
  const [openGroups, setOpenGroups] = useState(() => initialOpenGroups(items, location.pathname));

  // เปลี่ยนหน้า (เช่น สร้าง/ส่งคำขอเสร็จแล้วกลับมา) -> อัปเดตตัวเลขขั้นตอนของ Visit ที่เมนูซ้าย
  useEffect(() => { if (me && refreshMyVisit) refreshMyVisit(); /* eslint-disable-next-line */ }, [location.pathname, location.search, me && me.id]);

  // มือถือ: ตารางแสดงเป็นการ์ด ต้องมี data-label ที่ทุกช่อง — เติมให้อัตโนมัติจากหัวตาราง (เฉพาะช่องที่ยังไม่มี) ไม่ต้องแก้ทีละหน้า
  useEffect(() => {
    const root = document.querySelector('.content');
    if (!root) return undefined;
    const fill = () => {
      root.querySelectorAll('table').forEach(t => {
        const ths = t.querySelectorAll('thead th');
        if (!ths.length) return;
        const heads = Array.from(ths, th => th.textContent.trim());
        t.querySelectorAll('tbody tr').forEach(tr => {
          if (tr.children.length !== heads.length) return; // แถวที่ใช้ colSpan (เช่น "ไม่มีข้อมูล") ข้าม
          Array.from(tr.children).forEach((td, i) => { if (td.tagName === 'TD' && !td.hasAttribute('data-label')) td.setAttribute('data-label', /^(จัดการ|การจัดการ|actions?|action)$/i.test(heads[i]) ? '' : heads[i]); });
        });
      });
    };
    fill();
    let timer;
    const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(fill, 60); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); clearTimeout(timer); };
  }, [location.pathname, location.search]);

  if (!me) return null; // ProtectedRoute จัดการ redirect ให้แล้ว

  const closeSidebar = () => setSidebarOpen(false);
  const toggleGroup = (g) => setOpenGroups(prev => ({ ...prev, [g]: !prev[g] }));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const pageTitle = pc(`page.${location.pathname}`, title);
  const isApprover = me.role === 'Approver' || me.role === 'Admin' || me.can_approve || me.can_approve_leave;
  const pendingAll = (badgeCounts.pending || 0) + (badgeCounts.pendingOT || 0) + (badgeCounts.pendingLeave || 0);
  const ic = (d) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
  const bottomItems = [
    { to: '/dashboard', label: 'หน้าหลัก', match: ['/dashboard'], icon: ic(<><path d="M4 11 12 4l8 7" /><path d="M6 10v9.5h12V10" /></>) },
    { to: canAccessVisit(me) ? '/my-requests' : '/my-leave', label: 'คำขอของฉัน', match: ['/my-requests', '/my-leave', '/my-ot', '/visit-request', '/leave-request', '/ot-request'], icon: ic(<><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4.5h6M9 10h6M9 14h6" /></>), badge: (badgeCounts.vRevision || 0) + (badgeCounts.lRevision || 0) + (badgeCounts.oRevision || 0) },
    ...(isApprover ? [{ to: me.role === 'Employee' && !me.can_approve && me.can_approve_leave ? '/approve-leave' : '/approve-requests', label: 'อนุมัติ', match: ['/approve-requests', '/approve-leave', '/approve-ot'], icon: ic(<><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.3 2.4 2.4 4.6-5" /></>), badge: pendingAll }] : []),
    me.can_evaluate
      ? { to: '/my-team', label: 'ทีมของฉัน', match: ['/my-team', '/team'], icon: ic(<><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c0-3.2 2.7-5.3 6-5.3s6 2.1 6 5.3" /><path d="M16 5.5a3 3 0 0 1 0 6M18 14.6c1.7.7 3 2.2 3 4.9" /></>) }
      : { to: '/calendar', label: 'ปฏิทิน', match: ['/calendar'], icon: ic(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3.5v3M16 3.5v3" /></>) },
    { to: '/profile', label: 'โปรไฟล์', match: ['/profile'], icon: ic(<><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></>) }
  ];

  return (
    <div className="app">
      <div className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">T</div>
          <div className="brand-text"><b>TRISAK</b><span>VISIT MANAGEMENT</span></div>
        </div>
        <Link to="/profile" className="side-profile" onClick={closeSidebar} title="ดูโปรไฟล์ของฉัน">
          <img src={me.avatar_url || '/img/avatar1.png'} onError={(e) => { e.target.style.visibility = 'hidden'; }} />
          <div className="side-profile-text">
            <b>{me.full_name}</b>
            <span>{me.position || ROLE_TH[me.role]}</span>
            <em>{(() => {
              // ซ่อนแผนกที่ชื่อซ้ำกับตำแหน่ง (เช่น ตำแหน่ง "Sales" แผนก "Sales") ไม่ให้แสดงซ้ำ
              const pos = String(me.position || '').trim().toLowerCase();
              const depts = String(me.department || '').split(',').map(d => d.trim()).filter(d => d && d.toLowerCase() !== pos);
              return `${ROLE_TH[me.role]}${depts.length ? ` · ${depts.join(', ')}` : ''}`;
            })()}</em>
          </div>
          <span className="side-profile-go">{'\u203A'}</span>
        </Link>
        <ul className="nav">
          {items.map((it, i) => {
            if (it.divider) return <li key={`div-${i}`} className="nav-divider">{it.divider}</li>;

            if (it.group) {
              const isOpen = !!openGroups[it.group];
              const activeInside = it.items.some(sub => isNavActive(sub.href, location));
              const groupBadge = it.items.reduce((sum, sub) => sum + (sub.badgeKey && (!sub.badgeTone || sub.badgeTone === 'warn') ? (badgeCounts[sub.badgeKey] || 0) : 0), 0);
              return (
                <li key={it.group} className="nav-group">
                  <a className={`nav-group-head ${activeInside ? 'active-inside' : ''}`} onClick={() => toggleGroup(it.group)}>
                    <span className="icon" dangerouslySetInnerHTML={{ __html: it.icon }} />
                    {menuLabel(it)}
                    {groupBadge > 0 && <span className="badge" style={{ background: 'var(--red-600)', color: '#fff' }}>{groupBadge}</span>}
                    <span className={`chev ${isOpen ? 'open' : ''}`}>{'\u203A'}</span>
                  </a>
                  <ul className={`nav-subitems ${isOpen ? 'open' : ''}`} style={isOpen ? { maxHeight: it.items.length * 42 + 8 } : undefined}>
                    {it.items.map(sub => {
                      const subActive = isNavActive(sub.href, location) ? 'active' : '';
                      const subBadge = sub.badgeKey && badgeCounts[sub.badgeKey] > 0;
                      return (
                        <li key={sub.href}>
                          <Link to={sub.href} className={subActive} onClick={closeSidebar}>
                            <span className="icon" dangerouslySetInnerHTML={{ __html: sub.icon }} />
                            {menuLabel(sub)}
                            {subBadge && <span className="badge" style={BADGE_STYLE[sub.badgeTone] || { background: 'var(--red-600)', color: '#fff' }}>{badgeCounts[sub.badgeKey]}</span>}
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
                  {menuLabel(it)}
                  {badge && <span className="badge" style={{ background: 'var(--red-600)', color: '#fff' }}>{badgeCounts[it.badgeKey]}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <button type="button" className="side-logout" onClick={handleLogout}>{'\u23FB'} ออกจากระบบ</button>
      </aside>
      <div className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} title="เมนู">
              {'\u2630'}
            </button>
            <Link to="/dashboard" className="topbar-brand" aria-label="หน้าหลัก">
              <span className="brand-mark">T</span>
              <span className="tb-text"><b>TRISAK</b><small>Visit Management System</small></span>
            </Link>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-right">
            <NotificationBell />
            <Link to="/profile" className="topbar-avatar" aria-label="โปรไฟล์ของฉัน">
              <img src={me.avatar_url || '/img/avatar1.png'} alt="" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
            </Link>
            <div className="topbar-user" style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>
              <img src={me.avatar_url || '/img/avatar1.png'} onError={(e) => { e.target.style.display = 'none'; }} />
              <div>
                <b>{me.full_name}</b>
                <span>{me.position || ROLE_TH[me.role]}</span>
              </div>
            </div>
            <button className="btn btn-outline btn-sm topbar-logout" onClick={handleLogout}>ออกจากระบบ</button>
          </div>
        </div>
        <div className="content">
          <h2 className="m-pagetitle">{pageTitle}</h2>
          {children}
        </div>
      </div>

      {/* แถบเมนูล่างสำหรับมือถือ (ซ่อนบนจอกว้าง) */}
      <nav className="bottom-nav" aria-label="เมนูลัด">
        {bottomItems.map(b => {
          const on = b.match.some(m => location.pathname === m || location.pathname.startsWith(m + '/'));
          return (
            <Link key={b.to} to={b.to} className={on ? 'on' : ''} onClick={closeSidebar}>
              <span className="bn-ico" aria-hidden="true">{b.icon}{b.badge > 0 && <i className="bn-badge">{b.badge > 99 ? '99+' : b.badge}</i>}</span>
              <span className="bn-label">{b.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
