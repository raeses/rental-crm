const MANAGED_PROJECTS = ['apitchenkov', 'cinetools'];

let usersById = new Map();
let selectedUserId = null;

function setMessage(text, isError = true) {
  const message = document.getElementById('adminMessage');
  if (!message) return;
  message.textContent = text || '';
  message.style.color = isError ? 'var(--danger)' : '#1e6a3d';
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

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU');
}

function roleSelectValue(role) {
  const safeRole = String(role || 'manager').toLowerCase();
  const roles = ['admin', 'manager', 'viewer'];
  const selectedRole = roles.includes(safeRole) ? safeRole : 'manager';
  return roles
    .map((item) => `<option value="${item}" ${item === selectedRole ? 'selected' : ''}>${item}</option>`)
    .join('');
}

function renderUsers(users = []) {
  const body = document.getElementById('adminUsersBody');
  if (!body) return;

  usersById = new Map(users.map((user) => [Number(user.id), user]));

  if (!users.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Пользователи не найдены.</td></tr>';
    return;
  }

  body.innerHTML = users
    .map((user) => `
      <tr data-user-id="${user.id}">
        <td>${user.id}</td>
        <td>${user.project_slug}</td>
        <td><input data-field="username" value="${user.username}" /></td>
        <td><select data-field="role">${roleSelectValue(user.role)}</select></td>
        <td><input data-field="is_active" type="checkbox" ${user.is_active ? 'checked' : ''} /></td>
        <td><input data-field="password" type="password" placeholder="не менять" /></td>
        <td>
          <div class="admin-actions">
            <button class="admin-save" data-action="save">Сохранить</button>
            <button class="admin-view" data-action="view">История</button>
          </div>
        </td>
      </tr>
    `)
    .join('');
}

function renderLoginLogs(logins = []) {
  const body = document.getElementById('adminLoginLogsBody');
  if (!body) return;

  if (!logins.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">Логинов пока нет.</td></tr>';
    return;
  }

  body.innerHTML = logins
    .map((entry) => `
      <tr>
        <td>${formatDateTime(entry.created_at)}</td>
        <td>${entry.ip_address || '-'}</td>
        <td>${entry.project || '-'}</td>
        <td class="${entry.success ? 'admin-status-ok' : 'admin-status-fail'}">
          ${entry.success ? 'успешно' : 'ошибка'}
        </td>
      </tr>
    `)
    .join('');
}

function renderActivityLogs(activity = []) {
  const body = document.getElementById('adminActivityLogsBody');
  if (!body) return;

  if (!activity.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Действий пока нет.</td></tr>';
    return;
  }

  body.innerHTML = activity
    .map((entry) => `
      <tr>
        <td>${formatDateTime(entry.created_at)}</td>
        <td>${entry.project || '-'}</td>
        <td>${entry.action || '-'}</td>
        <td>${entry.entity || '-'}</td>
        <td>${entry.entity_id ?? '-'}</td>
        <td>${entry.ip_address || '-'}</td>
      </tr>
    `)
    .join('');
}

function setSelectedHistoryUser(user) {
  const container = document.getElementById('adminUserHistory');
  const label = document.getElementById('historyUserLabel');
  if (!container || !label) return;

  if (!user) {
    label.textContent = '-';
    container.hidden = true;
    return;
  }

  label.textContent = `${user.username} (${user.project_slug})`;
  container.hidden = false;
}

async function loadUserHistory(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  selectedUserId = id;

  const user = usersById.get(id);
  setSelectedHistoryUser(user || null);

  const [loginsPayload, activityPayload] = await Promise.all([
    api(`/api/admin/users/${id}/logins`),
    api(`/api/admin/users/${id}/activity`)
  ]);

  renderLoginLogs(Array.isArray(loginsPayload.logins) ? loginsPayload.logins : []);
  renderActivityLogs(Array.isArray(activityPayload.activity) ? activityPayload.activity : []);
}

async function loadUsers(projectSlug) {
  const payload = await api(`/api/admin/users?project=${encodeURIComponent(projectSlug)}`);
  const users = Array.isArray(payload.users) ? payload.users : [];
  renderUsers(users);

  if (!selectedUserId) {
    setSelectedHistoryUser(null);
    return;
  }

  if (!usersById.has(selectedUserId)) {
    selectedUserId = null;
    setSelectedHistoryUser(null);
    return;
  }

  await loadUserHistory(selectedUserId);
}

