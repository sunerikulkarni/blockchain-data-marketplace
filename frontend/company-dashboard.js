document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.token()) return;
  const recent = document.getElementById('company-recent');
  const requests = document.getElementById('company-requests');
  const privateCounts = ['company-purchased-count', 'company-pending-count', 'company-recent-count'];
  let loadId = 0;
  let initializationEventReceived = false;
  document.body.dataset.companyProfileReady = 'false';
  const state = (element, title, detail = '', error = false) => {
    element.innerHTML = `<div class="${error ? 'user-home-error' : 'user-home-empty'}"><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}${error ? '<button class="btn btn-secondary btn-sm" type="button" data-company-retry>Retry</button>' : ''}</div>`;
  };
  const gateMessage = () => {
    const wallet = WalletStatus.snapshot();
    if (wallet.verificationStatus === 'mismatch') return 'The active MetaMask wallet does not match the registered company wallet. Select the registered wallet in MetaMask.';
    if (wallet.verificationStatus === 'wrong-network') return 'Switch MetaMask to Sepolia to view company data.';
    if (wallet.verificationStatus === 'unavailable') return 'MetaMask is unavailable. Install or enable the extension to view company data.';
    if (wallet.verificationStatus === 'error') return `Wallet check failed: ${wallet.error || 'retry the connection check.'}`;
    return 'Connect the registered company wallet on Sepolia from Company Home to view company data.';
  };
  const clearPrivate = () => {
    privateCounts.forEach(id => { document.getElementById(id).textContent = '—'; });
    state(recent, 'Purchases hidden', gateMessage());
    state(requests, 'Requests hidden', gateMessage());
  };
  const authorized = () => {
    const wallet = WalletStatus.snapshot();
    return wallet.authenticated && wallet.connected && wallet.matchesRegisteredWallet && wallet.onSepolia;
  };
  async function load() {
    if (!WalletStatus.snapshot().initialized) return;
    const id = ++loadId;
    if (!authorized()) { clearPrivate(); return; }
    state(recent, 'Loading purchases…');
    state(requests, 'Loading requests…');
    try {
      const { data } = await API.get('/dashboard/company');
      if (id !== loadId || !authorized()) return;
      const company = data.company;
      document.getElementById('company-name').textContent = company.companyName;
      document.getElementById('company-email').textContent = company.email;
      document.getElementById('company-identity-email').textContent = company.email;
      document.getElementById('company-wallet').textContent = company.walletAddress;
      document.getElementById('company-status').textContent = company.verificationStatus;
      document.getElementById('company-purchased-count').textContent = Number(data.purchasedCount || 0);
      document.getElementById('company-pending-count').textContent = data.pendingAccessRequests.length;
      document.getElementById('company-recent-count').textContent = data.recentPurchases.length;
      if (data.recentPurchases.length) {
        recent.innerHTML = data.recentPurchases.slice(0, 5).map(item => `<article class="user-home-activity">
          <div><div class="user-home-activity-name">${esc(item.name || `Dataset #${item.dataId}`)}</div><div class="user-home-activity-meta">${esc(item.amount || '0')} ETH · Dataset #${esc(item.dataId)}</div></div>
          <a class="user-home-panel-link" href="${PageNavigation.datasetHref(item.dataId, 'companyList')}">View dataset →</a>
        </article>`).join('');
      } else state(recent, 'No purchases recorded yet.', 'Browse the marketplace to discover datasets.');
      if (data.pendingAccessRequests.length) {
        requests.innerHTML = data.pendingAccessRequests.slice(0, 5).map(item => `<article class="user-home-request">
          <div><div class="user-home-request-name">${esc(item.datasetName || item.name || `Dataset #${item.dataId}`)}</div><div class="user-home-request-meta">Awaiting owner review</div></div>
          <a class="user-home-panel-link" href="${PageNavigation.datasetHref(item.dataId, 'marketplace')}">View dataset →</a>
        </article>`).join('');
      } else state(requests, 'No pending access requests.', 'New requests will appear here.');
    } catch (error) {
      if (id !== loadId || !authorized()) return;
      state(recent, 'Purchases unavailable', error.message, true);
      state(requests, 'Requests unavailable', error.message, true);
    }
  }
  document.querySelector('.company-home-page').addEventListener('click', event => {
    if (event.target.closest('[data-company-retry]')) load();
  });
  window.addEventListener('dc:wallet-state', () => { initializationEventReceived = true; load(); });
  window.addEventListener('dc:auth-profile', event => {
    if (event.detail?.role === 'company') {
      document.body.dataset.companyProfileReady = 'true';
      syncWalletUI(WalletStatus.account, !WalletStatus.initialized);
    }
    load();
  });
  await WalletStatus.start();
  if (!initializationEventReceived) await load();
});
