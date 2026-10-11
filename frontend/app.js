/* ============================================================
   DATACHAIN — app.js  (shared across all pages)
   Backend: Express + MongoDB on http://localhost:3000
   Blockchain source of truth: Sepolia DataMarketplace contract
   ============================================================ */

const API_BASE = 'http://localhost:3000';
const PUBLIC_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

const CONTRACT_ADDRESS = '0x02018B847dA98a987EE59d7F235b2c690085F044';
const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_HEX = '0xaa36a7';

const CONTRACT_ABI = [
  'function dataCount() view returns (uint256)',
  'function getData(uint256) view returns (uint256,string,string,string,uint256,address,string,string)',
  'function getAccessStatus(uint256,address) view returns (uint8)',
  'function hasAccess(uint256,address) view returns (bool)',
  'function requestAccess(uint256)',
  'function approveAccess(uint256,address)',
  'function rejectAccess(uint256,address)',
  'function buyData(uint256) payable',
  'function addData(string,string,string,uint256,string,string)',
  'event DataAdded(uint indexed dataId, address indexed owner, uint price)',
  'event AccessRequested(uint indexed dataId, address indexed requester)',
  'event AccessApproved(uint indexed dataId, address indexed requester)',
  'event AccessRejected(uint indexed dataId, address indexed requester)',
  'event DataPurchased(uint indexed dataId, address indexed buyer, address indexed owner, uint amount)',
  'event AccessAuthorized(uint indexed dataId, address indexed requester)'
];

const ACCESS_STATUS = {
  0: 'NONE',
  1: 'PENDING',
  2: 'APPROVED',
  3: 'REJECTED',
  4: 'AUTHORIZED'
};

const NAV_PAGES = [
  ['index.html', 'Home'],
  ['marketplace.html', 'Marketplace'],
  ['listings.html', 'My Listings'],
  ['addData.html', 'Add Dataset'],
  ['transactions.html', 'Transactions'],
  ['access.html', 'Company Access'],
  ['owner.html', 'Owner Hub'],
  ['profile.html', 'Profile']
];

const PageNavigation = Object.freeze({
  parents: Object.freeze({
    marketplace: Object.freeze({ href: 'marketplace.html', label: 'Marketplace' }),
    listings: Object.freeze({ href: 'listings.html', label: 'My List' }),
    companyList: Object.freeze({ href: 'company-my-list.html', label: 'My List' }),
    owner: Object.freeze({ href: 'owner.html', label: 'Owner' }),
    transactions: Object.freeze({ href: 'transactions.html', label: 'Transactions' }),
    home: Object.freeze({ href: 'index.html', label: 'Home' }),
    addData: Object.freeze({ href: 'addData.html', label: 'Add Data' })
  }),
  getParent(key, fallback = 'marketplace') {
    return this.parents[key] || this.parents[fallback] || this.parents.marketplace;
  },
  datasetHref(id, parent) {
    return `dataset.html?id=${encodeURIComponent(String(id))}&from=${encodeURIComponent(this.parents[parent] ? parent : 'marketplace')}`;
  }
});

// Ethereum addresses are case-insensitive for identity comparison. Keep the
// original address untouched for display, signing, and transaction calls.
function walletAddressMatches(left, right) {
  return typeof left === 'string' && typeof right === 'string' &&
    left.toLowerCase() === right.toLowerCase();
}
function isSepoliaChain(chainId) {
  try { return chainId !== null && chainId !== undefined && BigInt(chainId) === SEPOLIA_CHAIN_ID; }
  catch { return false; }
}

function navSvg(page) {
  const icons = {
    'index.html': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'marketplace.html': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    'listings.html': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    'addData.html': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    'transactions.html': '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    'access.html': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'owner.html': '<path d="M21 2l-2 2m-1.5 6.1L12 15l-4-4 4.9-5.5a5.5 5.5 0 1 1 7.1 6.6z"/>',
    'profile.html': '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
    'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    'company-dashboard.html': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'company-my-list.html': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    'admin-dashboard.html': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    'admin-profile.html': '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${icons[page] || ''}</svg>`;
}

function buildSideNav() {
  const links = NAV_PAGES.map(([href, label]) => {
    const addClass = href === 'addData.html' ? ' nav-add-side' : '';
    return `<a href="${href}" class="side-nav-link${addClass}" data-page="${href}">${navSvg(href)}${label}</a>`;
  }).join('');
  return `<nav class="side-nav" aria-label="Sidebar navigation">
    <div class="side-nav-logo">Data<em>Chain</em></div>
    ${links}
    <div class="side-nav-spacer"></div>
    <div class="side-wallet-chip"><div class="w-dot"></div><span class="wallet-addr-txt">Not connected</span></div>
  </nav>`;
}

function buildBottomNav() {
  return `<nav class="bottom-nav" aria-label="Bottom navigation">
    <a href="index.html" class="b-nav-item" data-page="index.html">${navSvg('index.html')}<span class="b-nav-label">Home</span></a>
    <a href="marketplace.html" class="b-nav-item" data-page="marketplace.html">${navSvg('marketplace.html')}<span class="b-nav-label">Market</span></a>
    <div class="b-nav-add-wrap">
      <a href="addData.html" class="b-nav-add" aria-label="Add Dataset">${navSvg('addData.html')}</a>
      <span class="b-nav-add-label">Add</span>
    </div>
    <a href="owner.html" class="b-nav-item" data-page="owner.html">${navSvg('owner.html')}<span class="b-nav-label">Owner</span></a>
    <a href="profile.html" class="b-nav-item" data-page="profile.html">${navSvg('profile.html')}<span class="b-nav-label">Profile</span></a>
  </nav>`;
}

function injectSharedChrome() {
  if (document.body.classList.contains('admin-workspace')) return;
  if (!document.querySelector('.orb')) {
    document.body.insertAdjacentHTML('afterbegin', '<div class="orb orb-1"></div><div class="orb orb-2"></div>');
  }
  const wrap = document.querySelector('.site-wrap');
  if (!wrap) return;
  if (!document.querySelector('.side-nav')) {
    wrap.insertAdjacentHTML('afterbegin', buildSideNav());
  }
  if (!document.querySelector('.bottom-nav')) {
    wrap.insertAdjacentHTML('beforeend', buildBottomNav());
  }
}

async function checkSepoliaNetwork() {
  if (typeof window.ethereum === 'undefined') return false;
  try {
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    return BigInt(chainIdHex) === SEPOLIA_CHAIN_ID;
  } catch {
    return false;
  }
}

async function switchSepoliaNetwork() {
  if (typeof window.ethereum === 'undefined') return false;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_HEX }]
    });
    return true;
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_HEX,
          chainName: 'Sepolia Test Network',
          nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: [PUBLIC_RPC],
          blockExplorerUrls: ['https://sepolia.etherscan.io']
        }]
      });
      return true;
    }
    return false;
  }
}

async function ensureSepolia() {
  if (await checkSepoliaNetwork()) return true;
  Toast.warning('Switch MetaMask to Sepolia to continue.');
  const switched = await switchSepoliaNetwork();
  if (!switched) {
    Toast.error('Could not switch to Sepolia.');
    return false;
  }
  return checkSepoliaNetwork();
}

function getReadProvider() {
  if (typeof ethers === 'undefined') {
    throw new Error('ethers.js is not loaded.');
  }
  return new ethers.JsonRpcProvider(PUBLIC_RPC);
}

function getReadContract(provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider || getReadProvider());
}

function mapOnChainDataset(id, d) {
  return {
    id: Number(id),
    name: d[1],
    category: d[2],
    description: d[3],
    price: ethers.formatEther(d[4]),
    priceWei: d[4],
    owner: d[5],
    ipfsCID: d[6],
    dataHash: d[7]
  };
}

async function loadOnChainDatasets() {
  const backend = await API.get('/chain/datasets').catch(() => null);
  if (backend && backend.success && Array.isArray(backend.data)) {
    return backend.data.map((item) => ({
      ...item,
      id: Number(item.id)
    }));
  }

  const provider = getReadProvider();
  const contract = getReadContract(provider);
  const count = Number(await contract.dataCount());
  const allData = [];
  for (let i = 1; i <= count; i++) {
    try {
      const d = await contract.getData(i);
      allData.push(mapOnChainDataset(i, d));
    } catch (e) {
      console.warn(`Could not read on-chain dataset #${i}:`, e.message);
    }
  }
  return allData;
}

