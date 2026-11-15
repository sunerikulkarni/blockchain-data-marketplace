const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const addressA = `0x${'a'.repeat(40)}`;
const addressB = `0x${'b'.repeat(40)}`;
const sepolia = '0xaa36a7';
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const frontendDir = path.join(__dirname, '..');
const homeSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');

function section(start, end) {
  const a = appSource.indexOf(start);
  const b = appSource.indexOf(end, a);
  assert.notEqual(a, -1, `source contains ${start}`);
  assert.notEqual(b, -1, `source contains ${end}`);
  return appSource.slice(a, b);
}

function createHarness({ registered = addressA, accounts = [], chainId = sepolia, role = 'user', authenticated = true, storage = new Map(), sessionStore = new Map(), sharedProvider = null } = {}) {
  const toastMessages = [];
  const windowEvents = new EventEmitter();
  const documentEvents = new EventEmitter();
  const provider = sharedProvider || new EventEmitter();
  provider.accounts = accounts;
  provider.chainId = chainId;
  provider.permissionsCalls = 0;
  provider.requestMethods = [];
  provider.request = async ({ method }) => {
    provider.requestMethods.push(method);
    if (method === 'eth_accounts') return provider.accounts;
    if (method === 'eth_chainId') return provider.chainId;
    if (method === 'eth_requestAccounts') return provider.accounts;
    if (method === 'wallet_requestPermissions') {
      provider.permissionsCalls++;
      provider.accounts = [addressB];
      provider.emit('accountsChanged', provider.accounts);
      return [{ parentCapability: 'eth_accounts' }];
    }
    if (method === 'wallet_switchEthereumChain') {
      provider.chainId = method === 'wallet_switchEthereumChain' ? sepolia : provider.chainId;
      provider.emit('chainChanged', provider.chainId);
      return null;
    }
    throw new Error(`Unexpected provider method: ${method}`);
  };
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const sessionStorage = {
    getItem(key) { return sessionStore.has(key) ? sessionStore.get(key) : null; },
    setItem(key, value) { sessionStore.set(key, String(value)); },
    removeItem(key) { sessionStore.delete(key); }
  };
  const authProfile = { walletAddress: registered };
  const Auth = {
    role: () => role, token: () => sessionStore.get('dc_auth_token') || (authenticated ? 'session-token' : null), profile: () => authProfile,
    setSession(result) {
      sessionStore.set('dc_auth_token', result.token);
      sessionStore.set('dc_auth_role', result.role);
      sessionStore.set('dc_auth_profile', JSON.stringify(result.data || null));
      localStorage.removeItem('dc_wallet_disconnected');
      localStorage.removeItem('dc_wallet_logged_out');
    },
    async linkWallet(address) { authProfile.walletAddress = address; }
  };
  let renderedWallet = null;
  const browserWindow = {
    ethereum: provider,
    addEventListener: (...args) => windowEvents.on(...args),
    removeEventListener: (...args) => windowEvents.off(...args),
    dispatchEvent: event => { windowEvents.emit(event.type, event); return true; }
  };
  const document = {
    hidden: false,
    addEventListener: (...args) => documentEvents.on(...args),
    removeEventListener: (...args) => documentEvents.off(...args)
  };
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const context = {
    window: browserWindow, document, localStorage, sessionStorage, Auth, CustomEvent,
    Toast: { success: m => toastMessages.push(['success', m]), warning: m => toastMessages.push(['warning', m]), error: m => toastMessages.push(['error', m]) },
    syncWalletUI(address) { renderedWallet = address || null; }, walletAddressMatches: (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(),
    isSepoliaChain: value => { try { return BigInt(value) === 11155111n; } catch { return false; } },
    SEPOLIA_CHAIN_ID: 11155111n,
    checkSepoliaNetwork: async () => provider.chainId === sepolia,
    switchSepoliaNetwork: async () => { await provider.request({ method: 'wallet_switchEthereumChain' }); return true; },
    ensureSepolia: async () => {
      if (provider.chainId === sepolia) return true;
      toastMessages.push(['warning', 'Switch MetaMask to Sepolia to continue.']);
      return context.switchSepoliaNetwork();
    },
    BigInt
  };
  vm.createContext(context);
  vm.runInContext(
    section('const Wallet = {', '\nconst Profile = {') +
    section('const WalletStatus = {', "\ndocument.addEventListener('DOMContentLoaded'") +
    '\nglobalThis.walletTest = { Wallet, WalletStatus };', context);
  return { ...context.walletTest, Auth, provider, storage, sessionStore, toastMessages, windowEvents, documentEvents, context, getRenderedWallet: () => renderedWallet };
}

test('wallet manager reads authorized accounts and subscribes exactly once, including provider connect', async () => {
  const h = createHarness({ accounts: [addressA] });
  await h.WalletStatus.start();
  await h.WalletStatus.start();
  assert.equal(h.provider.requestMethods.includes('eth_requestAccounts'), false, 'page-load restoration is passive');
  assert.equal(h.WalletStatus.verificationStatus, 'verified');
  assert.equal(h.Wallet.isAuthorized(), true);
  assert.equal(h.provider.listenerCount('accountsChanged'), 1);
  assert.equal(h.provider.listenerCount('chainChanged'), 1);
  assert.equal(h.provider.listenerCount('connect'), 1);
  h.provider.accounts = [addressB];
  h.provider.emit('connect', { chainId: sepolia });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.WalletStatus.account, addressB);
  assert.equal(h.WalletStatus.verificationStatus, 'mismatch');
});

