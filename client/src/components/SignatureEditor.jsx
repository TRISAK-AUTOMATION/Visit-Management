// client/src/components/SignatureEditor.jsx - ตั้งลายเซ็นของตัวเองได้ 3 วิธี: เซ็นบนจอ / พิมพ์ชื่อ (สร้างเป็นลายมือ) / อัปโหลดรูป
// ทุกวิธีได้ผลเป็น PNG พื้นโปร่งใส แล้วบันทึกผ่าน PUT /api/users/me/signature (ที่เดียวกับที่ PDF ดึงไปใช้)
// ใช้ทั้งในหน้าโปรไฟล์ (SignatureCard) และหน้าต่างที่เด้งถามตอนกดอนุมัติ/ส่งคำขอ (SignatureGate)
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const MAX_EXPORT_W = 600, MAX_H = 220;
const MAX_DATA_URL_LEN = 380000; // server รับไม่เกิน ~400KB

// แบบตัวเขียนสำหรับ "พิมพ์ชื่อ" (ฟอนต์ฝังอยู่ในเว็บ ดู @font-face ใน style.css)
export const SCRIPT_FONTS = [
  { id: 'Charm', label: 'ลายมือ 1', css: "'TrisakCharm'", size: 64 },
  { id: 'Sriracha', label: 'ลายมือ 2', css: "'TrisakSriracha'", size: 56 }
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่ภาพที่เปิดได้'));
    img.src = src;
  });
}
const readFile = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
  fr.readAsDataURL(file);
});

// รูปที่อัปโหลด: ย่อ + ทำพื้นขาว/ใกล้ขาวให้โปร่งใส
async function prepareUpload(file) {
  const img = await loadImage(await readFile(file));
  const k = Math.min(1, MAX_EXPORT_W / img.width, MAX_H / img.height);
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h); const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
    if (px[i + 3] > 0 && lum > 235) px[i + 3] = 0;
    else if (px[i + 3] > 0 && lum > 190) px[i + 3] = Math.round(px[i + 3] * (235 - lum) / 45);
  }
  ctx.putImageData(d, 0, 0);
  return cv.toDataURL('image/png');
}

// ตัดขอบโปร่งใสรอบลายเซ็นออก (ให้ภาพพอดีเส้น ไม่ลอยเล็กอยู่กลางกรอบใหญ่) แล้วย่อให้ไฟล์เล็ก
function trimAndExport(src) {
  const ctx = src.getContext('2d');
  const { width: W, height: H } = src;
  const px = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  let k = Math.min(1, MAX_EXPORT_W / cw, MAX_H / ch);
  for (let i = 0; i < 4; i++) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
    out.getContext('2d').drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    if (url.length <= MAX_DATA_URL_LEN) return url;
    k *= 0.7;
  }
  return null;
}

// พิมพ์ชื่อ -> วาดด้วยฟอนต์ลายมือลง canvas
async function renderTyped(name, font) {
  try { await document.fonts.load(`${font.size}px ${font.css}`, name); } catch { /* ใช้ฟอนต์สำรอง */ }
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = `${font.size}px ${font.css}, cursive`;
  const w = Math.ceil(ctx.measureText(name).width) + 40;
  cv.width = Math.min(1600, w); cv.height = Math.round(font.size * 1.9);
  ctx.font = `${font.size}px ${font.css}, cursive`;
  ctx.fillStyle = '#1b2a6b';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 20, cv.height / 2);
  return trimAndExport(cv);
}