const EVENT_LOOKBACK_BLOCKS = 120000;
const EVENT_CHUNK_SIZE = 9000;

async function queryEventLogsChunked(contract, filter) {
  const provider = contract.runner?.provider || getReadProvider();
  const latestBlock = await provider.getBlockNumber();
  const startBlock = Math.max(0, latestBlock - EVENT_LOOKBACK_BLOCKS);
  const logs = [];
  for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += EVENT_CHUNK_SIZE + 1) {
    const toBlock = Math.min(fromBlock + EVENT_CHUNK_SIZE, latestBlock);
    try {
      logs.push(...await contract.queryFilter(filter, fromBlock, toBlock));
    } catch (err) {
      console.warn(`Event query ${fromBlock}–${toBlock} failed:`, err.message);
    }
  }
  return logs;
}

async function queryAccessRequestedEvents(contract, ownedIds) {
  const idSet = new Set(ownedIds.map(String));
  try {
    const logs = await queryEventLogsChunked(contract, contract.filters.AccessRequested());
    const seen = new Set();
    const out = [];
    for (const log of logs) {
      const dataId = (log.args.dataId ?? log.args[0]).toString();
      const requester = log.args.requester ?? log.args[1];
      if (!idSet.has(dataId)) continue;
      const key = `${dataId}_${requester.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        dataId,
        requester,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber
      });
    }
    return out;
  } catch (err) {
    console.warn('Event query failed:', err.message);
    return [];
  }
}

const Theme = {
  get() { return localStorage.getItem('dc_theme') || 'light'; },
  set(t) {
    localStorage.setItem('dc_theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.body.classList.toggle('dark', t === 'dark');
    document.querySelectorAll('.theme-toggle-input').forEach(el => el.checked = t === 'dark');
  },
  toggle() { Theme.set(Theme.get() === 'dark' ? 'light' : 'dark'); },
  init() { Theme.set(Theme.get()); }
};

const Toast = {
  _el: null,
  _init() {
    if (document.getElementById('toast-container')) {
      this._el = document.getElementById('toast-container'); return;
    }
    this._el = document.createElement('div');
    this._el.id = 'toast-container';
    document.body.appendChild(this._el);
  },
  show(msg, type = 'default', dur = 3200) {
    this._init();
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    this._el.appendChild(t);
    setTimeout(() => {
      t.classList.add('hiding');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, dur);
  },
  success(m) { this.show(m, 'success'); },
  error(m) { this.show(m, 'error'); },
  warning(m) { this.show(m, 'warning'); }
};

function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
}

const API = {
  _headers(headers = {}) {
    const token = Auth.token();
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
  },
  async get(path) {
    const res = await fetch(API_BASE + path, { headers: this._headers(), cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  },

  async post(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    if (path === '/notifications/ingest') window.dispatchEvent(new CustomEvent('dc:notifications-updated'));
    return json;
  },

  async put(path, body, headers = {}) {
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: this._headers({ 'Content-Type': 'application/json', ...headers }),
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  },

  async patch(path, body, headers = {}) {
    const res = await fetch(API_BASE + path, {
      method: 'PATCH',
      headers: this._headers({ 'Content-Type': 'application/json', ...headers }),
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  },

  async getWithHeaders(path, headers = {}) {
    const res = await fetch(API_BASE + path, { headers: this._headers(headers) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }
};

const Auth = {
  tokenKey: 'dc_auth_token',
  roleKey: 'dc_auth_role',
  profileKey: 'dc_auth_profile',
  token() { return sessionStorage.getItem(this.tokenKey); },
  role() { return sessionStorage.getItem(this.roleKey); },
  profile() {
    try { return JSON.parse(sessionStorage.getItem(this.profileKey) || 'null'); } catch { return null; }
  },
  setSession(result) {
    sessionStorage.setItem(this.tokenKey, result.token);
    sessionStorage.setItem(this.roleKey, result.role);
    sessionStorage.setItem(this.profileKey, JSON.stringify(result.data || null));
    localStorage.removeItem('dc_wallet_disconnected');
    localStorage.removeItem('dc_wallet_logged_out');
  },
  clear() {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.roleKey);
    sessionStorage.removeItem(this.profileKey);
  },
  async me() {
    const result = await API.get('/auth/me');
    sessionStorage.setItem(this.roleKey, result.role);
    sessionStorage.setItem(this.profileKey, JSON.stringify(result.data || null));
    window.dispatchEvent(new CustomEvent('dc:auth-profile', { detail: { role: result.role, profile: result.data || null } }));
    return result;
  },
  landing(role) {
    return role === 'admin' ? 'admin-dashboard.html'
      : role === 'company' ? 'company-dashboard.html' : 'index.html';
  },
  async linkWallet(address) {
    const challenge = await API.post('/auth/wallet/challenge', {});
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [challenge.message, address]
    });
    const result = await API.post('/auth/wallet/verify', { walletAddress: address, signature });
    sessionStorage.setItem(this.profileKey, JSON.stringify(result.data));
    return result.data;
  },
  async logout() {
    const destination = this.role() === 'admin' ? 'admin-login.html' : 'landing.html';
    try { if (this.token()) await API.post('/auth/logout', {}); } catch { /* session is cleared locally either way */ }
    this.clear();
    Wallet.disconnect();
    localStorage.removeItem('dc_wallet_disconnected');
    localStorage.setItem('dc_wallet_logged_out', '1');
    location.replace(destination);
  },
  async guardPage() {
    const page = location.pathname.split('/').pop() || 'index.html';
    const pageRoles = {
      'index.html': ['user'],
      'listings.html': ['user'],
      'addData.html': ['user'],
      'owner.html': ['user'],
      'access.html': ['company'],
      'company-dashboard.html': ['company'],
      'company-my-list.html': ['company'],
      'marketplace.html': ['user', 'company'],
      'dataset.html': ['user', 'company'],
      'transactions.html': ['user', 'company'],
      'profile.html': ['user', 'company'],
      'admin-dashboard.html': ['admin'],
      'admin-profile.html': ['admin']
    };
    const requiredRoles = pageRoles[page];
    if (!requiredRoles) return;
    if (!this.token()) {
      location.replace(`landing.html?next=${encodeURIComponent(page + location.search)}`);
      return;
    }
    try {
      const session = await this.me();
      if (!requiredRoles.includes(session.role)) {
        location.replace(this.landing(session.role));
        return;
      }
      applyRoleNavigation(session.role);
    } catch (error) {
      this.clear();
      const destination = page.startsWith('company-') || page === 'access.html' ? 'company-login.html' :
        page.startsWith('admin-') ? 'admin-login.html' : 'auth.html';
      // A failed Admin session check is separate from a submitted login attempt.
      location.replace(page.startsWith('admin-') ? destination : `${destination}?message=${encodeURIComponent(error.message)}`);
    }
  }
};

function applyRoleNavigation(role) {
  if (role === 'user' || role === 'company') installUserSidebar();
  const entries = role === 'company'
    ? [['company-dashboard.html', 'Home'], ['company-my-list.html', 'My List'], ['marketplace.html', 'Marketplace'], ['transactions.html', 'Transactions'], ['profile.html', 'Profile']]
    : role === 'admin'
      ? [['admin-dashboard.html', 'Dashboard']]
      : [['index.html', 'Home'], ['listings.html', 'My List'], ['marketplace.html', 'Marketplace'], ['addData.html', 'Add Data'], ['transactions.html', 'Transactions'], ['owner.html', 'Owner'], ['profile.html', 'Profile']];

  const sidebar = document.querySelector('.side-nav');
  if (sidebar) {
    sidebar.querySelectorAll('.side-nav-link').forEach(link => link.remove());
    const spacer = sidebar.querySelector('.side-nav-spacer');
    for (const [href, label] of entries) {
      const path = href.split('#')[0];
      const link = document.createElement('a');
      link.href = href;
      link.className = `side-nav-link${role === 'user' && path === 'addData.html' ? ' nav-add-side' : ''}`;
      link.dataset.page = path;
      link.innerHTML = `${navSvg(path)}${label}`;
      sidebar.insertBefore(link, spacer || null);
    }
    let logout = sidebar.querySelector('[data-auth-logout]');
    if (!logout) {
      logout = document.createElement('button');
      logout.type = 'button';
      logout.dataset.authLogout = '';
      logout.className = 'side-nav-link';
      logout.innerHTML = `${navSvg('logout')}<span>Logout</span>`;
      sidebar.appendChild(logout);
      logout.addEventListener('click', () => Auth.logout());
    }
  }

  const bottom = document.querySelector('.bottom-nav');
  if (bottom && role !== 'user') {
    bottom.innerHTML = entries.slice(0, 5).map(([href, label]) => {
      const path = href.split('#')[0];
      return `<a href="${href}" class="b-nav-item" data-page="${path}">${navSvg(path)}<span class="b-nav-label">${label}</span></a>`;
    }).join('');
  }
  if (role === 'user' || role === 'company') installUserNotificationCenter(role);
  if (role === 'company') syncWalletUI(WalletStatus.account);
  setActiveNav();
}

function installUserSidebar() {
  document.body.classList.add('user-role');
  const header = document.querySelector('.app-header');
  const sidebar = document.querySelector('.side-nav');
  if (!header || !sidebar || document.querySelector('.user-sidebar-toggle')) return;
  let headerBrand = header.querySelector('.logo');
  if (!headerBrand) {
    headerBrand = document.createElement('div');
    headerBrand.className = 'logo user-header-brand';
    headerBrand.innerHTML = 'Data<em>Chain</em>';
    header.prepend(headerBrand);
  } else headerBrand.classList.add('user-header-brand');
  if (document.body.classList.contains('user-home-page')) {
    const title = document.createElement('div');
    title.className = 'hdr-title user-home-header-title';
    title.textContent = 'Home';
    headerBrand.after(title);
  }
  let sidebarLogo = sidebar.querySelector('.side-nav-logo');
  if (!sidebarLogo) {
    sidebarLogo = document.createElement('div');
    sidebarLogo.className = 'side-nav-logo';
    sidebarLogo.innerHTML = 'Data<em>Chain</em>';
    sidebar.prepend(sidebarLogo);
  }
  const sidebarHead = document.createElement('div');
  sidebarHead.className = 'user-sidebar-head';
  sidebarLogo.before(sidebarHead);
  sidebarHead.appendChild(sidebarLogo);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'user-sidebar-toggle';
  button.setAttribute('aria-controls', 'user-sidebar');
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  sidebar.id = 'user-sidebar';
  header.prepend(button);
  let profile = header.querySelector(':scope > a[href="profile.html"]');
  if (!profile) {
    profile = document.createElement('a');
    profile.href = 'profile.html';
    header.appendChild(profile);
  }
  profile.className = 'user-header-profile';
  profile.title = 'Profile';
  profile.setAttribute('aria-label', 'Profile');
  profile.innerHTML = navSvg('profile.html');
  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'user-sidebar-backdrop';
  backdrop.setAttribute('aria-label', 'Close navigation');
  backdrop.hidden = true;
  sidebar.after(backdrop);
  const isDrawer = () => window.matchMedia('(max-width: 1023px)').matches;
  const sync = () => {
    const open = isDrawer() ? document.body.classList.contains('user-sidebar-open') :
      !document.body.classList.contains('user-sidebar-collapsed');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    const destination = open ? sidebarHead : header;
    if (button.parentElement !== destination) {
      if (open) sidebarHead.appendChild(button);
      else header.prepend(button);
    }
    backdrop.hidden = !isDrawer() || !open;
    sidebar.inert = !open;
    if (!isDrawer()) document.body.classList.remove('user-sidebar-open');
  };
  const sidebarStorageKey = Auth.role() === 'company' ? 'dc_company_sidebar' : 'dc_user_sidebar';
  if (localStorage.getItem(sidebarStorageKey) === 'collapsed') document.body.classList.add('user-sidebar-collapsed');
  button.addEventListener('click', () => {
    if (isDrawer()) document.body.classList.toggle('user-sidebar-open');
    else {
      document.body.classList.toggle('user-sidebar-collapsed');
      localStorage.setItem(sidebarStorageKey, document.body.classList.contains('user-sidebar-collapsed') ? 'collapsed' : 'expanded');
    }
    sync();
  });
  backdrop.addEventListener('click', () => { document.body.classList.remove('user-sidebar-open'); sync(); button.focus(); });
  sidebar.addEventListener('click', event => {
    if (isDrawer() && event.target.closest('a')) { document.body.classList.remove('user-sidebar-open'); sync(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('user-sidebar-open')) {
      document.body.classList.remove('user-sidebar-open'); sync(); button.focus();
    }
  });
  window.addEventListener('resize', sync);
  sync();
}

function installUserNotificationCenter(role = 'user') {
  const header = document.querySelector('.app-header');
  if (!header || header.querySelector('.dc-notification-root')) return;
  const root = document.createElement('div');
  root.className = 'dc-notification-root';
  root.innerHTML = `
    <button class="dc-notification-bell" type="button" aria-label="Notifications" aria-expanded="false" aria-controls="dc-notification-panel">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      <span class="dc-notification-count" hidden></span>
    </button>
    <section class="dc-notification-panel" id="dc-notification-panel" aria-label="Notifications" hidden>
      <header class="dc-notification-panel-head"><div><h2>Notifications</h2><p>Account and marketplace activity</p></div><div class="dc-notification-head-actions"><button type="button" class="dc-notification-mark-all" hidden>Mark all read</button><button type="button" class="dc-notification-clear" hidden>Clear all</button></div></header>
      <div class="dc-notification-list" aria-live="polite"><p class="dc-notification-empty">Loading notifications…</p></div>
    </section>`;
  header.appendChild(root);

  const button = root.querySelector('.dc-notification-bell');
  const panel = root.querySelector('.dc-notification-panel');
  const list = root.querySelector('.dc-notification-list');
  const countBadge = root.querySelector('.dc-notification-count');
  const markAll = root.querySelector('.dc-notification-mark-all');
  const clearAll = root.querySelector('.dc-notification-clear');
  const basePath = role === 'company' ? '/company/notifications' : '/notifications';
  const companyKey = role === 'company' ? `dc_company_seen_notifications_${Auth.profile()?.walletAddress?.toLowerCase() || 'unknown'}` : null;
  let notifications = [];
  let unreadCount = 0;
  let loading = false;

  const updateCount = count => {
    unreadCount = Math.max(0, Number(count) || 0);
    countBadge.hidden = unreadCount === 0;
    countBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    button.setAttribute('aria-label', unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications');
    markAll.hidden = unreadCount === 0;
  };
  const relativeTime = dateValue => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    const [unit, divisor] = abs < 60 ? ['second', 1] : abs < 3600 ? ['minute', 60] : abs < 86400 ? ['hour', 3600] : ['day', 86400];
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
  };
  const notificationSvg = type => {
    if (type === 'ACCESS_REQUEST_APPROVED') return '<path d="m4 12 5 5L20 6"/>';
    if (type === 'ACCESS_REQUEST_REJECTED') return '<path d="M5 5l14 14M19 5 5 19"/>';
    if (type === 'PURCHASE_CONFIRMED' || type === 'TRANSACTION_CONFIRMED' || type === 'ETH_CREDITED' || type === 'ETH_DEBITED') return '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>';
    if (type === 'ACCESS_REQUEST_RECEIVED') return '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 17v3h14v-3"/>';
    return '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8m-4-4h8"/>';
  };
  const destinationFor = item => {
    const id = item.relatedDatasetId ? encodeURIComponent(item.relatedDatasetId) : '';
    if (role === 'company') {
      if (item.type === 'ETH_CREDITED' || item.type === 'ETH_DEBITED') return 'transactions.html';
      return /^\d+$/.test(String(item.relatedDatasetId || ''))
        ? PageNavigation.datasetHref(item.relatedDatasetId, 'marketplace') : null;
    }
    if (item.type === 'ACCESS_REQUEST_RECEIVED') {
      return id ? `owner.html?datasetId=${id}&from=owner` : 'owner.html';
    }
    if (item.type === 'DATASET_ADDED' || item.type === 'ACCESS_REQUEST_APPROVED' || item.type === 'ACCESS_REQUEST_REJECTED') {
      return item.relatedDatasetId ? PageNavigation.datasetHref(item.relatedDatasetId, 'home') : null;
    }
    if (item.type === 'PURCHASE_CONFIRMED' || item.type === 'TRANSACTION_CONFIRMED') return 'transactions.html';
    return null;
  };
  const render = () => {
    list.replaceChildren();
    clearAll.hidden = notifications.length === 0;
    if (!notifications.length) {
      const empty = document.createElement('p');
      empty.className = 'dc-notification-empty';
      empty.textContent = 'You’re all caught up.';
      list.appendChild(empty);
      return;
    }
    for (const item of notifications) {
      const card = document.createElement('article');
      card.className = `dc-notification-item${item.read ? '' : ' is-unread'}`;
      const icon = document.createElement('span');
      icon.className = 'dc-notification-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${notificationSvg(item.type)}</svg>`;
      const copy = document.createElement('div');
      copy.className = 'dc-notification-copy';
      const title = document.createElement('h3'); title.textContent = item.title || 'DataChain update';
      const message = document.createElement('p'); message.textContent = item.message || '';
      const time = document.createElement('time'); time.dateTime = item.createdAt || ''; time.textContent = relativeTime(item.createdAt);
      copy.append(title, message, time);
      const destination = destinationFor(item);
      if (destination) {
        const link = document.createElement('a'); link.className = 'dc-notification-open'; link.href = destination;
        link.textContent = 'Open'; copy.appendChild(link);
      }
      card.append(icon, copy);
      {
        const readButton = document.createElement('button');
        readButton.type = 'button'; readButton.className = 'dc-notification-read'; readButton.textContent = item.read ? 'Read' : 'Mark as read';
        readButton.disabled = Boolean(item.read);
        readButton.addEventListener('click', async () => {
          readButton.disabled = true;
          try {
            await API.patch(`${basePath}/${encodeURIComponent(item._id)}/read`, {});
            item.read = true; render(); updateCount(unreadCount - 1); await refreshCount();
          } catch (error) { Toast.error(error.message || 'Could not update notification.'); readButton.disabled = false; }
        });
        card.appendChild(readButton);
      }
      list.appendChild(card);
    }
  };
  async function refreshCount() {
    try {
      const result = await API.get(`${basePath}/unread-count`);
      updateCount(result.count);
    } catch { /* Header can still be used if notifications are temporarily unavailable. */ }
  }
  async function loadNotifications() {
    if (loading) return;
    loading = true;
    try {
      if (!panel.hidden && !notifications.length) list.innerHTML = '<p class="dc-notification-empty">Loading notifications…</p>';
      const result = await API.get(basePath);
      notifications = Array.isArray(result.data) ? result.data : [];
      if (companyKey) announceNewCompanyNotifications(notifications);
      render();
      await refreshCount();
    } catch (error) {
      list.replaceChildren();
      const message = document.createElement('p'); message.className = 'dc-notification-empty';
      message.textContent = error.message || 'Notifications are unavailable.'; list.appendChild(message);
    } finally { loading = false; }
  }
  const setOpen = open => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) loadNotifications();
  };
  button.addEventListener('click', () => setOpen(panel.hidden));
  markAll.addEventListener('click', async () => {
    markAll.disabled = true;
    try {
      await API.patch(`${basePath}/read-all`, {});
      notifications = notifications.map(item => ({ ...item, read: true }));
      render(); updateCount(0);
    } catch (error) { Toast.error(error.message || 'Could not update notifications.'); }
    finally { markAll.disabled = false; }
  });
  clearAll.addEventListener('click', async () => {
    clearAll.disabled = true;
    try {
      await API.patch(`${basePath}/clear-all`, {});
      notifications = [];
      render(); updateCount(0);
    } catch (error) { Toast.error(error.message || 'Could not clear notifications.'); }
    finally { clearAll.disabled = false; }
  });
  document.addEventListener('click', event => { if (!root.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  function announceNewCompanyNotifications(items) {
    let previous;
    try { previous = JSON.parse(localStorage.getItem(companyKey) || 'null'); } catch { previous = null; }
    const known = new Set(Array.isArray(previous) ? previous : []);
    if (previous !== null) {
      for (const item of items.slice().reverse()) {
        if (known.has(item._id)) continue;
        const toast = document.createElement('button');
        toast.type = 'button';
        toast.className = 'toast toast-default dc-notification-toast';
        const title = document.createElement('strong'); title.textContent = item.title || 'DataChain update';
        const message = document.createElement('span'); message.textContent = item.message || '';
        toast.append(title, message);
        toast.addEventListener('click', () => { setOpen(true); toast.remove(); });
        Toast._init(); Toast._el.appendChild(toast);
        setTimeout(() => toast.remove(), 5500);
      }
    }
    const next = [...new Set([...items.map(item => item._id), ...known])].slice(0, 200);
    try { localStorage.setItem(companyKey, JSON.stringify(next)); } catch { /* Private browsing can disable storage. */ }
  }
  if (companyKey) loadNotifications(); else refreshCount();
  window.addEventListener('dc:notifications-updated', () => { if (companyKey || !panel.hidden) loadNotifications(); else refreshCount(); });
  window.setInterval(() => { if (companyKey || !panel.hidden) loadNotifications(); else refreshCount(); }, 15000);
}

const Transactions = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem('dc_txns') || '[]');
    } catch {
      return [];
    }
  },
  addLocal(tx) {
    if (!tx || !tx.txHash) return;
    const list = this.getAll().filter(t => t.txHash !== tx.txHash);
    list.unshift({ ...tx, id: Date.now(), timestamp: tx.timestamp || new Date().toISOString() });
    localStorage.setItem('dc_txns', JSON.stringify(list.slice(0, 100)));
  }
};

