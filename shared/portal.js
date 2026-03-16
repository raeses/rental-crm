async function fetchProjects() {
  const response = await fetch('/api/auth/projects');
  if (!response.ok) throw new Error('Не удалось загрузить проекты портала.');
  const payload = await response.json();
  return Array.isArray(payload.projects) ? payload.projects : [];
}

function renderCard(project, index) {
  const article = document.createElement('article');
  article.className = 'portal-card';
  article.style.setProperty('--accent', project.themeColor || '#1f4e8c');
  article.style.animationDelay = `${index * 90}ms`;

  article.innerHTML = `
    <h2>${project.title}</h2>
    <div class="portal-tag">${project.tagline}</div>
    <p class="portal-description">${project.description}</p>
    <div class="portal-actions">
      <a class="portal-enter" href="${project.loginPath}">Войти</a>
      <span class="portal-route">${project.loginPath}</span>
    </div>
  `;

  return article;
}

async function bootstrapPortal() {
  const root = document.getElementById('portalCards');
  if (!root) return;

  root.innerHTML = '<p class="portal-loading">Загрузка доступных систем...</p>';

  try {
    const projects = await fetchProjects();
    if (!projects.length) {
      root.innerHTML = '<p class="portal-loading">Проекты не настроены.</p>';
      return;
    }

    root.innerHTML = '';
    projects.forEach((project, index) => {
      root.appendChild(renderCard(project, index));
    });
  } catch (error) {
    root.innerHTML = `<p class="portal-loading">${error.message}</p>`;
  }
}

bootstrapPortal();
