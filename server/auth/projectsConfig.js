import { appEnv } from '../config/env.js';

const PROJECT_METADATA = {
  cinetools: {
    slug: 'cinetools',
    title: 'CineTools',
    tagline: 'Продажи',
    description: 'CRM и учет для коммерческого контура продаж.',
    themeColor: '#0f4c81',
    loginPath: '/cinetools/login/',
    dashboardPath: '/cinetools/dashboard/',
    includeInPortal: true,
    managedUsers: true
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
    managedUsers: true
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
    managedUsers: false
  }
};

const DEV_FALLBACK_USERS = {
  cinetools: {
    id: 'dev-cinetools-admin',
    username: 'admin',
    role: 'admin',
    passwordHash:
      'scrypt$76baa213f726f7d71f26e32c5ec13652$ba25555da32956a8f7f331944cedf6085a5b16b899cda107bae45cb6c448d14acdf0d88252fc90f2b5097065895ef13d0de828523f975413eb34840ab83b8869'
  },
  apitchenkov: {
    id: 'dev-apitchenkov-admin',
    username: 'admin',
    role: 'admin',
    passwordHash:
      'scrypt$b5fc16fafc8224d11f12e00cbc84182e$e58521468b3812e0079dcc1ce09626fb17348cbd8d8125bcbc18f9c2645e9ce3064a493ad3e11eac0375ae7911b0168c49fecc6a88c4b7926a19233bc06627bd'
  },
  admin: {
    id: 'dev-portal-admin',
    username: 'portal-admin',
    role: 'superadmin',
    passwordHash:
      'scrypt$c3f14ba4d60d1632ccebfe271258e0f4$985a51bab40d0b6af17946159889e0dfb5de923e1a0801a96cbbecc40629a2f34459539beaf2f38f3c68f9c33e5009d224822731a6b4ad98285cf0c351e9fd4d'
  }
};

function getEnvConfiguredUser(projectSlug) {
  if (projectSlug === 'apitchenkov') {
    if (!appEnv.auth.apitchenkov.username || !appEnv.auth.apitchenkov.passwordHash) return null;
    return {
      id: 'env-apitchenkov-admin',
      username: appEnv.auth.apitchenkov.username,
      role: 'admin',
      passwordHash: appEnv.auth.apitchenkov.passwordHash
    };
  }

  if (projectSlug === 'cinetools') {
    if (!appEnv.auth.cinetools.username || !appEnv.auth.cinetools.passwordHash) return null;
    return {
      id: 'env-cinetools-admin',
      username: appEnv.auth.cinetools.username,
      role: 'admin',
      passwordHash: appEnv.auth.cinetools.passwordHash
    };
  }

  if (projectSlug === 'admin') {
    if (!appEnv.auth.admin.username || !appEnv.auth.admin.passwordHash) return null;
    return {
      id: 'env-portal-admin',
      username: appEnv.auth.admin.username,
      role: 'superadmin',
      passwordHash: appEnv.auth.admin.passwordHash
    };
  }

  return null;
}

function getConfiguredUsers(projectSlug) {
  const fromEnv = getEnvConfiguredUser(projectSlug);
  if (fromEnv) return [fromEnv];

  if (appEnv.security.enableDevAuthFallback) {
    const fallback = DEV_FALLBACK_USERS[projectSlug];
    return fallback ? [fallback] : [];
  }

  return [];
}

function getProjectWithUsers(projectSlug) {
  const metadata = PROJECT_METADATA[projectSlug];
  if (!metadata) return null;
  return {
    ...metadata,
    users: getConfiguredUsers(projectSlug)
  };
}

export const MANAGED_BUSINESS_PROJECTS = Object.values(PROJECT_METADATA)
  .filter((project) => project.managedUsers)
  .map((project) => project.slug);

export function getProjectConfig(projectSlug) {
  if (!projectSlug) return null;
  return getProjectWithUsers(String(projectSlug).toLowerCase());
}

export function listPortalProjects() {
  return Object.values(PROJECT_METADATA)
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
    project.users.find(
      (user) => String(user.username || '').trim().toLowerCase() === normalized
    ) || null
  );
}

export function getProjectDefaultUsers(projectSlug) {
  const project = getProjectConfig(projectSlug);
  if (!project) return [];
  return Array.isArray(project.users) ? project.users : [];
}
