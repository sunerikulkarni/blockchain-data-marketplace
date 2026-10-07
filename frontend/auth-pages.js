/* ============================================================
   DATACHAIN — auth-pages.js
   Handles: auth form submission, password visibility toggles
   ============================================================ */

/* ── Password visibility toggle ─────────────────────────────── */
function initPasswordToggles() {
  document.querySelectorAll('[data-pw-toggle]').forEach(button => {
    const targetId = button.dataset.pwToggle;
    const input = document.getElementById(targetId);
    if (!input) return;

    button.addEventListener('click', (event) => {
      // Prevent any possible form interaction
      event.preventDefault();
      event.stopPropagation();

      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      button.setAttribute('aria-pressed', String(!isVisible));
      button.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      button.setAttribute('title',      isVisible ? 'Show password' : 'Hide password');
    });

    // Keyboard accessibility: activate with Space/Enter
    button.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        button.click();
      }
    });
  });
}

/* ── Auth form submission ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Init password toggles on all auth pages
  initPasswordToggles();

  const form = document.querySelector('[data-auth-form]');
  if (!form) return;

  const message = document.getElementById('auth-message');
  const submit  = form.querySelector('[type="submit"]');
  const mode    = form.dataset.authForm;
  const params  = new URLSearchParams(location.search);

  if (params.get('message')) {
    message.textContent = params.get('message');
    message.hidden = false;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.hidden = true;
    message.classList.remove('is-error');
    submit.disabled = true;
    const originalText = submit.textContent;
    submit.textContent = mode.endsWith('register') ? 'Registering…' : 'Signing in…';
    const value = name => form.elements[name]?.value.trim() || '';

    try {
      let result;

      if (mode === 'user-register') {
        result = await API.post('/auth/register/user', {
          fullName: value('fullName'),
          email: value('email'),
          password: form.elements.password.value
        });
        location.replace('user-login.html?message=' + encodeURIComponent(result.message || 'Account created. Please sign in.'));
        return;
      }

      if (mode === 'company-register') {
        if (!window.ethereum) throw new Error('MetaMask is required to register a company wallet.');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts?.[0]) throw new Error('Connect a wallet to continue.');
        result = await API.post('/companies/register', {
          companyName:        value('companyName'),
          email:              value('email'),
          registrationNumber: value('registrationNumber'),
          walletAddress:      accounts[0],
          description:        value('description'),
          password:           form.elements.password.value
        });
        location.replace('company-login.html?message=' + encodeURIComponent('Registration submitted. Your company must be verified before login.'));
        return;
      }

      const role     = mode.startsWith('user-') ? 'user' : mode.startsWith('company-') ? 'company' : 'admin';
      const endpoint = `/auth/login/${role}`;
      const body     = role === 'admin'
        ? { username: value('username'), password: form.elements.password.value }
        : { email: value('email'),       password: form.elements.password.value };

      result = await API.post(endpoint, body);
      Auth.setSession(result);
      location.replace(Auth.landing(result.role));

    } catch (error) {
      message.textContent = error.message || 'The request could not be completed.';
      message.classList.add('is-error');
      message.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  });
});
