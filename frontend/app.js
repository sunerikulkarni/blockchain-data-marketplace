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

function navSvg(page) {
  const icons = {
    'index.html': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'marketplace.html': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    'listings.html': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    'addData.html': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    'transactions.html': '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    'access.html': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'owner.html': '<path d="M21 2l-2 2m-1.5 6.1L12 15l-4-4 4.9-5.5a5.5 5.5 0 1 1 7.1 6.6z"/>',
    'profile.html': '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'
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
  async get(path) {
    const res = await fetch(API_BASE + path);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async put(path, body, headers = {}) {
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async getWithHeaders(path, headers = {}) {
    const res = await fetch(API_BASE + path, { headers });
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
  getAddress() { return localStorage.getItem('dc_wallet') || null; },
  setAddress(a) { localStorage.setItem('dc_wallet', a); },
  disconnect() { localStorage.removeItem('dc_wallet'); },
  isConnected() { return !!this.getAddress(); },
  short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; },

  async connect() {
    if (typeof window.ethereum === 'undefined') {
      Toast.error('MetaMask not detected. Please install it.');
      return null;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      this.setAddress(accounts[0]);
      const onSepolia = await checkSepoliaNetwork();
      if (!onSepolia) {
        const switched = await switchSepoliaNetwork();
        if (!switched) Toast.warning('Connected, but Sepolia is required for marketplace actions.');
      }
      Toast.success('Wallet connected.');
      return accounts[0];
    } catch {
      Toast.error('Connection rejected.');
      return null;
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
    ? `dataset.html?id=${encodeURIComponent(String(targetId))}`
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

function syncWalletUI(addr) {
  document.querySelectorAll('.wallet-addr-txt').forEach(el =>
    el.textContent = addr ? Wallet.short(addr) : 'Not connected'
  );
  document.querySelectorAll('.w-dot').forEach(d =>
    d.classList.toggle('on', !!addr)
  );
  document.querySelectorAll('[data-wallet-connect]').forEach(btn => {
    if (addr) {
      btn.textContent = 'Connected';
      btn.disabled = true;
      btn.classList.add('connected');
    } else {
      btn.textContent = btn.dataset.walletLabel || 'Connect Wallet';
      btn.disabled = false;
      btn.classList.remove('connected');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectSharedChrome();
  Theme.init();
  Toast._init();
  setActiveNav();

  document.querySelectorAll('.theme-toggle-input').forEach(el =>
    el.addEventListener('change', () => Theme.toggle())
  );

  document.querySelectorAll('[data-wallet-connect]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const addr = await Wallet.connect();
      if (addr) syncWalletUI(addr);
    })
  );

  syncWalletUI(Wallet.getAddress());

  if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts && accounts.length) {
        Wallet.setAddress(accounts[0]);
      } else {
        Wallet.disconnect();
      }
      syncWalletUI(Wallet.getAddress());
    });
  }
});