test('concurrent start calls share the initial passive provider snapshot', async () => {
  const h = createHarness({ accounts: [addressA] });
  let releaseAccounts;
  const originalRequest = h.provider.request;
  h.provider.request = async ({ method }) => {
    if (method === 'eth_accounts') await new Promise(resolve => { releaseAccounts = resolve; });
    return originalRequest({ method });
  };
  const firstStart = h.WalletStatus.start();
  const secondStart = h.WalletStatus.start();
  assert.equal(firstStart, secondStart, 'subsequent callers await the same initialization');
  assert.equal(h.WalletStatus.snapshot().initialized, false, 'a pending passive provider check is distinct from disconnected');
  assert.equal(h.WalletStatus.snapshot().verificationStatus, 'checking');
  assert.equal(h.WalletStatus.account, null, 'account is not published before the provider snapshot completes');
  releaseAccounts();
  await firstStart;
  assert.equal(h.WalletStatus.account, addressA);
  assert.equal(h.WalletStatus.snapshot().initialized, true);
  assert.equal(h.provider.requestMethods.includes('eth_requestAccounts'), false);
});

test('profile hydration before the passive provider snapshot cannot publish a disconnected state', async () => {
  const h = createHarness({ registered: null, accounts: [addressA] });
  let releaseAccounts;
  let releaseChain;
  let requestsStarted = 0;
  let signalRequestsStarted;
  const requestsStartedPromise = new Promise(resolve => { signalRequestsStarted = resolve; });
  const originalRequest = h.provider.request;
  h.provider.request = ({ method }) => {
    if (method === 'eth_accounts') return new Promise(resolve => {
      releaseAccounts = () => resolve(originalRequest({ method }));
      if (++requestsStarted === 2) signalRequestsStarted();
    });
    if (method === 'eth_chainId') return new Promise(resolve => {
      releaseChain = () => resolve(originalRequest({ method }));
      if (++requestsStarted === 2) signalRequestsStarted();
    });
    return originalRequest({ method });
  };
  let published = 0;
  h.windowEvents.on('dc:wallet-state', () => published++);
  h.windowEvents.on('dc:auth-profile', () => h.WalletStatus.syncProfile());

  const startup = h.WalletStatus.start();
  await requestsStartedPromise;
  const requestIdBeforeProfile = h.WalletStatus.requestId;
  h.Auth.profile().walletAddress = addressA;
  h.windowEvents.emit('dc:auth-profile', { type: 'dc:auth-profile' });

  assert.equal(h.WalletStatus.snapshot().initialized, false, 'profile hydration must leave provider verification pending');
  assert.equal(h.WalletStatus.snapshot().verificationStatus, 'checking');
  assert.equal(h.WalletStatus.requestId, requestIdBeforeProfile, 'profile hydration must not invalidate either provider request');
  assert.equal(published, 0, 'no disconnected state may be published from profile hydration');

  releaseAccounts();
  releaseChain();
  await startup;
  assert.equal(h.WalletStatus.snapshot().account, addressA);
  assert.equal(h.WalletStatus.snapshot().onSepolia, true);
  assert.equal(h.WalletStatus.snapshot().verificationStatus, 'verified');
  assert.equal(published, 1, 'the account and network are published together once verified');
});

