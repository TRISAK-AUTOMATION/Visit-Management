// ลายเซ็นของฉัน — ตั้งครั้งเดียว ระบบฝังลงในเอกสาร/PDF คำขอ (ผู้ขอ/ผู้อนุมัติ) ให้อัตโนมัติ
// ตั้งได้ 3 วิธี: เซ็นบนจอ / พิมพ์ชื่อ / อัปโหลดรูป (ดู components/SignatureEditor.jsx)
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import { useAuth } from '../../lib/AuthContext';
import SignatureEditor from '../SignatureEditor';
import { markSignatureSet } from '../SignatureGate';

export default function SignatureCard() {
  const toast = useToast();
  const { me } = useAuth();
  const [url, setUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/users/me/signature').then(r => setUrl(r.data_url || null)).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const remove = async () => {
    if (!window.confirm('ลบลายเซ็นของคุณออกจากระบบ? เอกสารจะแสดงเป็นชื่อแทนลายเซ็น')) return;
    setBusy(true);
    try { await api.del('/api/users/me/signature'); setUrl(null); markSignatureSet(me?.id, false); toast('ลบลายเซ็นแล้ว', 'success'); }
    catch (err) { toast(err.message || 'ลบไม่สำเร็จ', 'error'); }
    finally { setBusy(false); }
  };

  const showEditor = editing || (loaded && !url);
  return (
    <section className="pd-card" aria-label="ลายเซ็นของฉัน">
      <div className="pd-card-head"><h3>ลายเซ็นของฉัน</h3></div>
      <div className="pd-sig">
        {url && (
          <div className="pd-sig-box has" aria-live="polite"><img src={url} alt="ลายเซ็นของคุณ" /></div>
        )}
        {!loaded && <div className="pd-sig-box"><span className="muted">กำลังโหลด…</span></div>}
        {loaded && !url && <p className="muted pd-sig-hint">ยังไม่มีลายเซ็น — ตอนนี้เอกสารจะแสดงชื่อของคุณแทนลายเซ็น ตั้งลายเซ็นได้ด้านล่าง</p>}
        {showEditor ? (
          <SignatureEditor
            defaultName={me?.full_name || ''}
            onSaved={(d) => { setUrl(d); setEditing(false); markSignatureSet(me?.id, true); toast('บันทึกลายเซ็นแล้ว จะแสดงในเอกสารคำขอของคุณอัตโนมัติ', 'success'); }}
            onError={(m) => toast(m, 'error')}
          />
        ) : (
          <>
            <p className="muted pd-sig-hint">ระบบจะฝังลายเซ็นนี้ลงในเอกสารทั้งตอนเป็นผู้ขอและผู้อนุมัติ</p>
            <div className="pd-sig-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => setEditing(true)}>เปลี่ยนลายเซ็น</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>ลบ</button>
            </div>
          </>
        )}
        {editing && url && <div className="pd-sig-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>ยกเลิก</button></div>}
      </div>
    </section>
  );
}
