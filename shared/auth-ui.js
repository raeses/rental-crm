function pickProjectFromPath() {
  const match = window.location.pathname.match(/^\/(cinetools|apitchenkov|admin)\b/i);
  return match ? match[1].toLowerCase() : null;
}

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
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function setMessage(text) {
  const target = document.getElementById('authMessage');
  if (target) target.textContent = text || '';
}

async function bootstrapLogin(project) {
  const form = document.getElementById('loginForm');
  if (!form) return;

  try {
    const session = await api(`/api/auth/${project}/session`, { method: 'GET' });
    if (session.authenticated) {
      window.location.replace(`/${project}/dashboard/`);
      return;
    }
  } catch (_error) {
    // Keep login form visible if session check fails.
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('username')?.value?.trim() || '';
    const password = document.getElementById('password')?.value || '';

    if (!username || !password) {
      setMessage('Заполни логин и пароль.');
      return;
    }

    try {
      setMessage('');
      await api(`/api/auth/${project}/login`, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      window.location.replace(`/${project}/dashboard/`);
    } catch (error) {
      setMessage(error.message);
    }
  });
}

async function bootstrapDashboard(project) {
  try {
    const session = await api(`/api/auth/${project}/session`, { method: 'GET' });
    if (!session.authenticated) {
      window.location.replace(`/${project}/login/`);
      return;
    }

    const userName = document.querySelector('[data-auth-username]');
    const userRole = document.querySelector('[data-auth-role]');
    if (userName) userName.textContent = session.user?.username || '-';
    if (userRole) userRole.textContent = session.user?.role || '-';
  } catch (_error) {
    window.location.replace(`/${project}/login/`);
    return;
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      try {
        await api(`/api/auth/${project}/logout`, { method: 'POST', body: JSON.stringify({}) });
      } finally {
        window.location.replace(`/${project}/login/`);
      }
    });
  }
}

async function bootstrap() {
  const project = document.body.dataset.project || pickProjectFromPath();
  const page = document.body.dataset.page;
  if (!project || !page) return;

  if (page === 'login') {
    await bootstrapLogin(project);
    return;
  }

  if (page === 'dashboard') {
    await bootstrapDashboard(project);
  }
}

bootstrap();