test('My List stays neutral while pending and loads once when wallet and profile verification finish', async () => {
  const h = createHarness({ registered: null, accounts: [addressA] });
  let releaseAccounts;
  let releaseChain;
  let requestsStarted = 0;
  let signalRequestsStarted;
  const requestsStartedPromise = new Promise(resolve => { signalRequestsStarted = resolve; });
  const originalRequest = h.provider.request;
  h.provider.request = ({ method }) => {
    if (method === 'eth_accounts') return new Promise(resolve => {
      releaseAccounts = () => resolve(originalRequest({ method }));
      if (++requestsStarted === 2) signalRequestsStarted();
    });
    if (method === 'eth_chainId') return new Promise(resolve => {
      releaseChain = () => resolve(originalRequest({ method }));
      if (++requestsStarted === 2) signalRequestsStarted();
    });
    return originalRequest({ method });
  };

  const classList = () => {
    const classes = new Set();
    return {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force) {
        const add = force === undefined ? !classes.has(name) : Boolean(force);
        if (add) classes.add(name); else classes.delete(name);
        return add;
      }
    };
  };
  const span = { textContent: 'Checking your MetaMask wallet…' };
  const makeElement = () => ({
    classList: classList(), children: [], style: {}, textContent: '', innerHTML: '',
    appendChild(child) { this.children.push(child); },
    querySelector(selector) { return selector === 'span' ? span : null; }
  });
  const elements = new Map(['listings-list', 'empty-listings', 'no-wallet-nag', 'listing-count', 'total-earned'].map(id => [id, makeElement()]));
  h.context.document.getElementById = id => elements.get(id) || makeElement();
  h.context.document.createElement = () => makeElement();
  h.context.skeletonCards = () => [];
  h.context.esc = value => String(value || '');
  h.context.badgeClass = () => 'category';
  h.context.PageNavigation = { datasetHref: id => `dataset.html?id=${id}` };
  let datasetLoads = 0;
  h.context.loadOnChainDatasets = async () => {
    datasetLoads++;
    return Array.from({ length: 6 }, (_, index) => ({ id: index + 1, owner: addressA, name: `Dataset ${index + 1}`, category: 'test', price: '0.001' }));
  };

  h.windowEvents.on('dc:auth-profile', () => h.WalletStatus.syncProfile());
  const startup = h.WalletStatus.start();
  await requestsStartedPromise;

  const source = fs.readFileSync(path.join(frontendDir, 'listings.html'), 'utf8');
  const inlineScript = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(script => script.trim()).at(-1);
  assert.ok(inlineScript, 'My List inline script is available for the page-level regression');
  vm.runInContext(`${inlineScript}\nglobalThis.listingsTestLoad = loadListings;`, h.context);
  h.documentEvents.emit('DOMContentLoaded');
  assert.equal(span.textContent, 'Checking your MetaMask wallet…');
  assert.equal(elements.get('listing-count').textContent, 'Checking wallet…');
  assert.equal(datasetLoads, 0, 'the page must not load private listing results while provider verification is pending');

  h.Auth.profile().walletAddress = addressA;
  h.windowEvents.emit('dc:auth-profile', { type: 'dc:auth-profile' });
  assert.equal(h.WalletStatus.snapshot().initialized, false);
  assert.equal(span.textContent, 'Checking your MetaMask wallet…');

  releaseAccounts();
  releaseChain();
  await startup;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(datasetLoads, 1, 'the verified wallet-state event starts one listings request');
  assert.equal(elements.get('listing-count').textContent, '6 listings');
  assert.equal(elements.get('listings-list').children.length, 6);
  assert.equal(elements.get('no-wallet-nag').classList.contains('hidden'), true);

  h.windowEvents.emit('dc:auth-profile', { type: 'dc:auth-profile' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(datasetLoads, 1, 'same effective authorization from profile and wallet events is deduplicated');
});

test('initial passive check publishes confirmed disconnected once after it resolves', async () => {
  const h = createHarness({ accounts: [] });
  const events = [];
  h.windowEvents.on('dc:wallet-state', event => events.push(event.detail));
  let releaseAccounts;
  const originalRequest = h.provider.request;
  h.provider.request = async ({ method }) => {
    if (method === 'eth_accounts') await new Promise(resolve => { releaseAccounts = resolve; });
    return originalRequest({ method });
  };
  const pending = h.WalletStatus.start();
  assert.equal(h.WalletStatus.snapshot().initialized, false);
  assert.equal(events.length, 0, 'no disconnected event or private-data load is published while checking');
  releaseAccounts();
  await pending;
  assert.equal(events.length, 1, 'the resolved snapshot schedules one initial state update');
  assert.equal(events[0].initialized, true);
  assert.equal(events[0].verificationStatus, 'disconnected');
  assert.equal(events[0].connected, false);
});

test('provider account changes during startup refresh account and network together once', async () => {
  const h = createHarness({ registered: addressB, accounts: [addressA] });
  const events = [];
  h.windowEvents.on('dc:wallet-state', event => events.push(event.detail));
  let releaseFirstAccounts;
  let holdFirst = true;
  const originalRequest = h.provider.request;
  h.provider.request = async ({ method }) => {
    if (method === 'eth_accounts' && holdFirst) {
      holdFirst = false;
      await new Promise(resolve => { releaseFirstAccounts = resolve; });
    }
    return originalRequest({ method });
  };

  const startup = h.WalletStatus.start();
  h.provider.accounts = [addressB];
  h.provider.emit('accountsChanged', h.provider.accounts);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.length, 1);
  assert.equal(events[0].account, addressB);
  assert.equal(events[0].onSepolia, true, 'account publication includes a verified network');
  assert.equal(events[0].verificationStatus, 'verified');
  releaseFirstAccounts();
  await startup;
  assert.equal(events.length, 1, 'the superseded initial request cannot publish a second stale state');
});