// onSaved(dataUrl) เรียกหลังบันทึกสำเร็จ / defaultName = ชื่อผู้ใช้ (ค่าเริ่มต้นของแท็บพิมพ์ชื่อ)
export default function SignatureEditor({ defaultName = '', onSaved, onError, compact = false }) {
  const [mode, setMode] = useState('draw');
  const [busy, setBusy] = useState(false);
  // เซ็นบนจอ
  const canvasRef = useRef(null), drawing = useRef(false), last = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  // พิมพ์ชื่อ
  const [typed, setTyped] = useState(defaultName);
  const [fontId, setFontId] = useState(SCRIPT_FONTS[0].id);
  const fileRef = useRef(null);

  useEffect(() => { setTyped(t => t || defaultName); }, [defaultName]);

  useEffect(() => {
    if (mode !== 'draw') return;
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr);
    const ctx = cv.getContext('2d');
    ctx.lineWidth = 2.6 * dpr; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a6b';
    setHasInk(false);
  }, [mode]);

  const pos = (e) => {
    const cv = canvasRef.current, r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
  };
  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true; last.current = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(last.current.x + 0.01, last.current.y + 0.01); ctx.stroke();
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d'), p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const up = () => { drawing.current = false; };
  const clearPad = () => { const cv = canvasRef.current; if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); setHasInk(false); };

  const save = async (dataUrl) => {
    if (!dataUrl) throw new Error('สร้างภาพลายเซ็นไม่สำเร็จ ลองใหม่อีกครั้ง');
    await api.put('/api/users/me/signature', { data_url: dataUrl });
    onSaved && onSaved(dataUrl);
  };
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { onError && onError(err.message || 'บันทึกลายเซ็นไม่สำเร็จ'); } finally { setBusy(false); }
  };

  const font = SCRIPT_FONTS.find(f => f.id === fontId) || SCRIPT_FONTS[0];
  const onPick = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { onError && onError('เลือกไฟล์ภาพ PNG หรือ JPG เท่านั้น'); return; }
    if (file.size > 6 * 1024 * 1024) { onError && onError('ไฟล์ใหญ่เกินไป (สูงสุด 6 MB)'); return; }
    run(async () => save(await prepareUpload(file)));
  };

  return (
    <div className={`sge ${compact ? 'compact' : ''}`}>
      <div className="sge-tabs" role="tablist">
        {[['draw', 'เซ็นบนจอ'], ['type', 'พิมพ์ชื่อ'], ['upload', 'อัปโหลดรูป']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>

      {mode === 'draw' && (
        <>
          <div className="sge-pad">
            <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="กรอบเซ็นชื่อ" />
            {!hasInk && <div className="sge-hint">ใช้นิ้วหรือเมาส์เซ็นชื่อที่นี่</div>}
            <div className="sge-line" />
          </div>
          <div className="sge-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={clearPad} disabled={busy || !hasInk}>ล้าง</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !hasInk} onClick={() => run(async () => save(trimAndExport(canvasRef.current)))}>{busy ? 'กำลังบันทึก…' : 'บันทึกลายเซ็น'}</button>
          </div>
        </>
      )}

      {mode === 'type' && (
        <>
          <input className="sge-input" value={typed} maxLength={60} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์ชื่อของคุณ" aria-label="ชื่อสำหรับลายเซ็น" />
          <div className="sge-fonts">
            {SCRIPT_FONTS.map(f => (
              <button key={f.id} type="button" className={`sge-font ${fontId === f.id ? 'on' : ''}`} onClick={() => setFontId(f.id)} aria-pressed={fontId === f.id}>
                <span style={{ fontFamily: f.css }}>{typed.trim() || 'ชื่อของคุณ'}</span>
                <small>{f.label}</small>
              </button>
            ))}
          </div>
          <div className="sge-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !typed.trim()} onClick={() => run(async () => save(await renderTyped(typed.trim(), font)))}>{busy ? 'กำลังบันทึก…' : 'ใช้ลายเซ็นนี้'}</button>
          </div>
        </>
      )}

      {mode === 'upload' && (
        <>
          <p className="muted sge-note">ใช้ภาพเซ็นบนกระดาษขาว (PNG/JPG) พื้นขาวจะถูกทำให้โปร่งใสอัตโนมัติ</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onPick} hidden />
          <div className="sge-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>{busy ? 'กำลังบันทึก…' : 'เลือกไฟล์รูปลายเซ็น'}</button>
          </div>
        </>
      )}
    </div>
  );
}
