import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from './Modal';

export default function QuickActions({ canVisit, canReport = true }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const types = [
    canVisit && { to: '/visit-request', icon: '🚗', label: 'ขอ Visit', sub: 'ไปพบลูกค้า / งานนอกสถานที่' },
    { to: '/leave-request', icon: '🏖', label: 'ขอลา', sub: 'ลาพักร้อน / ลากิจ / ลาป่วย' },
    { to: '/ot-request', icon: '⏱', label: 'ขอ OT', sub: 'ทำงานล่วงเวลา' }
  ].filter(Boolean);
  return (
    <section className="pd-card" aria-label="เมนูลัด">
      <div className="pd-card-head"><h3>เมนูลัด</h3></div>
      <div className="pd-quick">
        <button type="button" className="pd-q primary" onClick={() => setOpen(true)}>＋ สร้างคำขอใหม่</button>
        <Link className="pd-q" to="/calendar">📅 ปฏิทิน</Link>
        {canReport && <Link className="pd-q" to="/report">📊 รายงาน</Link>}
        <Link className="pd-q" to="/settings">⚙ ตั้งค่า</Link>
      </div>
      {open && (
        <Modal title="สร้างคำขอใหม่" onClose={() => setOpen(false)} width={420} labelId="pd-new-title">
          <div className="pd-types">
            {types.map(t => (
              <button type="button" key={t.to} className="pd-type" onClick={() => { setOpen(false); nav(t.to); }}>
                <span aria-hidden="true">{t.icon}</span><b>{t.label}</b><small>{t.sub}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
