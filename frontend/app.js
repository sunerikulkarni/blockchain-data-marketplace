/* ============================================================
   DATACHAIN — app.js  (shared across all pages)
   Backend: Express + MongoDB on http://localhost:3000
   ============================================================ */

const API_BASE = 'http://localhost:3000';

/* ── Theme ─────────────────────────────────────────────────── */
const Theme = {
  get()    { return localStorage.getItem('dc_theme') || 'light'; },
  set(t)   {
    localStorage.setItem('dc_theme', t);
    document.body.classList.toggle('dark', t === 'dark');
    document.querySelectorAll('.theme-toggle-input').forEach(el => el.checked = t === 'dark');
  },
  toggle() { Theme.set(Theme.get() === 'dark' ? 'light' : 'dark'); },
  init()   { Theme.set(Theme.get()); }
};

/* ── Toast ─────────────────────────────────────────────────── */
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
    const icons = { default: '💬', success: '✓', error: '✕', warning: '⚠' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span style="font-size:1rem;flex-shrink:0">${icons[type] || '💬'}</span><span>${msg}</span>`;
    this._el.appendChild(t);
    setTimeout(() => {
      t.classList.add('hiding');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, dur);
  },
  success(m) { this.show(m, 'success'); },
  error(m)   { this.show(m, 'error');   },
  warning(m) { this.show(m, 'warning'); }
};

/* ── Active nav ─────────────────────────────────────────────── */
function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
}

/* ── API helpers ────────────────────────────────────────────── */
/*
  IMPORTANT:
  The backend wraps every response like:
    { success: true, data: [...] }   or   { success: true, data: {...} }

  So API.get() and API.post() return the FULL response object.
  Each caller must read .data themselves — this keeps things explicit
  and makes it easy to check .success or .errors.
*/
const API = {
  async get(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json(); // returns { success, data, count, total, ... }
  },

  async post(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    // Don't throw on 400 — let the caller inspect .success and .errors
    return res.json();
  },

  async put(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async delete(path) {
    const res = await fetch(API_BASE + path, { method: 'DELETE' });
    return res.json();
  }
};

/* ── Local transaction cache (mirrors MongoDB) ──────────────── */
/*
  We keep a small localStorage cache so the Transactions page
  loads instantly without waiting for the API.
  Every real purchase also calls POST /buyData to save to MongoDB.
*/
const Transactions = {
  getAll() {
    return JSON.parse(localStorage.getItem('dc_txns') || '[]');
  },
  addLocal(tx) {
    const list = this.getAll();
    list.unshift({ ...tx, id: Date.now(), timestamp: new Date().toISOString() });
    localStorage.setItem('dc_txns', JSON.stringify(list.slice(0, 100)));
  }
};

/* ── Wallet ─────────────────────────────────────────────────── */
const Wallet = {
  getAddress()  { return localStorage.getItem('dc_wallet') || null; },
  setAddress(a) { localStorage.setItem('dc_wallet', a); },
  disconnect()  { localStorage.removeItem('dc_wallet'); },
  isConnected() { return !!this.getAddress(); },
  short(a)      { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; },

  async connect() {
    if (typeof window.ethereum === 'undefined') {
      Toast.error('MetaMask not detected. Please install it.');
      return null;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      this.setAddress(accounts[0]);
      Toast.success('Wallet connected!');
      return accounts[0];
    } catch {
      Toast.error('Connection rejected.');
      return null;
    }
  }
};

/* ── Profile ────────────────────────────────────────────────── */
const Profile = {
  getAvatar() { return localStorage.getItem('dc_avatar') || null; },
  setAvatar(d){ localStorage.setItem('dc_avatar', d); },
  getName()   { return localStorage.getItem('dc_name') || 'Anonymous'; },
  setName(n)  { localStorage.setItem('dc_name', n); }
};

/* ── Category → badge class ─────────────────────────────────── */
function badgeClass(cat) {
  return {
    Health:      'badge-green',
    Finance:     'badge-blue',
    Technology:  'badge-purple',
    Environment: 'badge-warm',
    Education:   'badge-blue',
    Research:    'badge-purple',
    Other:       'badge-muted'
  }[cat] || 'badge-muted';
}

/* ── Render a marketplace data card ─────────────────────────── */
function renderDataCard(item, onBuy) {
  const bc = badgeClass(item.category);
  const el = document.createElement('div');
  el.className = 'card card-hover data-card anim-up';
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
    <div class="dc-footer">
      <div class="dc-meta">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
        <span>On-chain</span>
      </div>
      <button class="btn btn-primary btn-sm buy-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        Buy
      </button>
    </div>`;
  el.querySelector('.buy-btn').addEventListener('click', () => onBuy && onBuy(item));
    el.addEventListener('click', (e) => {
      if (e.target.closest('.buy-btn')) return;

      if (item._id) {
        window.location.href = `dataset.html?id=${encodeURIComponent(item._id)}`;
      }
    });
  return el;
}

/* ── Buy — saves to MongoDB via POST /buyData ────────────────── */
async function handleBuy(item) {
  if (!Wallet.isConnected()) {
    Toast.warning('Connect your wallet first.');
    return;
  }

  // Disable button to prevent double-click
  const btn = event.currentTarget;
  if (btn) btn.disabled = true;

  Toast.show(`Processing purchase of "${item.name}"…`);

  try {
    // POST to backend — this saves the transaction to MongoDB
    // and increments the sales counter on the dataset
    const result = await API.post('/buyData', {
      dataId: item._id,        // MongoDB ObjectId from the dataset
      buyer:  Wallet.getAddress()
    });

    if (result.success) {
      // Also cache locally so Transactions page works offline
      Transactions.addLocal({
        type:     'buy',
        name:     item.name,
        category: item.category,
        price:    item.price,
        status:   'confirmed',
        dbId:     result.transaction?._id   // MongoDB _id of the transaction
      });
      Toast.success(`"${item.name}" purchased and saved!`);
    } else {
      Toast.error(result.message || 'Purchase failed.');
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    // Network error — still cache locally
    Toast.error('Could not reach the server. Saved locally.');
    Transactions.addLocal({
      type: 'buy', name: item.name,
      category: item.category, price: item.price, status: 'pending'
    });
    if (btn) btn.disabled = false;
  }
}

/* ── Skeleton loaders ────────────────────────────────────────── */
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

/* ── Utility helpers ─────────────────────────────────────────── */
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

/* ── Sync wallet UI across all pages ────────────────────────── */
function syncWalletUI(addr) {
  document.querySelectorAll('.wallet-addr-txt').forEach(el =>
    el.textContent = addr ? Wallet.short(addr) : 'Not connected'
  );
  document.querySelectorAll('.w-dot').forEach(d =>
    d.classList.toggle('on', !!addr)
  );
  document.querySelectorAll('[data-wallet-connect]').forEach(btn => {
    if (addr) {
      btn.textContent = 'Connected ✓';
      btn.disabled = true;
      btn.classList.add('connected');
    } else {
      btn.textContent = btn.dataset.walletLabel || 'Connect Wallet';
      btn.disabled = false;
      btn.classList.remove('connected');
    }
  });
}

/* ── Page init (runs on every page load) ────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  Toast._init();
  setActiveNav();

  // Theme toggle switches
  document.querySelectorAll('.theme-toggle-input').forEach(el =>
    el.addEventListener('change', () => Theme.toggle())
  );

  // All wallet connect buttons
  document.querySelectorAll('[data-wallet-connect]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const addr = await Wallet.connect();
      if (addr) syncWalletUI(addr);
    })
  );

  // Restore wallet state on load
  syncWalletUI(Wallet.getAddress());
});
