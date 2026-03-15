function renderPortalCards() {
  const grid = document.getElementById('portalGrid');
  if (!grid || !Array.isArray(window.PORTAL_BUSINESSES)) return;

  grid.innerHTML = window.PORTAL_BUSINESSES.map(business => `
    <article class="portal-card ${business.accent}">
      <div class="portal-card-meta">
        <span class="portal-chip">${business.status === 'live' ? 'Активная система' : 'Новый контур'}</span>
        <span class="portal-chip portal-chip-muted">${business.subtitle}</span>
      </div>
      <div>
        <h3>${business.name}</h3>
        <p>${business.description}</p>
      </div>
      <div class="portal-card-footer">
        <div class="portal-card-route">${business.loginPath}</div>
        <a class="portal-button" href="${business.loginPath}">Войти</a>
      </div>
    </article>
  `).join('');
}

renderPortalCards();
