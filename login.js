async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function setError(message = '') {
  const errorBox = document.getElementById('loginError');
  if (!errorBox) return;

  errorBox.textContent = message;
  errorBox.classList.toggle('visible', Boolean(message));
}

function hydrateLoginPage() {
  const business = window.getPortalBusiness?.(document.body.dataset.business);
  if (!business) return null;

  document.title = `Вход в ${business.name}`;
  document.querySelectorAll('[data-business-name]').forEach(node => {
    node.textContent = business.name;
  });
  document.querySelectorAll('[data-business-subtitle]').forEach(node => {
    node.textContent = business.subtitle;
  });
  document.querySelectorAll('[data-business-description]').forEach(node => {
    node.textContent = business.description;
  });

  return business;
}

async function bootstrapLogin() {
  const business = hydrateLoginPage();
  const form = document.getElementById('loginForm');
  const submitButton = document.getElementById('loginSubmit');
  if (!business || !form || !submitButton) return;

  try {
    await requestJson(`/api/auth/${business.key}/session`);
    window.location.replace(business.dashboardPath);
    return;
  } catch {
    // No active session yet.
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setError('');
    submitButton.disabled = true;

    try {
      const formData = new FormData(form);
      await requestJson(`/api/auth/${business.key}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(formData.get('username') || '').trim(),
          password: String(formData.get('password') || '')
        })
      });

      window.location.replace(business.dashboardPath);
    } catch (error) {
      setError(error.message || 'Не удалось войти');
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', bootstrapLogin);