test('provider verification error is a single confirmed state publication', async () => {
  const h = createHarness({ accounts: [addressA] });
  let published = 0;
  h.windowEvents.on('dc:wallet-state', () => published++);
  h.provider.request = async ({ method }) => {
    if (method === 'eth_accounts') throw new Error('provider unavailable');
    return sepolia;
  };
  await h.WalletStatus.start();
  assert.equal(published, 1, 'an error cannot publish both disconnected and error states');
  assert.equal(h.WalletStatus.snapshot().verificationStatus, 'error');
});

test('unchanged passive refreshes do not republish or retrigger page loaders', async () => {
  const h = createHarness({ accounts: [addressA] });
  let published = 0;
  h.windowEvents.on('dc:wallet-state', () => published++);
  await h.WalletStatus.start();
  assert.equal(published, 1);
  await h.WalletStatus.refresh();
  assert.equal(published, 1, 'same verified account and network do not reload wallet-dependent pages');
  h.provider.chainId = '0x1';
  await h.WalletStatus.refresh();
  assert.equal(published, 2, 'a real network-state change still updates subscribers');
  assert.equal(h.WalletStatus.snapshot().verificationStatus, 'wrong-network');
});

test('wallet state restores after a same-origin page initialization using passive provider checks', async () => {
  const firstPage = createHarness({ accounts: [addressA] });
  await firstPage.WalletStatus.start();
  assert.equal(firstPage.storage.get('dc_wallet'), addressA, 'the verified account is retained as a display hint');
  firstPage.WalletStatus.stop();

  const secondaryPage = createHarness({
    accounts: [addressA], storage: firstPage.storage,
    sessionStore: firstPage.sessionStore, sharedProvider: firstPage.provider
  });
  await secondaryPage.WalletStatus.start();
  assert.equal(secondaryPage.WalletStatus.snapshot().account, addressA);
  assert.equal(secondaryPage.getRenderedWallet(), addressA, 'shared navbar sync receives the restored live account even without a page listener');
  assert.equal(secondaryPage.WalletStatus.snapshot().onSepolia, true);
  assert.equal(secondaryPage.Wallet.isAuthorized(), true);
  assert.equal(secondaryPage.provider.requestMethods.includes('eth_requestAccounts'), false);
});

