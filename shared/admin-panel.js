const MANAGED_PROJECTS = ['apitchenkov', 'cinetools'];

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
        <td><button class="admin-save" data-action="save">Сохранить</button></td>
      </tr>
    `)
    .join('');
}

async function loadUsers(projectSlug) {
  const payload = await api(`/api/admin/users?project=${encodeURIComponent(projectSlug)}`);
  renderUsers(Array.isArray(payload.users) ? payload.users : []);
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

  const currentProject = MANAGED_PROJECTS.includes(projectFilter?.value)
    ? projectFilter.value
    : MANAGED_PROJECTS[0];

  if (projectFilter) projectFilter.value = currentProject;
  await loadUsers(currentProject);

  if (projectFilter) {
    projectFilter.addEventListener('change', async () => {
      try {
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
        projectFilter.value = projectSlug;
        await loadUsers(projectSlug);
        setMessage('Пользователь создан.', false);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  if (usersBody) {
    usersBody.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.action !== 'save') return;

      const row = target.closest('tr[data-user-id]');
      if (!row) return;

      try {
        setMessage('');
        await saveUserRow(row);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }
}

bootstrap();
