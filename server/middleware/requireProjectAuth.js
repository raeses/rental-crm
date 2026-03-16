export function requireProjectAuth(projectSlug) {
  const normalizedProject = String(projectSlug || '').toLowerCase();

  return function ensureProjectSession(req, res, next) {
    const authByProject = req.session?.authByProject || {};
    const auth = authByProject[normalizedProject];

    if (!auth) {
      return res.status(401).json({
        error: 'Auth required',
        project: normalizedProject,
        loginPath: `/${normalizedProject}/login/`
      });
    }

    req.projectAuth = auth;
    return next();
  };
}