test('User and Company sessions restore only their matching live registered account', async () => {
  for (const role of ['user', 'company']) {
    const h = createHarness({ role, accounts: [addressA] });
    await h.WalletStatus.start();
    assert.equal(h.WalletStatus.snapshot().authenticated, true);
    assert.equal(h.WalletStatus.snapshot().matchesRegisteredWallet, true);
    assert.equal(h.WalletStatus.snapshot().verificationStatus, 'verified');
    h.provider.accounts = [addressB];
    h.provider.emit('accountsChanged', h.provider.accounts);
    assert.equal(h.WalletStatus.snapshot().verificationStatus, 'mismatch');
    assert.equal(h.Wallet.isAuthorized(), false);
    h.WalletStatus.stop();
  }
});

test('Company wallet state survives page navigation and refresh and follows provider account and network changes', async () => {
  const companyHome = createHarness({ role: 'company', accounts: [addressA] });
  await companyHome.WalletStatus.start();
  assert.equal(companyHome.WalletStatus.snapshot().verificationStatus, 'verified');
  assert.equal(companyHome.Wallet.isAuthorized(), true);
  companyHome.WalletStatus.stop();

  const companyPage = createHarness({
    role: 'company', accounts: [addressA], storage: companyHome.storage,
    sessionStore: companyHome.sessionStore, sharedProvider: companyHome.provider
  });
  await companyPage.WalletStatus.start();
  assert.equal(companyPage.WalletStatus.snapshot().account, addressA, 'secondary Company pages passively restore the live provider account');
  assert.equal(companyPage.WalletStatus.snapshot().verificationStatus, 'verified');

  companyPage.provider.accounts = [addressB];
  companyPage.provider.emit('accountsChanged', companyPage.provider.accounts);
  assert.equal(companyPage.WalletStatus.snapshot().verificationStatus, 'mismatch');
  assert.equal(companyPage.Wallet.isAuthorized(), false, 'a changed account cannot access the registered company wallet data');

  companyPage.provider.accounts = [addressA];
  companyPage.provider.emit('accountsChanged', companyPage.provider.accounts);
  assert.equal(companyPage.WalletStatus.snapshot().verificationStatus, 'verified');
  companyPage.provider.chainId = '0x1';
  companyPage.provider.emit('chainChanged', companyPage.provider.chainId);
  assert.equal(companyPage.WalletStatus.snapshot().verificationStatus, 'wrong-network');
  assert.equal(companyPage.Wallet.isAuthorized(), false, 'a network change removes wallet authorization until Sepolia is restored');
  companyPage.provider.chainId = sepolia;
  companyPage.provider.emit('chainChanged', sepolia);
  assert.equal(companyPage.WalletStatus.snapshot().verificationStatus, 'verified');
  companyPage.WalletStatus.stop();

  const refreshedCompanyHome = createHarness({
    role: 'company', accounts: [addressA], storage: companyHome.storage,
    sessionStore: companyHome.sessionStore, sharedProvider: companyHome.provider
  });
  await refreshedCompanyHome.WalletStatus.start();
  assert.equal(refreshedCompanyHome.WalletStatus.snapshot().account, addressA, 'refresh repeats passive verification without requesting account approval');
  assert.equal(refreshedCompanyHome.provider.requestMethods.includes('eth_requestAccounts'), false);
  refreshedCompanyHome.WalletStatus.stop();
});

