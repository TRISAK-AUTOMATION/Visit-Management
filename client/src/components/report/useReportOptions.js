// client/src/components/report/useReportOptions.js - โหลดตัวเลือกตัวกรอง/คอลัมน์ของรายงาน 1 ครั้งแล้วแชร์ให้ทุกหน้า
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

let cache = null;
let inflight = null;

export function loadReportOptions(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = api.get('/api/report/options').then((d) => { cache = d; return d; }).finally(() => { inflight = null; });
  }
  return inflight;
}

export default function useReportOptions() {
  const [opts, setOpts] = useState(cache);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadReportOptions().then((d) => { if (alive) setOpts(d); }).catch((e) => { if (alive) setError(e.message || 'ไม่สามารถโหลดตัวเลือกได้'); });
    return () => { alive = false; };
  }, []);
  return { opts, error };
}
