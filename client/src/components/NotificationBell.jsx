// กระดิ่งแจ้งเตือน: กดแล้วเปิดแผงเล็กใต้กระดิ่ง (ไม่ต้องเปลี่ยนหน้า) + มีป๊อปอัพเล็กๆ มุมขวาบนเมื่อมีแจ้งเตือนใหม่เข้ามา
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import './notification-bell.css';

const ICONS = { new_request: '📝', approved: '✅', rejected: '❌', revision: '✏️', reminder: '🔔', leave_new_request: '🏖', leave_approved: '✅', leave_rejected: '❌', leave_revision: '✏️', ot_new_request: '⏰', ot_approved: '✅', ot_rejected: '❌', ot_revision: '✏️' };

// แจ้งเตือนแต่ละประเภทพาไปหน้าที่เกี่ยวข้อง
function targetOf(n) {
  const t = n.type || '';
  const mod = t.startsWith('leave_') ? 'leave' : t.startsWith('ot_') ? 'ot' : 'visit';
  const kind = t.replace(/^(leave_|ot_)/, '');
  const approve = { visit: '/approve-requests', leave: '/approve-leave', ot: '/approve-ot' }[mod];
  const mine = { visit: '/my-requests', leave: '/my-leave', ot: '/my-ot' }[mod];
  if (kind === 'new_request') return `${approve}?status=pending`;
  if (['approved', 'rejected', 'revision'].includes(kind)) return `${mine}?status=${kind}`;
  return '/notifications';
}

function ago(s) {
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (isNaN(m) || m < 0) return '';
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  if (m < 1440) return `${Math.floor(m / 60)} ชม.ที่แล้ว`;
  return `${Math.floor(m / 1440)} วันที่แล้ว`;
}

export default function NotificationBell() {
  const { badgeCounts, refreshBadges } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(false);
  const [pop, setPop] = useState(null);
  const box = useRef(null);
  const unread = badgeCounts.unread || 0;

  const load = useCallback(async () => {
    try { const { notifications } = await api.get('/api/notifications'); setItems(notifications.slice(0, 8)); setErr(false); }
    catch (e) { setErr(true); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { setOpen(false); }, [loc.pathname, loc.search]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // ป๊อปอัพมุมจอเมื่อมีแจ้งเตือนใหม่ (สัญญาณมาจาก AuthContext ตอนโพลล์เจอจำนวนที่ยังไม่อ่านเพิ่มขึ้น)
  useEffect(() => {
    let timer;
    const onNew = (e) => {
      setPop(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setPop(null), 7000);
      if (open) load();
    };
    window.addEventListener('trisak:new-notif', onNew);
    return () => { window.removeEventListener('trisak:new-notif', onNew); clearTimeout(timer); };
  }, [open, load]);

  const openItem = async (n) => {
    setOpen(false); setPop(null);
    if (!n.is_read) { try { await api.post(`/api/notifications/${n.id}/read`); } catch (e) { /* ignore */ } refreshBadges(); }
    nav(targetOf(n));
  };
  const markAll = async () => {
    try { await api.post('/api/notifications/read-all'); setItems(l => (l || []).map(n => ({ ...n, is_read: 1 }))); refreshBadges(); } catch (e) { /* ignore */ }
  };

  return (
    <div className="nb" ref={box}>
      <button className={`icon-btn nb-btn ${unread > 0 ? 'has-new' : ''}`} onClick={() => { setPop(null); setOpen(o => !o); }}
        title="การแจ้งเตือน" aria-haspopup="true" aria-expanded={open} aria-label={`การแจ้งเตือน${unread ? ` ยังไม่อ่าน ${unread} รายการ` : ''}`}>
        {'🔔'}
        {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="nb-panel" role="dialog" aria-label="การแจ้งเตือน">
          <div className="nb-head">
            <b>การแจ้งเตือน</b>
            <button type="button" className="nb-link" onClick={markAll} disabled={!unread}>อ่านทั้งหมดแล้ว</button>
          </div>
          <div className="nb-list">
            {items === null && !err && <div className="nb-empty">กำลังโหลด…</div>}
            {err && <div className="nb-empty">โหลดไม่สำเร็จ <button type="button" className="nb-link" onClick={load}>ลองใหม่</button></div>}
            {items && !items.length && <div className="nb-empty">ไม่มีการแจ้งเตือน</div>}
            {items && items.map(n => (
              <button type="button" key={n.id} className={`nb-item ${n.is_read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <span className="nb-ico" aria-hidden="true">{ICONS[n.type] || '🔔'}</span>
                <span className="nb-txt"><span className="nb-msg">{n.message}</span><span className="nb-time">{ago(n.created_at)}</span></span>
                {!n.is_read && <span className="nb-dot" aria-label="ยังไม่อ่าน" />}
              </button>
            ))}
          </div>
          <button type="button" className="nb-foot" onClick={() => { setOpen(false); nav('/notifications'); }}>ดูการแจ้งเตือนทั้งหมด →</button>
        </div>
      )}

      {pop && !open && (
        <div className="nb-pop" role="status" onClick={() => { const n = pop.latest; setPop(null); n ? openItem(n) : setOpen(true); }}>
          <span className="nb-ico" aria-hidden="true">{pop.latest ? (ICONS[pop.latest.type] || '🔔') : '🔔'}</span>
          <span className="nb-txt">
            <b>มีแจ้งเตือนใหม่{pop.added > 1 ? ` ${pop.added} รายการ` : ''}</b>
            {pop.latest && <span className="nb-msg">{pop.latest.message}</span>}
          </span>
          <button type="button" className="nb-x" aria-label="ปิด" onClick={(e) => { e.stopPropagation(); setPop(null); }}>&times;</button>
        </div>
      )}
    </div>
  );
}