test('Company navbar wallet controls show pending and verified states and retain verification gates', () => {
  const app = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = app.indexOf('function syncWalletUI(');
  const end = app.indexOf('\n}\n\n// A saved wallet address', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const classList = () => ({
    values: new Set(),
    toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); },
    add(name) { this.values.add(name); },
    remove(name) { this.values.delete(name); },
    contains(name) { return this.values.has(name); }
  });
  const dot = { classList: classList() };
  const label = { textContent: '' };
  const state = { textContent: '', title: '' };
  const chip = { classList: classList(), querySelector(selector) { return selector === '.w-dot' ? dot : selector === '.company-wallet-label' ? label : selector === '.company-wallet-state' ? state : null; } };
  const notice = { classList: classList(), textContent: '' };
  const connect = { textContent: '', disabled: false, classList: classList() };
  const homeConnect = { textContent: '', disabled: false, classList: classList() };
  const groups = new Map([
    ['.wallet-addr-txt', []], ['.w-dot', [dot]], ['[data-wallet-connect]', [connect]],
    ['.company-header-wallet', [chip]], ['[data-home-wallet-connect]', [homeConnect]],
    ['.company-header-wallet .w-dot', [dot]], ['.company-wallet-notice', [notice]]
  ]);
  const context = {
    document: { body: { dataset: { companyProfileReady: 'false' } }, querySelectorAll: selector => groups.get(selector) || [] },
    Auth: { role: () => 'company', profile: () => ({ walletAddress: addressA }) },
    Wallet: { short: address => `${address.slice(0, 6)}…${address.slice(-4)}` },
    WalletStatus: { snapshot: () => walletSnapshot },
    walletAddressMatches: (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
  };
  let walletSnapshot = { initialized: false, authenticated: true, onSepolia: false };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end + 2), context);
  context.syncWalletUI(null, true);
  assert.equal(label.textContent, 'Checking wallet…');
  assert.equal(state.textContent, 'Verifying registered wallet…');
  assert.equal(homeConnect.textContent, 'Checking wallet…');
  assert.equal(homeConnect.disabled, true);

  walletSnapshot = { initialized: true, authenticated: true, onSepolia: true };
  context.syncWalletUI(addressA);
  assert.equal(label.textContent, 'Connected');
  assert.equal(homeConnect.textContent, 'Verifying company profile…');
  assert.equal(homeConnect.disabled, true, 'a wallet alone cannot enable Company Home actions before authenticated profile verification');
  context.document.body.dataset.companyProfileReady = 'true';
  context.syncWalletUI(addressA);
  assert.equal(homeConnect.textContent, 'Switch Wallet');
  assert.equal(homeConnect.disabled, false);
  assert.equal(dot.classList.contains('on'), true);

  walletSnapshot = { initialized: true, authenticated: true, onSepolia: false };
  context.syncWalletUI(addressA);
  assert.equal(label.textContent, 'Wrong network');
  assert.equal(homeConnect.textContent, 'Switch to Sepolia');
  assert.equal(notice.classList.contains('is-visible'), true);

  walletSnapshot = { initialized: true, authenticated: true, onSepolia: true };
  context.Auth.profile = () => ({ walletAddress: addressB });
  context.syncWalletUI(addressA);
  assert.equal(label.textContent, 'Wrong account');
  assert.equal(homeConnect.textContent, 'Select registered wallet');
  assert.equal(notice.textContent.includes('registered company wallet'), true);

  const companyHome = fs.readFileSync(path.join(frontendDir, 'company-dashboard.html'), 'utf8');
  const companyDashboard = fs.readFileSync(path.join(frontendDir, 'company-dashboard.js'), 'utf8');
  const companyList = fs.readFileSync(path.join(frontendDir, 'company-my-list.js'), 'utf8');
  const middleware = fs.readFileSync(path.join(frontendDir, '..', 'backend', 'middleware', 'authMiddleware.js'), 'utf8');
  assert.match(companyHome, /data-home-wallet-connect/);
  assert.match(companyHome, /data-home-wallet-connect disabled/);
  assert.match(app, /document\.querySelectorAll\('\[data-home-wallet-connect\]'\)/);
  assert.match(app, /await Wallet\.connect\(\)/, 'MetaMask approval remains behind the explicit button click');
  assert.match(companyDashboard, /wallet\.authenticated && wallet\.connected && wallet\.matchesRegisteredWallet && wallet\.onSepolia/);
  assert.match(companyDashboard, /event\.detail\?\.role === 'company'/);
  assert.match(companyDashboard, /companyProfileReady = 'true'/);
  assert.match(companyList, /wallet\.authenticated && wallet\.connected && wallet\.matchesRegisteredWallet && wallet\.onSepolia/);
  assert.match(middleware, /req\.company\.verificationStatus !== 'verified'/, 'server authorization still blocks unverified companies');
});

