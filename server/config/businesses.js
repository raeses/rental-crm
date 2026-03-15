const BUSINESSES = [
  {
    key: 'cinetools',
    name: 'CineTools',
    subtitle: 'Продажи',
    description: 'CRM для отдела продаж и сделок.',
    dashboardPath: '/cinetools/dashboard/',
    loginPath: '/cinetools/login/',
    plannedDatabaseEnv: 'CINETOOLS_DB_NAME',
    status: 'planned'
  },
  {
    key: 'apitchenkov',
    name: 'Apitchenkov',
    subtitle: 'Рентал',
    description: 'CRM для проката и учета оборудования.',
    dashboardPath: '/apitchenkov/dashboard/',
    loginPath: '/apitchenkov/login/',
    plannedDatabaseEnv: 'APITCHENKOV_DB_NAME',
    status: 'live'
  }
];

export function listBusinesses() {
  return BUSINESSES.map(({ key, name, subtitle, description, dashboardPath, loginPath, plannedDatabaseEnv, status }) => ({
    key,
    name,
    subtitle,
    description,
    dashboardPath,
    loginPath,
    plannedDatabaseEnv,
    status
  }));
}

export function getBusinessConfig(key) {
  return BUSINESSES.find(entry => entry.key === String(key || '').toLowerCase()) || null;
}