async function loadWalletActivity(wallet) {
  if (!wallet) return [];

  const address = wallet.toLowerCase();
  const walletQuery = encodeURIComponent(wallet);
  const [purchaseResponse, requestResponse] = await Promise.all([
    API.get(`/chain/purchases?wallet=${walletQuery}`),
    API.get(`/chain/access-requests?requester=${walletQuery}`)
  ]);

  if (!purchaseResponse.success || !Array.isArray(purchaseResponse.data)) {
    throw new Error('Could not read purchase events from the blockchain API.');
  }
  if (!requestResponse.success || !Array.isArray(requestResponse.data)) {
    throw new Error('Could not read access request events from the blockchain API.');
  }

  const activity = [];
  for (const event of purchaseResponse.data) {
    const buyer = event.buyer?.toLowerCase();
    const owner = event.owner?.toLowerCase();
    const base = {
      dataId: event.dataId,
      name: event.name || `Dataset #${event.dataId}`,
      category: event.category || '',
      price: event.amount || '0',
      status: event.status || 'confirmed',
      timestamp: event.timestamp || null,
      blockNumber: event.blockNumber,
      txHash: event.txHash
    };
    if (buyer === address) activity.push({ ...base, type: 'buy' });
    if (owner === address) activity.push({ ...base, type: 'sell' });
  }

  for (const event of requestResponse.data) {
    if (event.requester?.toLowerCase() !== address) continue;
    activity.push({
      type: 'request',
      dataId: event.dataId,
      name: event.datasetName || `Dataset #${event.dataId}`,
      category: '',
      price: '0',
      status: 'confirmed',
      accessStatus: event.status || 'PENDING',
      timestamp: event.timestamp || null,
      blockNumber: event.blockNumber,
      txHash: event.transactionHash
    });
  }

  const unique = new Map();
  for (const event of activity) {
    if (!event.txHash) continue;
    unique.set(`${event.txHash}-${event.type}`, event);
  }
  return [...unique.values()].sort((a, b) => {
    const byDate = new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    return byDate || Number(b.blockNumber || 0) - Number(a.blockNumber || 0);
  });
}

