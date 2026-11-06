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
  sort: <path d="M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3" />,
  layers: <><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" /><path d="m3.5 12.2 8.5 4.5 8.5-4.5M3.5 16.2 12 20.7l8.5-4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M4.5 7h15M9.5 7V4.8h5V7" /><path d="m6.5 7 .8 12.2a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L17.5 7M10 11v5.5M14 11v5.5" /></>,
  edit: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 7.5 3 3" /></>,
  shield: <><path d="M12 3.5 5 6.2v5.3c0 4.2 2.8 7.5 7 9 4.2-1.5 7-4.8 7-9V6.2l-7-2.7Z" /><path d="m9 12 2.2 2.2L15.2 10" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>,
  list: <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.2" /><path d="m4 7.5 8 6 8-6" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="2.8" /><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" /></>,
  flow: <><circle cx="5.5" cy="6.5" r="2.2" /><circle cx="18.5" cy="12" r="2.2" /><circle cx="5.5" cy="17.5" r="2.2" /><path d="M7.7 6.5h4.3a3 3 0 0 1 3 3v.3M7.7 17.5h4.3a3 3 0 0 0 3-3v-.3" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  tag: <><path d="M3.5 12V5.5a2 2 0 0 1 2-2H12l8.5 8.5a1.6 1.6 0 0 1 0 2.3l-6.2 6.2a1.6 1.6 0 0 1-2.3 0L3.5 12Z" /><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" /></>,
  file: <><path d="M6 3.5h8l4.5 4.5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14 3.5V8h4.5M8.5 13h7M8.5 16.5h5" /></>,
  arrowUp: <path d="M12 19V5m0 0-5 5m5-5 5 5" />,
  arrowDown: <path d="M12 5v14m0 0-5-5m5 5 5-5" />,
  warn: <><path d="M12 4 3 19.5h18L12 4Z" /><path d="M12 10v4.5M12 17.2h0" /></>,
  save: <><path d="M5 4.5h11l3.5 3.5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1Z" /><path d="M8 4.5v4.5h7V4.5M8 20v-6h8v6" /></>,
  bolt: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12l1-7Z" />,
  star: <path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7L12 4Z" />,
  chat: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.3-1.6-1.3-2.9 0-1 .8-1.8 1.8-1.8H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.7 3.5 12 3.5Z" /><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="11" cy="7.8" r="1" fill="currentColor" stroke="none" /><circle cx="15.2" cy="8.6" r="1" fill="currentColor" stroke="none" /></>,
  umbrella: <><path d="M3.5 12a8.5 8.5 0 0 1 17 0H3.5Z" /><path d="M12 12v6.2a1.8 1.8 0 0 0 3.6 0" /></>,
  badge: <><circle cx="12" cy="9" r="4.8" /><path d="m8.8 13.2-1.3 7 4.5-2.4 4.5 2.4-1.3-7" /></>
};

export default function RIcon({ name, size = 20, stroke = 1.8, className = '', style }) {
  return (
    <svg className={`rx-ico ${className}`} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name] || null}
    </svg>
  );
}
