/* Login and registration forms. */
(function () {
  'use strict';

  const DEMO_EMAILS = {
    customer: 'customer@agrimart.test',
    farmer: 'farmer@agrimart.test'
  };

  function destinationFor(user) {
    const next = new URLSearchParams(window.location.search).get('next');
    const safeNext = next && /^[a-z0-9-]+\.html$/i.test(next) ? next : null;
    const fallback = user.role === 'farmer' ? 'farmer.html' : 'shop.html';

    if (!safeNext) return fallback;
    if (safeNext === 'farmer.html' && user.role !== 'farmer') return 'shop.html';
    if (safeNext === 'orders.html' && user.role !== 'customer') return 'farmer.html';
    return safeNext;
  }

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function hideError(element) {
    element.textContent = '';
    element.hidden = true;
  }

  const loginForm = document.getElementById('login-form');

  if (loginForm) {
    const errorBox = document.getElementById('form-error');
    const submitButton = document.getElementById('login-submit');

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideError(errorBox);

      const email = loginForm.elements.email.value.trim();
      const password = loginForm.elements.password.value;

      if (!email || !password) {
        showError(errorBox, 'Please enter your email and password.');
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Logging in…';

      try {
        const data = await Agri.api('/api/auth/login', {
          method: 'POST',
          body: { email, password }
        });
        window.location.href = destinationFor(data.user);
      } catch (err) {
        showError(errorBox, err.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Log in';
      }
    });

    document.querySelectorAll('[data-demo]').forEach((button) => {
      button.addEventListener('click', () => {
        loginForm.elements.email.value = DEMO_EMAILS[button.dataset.demo];
        loginForm.elements.password.value = 'password123';
        loginForm.requestSubmit();
      });
    });
  }

  const registerForm = document.getElementById('register-form');

  if (registerForm) {
    // register.html?role=farmer pre-selects the farmer option.
    const presetRole = new URLSearchParams(window.location.search).get('role');
    const presetInput = registerForm.querySelector(`input[name="role"][value="${presetRole === 'farmer' ? 'farmer' : 'customer'}"]`);
    if (presetInput) presetInput.checked = true;

    const errorBox = document.getElementById('form-error');
    const submitButton = document.getElementById('register-submit');

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideError(errorBox);

      const name = registerForm.elements.name.value.trim();
      const email = registerForm.elements.email.value.trim();
      const phone = registerForm.elements.phone.value.trim();
      const password = registerForm.elements.password.value;
      const roleInput = registerForm.querySelector('input[name="role"]:checked');
      const role = roleInput ? roleInput.value : 'customer';

      if (!name) {
        showError(errorBox, 'Please enter your full name.');
        return;
      }
      if (!email) {
        showError(errorBox, 'Please enter your email address.');
        return;
      }
      if (password.length < 6) {
        showError(errorBox, 'Password must be at least 6 characters long.');
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Creating account…';

      try {
        const data = await Agri.api('/api/auth/register', {
          method: 'POST',
          body: { name, email, phone, password, role }
        });
        window.location.href = data.user.role === 'farmer' ? 'farmer.html' : 'shop.html';
      } catch (err) {
        showError(errorBox, err.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Create account';
      }
    });
  }
})();