const Wallet = {
  connecting: false,
  getAddress() { return localStorage.getItem('dc_wallet') || null; },
  setAddress(a) { localStorage.setItem('dc_wallet', a); },
  disconnect() { localStorage.removeItem('dc_wallet'); },
  isConnected() { return !!this.getAddress(); },
  isAuthorized() {
    const connected = this.getAddress();
    const registered = Auth.profile()?.walletAddress;
    return Boolean(Auth.token() && connected && registered && walletAddressMatches(connected, registered) && isSepoliaChain(WalletStatus.chainId));
  },
  async verifyAuthorization(requireSepolia = false) {
    if (!window.ethereum?.request || WalletStatus.providerStateSuppressed()) return false;
    const contextId = WalletStatus.requestId;
    try {
      const [accounts, chainId] = await Promise.all([
        window.ethereum.request({ method: 'eth_accounts' }),
        window.ethereum.request({ method: 'eth_chainId' })
      ]);
      if (contextId !== WalletStatus.requestId || WalletStatus.providerStateSuppressed()) return false;
      const account = accounts?.[0] || null;
      const publishedAccount = WalletStatus.publish(account, false, chainId || null);
      const linked = Auth.profile()?.walletAddress;
      return Boolean(publishedAccount && linked && walletAddressMatches(publishedAccount, linked) &&
        (!requireSepolia || BigInt(chainId) === SEPOLIA_CHAIN_ID));
    } catch {
      WalletStatus.publish(null, false, null);
      return false;
    }
  },
  short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; },

  async connect() {
    if (!window.ethereum?.request) {
      Toast.error('MetaMask not detected. Please install it.');
      return null;
    }
    if (this.connecting) {
      Toast.warning('A MetaMask account request is already pending. Finish it in the extension, then try again.');
      return null;
    }
    const previouslyConnected = WalletStatus.account;
    this.connecting = true;
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      let account = accounts?.[0];
      let chainId = null;
      try {
        const [confirmedAccounts, confirmedChainId] = await Promise.all([
          window.ethereum.request({ method: 'eth_accounts' }),
          window.ethereum.request({ method: 'eth_chainId' })
        ]);
        account = confirmedAccounts?.[0] || null;
        chainId = confirmedChainId || null;
      } catch { /* Validate connection below and fail closed on network-dependent actions. */ }
      if (!account) {
        WalletStatus.publish(null);
        if (!previouslyConnected) Toast.warning('MetaMask did not return an account. Select an account in the extension and try again.');
        return null;
      }
      localStorage.removeItem('dc_wallet_disconnected');
      localStorage.removeItem('dc_wallet_logged_out');
      const accountProfile = Auth.profile();
      WalletStatus.publish(account, false, chainId);
      const linkedAddress = accountProfile?.walletAddress || null;
      const companyMismatch = Auth.role() === 'company' &&
        (!linkedAddress || !walletAddressMatches(linkedAddress, account));
      const userMismatch = Auth.role() === 'user' && linkedAddress &&
        !walletAddressMatches(linkedAddress, account);
      if (previouslyConnected && walletAddressMatches(previouslyConnected, account) &&
          !(Auth.role() === 'user' && !linkedAddress)) {
        if (linkedAddress && walletAddressMatches(linkedAddress, account) && !isSepoliaChain(chainId)) {
          const switched = await ensureSepolia();
          await WalletStatus.refresh();
          if (switched) Toast.success('Switched MetaMask to Sepolia.');
          return account;
        }
        let selection = null;
        try {
          await window.ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }]
          });
          const updatedAccounts = await window.ethereum.request({ method: 'eth_accounts' });
          selection = updatedAccounts?.[0] || null;
        } catch (error) {
          selection = WalletStatus.account !== account ? WalletStatus.account : null;
        }
        const selectedAccount = selection || WalletStatus.account;
        if (selectedAccount && !walletAddressMatches(selectedAccount, account)) {
          WalletStatus.publish(selectedAccount, false);
          const selectedMatches = Boolean(linkedAddress && walletAddressMatches(linkedAddress, selectedAccount));
          if (Auth.role() === 'user' && !linkedAddress) await Auth.linkWallet(selectedAccount);
          if (selectedMatches || Auth.role() === 'user' && !linkedAddress) {
            Toast.success('MetaMask account switched.');
          } else {
            Toast.warning(Auth.role() === 'company'
              ? 'The selected MetaMask account differs from the registered company wallet. The registered wallet is unchanged.'
              : 'The selected MetaMask account differs from your linked wallet. The linked wallet is unchanged.');
          }
          return selectedAccount;
        }
        Toast.warning('MetaMask returned the current account. Use the MetaMask extension to select another account; DataChain will update when accountsChanged fires.');
        return account;
      }
      if (companyMismatch || userMismatch) {
        Toast.warning(companyMismatch
          ? 'This MetaMask account differs from the registered company wallet. Select the registered account in MetaMask; the registered wallet has not changed. DataChain updates when accountsChanged fires.'
          : 'This MetaMask account differs from your linked wallet. Select the linked account in MetaMask; the linked wallet has not changed. DataChain updates when accountsChanged fires.');
        return account;
      }
      if (Auth.role() === 'user' && !linkedAddress) {
        await Auth.linkWallet(account);
        await WalletStatus.refresh();
      }
      const onSepolia = await checkSepoliaNetwork();
      if (!onSepolia) {
        const switched = await switchSepoliaNetwork();
        if (!switched) Toast.warning('Connected, but Sepolia is required for marketplace actions.');
      }
      Toast.success('Wallet connected.');
      return account;
    } catch (error) {
      if (error?.code === 4001) Toast.warning('MetaMask connection request was rejected.');
      else {
        const currentAccount = await WalletStatus.refresh();
        if (!(previouslyConnected && !currentAccount)) Toast.error(error?.message || 'Could not connect to MetaMask.');
      }
      return null;
    } finally {
      this.connecting = false;
    }
  }
};

