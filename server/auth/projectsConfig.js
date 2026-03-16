const PROJECTS = {
  cinetools: {
    slug: 'cinetools',
    title: 'CineTools',
    tagline: 'Продажи',
    description: 'CRM и учет для коммерческого контура продаж.',
    themeColor: '#0f4c81',
    loginPath: '/cinetools/login/',
    dashboardPath: '/cinetools/dashboard/',
    includeInPortal: true,
    managedUsers: true,
    defaultUsers: [
      {
        id: 'cinetools-admin',
        username: process.env.CINETOOLS_ADMIN_USERNAME || 'admin',
        role: 'admin',
        passwordHash:
          process.env.CINETOOLS_ADMIN_PASSWORD_HASH ||
          'scrypt$76baa213f726f7d71f26e32c5ec13652$ba25555da32956a8f7f331944cedf6085a5b16b899cda107bae45cb6c448d14acdf0d88252fc90f2b5097065895ef13d0de828523f975413eb34840ab83b8869'
      }
    ]
  },
  apitchenkov: {
    slug: 'apitchenkov',
    title: 'Apitchenkov',
    tagline: 'Рентал',
    description: 'CRM и операционный учет для прокатного бизнеса.',
    themeColor: '#174f3b',
    loginPath: '/apitchenkov/login/',
    dashboardPath: '/apitchenkov/dashboard/',
    includeInPortal: true,
    managedUsers: true,
    defaultUsers: [
      {
        id: 'apitchenkov-admin',
        username: process.env.APITCHENKOV_ADMIN_USERNAME || 'admin',
        role: 'admin',
        passwordHash:
          process.env.APITCHENKOV_ADMIN_PASSWORD_HASH ||
          'scrypt$b5fc16fafc8224d11f12e00cbc84182e$e58521468b3812e0079dcc1ce09626fb17348cbd8d8125bcbc18f9c2645e9ce3064a493ad3e11eac0375ae7911b0168c49fecc6a88c4b7926a19233bc06627bd'
      }
    ]
  },
  admin: {
    slug: 'admin',
    title: 'Admin Panel',
    tagline: 'Управление доступом',
    description: 'Создание и редактирование пользователей для CineTools и Apitchenkov.',
    themeColor: '#1d2a3a',
    loginPath: '/admin/login/',
    dashboardPath: '/admin/dashboard/',
    includeInPortal: true,
    managedUsers: false,
    defaultUsers: [
      {
        id: 'portal-admin',
        username: process.env.PORTAL_ADMIN_USERNAME || 'portal-admin',
        role: 'superadmin',
        passwordHash:
          process.env.PORTAL_ADMIN_PASSWORD_HASH ||
          'scrypt$c3f14ba4d60d1632ccebfe271258e0f4$985a51bab40d0b6af17946159889e0dfb5de923e1a0801a96cbbecc40629a2f34459539beaf2f38f3c68f9c33e5009d224822731a6b4ad98285cf0c351e9fd4d'
      }
    ]
  }
};

export const MANAGED_BUSINESS_PROJECTS = Object.values(PROJECTS)
  .filter((project) => project.managedUsers)
  .map((project) => project.slug);

export function getProjectConfig(projectSlug) {
  if (!projectSlug) return null;
  return PROJECTS[String(projectSlug).toLowerCase()] || null;
}

export function listPortalProjects() {
  return Object.values(PROJECTS)
    .filter((project) => project.includeInPortal)
    .map((project) => ({
      slug: project.slug,
      title: project.title,
      tagline: project.tagline,
      description: project.description,
      themeColor: project.themeColor,
      loginPath: project.loginPath,
      dashboardPath: project.dashboardPath
    }));
}

export function findConfiguredProjectUser(projectSlug, username) {
  const project = getProjectConfig(projectSlug);
  if (!project) return null;

  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;

  return (
    project.defaultUsers.find(
      (user) => String(user.username || '').trim().toLowerCase() === normalized
    ) || null
  );
}

export function getProjectDefaultUsers(projectSlug) {
  const project = getProjectConfig(projectSlug);
  if (!project) return [];
  return Array.isArray(project.defaultUsers) ? project.defaultUsers : [];
}
