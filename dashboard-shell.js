async function dashboardRequest(path, options = {}) {
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

function wireLogout(business) {
  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await dashboardRequest(`/api/auth/${business.key}/logout`, { method: 'POST' });
      } catch {
        // Redirect anyway to close the current flow on the client.
      } finally {
        window.location.replace(business.loginPath);
      }
    });
  });
}

function hydrateSession(session, business) {
  document.querySelectorAll('[data-session-username]').forEach(node => {
    node.textContent = session.user?.username || 'user';
  });
  document.querySelectorAll('[data-business-name]').forEach(node => {
    node.textContent = business.name;
  });
  document.querySelectorAll('[data-business-subtitle]').forEach(node => {
    node.textContent = business.subtitle;
  });
}

async function bootstrapDashboard() {
  const config = window.APP_CONFIG || {};
  const business = window.getPortalBusiness?.(config.businessKey);
  if (!business) return;

  const authScreen = document.getElementById('dashboardAuthScreen');
  const authMessage = document.getElementById('dashboardAuthMessage');

  try {
    const session = await dashboardRequest(`/api/auth/${business.key}/session`);
    hydrateSession(session, business);
    wireLogout(business);
    if (authScreen) authScreen.hidden = true;

    if (typeof window.initializeCrmApp === 'function') {
      window.initializeCrmApp();
    }
    if (typeof window.initializeBusinessDashboard === 'function') {
      window.initializeBusinessDashboard(session, business);
    }
  } catch (_error) {
    if (authMessage) {
      authMessage.textContent = 'Сессия не найдена. Перенаправляем на страницу входа.';
    }
    window.setTimeout(() => {
      window.location.replace(business.loginPath);
    }, 500);
  }
}

document.addEventListener('DOMContentLoaded', bootstrapDashboard);