const Profile = {
  getAvatar() { return localStorage.getItem('dc_avatar') || null; },
  setAvatar(d) { localStorage.setItem('dc_avatar', d); },
  getName() { return localStorage.getItem('dc_name') || 'Anonymous'; },
  setName(n) { localStorage.setItem('dc_name', n); }
};

function badgeClass(cat) {
  return {
    Health: 'badge-green',
    Finance: 'badge-blue',
    Technology: 'badge-purple',
    Environment: 'badge-warm',
    Education: 'badge-blue',
    Research: 'badge-purple',
    Other: 'badge-muted'
  }[cat] || 'badge-muted';
}

function renderDataCard(item) {
  const bc = badgeClass(item.category);
  const targetId = item.id ?? item.blockchainId ?? item.onChainId ?? '';
  const detailHref = targetId !== ''
      ? PageNavigation.datasetHref(targetId, 'marketplace')
    : null;
  console.info('[Marketplace detail link]', {
    datasetId: targetId,
    href: detailHref
  });
  const el = document.createElement('div');
  el.className = 'card card-hover data-card anim-up';
  el.style.cursor = 'pointer';
  el.innerHTML = `
    <div class="dc-header">
      <div>
        <div class="dc-name">${esc(item.name)}</div>
        <span class="badge ${bc}">${esc(item.category)}</span>
      </div>
      <div class="dc-price">
        <span class="dc-price-val">${parseFloat(item.price).toFixed(4)}</span>
        <span class="dc-price-unit">ETH</span>
      </div>
    </div>
    <p class="dc-desc">${esc(item.description)}</p>
    <div class="dc-owner"><span>Owner</span><span title="${esc(item.owner || item.seller || 'Not available')}">${esc(item.owner || item.seller || 'Not available')}</span></div>
    <div class="dc-footer">
      <div class="dc-meta">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
        <span>Sepolia #${esc(targetId)}</span>
      </div>
      ${detailHref
        ? `<a class="btn btn-primary btn-sm buy-btn" data-dataset-id="${esc(targetId)}" href="${esc(detailHref)}">View dataset</a>`
        : '<button class="btn btn-primary btn-sm buy-btn" type="button" disabled>Dataset ID unavailable</button>'}
    </div>`;

  return el;
}

