document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.token()) return;
  const list = document.getElementById('company-list');
  const count = document.getElementById('company-list-count');
  let loadId = 0;
  let initializationEventReceived = false;
  const authorized = () => {
    const wallet = WalletStatus.snapshot();
    return wallet.authenticated && wallet.connected && wallet.matchesRegisteredWallet && wallet.onSepolia;
  };
  const gateMessage = () => {
    const wallet = WalletStatus.snapshot();
    if (wallet.verificationStatus === 'mismatch') return 'The active MetaMask wallet does not match the registered company wallet. Select the registered wallet in MetaMask.';
    if (wallet.verificationStatus === 'wrong-network') return 'Switch MetaMask to Sepolia to view company data.';
    if (wallet.verificationStatus === 'unavailable') return 'MetaMask is unavailable. Install or enable the extension to view company data.';
    if (wallet.verificationStatus === 'error') return `Wallet check failed: ${wallet.error || 'retry the connection check.'}`;
    return 'Connect the registered company wallet on Sepolia from Company Home to view purchased datasets.';
  };
  function clearPrivate(message = 'Connect the registered company wallet on Sepolia from Company Home to view purchased datasets.') {
    count.textContent = 'Private datasets hidden';
    list.innerHTML = `<div class="user-home-empty"><strong>My List is unavailable</strong><span>${esc(message)}</span></div>`;
  }
  async function load() {
    if (!WalletStatus.snapshot().initialized) return;
    const id = ++loadId;
    if (!authorized()) { clearPrivate(gateMessage()); return; }
    count.textContent = 'Loading datasets…';
    list.innerHTML = '<div class="user-home-loading">Loading your datasets…</div>';
    try {
      const { data } = await API.get('/dashboard/company');
      if (id !== loadId || !authorized()) return;
      const items = data.authorizedDatasets;
      count.textContent = `${items.length} ${items.length === 1 ? 'dataset' : 'datasets'}`;
      if (!items.length) {
        list.innerHTML = '<div class="empty-state card"><h2>No purchased datasets</h2><p>Company purchases will appear here.</p><a class="btn btn-primary btn-sm" href="marketplace.html">Browse Marketplace</a></div>';
        return;
      }
      list.innerHTML = items.map(item => `<article class="card listing-card">
        <h2>${esc(item.name || `Dataset #${item.dataId}`)}</h2>
        <p>Owner: ${esc(item.owner || 'Unavailable')}</p>
        <div class="listing-meta-row"><span class="listing-meta-item">Dataset #${esc(item.dataId)}</span><span class="listing-meta-item">Access: ${esc(item.accessStatus || 'Unknown')}</span></div>
        <div class="listing-actions"><a class="btn btn-primary btn-sm" href="${PageNavigation.datasetHref(item.dataId, 'companyList')}">View Dataset</a>${item.txHash ? `<a class="btn btn-outline btn-sm" href="https://sepolia.etherscan.io/tx/${encodeURIComponent(item.txHash)}" target="_blank" rel="noopener noreferrer">View transaction ↗</a>` : ''}</div>
      </article>`).join('');
    } catch (error) {
      if (id !== loadId || !authorized()) return;
      count.textContent = 'Datasets unavailable';
      list.innerHTML = `<div class="user-home-error"><strong>Could not load your datasets.</strong><span>${esc(error.message)}</span><button class="btn btn-secondary btn-sm" type="button" data-company-list-retry>Retry</button></div>`;
    }
  }
  list.addEventListener('click', event => {
    if (event.target.closest('[data-company-list-retry]')) load();
  });
  window.addEventListener('dc:wallet-state', () => { initializationEventReceived = true; load(); });
  window.addEventListener('dc:auth-profile', load);
  await WalletStatus.start();
  if (!initializationEventReceived) await load();
});
