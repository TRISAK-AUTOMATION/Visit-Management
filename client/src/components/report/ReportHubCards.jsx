// components/report/ReportHubCards.jsx - การ์ดเลือกประเภทรายงาน (ใช้บนหน้า Dashboard) ตัวเลขมาจาก /api/report/hub
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import RIcon from './ReportIcons';
import CountUp from '../profile/CountUp';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { periodRange } from '../ReportParts';
import './report-ui.css';

export const PERIODS = [
  { v: 'month', label: 'เดือนนี้' },
  { v: 'quarter', label: 'ไตรมาสนี้' },
  { v: 'year', label: 'ปีนี้' }
];

export default function ReportHubCards({ period, baseDelay = 0 }) {
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const [from, to] = periodRange(period);
    setError('');
    let alive = true;
    api.get(`/api/report/hub?from=${from}&to=${to}`).then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(e.message || 'Unable to load report data.'); });
    return () => { alive = false; };
  }, [period]);

  const mgr = !!(data && data.can_view_all) || (me && ['Approver', 'Admin'].includes(me.role));
  const periodText = PERIODS.find(p => p.v === period).label;

  const cards = [
    {
      key: 'visit', to: '/report/visit', tone: 'blue', icon: 'car', title: 'Visit Report',
      th: 'รายงานการออกพบลูกค้า', desc: 'ดูข้อมูลลูกค้าที่พนักงานออกพบ ตามช่วงวันที่และรายละเอียดต่างๆ',
      stat: data ? data.visit.total : null, unit: 'ครั้ง', sub: data ? `${data.visit.companies} บริษัท · ${data.visit.employees} คน` : ''
    },
    {
      key: 'ot', to: '/report/ot', tone: 'orange', icon: 'clock', title: 'OT Report',
      th: 'รายงานการทำงานล่วงเวลา', desc: 'ดูข้อมูลการทำงานล่วงเวลาของพนักงาน ตามช่วงวันที่และรายละเอียดต่างๆ',
      stat: data ? data.ot.approved_hours : null, unit: 'ชม. ที่อนุมัติ', sub: data ? `${data.ot.total} รายการ · รออนุมัติ ${data.ot.pending}` : ''
    },
    {
      key: 'leave', to: '/report/leave', tone: 'green', icon: 'calendar', title: 'Leave Report',
      th: 'รายงานการลา', desc: 'ดูข้อมูลการลาของพนักงาน ตามช่วงวันที่และรายละเอียดต่างๆ',
      stat: data ? data.leave.approved_days : null, unit: 'วัน ที่อนุมัติ', sub: data ? `${data.leave.total} รายการ · รออนุมัติ ${data.leave.pending}` : ''
    },
    mgr ? {
      key: 'summary', to: '/report/summary', tone: 'purple', icon: 'users', title: 'Employee Summary',
      th: 'รายงานสรุปพนักงานทั้งหมด', desc: 'สรุปภาพรวมการทำงานของพนักงานทุกคน (Visit / OT / Leave / Late / Absent)',
      stat: data ? data.employees : null, unit: 'คน', sub: 'คลิกเพื่อดูสรุปรายบุคคล'
    } : {
      key: 'summary', to: me ? `/report/employee/${me.id}` : '/report', tone: 'purple', icon: 'user', title: 'My Summary',
      th: 'สรุปการทำงานของฉัน', desc: 'สรุปภาพรวม Visit / OT / Leave ของคุณเอง ตามช่วงวันที่ที่เลือก',
      stat: null, unit: '', sub: 'คลิกเพื่อดูรายงานของฉัน'
    }
  ];

  return (
    <>
      {error && <div className="rx-err" style={{ marginTop: 12 }}>{error}</div>}

      <div className="rx-hub">
        {cards.map((c, i) => (
          <Link key={c.key} to={c.to} className={`rx-hubcard tone-${c.tone} rx-rise`} style={{ '--i': baseDelay + i }}>
            <span className="rx-hubicon"><RIcon name={c.icon} size={26} /></span>
            <div className="rx-hubbody">
              <div className="rx-hubtitle">{c.title}</div>
              <div className="rx-hubth">{c.th}</div>
              <p className="rx-hubdesc">{c.desc}</p>
              <div className="rx-hubstat">
                {c.stat === null && c.key !== 'summary' ? <span className="rx-skel" style={{ width: 90, height: 26 }} />
                  : c.stat === null ? <span className="rx-hubgo">เปิดรายงาน</span>
                  : <><b><CountUp key={`${c.key}-${period}-${c.stat}`} value={c.stat} /></b><small>{c.unit}</small></>}
                {c.stat !== null && <span className="rx-hubperiod">{c.key === 'summary' ? 'ที่ใช้งานอยู่' : periodText}</span>}
              </div>
              {c.sub && <div className="rx-hubsub">{c.sub}</div>}
            </div>
            <span className="rx-hubarrow"><RIcon name="chevron" size={20} /></span>
          </Link>
        ))}
      </div>

      <div className="rx-tip rx-rise" style={{ '--i': baseDelay + 5 }}>
        <RIcon name="info" size={18} />
        <span>เมื่อเลือกประเภทรายงานแล้ว ระบบจะแสดงตัวกรองที่เหมาะสม และสามารถ <b>Export</b> ข้อมูลเป็น Excel หรือ PDF ได้{mgr ? '' : ' (เห็นเฉพาะข้อมูลของคุณเอง)'}</span>
        {data && data.pending > 0 && <span className="rx-tip-pill">รออนุมัติรวม {data.pending} รายการ · {periodText}</span>}
      </div>
    </>
  );
}