function skeletonCards(n = 3) {
  return Array.from({ length: n }, () => {
    const d = document.createElement('div');
    d.className = 'card';
    d.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
    d.innerHTML = `
      <div class="skeleton" style="height:18px;width:55%"></div>
      <div class="skeleton" style="height:12px;width:28%"></div>
      <div class="skeleton" style="height:48px;width:100%;border-radius:12px"></div>
      <div style="display:flex;justify-content:flex-end">
        <div class="skeleton" style="height:34px;width:72px;border-radius:999px"></div>
      </div>`;
    return d;
  });
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function parseRevert(err) {
  return err.reason || err.shortMessage || err.message || 'Transaction failed.';
}

function syncWalletUI(addr, checking = false) {
  document.querySelectorAll('.wallet-addr-txt').forEach(el =>
    el.textContent = addr ? Wallet.short(addr) : checking ? 'Checking wallet…' : 'Not connected'
  );
  document.querySelectorAll('.w-dot').forEach(d =>
    d.classList.toggle('on', !!addr)
  );
  document.querySelectorAll('[data-wallet-connect]').forEach(btn => {
    const linked = Auth.role() === 'company' ? Auth.profile()?.walletAddress : null;
    const mismatch = Boolean(addr && linked && !walletAddressMatches(addr, linked));
    if (addr) {
      btn.textContent = mismatch ? 'Select linked wallet on Home' : `Wallet · ${Wallet.short(addr)}`;
      btn.disabled = false;
      btn.classList.add('connected');
    } else {
      btn.textContent = checking ? 'Checking wallet…' : 'Connect from Home';
      btn.disabled = checking;
      btn.classList.remove('connected');
    }
  });
  if (Auth.role() === 'company') {
    const linked = Auth.profile()?.walletAddress || null;
    const wallet = WalletStatus.snapshot();
    const mismatch = Boolean(addr && linked && !walletAddressMatches(addr, linked));
    const wrongNetwork = Boolean(addr && !wallet.onSepolia);
    const walletReady = Boolean(wallet.authenticated && addr && linked && !mismatch && wallet.onSepolia);
    document.querySelectorAll('.company-header-wallet').forEach(chip => {
      chip.classList.toggle('is-mismatch', Boolean(!checking && addr && (mismatch || wrongNetwork)));
      const label = chip.querySelector('.company-wallet-label');
      const state = chip.querySelector('.company-wallet-state');
      if (label) label.textContent = checking ? 'Checking wallet…' : walletReady ? 'Connected' : addr ? mismatch ? 'Wrong account' : wrongNetwork ? 'Wrong network' : 'Not verified' : 'Not connected';
      if (state) {
        state.textContent = checking ? 'Verifying registered wallet…' : addr ? `Connected: ${Wallet.short(addr)}` : linked ? `Linked: ${Wallet.short(linked)}` : 'Not linked';
        state.title = linked ? `Registered wallet ${Wallet.short(linked)}` : 'No linked wallet is stored on this account';
      }
    });
    document.querySelectorAll('[data-home-wallet-connect]').forEach(btn => {
      const profileReady = document.body.dataset.companyProfileReady === 'true';
      btn.textContent = checking ? 'Checking wallet…' : !profileReady ? 'Verifying company profile…' : walletReady ? 'Switch Wallet' : addr ? mismatch ? 'Select registered wallet' : wrongNetwork ? 'Switch to Sepolia' : 'Verify wallet' : 'Connect MetaMask';
      btn.disabled = checking || !profileReady;
      btn.classList.toggle('connected', walletReady);
    });
    document.querySelectorAll('.company-header-wallet .w-dot').forEach(dot => dot.classList.toggle('on', walletReady));
    document.querySelectorAll('.company-wallet-notice').forEach(notice => {
      const showMismatch = !checking && Boolean(addr && mismatch);
      const showWrongNetwork = !checking && Boolean(addr && !mismatch && wrongNetwork);
      notice.classList.toggle('is-visible', showMismatch || showWrongNetwork);
      notice.textContent = showMismatch
        ? 'The connected MetaMask account differs from your registered company wallet. Company data remains protected until the registered wallet is selected.'
        : showWrongNetwork
          ? 'Switch MetaMask to Sepolia before using company wallet features.'
          : '';
    });
  }
}

// A saved wallet address is not evidence that MetaMask is still connected.
// Keep the current provider account separate from the authenticated profile.
const WalletStatus = {
  account: null,
  chainId: null,
  provider: null,
  started: false,
  initialization: null,
  initialized: false,
  lastPublishedStateKey: null,
  requestId: 0,
  lastRegisteredWallet: null,
  error: null,
  verificationStatus: 'checking',
  snapshot() {
    const registeredWallet = Auth.profile()?.walletAddress || null;
    const connected = Boolean(this.account);
    const matchesRegisteredWallet = Boolean(connected && registeredWallet && walletAddressMatches(this.account, registeredWallet));
    const sepolia = isSepoliaChain(this.chainId);
    return {
      account: this.account,
      registeredWallet,
      chainId: this.chainId,
      providerAvailable: Boolean(this.provider?.request),
      connected,
      matchesRegisteredWallet,
      onSepolia: sepolia,
      verificationStatus: this.verificationStatus,
      initialized: this.initialized,
      error: this.error,
      locallyDisconnected: localStorage.getItem('dc_wallet_disconnected') === '1',
      loggedOut: localStorage.getItem('dc_wallet_logged_out') === '1' && !Auth.token(),
      authenticated: Boolean(Auth.token())
    };
  },
  publish(account, notify = true, chainId = this.chainId, verificationError = null) {
    ++this.requestId;
    const previous = this.account;
    this.account = this.providerStateSuppressed() ? null : account || null;
    this.chainId = this.account ? chainId || null : null;
    this.error = verificationError;
    const registered = Auth.profile()?.walletAddress || null;
    this.lastRegisteredWallet = registered;
    if (localStorage.getItem('dc_wallet_disconnected') === '1') this.verificationStatus = 'locally-disconnected';
    else if (localStorage.getItem('dc_wallet_logged_out') === '1' && !Auth.token()) this.verificationStatus = 'logged-out';
    else if (this.error) this.verificationStatus = 'error';
    else if (!this.provider?.request) { this.verificationStatus = 'unavailable'; this.error = 'MetaMask is not available in this browser.'; }
    else if (!this.account) this.verificationStatus = 'disconnected';
    else if (!Auth.token()) this.verificationStatus = 'unauthenticated';
    else if (!registered) this.verificationStatus = 'unlinked';
    else if (!walletAddressMatches(this.account, registered)) this.verificationStatus = 'mismatch';
    else if (!this.chainId) this.verificationStatus = 'unverified';
    else if (!isSepoliaChain(this.chainId)) this.verificationStatus = 'wrong-network';
    else this.verificationStatus = 'verified';
    if (this.account) Wallet.setAddress(this.account);
    else Wallet.disconnect();
    syncWalletUI(this.account);
    if (notify && this.initialized && previous && !this.account) {
      Toast.warning('Wallet disconnected — reconnect MetaMask to perform blockchain actions.');
    } else if (notify && this.initialized && !previous && this.account) {
      Toast.success('Wallet reconnected.');
    }
    this.initialized = true;
    const state = this.snapshot();
    const stateKey = JSON.stringify(state);
    if (stateKey !== this.lastPublishedStateKey) {
      this.lastPublishedStateKey = stateKey;
      window.dispatchEvent(new CustomEvent('dc:wallet-state', { detail: state }));
    }
    return this.account;
  },
  syncProfile() {
    const registered = Auth.profile()?.walletAddress || null;
    if (!this.initialized) {
      // Profile hydration can finish before eth_accounts / eth_chainId. Do not
      // turn that still-pending provider snapshot into a disconnected publish.
      this.lastRegisteredWallet = registered;
      return this.account;
    }
    const previous = this.lastRegisteredWallet;
    const unchanged = registered === previous || Boolean(registered && previous && walletAddressMatches(registered, previous));
    if (unchanged) return this.account;
    return this.publish(this.account, false, this.chainId);
  },
  providerStateSuppressed() {
    return localStorage.getItem('dc_wallet_disconnected') === '1' ||
      (localStorage.getItem('dc_wallet_logged_out') === '1' && !Auth.token());
  },
  async refresh() {
    if (this.started && (window.ethereum || null) !== this.provider) {
      this.stop();
      return this.start();
    }
    const requestId = ++this.requestId;
    if (this.providerStateSuppressed()) return this.publish(null, false);
    if (!this.provider?.request) return this.publish(null);
    let accounts, chainId;
    try {
      [accounts, chainId] = await Promise.all([
        this.provider.request({ method: 'eth_accounts' }),
        this.provider.request({ method: 'eth_chainId' })
      ]);
    } catch (error) {
      if (requestId !== this.requestId) return this.account;
      this.publish(null, false, null, error?.message || 'Could not verify the MetaMask account. Retry the connection check.');
      return null;
    }
    if (requestId !== this.requestId) return this.account;
    return this.publish(accounts?.[0] || null, true, chainId);
  },
  start() {
    // start() is intentionally idempotent; callers that need a fresh provider
    // snapshot should call refresh() explicitly.
    if (this.started) return this.initialization || Promise.resolve(this.account);
    this.started = true;
    this.provider = window.ethereum || null;
    this.onAccountsChanged = accounts => {
      // During the first snapshot, do not publish a partial account-only state:
      // it would invalidate the in-flight chain read and leave pages unverified.
      if (!this.initialized) return this.refresh();
      ++this.requestId;
      if (this.providerStateSuppressed()) return this.publish(null, false);
      this.publish(accounts?.[0] || null);
    };
    this.onDisconnect = () => {
      ++this.requestId;
      this.publish(null);
    };
    this.onConnect = () => this.refresh();
    this.onChainChanged = chainId => {
      // Resolve account and network together if a network event arrives before
      // the initial passive snapshot has completed.
      if (!this.initialized) return this.refresh();
      ++this.requestId;
      this.chainId = chainId || null;
      this.publish(this.account, false, chainId);
    };
    this.onFocus = () => this.refresh();
    this.onVisibilityChange = () => { if (!document.hidden) this.refresh(); };
    this.provider?.on?.('accountsChanged', this.onAccountsChanged);
    this.provider?.on?.('disconnect', this.onDisconnect);
    this.provider?.on?.('chainChanged', this.onChainChanged);
    this.provider?.on?.('connect', this.onConnect);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    const pending = this.refresh();
    this.initialization = pending;
    pending.then(() => { if (this.initialization === pending) this.initialization = null; });
    return pending;
  },
  stop() {
    if (!this.started) return;
    this.started = false;
    this.initialization = null;
    ++this.requestId;
    this.provider?.removeListener?.('accountsChanged', this.onAccountsChanged);
    this.provider?.removeListener?.('disconnect', this.onDisconnect);
    this.provider?.removeListener?.('chainChanged', this.onChainChanged);
    this.provider?.removeListener?.('connect', this.onConnect);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.provider = null;
  },
  disconnectLocally() {
    localStorage.setItem('dc_wallet_disconnected', '1');
    localStorage.removeItem('dc_wallet_logged_out');
    this.chainId = null;
    this.publish(null, false);
    Toast.success('Wallet disconnected. Your DataChain session is still active.');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  injectSharedChrome();
  Theme.init();
  Toast._init();
  setActiveNav();

  document.querySelectorAll('.theme-toggle-input').forEach(el =>
    el.addEventListener('change', () => Theme.toggle())
  );

  document.querySelectorAll('[data-wallet-connect]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (Auth.role() === 'company') location.assign('company-dashboard.html');
      else location.assign('index.html');
    })
  );

  document.querySelectorAll('[data-home-wallet-connect]').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (Auth.role() === 'company' && !Auth.profile()?.walletAddress) {
        Toast.warning('Could not verify the registered company wallet. Refresh Company Home and try again.');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Connecting…';
      try { await Wallet.connect(); }
      finally { syncWalletUI(WalletStatus.account, !WalletStatus.initialized); }
    })
  );

  if (!document.body.classList.contains('admin-workspace')) {
    syncWalletUI(null, !WalletStatus.initialized);
    WalletStatus.start();
    window.addEventListener('dc:auth-profile', () => WalletStatus.syncProfile());
    window.addEventListener('pagehide', () => WalletStatus.stop());
    window.addEventListener('pageshow', () => { if (!WalletStatus.started) WalletStatus.start(); });
  }

  document.querySelectorAll('[data-auth-logout]').forEach(button =>
    button.addEventListener('click', () => Auth.logout())
  );
  Auth.guardPage();
});

// Replace static disconnected placeholders as soon as the shared script can
// access the parsed page, while the passive provider snapshot is pending.
if (!document.body.classList.contains('admin-workspace')) syncWalletUI(null, !WalletStatus.initialized);