async function saveUserRow(row) {
  const userId = Number(row.dataset.userId || 0);
  if (!userId) return;

  const username = row.querySelector('[data-field="username"]')?.value?.trim() || '';
  const role = row.querySelector('[data-field="role"]')?.value || 'manager';
  const isActive = Boolean(row.querySelector('[data-field="is_active"]')?.checked);
  const password = row.querySelector('[data-field="password"]')?.value || '';

  if (!username) {
    setMessage('Логин пользователя не может быть пустым.');
    return;
  }

  await api(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({
      username,
      role,
      is_active: isActive,
      password
    })
  });

  const passwordInput = row.querySelector('[data-field="password"]');
  if (passwordInput) passwordInput.value = '';
  setMessage('Пользователь обновлён.', false);
}

async function ensureAdminSession() {
  const session = await api('/api/auth/admin/session');
  if (!session.authenticated) {
    window.location.replace('/admin/login/');
    throw new Error('Unauthorized');
  }
}

async function bootstrap() {
  if (document.body.dataset.project !== 'admin' || document.body.dataset.page !== 'dashboard') return;

  try {
    await ensureAdminSession();
  } catch {
    return;
  }

  const projectFilter = document.getElementById('adminProjectFilter');
  const refreshButton = document.getElementById('adminRefresh');
  const createForm = document.getElementById('adminCreateUserForm');
  const usersBody = document.getElementById('adminUsersBody');
  const changePasswordForm = document.getElementById('adminChangePasswordForm');

  const currentProject = MANAGED_PROJECTS.includes(projectFilter?.value)
    ? projectFilter.value
    : MANAGED_PROJECTS[0];

  if (projectFilter) projectFilter.value = currentProject;
  await loadUsers(currentProject);

  if (projectFilter) {
    projectFilter.addEventListener('change', async () => {
      try {
        selectedUserId = null;
        setMessage('');
        await loadUsers(projectFilter.value);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      try {
        setMessage('');
        await loadUsers(projectFilter?.value || MANAGED_PROJECTS[0]);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  if (createForm) {
    createForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const projectSlug = document.getElementById('newUserProject')?.value || '';
      const username = document.getElementById('newUsername')?.value?.trim() || '';
      const role = document.getElementById('newRole')?.value || 'manager';
      const password = document.getElementById('newPassword')?.value || '';

      if (!MANAGED_PROJECTS.includes(projectSlug)) {
        setMessage('Выбери корректный проект.');
        return;
      }

      if (!username) {
        setMessage('Логин обязателен.');
        return;
      }

      if (password.length < 8) {
        setMessage('Пароль должен быть не короче 8 символов.');
        return;
      }

      try {
        setMessage('');
        await api('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            project_slug: projectSlug,
            username,
            role,
            password
          })
        });

        createForm.reset();
        document.getElementById('newUserProject').value = projectSlug;
        if (projectFilter) projectFilter.value = projectSlug;
        await loadUsers(projectSlug);
        setMessage('Пользователь создан.', false);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const currentPassword = document.getElementById('currentPassword')?.value || '';
      const newPassword = document.getElementById('newPasswordSelf')?.value || '';
      const repeatPassword = document.getElementById('repeatPasswordSelf')?.value || '';

      if (!currentPassword || !newPassword || !repeatPassword) {
        setMessage('Заполни все поля для смены пароля.');
        return;
      }

      if (newPassword.length < 8) {
        setMessage('Новый пароль должен быть не короче 8 символов.');
        return;
      }

      if (newPassword !== repeatPassword) {
        setMessage('Новый пароль и повтор не совпадают.');
        return;
      }

      try {
        setMessage('');
        await api('/api/admin/change-password', {
          method: 'POST',
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
            new_password_repeat: repeatPassword
          })
        });

        changePasswordForm.reset();
        setMessage('Пароль успешно изменён.', false);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  if (usersBody) {
    usersBody.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const action = target.dataset.action;
      const row = target.closest('tr[data-user-id]');
      if (!row) return;

      try {
        if (target instanceof HTMLInputElement && target.dataset.field === 'username') {
          setMessage('');
          await loadUserHistory(row.dataset.userId);
          return;
        }

        if (action === 'save') {
          setMessage('');
          await saveUserRow(row);
          const activeProject = projectFilter?.value || MANAGED_PROJECTS[0];
          await loadUsers(activeProject);
          return;
        }

        if (action === 'view') {
          setMessage('');
          await loadUserHistory(row.dataset.userId);
        }
      } catch (error) {
        setMessage(error.message);
      }
    });
  }
}

bootstrap();
