// ลายเซ็นของฉัน — อัปโหลดครั้งเดียว ระบบฝังลงใน PDF คำขอ (ผู้ขอ/ผู้อนุมัติ) ให้อัตโนมัติ
// ปรับภาพฝั่งเบราว์เซอร์ก่อนส่ง: ย่อขนาด + ทำพื้นขาวให้โปร่งใส (PNG) ส่วนการตรวจไฟล์จริงทำที่ Backend อีกครั้ง
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';

const MAX_W = 600, MAX_H = 220;

function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    fr.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่ภาพที่เปิดได้'));
    img.src = src;
  });
}

// ย่อภาพ + ทำพื้นสีขาว/ใกล้ขาวให้โปร่งใส -> data URL PNG
async function prepare(file) {
  const img = await loadImage(await readFile(file));
  const k = Math.min(1, MAX_W / img.width, MAX_H / img.height);
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h); const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
    if (px[i + 3] > 0 && lum > 235) px[i + 3] = 0;           // พื้นขาว -> โปร่งใส
    else if (px[i + 3] > 0 && lum > 190) px[i + 3] = Math.round(px[i + 3] * (235 - lum) / 45); // ขอบนุ่ม
  }
  ctx.putImageData(d, 0, 0);
  return cv.toDataURL('image/png');
}

export default function SignatureCard() {
  const toast = useToast();
  const inputRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/users/me/signature').then(r => setUrl(r.data_url || null)).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { toast('เลือกไฟล์ภาพ PNG หรือ JPG เท่านั้น', 'error'); return; }
    if (file.size > 6 * 1024 * 1024) { toast('ไฟล์ใหญ่เกินไป (สูงสุด 6 MB)', 'error'); return; }
    setBusy(true);
    try {
      const dataUrl = await prepare(file);
      await api.put('/api/users/me/signature', { data_url: dataUrl });
      setUrl(dataUrl);
      toast('บันทึกลายเซ็นแล้ว จะแสดงใน PDF คำขอของคุณอัตโนมัติ', 'success');
    } catch (err) { toast(err.message || 'บันทึกลายเซ็นไม่สำเร็จ', 'error'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('ลบลายเซ็นของคุณออกจากระบบ? PDF ที่ออกต่อไปจะไม่มีลายเซ็น')) return;
    setBusy(true);
    try { await api.del('/api/users/me/signature'); setUrl(null); toast('ลบลายเซ็นแล้ว', 'success'); }
    catch (err) { toast(err.message || 'ลบไม่สำเร็จ', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="pd-card" aria-label="ลายเซ็นของฉัน">
      <div className="pd-card-head"><h3>ลายเซ็นของฉัน</h3></div>
      <div className="pd-sig">
        <div className={`pd-sig-box ${url ? 'has' : ''}`} aria-live="polite">
          {!loaded ? <span className="muted">กำลังโหลด…</span>
            : url ? <img src={url} alt="ลายเซ็นของคุณ" /> : <span className="muted">ยังไม่มีลายเซ็น</span>}
        </div>
        <p className="muted pd-sig-hint">ใช้ภาพเซ็นบนกระดาษขาว (PNG/JPG) พื้นขาวจะถูกทำให้โปร่งใสอัตโนมัติ ระบบจะฝังลงใน PDF ทั้งตอนเป็นผู้ขอและผู้อนุมัติ</p>
        <div className="pd-sig-actions">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={onPick} hidden />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
            {busy ? 'กำลังบันทึก…' : url ? 'เปลี่ยนลายเซ็น' : 'อัปโหลดลายเซ็น'}
          </button>
          {url && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>ลบ</button>}
        </div>
      </div>
    </section>
  );
}