test('a persisted address hint cannot authorize a wallet absent from the live provider snapshot', async () => {
  const storage = new Map([['dc_wallet', addressA]]);
  const h = createHarness({ storage, accounts: [] });
  assert.equal(h.Wallet.getAddress(), addressA, 'the address hint may exist before provider verification');
  assert.equal(h.Wallet.isAuthorized(), false, 'cached address alone is not authorization');
  await h.WalletStatus.start();
  assert.equal(h.WalletStatus.snapshot().account, null);
  assert.equal(h.Wallet.isAuthorized(), false);
});

test('logout suppression is separate from local disconnect and clears on a fresh authenticated session', async () => {
  const loggedOut = createHarness({ accounts: [addressA], authenticated: false });
  loggedOut.storage.set('dc_wallet_logged_out', '1');
  await loggedOut.WalletStatus.start();
  assert.equal(loggedOut.WalletStatus.account, null);
  assert.equal(loggedOut.WalletStatus.snapshot().loggedOut, true);
  loggedOut.Auth.setSession({ token: 'new-session', role: 'user', data: { walletAddress: addressA } });
  await loggedOut.WalletStatus.refresh();
  assert.equal(loggedOut.WalletStatus.snapshot().account, addressA);
  assert.equal(loggedOut.storage.has('dc_wallet_logged_out'), false);
});

