import { Router } from 'express';
import {
  listBusinessesHandler,
  loginHandler,
  logoutHandler,
  sessionHandler
} from '../controllers/authController.js';

const router = Router();

router.get('/businesses', listBusinessesHandler);
router.post('/:business/login', loginHandler);
router.post('/:business/logout', logoutHandler);
router.get('/:business/session', sessionHandler);

export default router;

