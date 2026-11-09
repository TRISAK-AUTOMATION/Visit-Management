// client/src/components/CustomerSignModal.jsx - ให้ลูกค้าเซ็นรับทราบบนหน้าจอเครื่องพนักงานตอนเข้า Visit
// พนักงานกด "ให้ลูกค้าเซ็น" -> ส่งเครื่องให้ลูกค้า -> ลูกค้าเซ็นด้วยนิ้ว/เมาส์ + ระบุชื่อ -> บันทึกผูกกับใบ Visit (แสดงใน PDF ช่อง "ลูกค้ารับทราบ")
import React, { useEffect, useRef, useState } from 'react';
import { api, fmtDate, fmtDateTime } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const MAX_EXPORT_W = 600;      // ย่อภาพก่อนส่ง ให้ไฟล์เล็ก (server รับไม่เกิน ~400KB)
const MAX_DATA_URL_LEN = 380000;

export default function CustomerSignModal({ request, onClose, onChanged }) {
  const toast = useToast();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [existing, setExisting] = useState(undefined); // undefined = กำลังโหลด, null = ยังไม่มี
  const [editing, setEditing] = useState(false);       // true = กำลังเซ็นใหม่
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const locked = !!request.completed_at; // แจ้ง Visit Completed แล้ว = ล็อกถาวร

  const load = async () => {
    try {
      const d = await api.get(`/api/visit-requests/${request.id}`);
      setExisting(d.customer_signature || null);
      setEditing(!d.customer_signature);
    } catch (err) { toast(err.message, 'error'); setExisting(null); setEditing(true); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // ตั้งขนาด canvas ตามหน้าจอจริง (คมบนจอ retina) ทุกครั้งที่เปิดโหมดเซ็น
  useEffect(() => {
    if (!editing || locked) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const ctx = cv.getContext('2d');
    ctx.lineWidth = 2.6 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b2a6b';
    setHasInk(false);
  }, [editing, locked, existing]);

  const pos = (e) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (cv.width / rect.width), y: (e.clientY - rect.top) * (cv.height / rect.height) };
  };
  const down = (e) => {
    e.preventDefault();
    const cv = canvasRef.current;
    cv.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    // แตะครั้งเดียวให้เป็นจุด
    const ctx = cv.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(last.current.x + 0.01, last.current.y + 0.01);
    ctx.stroke();
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const up = () => { drawing.current = false; };

  const clearPad = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    setHasInk(false);
  };

  // ย่อภาพเป็น PNG พื้นโปร่งใส ความกว้างไม่เกิน MAX_EXPORT_W
  const exportPng = () => {
    const cv = canvasRef.current;
    let w = Math.min(cv.width, MAX_EXPORT_W);
    for (let i = 0; i < 3; i++) {
      const h = Math.round(cv.height * (w / cv.width));
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      out.getContext('2d').drawImage(cv, 0, 0, w, h);
      const url = out.toDataURL('image/png');
      if (url.length <= MAX_DATA_URL_LEN) return url;
      w = Math.round(w * 0.7);
    }
    return null;
  };

  const canSave = hasInk && name.trim() && agree && !saving;
  // บอกให้ชัดว่ายังขาดอะไร (เดิมปุ่มแค่จางลง ผู้ใช้ไม่รู้ว่าทำไมกดไม่ได้ แล้วปิดหน้าต่างไปโดยลายเซ็นยังไม่ถูกบันทึก)
  const missing = [!hasInk && 'เซ็นชื่อในกรอบ', !name.trim() && 'กรอกชื่อ-นามสกุลผู้เซ็น', !agree && 'ติ๊กยืนยันข้อมูล'].filter(Boolean);
  const unsaved = editing && !locked && (hasInk || name.trim());
  const requestClose = () => {
    if (unsaved && !saving && !window.confirm('ลายเซ็นยังไม่ได้บันทึก (ต้องกด "ยืนยันลายเซ็น" ก่อน)\nต้องการปิดและทิ้งลายเซ็นนี้หรือไม่?')) return;
    onClose();
  };

  const save = async () => {
    if (!canSave) return;
    const data_url = exportPng();
    if (!data_url) { toast('ลายเซ็นมีขนาดใหญ่เกินไป กรุณาล้างแล้วเซ็นใหม่ให้เรียบง่ายขึ้น', 'error'); return; }
    setSaving(true);
    try {
      await api.post(`/api/visit-requests/${request.id}/customer-signature`, { data_url, signer_name: name.trim(), signer_title: title.trim() });
      toast('บันทึกลายเซ็นลูกค้าแล้ว', 'success');
      if (onChanged) onChanged();
      await load();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm('ลบลายเซ็นลูกค้าของใบนี้หรือไม่?')) return;
    try {
      await api.del(`/api/visit-requests/${request.id}/customer-signature`);
      toast('ลบลายเซ็นลูกค้าแล้ว', 'success');
      if (onChanged) onChanged();
      setName(''); setTitle(''); setAgree(false);
      await load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const fieldStyle = { width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: 16 };

  return (
    <div className="modal-bg" style={{ zIndex: 400 }} onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-head">
          <h3>ลายเซ็นลูกค้า · {request.code}</h3>
          <button type="button" className="modal-close" onClick={requestClose} aria-label="ปิด">&times;</button>
        </div>
        <div className="modal-body">
          {existing === undefined && <div className="muted">กำลังโหลด...</div>}

          {existing && !editing && (
            <>
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 8, textAlign: 'center' }}>
                <img src={existing.data_url} alt="ลายเซ็นลูกค้า" style={{ maxWidth: '100%', maxHeight: 140 }} />
              </div>
              <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.8 }}>
                <div><span className="muted">ผู้เซ็น</span> <b>{existing.signer_name}</b></div>
                {existing.signer_title && <div><span className="muted">ตำแหน่ง</span> {existing.signer_title}</div>}
                <div><span className="muted">เซ็นเมื่อ</span> {fmtDateTime(existing.signed_at)}</div>
              </div>
              {locked ? (
                <p className="muted" style={{ fontSize: 13 }}>คำขอนี้แจ้ง Visit Completed แล้ว ลายเซ็นถูกล็อก ไม่สามารถเปลี่ยนได้อีก</p>
              ) : (
                <div className="form-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-danger btn-sm" onClick={remove}>ลบลายเซ็น</button>
                  <button type="button" className="btn btn-outline" onClick={() => { setName(existing.signer_name); setTitle(existing.signer_title || ''); setAgree(false); setEditing(true); }}>ให้ลูกค้าเซ็นใหม่</button>
                </div>
              )}
            </>
          )}

          {existing !== undefined && editing && locked && (
            <p className="muted">คำขอนี้แจ้ง Visit Completed แล้ว จึงเพิ่มลายเซ็นไม่ได้อีก</p>
          )}

          {existing !== undefined && editing && !locked && (
            <>
              <div style={{ background: '#f4f6fb', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, lineHeight: 1.6 }}>
                ข้าพเจ้ารับทราบว่าพนักงาน <b>TRISAK Automation</b> ได้เข้าพบที่ <b>{request.customer_name || 'ลูกค้า'}</b>{' '}
                เมื่อวันที่ <b>{fmtDate(request.visit_date)}</b>
              </div>

              <div className="flex between" style={{ marginTop: 14, alignItems: 'baseline' }}>
                <b style={{ fontSize: 14 }}>เซ็นชื่อในกรอบด้านล่าง</b>
                <button type="button" className="btn btn-outline btn-sm" onClick={clearPad}>ล้างลายเซ็น</button>
              </div>
              <div style={{ position: 'relative', marginTop: 6 }}>
                <canvas
                  ref={canvasRef}
                  aria-label="กรอบเซ็นชื่อ ใช้นิ้วหรือเมาส์เซ็นชื่อ"
                  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                  style={{ display: 'block', width: '100%', height: 190, border: '2px solid #2f5bff', borderRadius: 12, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
                />
                {!hasInk && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5b6785', fontSize: 14, pointerEvents: 'none' }}>เซ็นชื่อที่นี่</div>}
                <div style={{ position: 'absolute', left: 18, right: 18, bottom: 30, height: 1, background: '#c3cce3', pointerEvents: 'none' }} />
              </div>

              <div style={{ marginTop: 12 }}>
                <label htmlFor="cs-name" style={{ fontSize: 13, fontWeight: 600 }}>ชื่อ-นามสกุลผู้เซ็น <span style={{ color: '#d93a30' }}>*</span></label>
                <input id="cs-name" type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} style={fieldStyle} autoComplete="off" />
              </div>
              <div style={{ marginTop: 10 }}>
                <label htmlFor="cs-title" style={{ fontSize: 13, fontWeight: 600 }}>ตำแหน่ง</label>
                <input id="cs-title" type="text" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} autoComplete="off" />
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, fontSize: 14 }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 22, height: 22, flex: 'none', margin: 0 }} />
                <span>ข้าพเจ้ายืนยันว่าข้อมูลการเข้าพบข้างต้นถูกต้อง</span>
              </label>

              {missing.length > 0 && !saving && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#8a5a00', background: '#fff7e6', border: '1px solid #f5d9a0', borderRadius: 9, padding: '8px 12px' }}>
                  ยังบันทึกไม่ได้ กรุณา{missing.join(' / ')} แล้วกด "ยืนยันลายเซ็น"
                </p>
              )}
              <div className="form-actions" style={{ marginTop: 14 }}>
                {existing && <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>ยกเลิก</button>}
                <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save} style={{ minHeight: 44 }}>
                  {saving ? 'กำลังบันทึก...' : 'ยืนยันลายเซ็น'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
