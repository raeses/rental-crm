import { Router } from 'express';
import {
  archiveEstimateHandler,
  createEstimateHandler,
  createEstimateItemHandler,
  deleteEstimateItemHandler,
  estimatePdfHandler,
  getEstimateHandler,
  listProjectEstimatesHandler,
  reorderEstimateItemsHandler,
  updateEstimateHandler,
  updateEstimateItemHandler
} from '../controllers/estimatesController.js';

const router = Router();

router.post('/estimates', createEstimateHandler);
router.get('/estimates/:id', getEstimateHandler);
router.put('/estimates/:id', updateEstimateHandler);
router.post('/estimates/:id/archive', archiveEstimateHandler);
router.get('/projects/:projectId/estimates', listProjectEstimatesHandler);

router.post('/estimates/:estimateId/items', createEstimateItemHandler);
router.put('/estimate-items/:id', updateEstimateItemHandler);
router.delete('/estimate-items/:id', deleteEstimateItemHandler);
router.post('/estimates/:id/reorder-items', reorderEstimateItemsHandler);

router.get('/estimates/:id/pdf', estimatePdfHandler);

export default router;
