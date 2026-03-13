import { Router } from 'express';
import {
  createProjectHandler,
  getProjectHandler,
  listProjectsHandler,
  updateProjectHandler
} from '../controllers/projectsController.js';

const router = Router();

router.post('/', createProjectHandler);
router.get('/', listProjectsHandler);
router.get('/:id', getProjectHandler);
router.put('/:id', updateProjectHandler);

export default router;
