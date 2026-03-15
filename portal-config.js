window.PORTAL_BUSINESSES = [
  {
    key: 'cinetools',
    name: 'CineTools',
    subtitle: 'Продажи',
    description: 'Отдельный контур для sales CRM, сделок, клиентов и воронки продаж.',
    loginPath: '/cinetools/login/',
    dashboardPath: '/cinetools/dashboard/',
    accent: 'portal-card-cinetools',
    status: 'planned'
  },
  {
    key: 'apitchenkov',
    name: 'Apitchenkov',
    subtitle: 'Рентал',
    description: 'Текущая CRM для проката, проектов, смет и каталога оборудования.',
    loginPath: '/apitchenkov/login/',
    dashboardPath: '/apitchenkov/dashboard/',
    accent: 'portal-card-apitchenkov',
    status: 'live'
  }
];

window.getPortalBusiness = function getPortalBusiness(key) {
  return window.PORTAL_BUSINESSES.find(entry => entry.key === String(key || '').toLowerCase()) || null;
};
