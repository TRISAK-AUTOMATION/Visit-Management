// public/js/layout.js - เรนเดอร์ Sidebar/Topbar ตามสิทธิ์ผู้ใช้ (Role-based Menu)

const MENU = {
  common: [
    { href: '/dashboard.html', icon: '&#8962;', label: 'Dashboard' },
  ],
  Employee: [
    { href: '/visit-request.html', icon: '&#128221;', label: 'สร้างคำขอ Visit' },
    { href: '/my-requests.html', icon: '&#128203;', label: 'My Requests' },
  ],
  ApproverAdmin: [
    { href: '/visit-request.html', icon: '&#128221;', label: 'สร้างคำขอ Visit' },
    { href: '/my-requests.html', icon: '&#128203;', label: 'My Requests' },
    { href: '/approve-requests.html', icon: '&#9989;', label: 'Approve Requests', badgeKey: 'pending' },
  ],
  tail: [
    { href: '/calendar.html', icon: '&#128197;', label: 'ปฏิทิน' },
    { href: '/customers.html', icon: '&#128101;', label: 'Customer' },
    { href: '/report.html', icon: '&#128202;', label: 'Report' },
    { href: '/notifications.html', icon: '&#128276;', label: 'Notifications', badgeKey: 'unread' },
    { href: '/settings.html', icon: '&#9881;', label: 'ตั้งค่า' },
  ],
  admin: [
    { href: '/admin-users.html', icon: '&#128737;', label: 'จัดการผู้ใช้งาน' }
  ]
};

function buildMenu(role) {
  let items = [...MENU.common];
  if (role === 'Employee') items = items.concat(MENU.Employee);
  else items = items.concat(MENU.ApproverAdmin);
  items = items.concat(MENU.tail);
  if (role === 'Admin') items = items.concat(MENU.admin);
  return items;
}

async function renderLayout(pageTitle) {
  let me;
  try {
    const r = await api.get('/api/auth/me');
    me = r.user;
  } catch (e) {
    window.location.href = '/login.html';
    return null;
  }

  const badgeCounts = { pending: 0, unread: 0 };
  try {
    if (me.role !== 'Employee') {
      const pend = await api.get('/api/visit-requests?scope=pending&status=pending');
      badgeCounts.pending = pend.requests.length;
    }
    const notif = await api.get('/api/notifications');
    badgeCounts.unread = notif.unread;
  } catch (e) { /* ignore */ }

  const items = buildMenu(me.role);
  const path = window.location.pathname;

  const navHtml = items.map(it => {
    const active = path === it.href ? 'active' : '';
    const badge = it.badgeKey && badgeCounts[it.badgeKey] > 0
      ? `<span class="badge" style="background:var(--red-600);color:#fff;">${badgeCounts[it.badgeKey]}</span>` : '';
    return `<li><a href="${it.href}" class="${active}"><span class="icon">${it.icon}</span>${it.label}${badge}</a></li>`;
  }).join('');

  const roleLabelMap = { Employee: 'พนักงาน', Approver: 'ผู้อนุมัติ', Admin: 'ผู้ดูแลระบบ' };

  document.body.insertAdjacentHTML('afterbegin', `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-mark">T</div>
          <div class="brand-text"><b>TRISAK</b><span>VISIT MANAGEMENT</span></div>
        </div>
        <ul class="nav">${navHtml}</ul>
        <div class="side-user">
          <img src="${me.avatar_url || '/img/avatar1.png'}" onerror="this.style.display='none'">
          <div>
            <b>${me.full_name}</b>
            <span>${me.position || roleLabelMap[me.role]}</span>
          </div>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <h1>${pageTitle}</h1>
          <div class="topbar-right">
            <button class="icon-btn" onclick="location.href='/notifications.html'" title="การแจ้งเตือน">
              &#128276;
              ${badgeCounts.unread > 0 ? `<span class="dot">${badgeCounts.unread}</span>` : ''}
            </button>
            <div class="topbar-user" style="cursor:pointer" onclick="location.href='/profile.html'">
              <img src="${me.avatar_url || '/img/avatar1.png'}" onerror="this.style.display='none'">
              <div>
                <b>${me.full_name}</b>
                <span>${me.position || roleLabelMap[me.role]}</span>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="logout()">ออกจากระบบ</button>
          </div>
        </div>
        <div class="content" id="content"></div>
      </div>
    </div>
  `);

  return me;
}

async function logout() {
  await api.post('/api/auth/logout');
  window.location.href = '/login.html';
}
