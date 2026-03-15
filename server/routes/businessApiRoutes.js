import { Router } from 'express';
import itemsRoutes from './itemsRoutes.js';
import projectsRoutes from './projectsRoutes.js';
import estimatesRoutes from './estimatesRoutes.js';
import { requireBusinessAuth } from '../middleware/auth.js';

export function createBusinessApiRouter(businessKey) {
  const router = Router();

  router.use(requireBusinessAuth(businessKey));
  router.use('/items', itemsRoutes);
  router.use('/projects', projectsRoutes);
  router.use('/', estimatesRoutes);

  return router;
}
