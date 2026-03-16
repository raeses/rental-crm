async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'same-origin'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function attachLogout() {
  const button = document.getElementById('logoutButton');
  if (!button) return;

  button.addEventListener('click', async () => {
    try {
      await api('/api/auth/apitchenkov/logout', { method: 'POST', body: JSON.stringify({}) });
    } finally {
      window.location.replace('/apitchenkov/login/');
    }
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.body.appendChild(script);
  });
}

async function bootstrap() {
  try {
    const session = await api('/api/auth/apitchenkov/session', { method: 'GET' });
    if (!session.authenticated) {
      window.location.replace('/apitchenkov/login/');
      return;
    }

    attachLogout();
    await loadScript('/app.js');
    await loadScript('/analytics.js');
    await loadScript('/estimates.js');
  } catch (_error) {
    window.location.replace('/apitchenkov/login/');
  }
}

bootstrap();
