// client/src/components/PopupModal.jsx — ป๊อปอัพมาตรฐานของระบบ (หัว gradient + อนิเมชันเด้งเข้า/ค่อยๆ หาย)
// เข้าถึงง่าย: Esc ปิด · คลิกพื้นหลังปิด · focus trap · คืน focus เดิมเมื่อปิด · ล็อกการเลื่อนของหน้าหลัง
import React, { useEffect, useRef, useState } from 'react';
import RIcon from './report/ReportIcons';
import './ui-kit.css';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function PopupModal({ title, subtitle, icon = 'layers', tone = 'blue', onClose, canClose, actions, footer, children, width, labelId = 'ux-modal-title' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [closing, setClosing] = useState(false);

  const requestClose = () => {
    if (closing) return;
    if (canClose && !canClose()) return; // เช่น ยืนยันก่อนปิดเมื่อมีการแก้ไขที่ยังไม่บันทึก
    setClosing(true);
    setTimeout(() => closeRef.current(), 150);
  };
  const reqRef = useRef(requestClose);
  reqRef.current = requestClose;

  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    el && el.focus();
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const oldOverflow = document.body.style.overflow;
    const oldPad = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); reqRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = Array.from(el.querySelectorAll(FOCUSABLE)).filter(x => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = oldOverflow;
      document.body.style.paddingRight = oldPad;
      if (prev && prev.focus) prev.focus();
    };
  }, []);

  return (
    <div className="ux-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className={`ux-modal${closing ? ' closing' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} style={width ? { width: Math.min(width, 1400) } : undefined}>
        <div className={`ux-modal-head tone-${tone}`}>
          <span className="ux-modal-ico"><RIcon name={icon} size={24} /></span>
          <div className="ux-modal-title">
            <h3 id={labelId}>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="ux-modal-actions">
            {actions}
            <button type="button" className="ux-modal-x" onClick={requestClose} aria-label="ปิด"><RIcon name="x" size={18} /></button>
          </div>
        </div>
        <div className="ux-modal-body">{children}</div>
        {footer ? <div className="ux-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
