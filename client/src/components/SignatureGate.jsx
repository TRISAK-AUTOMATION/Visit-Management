// client/src/components/SignatureGate.jsx - ถามให้ตั้งลายเซ็นก่อน "อนุมัติ" หรือ "ส่งคำขอ" ถ้ายังไม่มีลายเซ็น (ทำครั้งเดียวแล้วระบบจำไว้)
// ใช้: const { ensureSignature, gate } = useSignatureGate();  ...  if (!(await ensureSignature('approve'))) return;  ...  {gate}
//   ได้ true  = ไปต่อได้ (มีลายเซ็นแล้ว / เพิ่งตั้งเสร็จ / กด "ข้ามไปก่อน")
//   ได้ false = ผู้ใช้ปิดหน้าต่าง -> ยกเลิกการกดครั้งนั้น
// กด "ข้ามไปก่อน" แล้วจะไม่ถามซ้ำจนกว่าจะปิดเบราว์เซอร์ (เอกสารจะแสดงชื่อพร้อมวันเวลาแทนลายเซ็น)
import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import SignatureEditor from './SignatureEditor';

const SKIP_KEY = 'sig_gate_skipped';
// แยกตามผู้ใช้ (กันค่าค้างเมื่อออกจากระบบแล้วเข้าด้วยบัญชีอื่น) — ไม่มี key = ยังไม่รู้ โหลดจาก server ครั้งแรกที่ต้องใช้
const hasSig = {};
export const markSignatureSet = (userId, v) => { if (userId) hasSig[userId] = v; };

const skipped = () => { try { return sessionStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } };
const setSkipped = () => { try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* ไม่เป็นไร */ } };

const TEXT = {
  approve: { title: 'ตั้งลายเซ็นก่อนอนุมัติ', desc: 'ลายเซ็นนี้จะไปอยู่ในช่องลงนามของเอกสารที่คุณอนุมัติ ตั้งครั้งเดียว ครั้งต่อไปไม่ต้องทำอีก' },
  submit: { title: 'ตั้งลายเซ็นก่อนส่งคำขอ', desc: 'ลายเซ็นนี้จะไปอยู่ในช่อง "ผู้ยื่นคำร้อง" ของเอกสาร ตั้งครั้งเดียว ครั้งต่อไปไม่ต้องทำอีก' }
};

export function useSignatureGate() {
  const { me } = useAuth();
  const toast = useToast();
  const [ask, setAsk] = useState(null); // 'approve' | 'submit' | null
  const resolver = useRef(null);

  const finish = (ok) => { setAsk(null); const r = resolver.current; resolver.current = null; if (r) r(ok); };

  const ensureSignature = useCallback(async (purpose = 'approve') => {
    const uid = me?.id;
    if (hasSig[uid]) return true;
    if (hasSig[uid] === undefined) {
      try { const r = await api.get('/api/users/me/signature'); hasSig[uid] = !!r.data_url; }
      catch { return true; } // เช็คไม่ได้ ไม่บล็อกงาน
      if (hasSig[uid]) return true;
    }
    if (skipped()) return true;
    return new Promise((resolve) => { resolver.current = resolve; setAsk(purpose); });
  }, [me]);

  const t = TEXT[ask] || TEXT.approve;
  const gate = ask ? createPortal(
    <div className="modal-bg" style={{ zIndex: 160 }} onClick={(e) => { if (e.target === e.currentTarget) finish(false); }}>
      <div className="modal sgg" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="modal-head"><h3>{t.title}</h3><button className="modal-close" onClick={() => finish(false)} aria-label="ปิด">×</button></div>
        <div className="modal-body">
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t.desc}</p>
          <SignatureEditor
            compact
            defaultName={me?.full_name || ''}
            onSaved={() => { hasSig[me?.id] = true; toast('บันทึกลายเซ็นแล้ว', 'success'); finish(true); }}
            onError={(m) => toast(m, 'error')}
          />
          <div className="sgg-skip">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSkipped(); finish(true); }}>ข้ามไปก่อน</button>
            <span className="muted">เอกสารจะแสดงชื่อของคุณพร้อมวันเวลาแทนลายเซ็น</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return { ensureSignature, gate };
}
