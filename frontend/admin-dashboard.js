/* Admin company-verification UI. API endpoints and verification payloads are unchanged. */
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.token()) return; // app.js handles the unauthenticated redirect.

  const countsEl = document.getElementById('company-counts');
  const recordsEl = document.getElementById('company-records');
  const resultCountEl = document.getElementById('company-result-count');
  const errorEl = document.getElementById('company-load-error');
  const refreshButton = document.getElementById('refresh-companies');
  const filterButtons = [...document.querySelectorAll('[data-company-filter]')];
  const profile = Auth.profile();
  document.getElementById('admin-username').textContent = profile?.username || 'Admin';

  const statusMeta = {
    pending: { label: 'Pending', countLabel: 'Pending companies', hint: 'Awaiting review', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    verified: { label: 'Verified', countLabel: 'Approved companies', hint: 'Verified for access', icon: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>' },
    rejected: { label: 'Rejected', countLabel: 'Rejected companies', hint: 'Registrations declined', icon: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>' }
  };
  const emptyCopy = {
    all: ['No company records yet', 'Company registrations will appear here when they are submitted.'],
    pending: ['Everything is up to date', 'No companies are currently waiting for verification.'],
    verified: ['No approved companies', 'Approved registrations will appear here.'],
    rejected: ['No rejected companies', 'Rejected company registrations will appear here.']
  };
  const emptyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8m-8 4h5"/></svg>';
  let companies = [];
  let activeFilter = 'all';

  function renderCounts() {
    countsEl.innerHTML = Object.entries(statusMeta).map(([status, meta]) => {
      const count = companies.filter(company => company.verificationStatus === status).length;
      return `<div class="admin-stat admin-stat-${status}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.icon}</svg>
        <span>${meta.countLabel}</span><strong>${count}</strong><small>${meta.hint}</small>
      </div>`;
    }).join('');
  }

  function companyCard(company) {
    const status = company.verificationStatus;
    const meta = statusMeta[status];
    const description = company.description || 'No additional verification information provided.';
    return `<article class="admin-company-card" data-status="${status}">
      <div class="admin-company-top"><h3>${esc(company.companyName)}</h3><span class="admin-status admin-status-${status}">${meta.label.toUpperCase()}</span></div>
      <dl class="admin-company-meta">
        <div><dt>Email</dt><dd>${esc(company.email)}</dd></div>
        <div><dt>Registration number</dt><dd>${esc(company.registrationNumber)}</dd></div>
        <div><dt>Wallet</dt><dd>${esc(company.walletAddress)}</dd></div>
        <div><dt>Verification status</dt><dd>${meta.label}</dd></div>
      </dl>
      ${status === 'pending' ? `<div class="admin-company-detail"><strong>Verification information / intended use</strong><p>${esc(description)}</p></div>` : ''}
      ${company.rejectionReason ? `<div class="admin-company-detail"><strong>Rejection reason</strong><p>${esc(company.rejectionReason)}</p></div>` : ''}
      ${status === 'pending' ? `<div class="admin-actions">
        <button class="admin-action admin-action-approve" type="button" data-company-action="verified" data-id="${esc(company._id)}">Approve</button>
        <button class="admin-action admin-action-reject" type="button" data-company-action="rejected" data-id="${esc(company._id)}">Reject</button>
      </div>` : ''}
    </article>`;
  }

  function renderRecords() {
    const visible = activeFilter === 'all' ? companies : companies.filter(company => company.verificationStatus === activeFilter);
    resultCountEl.textContent = `${visible.length} ${visible.length === 1 ? 'company' : 'companies'} ${activeFilter === 'all' ? 'total' : 'shown'}`;
    if (!visible.length) {
      const [title, detail] = emptyCopy[activeFilter];
      recordsEl.innerHTML = `<div class="admin-empty"><span class="admin-empty-mark">${emptyIcon}</span><div><strong>${title}</strong><p>${detail}</p></div></div>`;
      return;
    }
    recordsEl.innerHTML = visible.map(companyCard).join('');
  }

  async function loadCompanies() {
    refreshButton.disabled = true;
    refreshButton.setAttribute('aria-busy', 'true');
    errorEl.hidden = true;
    try {
      const result = await API.get('/companies');
      if (!Array.isArray(result.data)) throw new Error('Unexpected company response.');
      companies = result.data.filter(company => Object.hasOwn(statusMeta, company.verificationStatus));
      renderCounts();
      renderRecords();
      return true;
    } catch (error) {
      errorEl.textContent = `Unable to load company records: ${error.message}`;
      errorEl.hidden = false;
      if (!companies.length) {
        resultCountEl.textContent = '';
        recordsEl.innerHTML = `<div class="admin-empty"><span class="admin-empty-mark">${emptyIcon}</span><div><strong>Company records unavailable</strong><p>Use Refresh to try again.</p></div></div>`;
      }
      return false;
    } finally {
      refreshButton.disabled = false;
      refreshButton.removeAttribute('aria-busy');
    }
  }

  filterButtons.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.companyFilter;
    filterButtons.forEach(item => {
      const selected = item === button;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    renderRecords();
  }));

  recordsEl.addEventListener('click', async event => {
    const button = event.target.closest('[data-company-action]');
    if (!button) return;
    const status = button.dataset.companyAction;
    let rejectionReason = '';
    if (status === 'rejected') rejectionReason = prompt('Reason for rejection:') || '';
    button.disabled = true;
    try {
      await API.put(`/companies/${encodeURIComponent(button.dataset.id)}/verify`, { status, rejectionReason });
      await loadCompanies();
      Toast.success(status === 'verified' ? 'Company approved.' : 'Company rejected.');
    } catch (error) {
      Toast.error(error.message);
      button.disabled = false;
    }
  });

  refreshButton.addEventListener('click', loadCompanies);
  loadCompanies();
});