test('restored snapshots drive navbar and wallet-dependent page loaders', () => {
  const app = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
  const listings = fs.readFileSync(path.join(frontendDir, 'listings.html'), 'utf8');
  const transactions = fs.readFileSync(path.join(frontendDir, 'transactions.html'), 'utf8');
  const owner = fs.readFileSync(path.join(frontendDir, 'owner.html'), 'utf8');
  const profile = fs.readFileSync(path.join(frontendDir, 'profile.html'), 'utf8');
  const access = fs.readFileSync(path.join(frontendDir, 'access.html'), 'utf8');
  const dataset = fs.readFileSync(path.join(frontendDir, 'dataset.html'), 'utf8');
  const marketplace = fs.readFileSync(path.join(frontendDir, 'marketplace.html'), 'utf8');
  assert.match(app, /syncWalletUI\(this\.account\)/);
  assert.match(app, /syncWalletUI\(null, !WalletStatus\.initialized\)/);
  assert.match(homeSource, /WalletStatus\.snapshot\(\)/);
  assert.match(listings, /window\.addEventListener\('dc:wallet-state', loadListings\)/);
  assert.match(transactions, /window\.addEventListener\('dc:wallet-state', loadTxns\)/);
  assert.match(listings, /latestWallet\.matchesRegisteredWallet/);
  assert.match(transactions, /latestWallet\.matchesRegisteredWallet/);
  assert.match(owner, /window\.addEventListener\('dc:wallet-state', loadOwnerDashboard\)/);
  assert.match(profile, /window\.addEventListener\('dc:wallet-state'/);
  assert.match(access, /window\.addEventListener\('dc:wallet-state', initPage\)/);
  assert.match(dataset, /window\.addEventListener\('dc:wallet-state', loadAccessStatus\)/);
  assert.match(marketplace, /window\.addEventListener\('dc:wallet-state', syncMarketplaceWalletNag\)/);
  assert.match(listings, /if \(!walletState\.initialized\) \{/);
  assert.match(listings, /Checking your MetaMask wallet/);
  assert.match(transactions, /if \(!walletState\.initialized\) return/);
  assert.match(owner, /if \(!walletState\.initialized\)/);
  const companyDashboard = fs.readFileSync(path.join(frontendDir, 'company-dashboard.js'), 'utf8');
  const companyList = fs.readFileSync(path.join(frontendDir, 'company-my-list.js'), 'utf8');
  assert.match(companyDashboard, /wallet\.matchesRegisteredWallet && wallet\.onSepolia/);
  assert.match(companyList, /wallet\.matchesRegisteredWallet && wallet\.onSepolia/);
  assert.match(companyDashboard, /if \(!initializationEventReceived\) await load\(\)/);
  assert.match(companyList, /if \(!initializationEventReceived\) await load\(\)/);
});

test('profile refresh does not republish unchanged wallet state, but registered-wallet changes do', async () => {
  const h = createHarness({ accounts: [addressA] });
  let published = 0;
  h.windowEvents.on('dc:wallet-state', () => { published++; });
  await h.WalletStatus.start();
  const afterStart = published;
  h.WalletStatus.syncProfile();
  assert.equal(published, afterStart, 'Auth.me refresh with the same registered wallet cannot create a dashboard reload loop');
  h.Auth.profile().walletAddress = addressB;
  h.WalletStatus.syncProfile();
  assert.equal(published, afterStart + 1);
  assert.equal(h.WalletStatus.verificationStatus, 'mismatch');
});

test('clicking Connect on the current linked account switches a wrong network to Sepolia', async () => {
  const h = createHarness({ accounts: [addressA], chainId: '0x1' });
  await h.WalletStatus.start();
  await h.Wallet.connect();
  assert.equal(h.provider.chainId, sepolia);
  assert.equal(h.WalletStatus.verificationStatus, 'verified');
  assert.equal(h.provider.permissionsCalls, 0, 'network correction should not request account permissions');
});

test('account selection, network changes, and local disconnect invalidate wallet authorization', async () => {
  const h = createHarness({ registered: addressB, accounts: [addressA] });
  await h.WalletStatus.start();
  await h.Wallet.connect();
  assert.equal(h.WalletStatus.account, addressB, 'explicit account selection updates the shared account');
  assert.equal(h.WalletStatus.verificationStatus, 'verified');

  h.provider.chainId = '0x1';
  h.provider.emit('chainChanged', '0x1');
  assert.equal(h.WalletStatus.verificationStatus, 'wrong-network');
  assert.equal(h.Wallet.isAuthorized(), false, 'private authorization requires Sepolia');

  h.WalletStatus.disconnectLocally();
  assert.equal(h.WalletStatus.snapshot().locallyDisconnected, true);
  assert.equal(h.WalletStatus.account, null);
  await h.WalletStatus.refresh();
  assert.equal(h.WalletStatus.account, null, 'provider refresh cannot restore a locally disconnected wallet');

  h.WalletStatus.stop();
  const reloaded = createHarness({
    registered: addressB, accounts: [addressB], storage: h.storage,
    sessionStore: h.sessionStore, sharedProvider: h.provider
  });
  await reloaded.WalletStatus.start();
  assert.equal(reloaded.WalletStatus.account, null, 'local disconnect survives a page refresh');
  assert.equal(reloaded.WalletStatus.snapshot().locallyDisconnected, true);
  await reloaded.Wallet.connect();
  assert.equal(reloaded.WalletStatus.account, addressB, 'explicit reconnection clears the local disconnect');
  assert.equal(reloaded.WalletStatus.snapshot().locallyDisconnected, false);
});

test('non-home wallet controls route to the role Home instead of opening MetaMask', () => {
  const start = appSource.lastIndexOf("document.querySelectorAll('[data-wallet-connect]').forEach(btn =>");
  const end = appSource.indexOf("document.querySelectorAll('[data-home-wallet-connect]').forEach(btn =>", start);
  const handler = appSource.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(handler, /location\.assign\('company-dashboard\.html'\)/);
  assert.match(handler, /location\.assign\('index\.html'\)/);
  assert.doesNotMatch(handler, /Wallet\.connect\(\)/);
});

test('User Home loads public datasets from the public chain API separately from private dashboard data', () => {
  assert.match(homeSource, /async function loadHomePublicDatasets\(\)/);
  assert.match(homeSource, /API\.get\('\/chain\/datasets'\)/);
  assert.match(homeSource, /loadHomePublicDatasets\(\);/);
  assert.match(homeSource, /user-recent-datasets/);
});
