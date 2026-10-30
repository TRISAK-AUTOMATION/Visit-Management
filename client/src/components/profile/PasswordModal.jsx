import React, { useState } from 'react';
import Modal from './Modal';
import { api } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';

export default function PasswordModal({ onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/api/users/me/password', pw);
      toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
      onClose();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };
  return (
    <Modal title="เปลี่ยนรหัสผ่าน" onClose={onClose} width={420} labelId="pd-pw-title">
      <form onSubmit={submit}>
        <div className="form-group"><label htmlFor="pw-cur">รหัสผ่านปัจจุบัน</label><input id="pw-cur" type="password" autoComplete="current-password" value={pw.current_password} onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} required /></div>
        <div className="form-group"><label htmlFor="pw-new">รหัสผ่านใหม่</label><input id="pw-new" type="password" autoComplete="new-password" value={pw.new_password} onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} required /></div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}</button>
        </div>
      </form>
    </Modal>
  );
}
