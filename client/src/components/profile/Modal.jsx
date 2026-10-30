// Modal เข้าถึงง่าย: Esc ปิด, focus trap, คืน focus เดิมเมื่อปิด, คลิกพื้นหลังปิด
import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, width = 520, labelId = 'pd-modal-title' }) {
  const ref = useRef(null);
  const prev = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    prev.current = document.activeElement;
    const el = ref.current;
    const vis = (x) => x.offsetParent !== null;
    const first = el && Array.from(el.querySelectorAll('input:not([type=file]),select,textarea')).find(vis);
    (first || (el && Array.from(el.querySelectorAll(FOCUSABLE)).find(vis)) || el).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
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
      if (prev.current && prev.current.focus) prev.current.focus();
    };
  }, []);

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pd-modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} style={{ width }}>
        <div className="modal-head">
          <h3 id={labelId}>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
