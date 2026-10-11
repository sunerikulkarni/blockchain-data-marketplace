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

  if (mode === 'company-login' || mode === 'company-register') {
    form.querySelectorAll('input, textarea').forEach(input => input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      if (message.dataset.companyValidation === 'true') {
        message.hidden = true;
        message.dataset.companyValidation = 'false';
      }
    }));
  }

  if (mode === 'user-register') {
    const wallet = form.elements.walletAddress;
    const confirm = form.elements.confirmPassword;
    const clearFieldError = (input, errorId) => {
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      const error = document.getElementById(errorId);
      if (error) error.hidden = true;
    };
    wallet.addEventListener('input', () => clearFieldError(wallet, 'wallet-error'));
    confirm.addEventListener('input', () => clearFieldError(confirm, 'confirm-password-error'));
    form.elements.password.addEventListener('input', () => clearFieldError(confirm, 'confirm-password-error'));
  }

  if (mode !== 'admin-login' && params.get('message')) {
    message.textContent = params.get('message');
    message.hidden = false;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.hidden = true;
    message.classList.remove('is-error');
    const value = name => form.elements[name]?.value.trim() || '';

    if (mode === 'company-login' || mode === 'company-register') {
      form.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute('aria-invalid'));
      if (!form.checkValidity()) {
        const invalid = [...form.elements].filter(input => input.willValidate && !input.checkValidity());
        invalid.forEach(input => input.setAttribute('aria-invalid', 'true'));
        const first = invalid[0];
        const label = form.querySelector(`label[for="${first.id}"]`)?.textContent.trim() || 'This field';
        message.textContent = `${label}: ${first.validationMessage}`;
        message.dataset.companyValidation = 'true';
        message.setAttribute('role', 'alert');
        message.classList.add('is-error');
        message.hidden = false;
        first.focus();
        return;
      }
      message.dataset.companyValidation = 'false';
    }

    if (mode === 'user-register') {
      const wallet = form.elements.walletAddress;
      const confirm = form.elements.confirmPassword;
      const walletError = document.getElementById('wallet-error');
      const confirmError = document.getElementById('confirm-password-error');
      wallet.setCustomValidity('');
      confirm.setCustomValidity('');
      walletError.hidden = true;
      confirmError.hidden = true;
      wallet.removeAttribute('aria-invalid');
      confirm.removeAttribute('aria-invalid');

      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet.value.trim())) {
        wallet.setCustomValidity('Enter a valid Ethereum wallet address (0x followed by 40 hexadecimal characters).');
        walletError.textContent = wallet.validationMessage;
        walletError.hidden = false;
        wallet.setAttribute('aria-invalid', 'true');
      }
      if (confirm.value !== form.elements.password.value) {
        confirm.setCustomValidity('Passwords do not match.');
        confirmError.textContent = confirm.validationMessage;
        confirmError.hidden = false;
        confirm.setAttribute('aria-invalid', 'true');
      }
      if (!form.reportValidity()) return;
    }

    submit.disabled = true;
    if (mode === 'company-login' || mode === 'company-register') form.setAttribute('aria-busy', 'true');
    const originalText = submit.textContent;
    submit.textContent = mode.endsWith('register') ? 'Registering…' : 'Signing in…';

    try {
      let result;

      if (mode === 'user-register') {
        result = await API.post('/auth/register/user', {
          fullName: value('fullName'),
          email: value('email'),
          walletAddress: value('walletAddress'),
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
      if (mode === 'company-login' || mode === 'company-register') form.removeAttribute('aria-busy');
    }
  });
});
