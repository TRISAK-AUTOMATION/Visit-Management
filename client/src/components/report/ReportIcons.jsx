// client/src/components/report/ReportIcons.jsx - ไอคอนเส้นแบบ SVG สำหรับหน้า Report (ไม่พึ่ง library เพิ่ม)
import React from 'react';

const P = {
  car: <><path d="M5 16V11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v5" /><path d="M3.5 16h17v2.2a.8.8 0 0 1-.8.8H18a.8.8 0 0 1-.8-.8V17.5M6.8 17.5v.7a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8V16" /><path d="M5 11h14" /><circle cx="7.8" cy="14" r=".9" fill="currentColor" stroke="none" /><circle cx="16.2" cy="14" r=".9" fill="currentColor" stroke="none" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3.5v3M16 3.5v3" /><path d="m9 15 2 2 4-4" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c0-3.2 2.7-5.3 6-5.3s6 2.1 6 5.3" /><path d="M16 5.5a3 3 0 0 1 0 6M18 14.6c1.7.7 3 2.2 3 4.9" /></>,
  building: <><rect x="5" y="3.5" width="9" height="17" rx="1.5" /><path d="M14 9h4.5A1.5 1.5 0 0 1 20 10.5v10M8.5 7.5h2M8.5 11h2M8.5 14.5h2M17 13h0M17 16.5h0" /></>,
  download: <><path d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v9.5h12V10" /></>,
  filter: <path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8L4 5Z" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5" /><path d="M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.3L20 15.5" /><path d="M20 20v-4.5h-4.5" /></>,
  sheet: <><path d="M6 3.5h8l4.5 4.5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14 3.5V8h4.5M8.5 12.5l5 5M13.5 12.5l-5 5" /></>,
  pdf: <><path d="M6 3.5h8l4.5 4.5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14 3.5V8h4.5M8.5 17.5v-4h1.3a1.2 1.2 0 0 1 0 2.4H8.5M12.5 13.5v4h.9a2 2 0 0 0 0-4h-.9" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8h0" /></>,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></>,
  sort: <path d="M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3" />
};

export default function RIcon({ name, size = 20, stroke = 1.8, className = '', style }) {
  return (
    <svg className={`rx-ico ${className}`} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name] || null}
    </svg>
  );
}
