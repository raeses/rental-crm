import { Router } from 'express';
import {
  archiveItemHandler,
  createItemHandler,
  getItemHandler,
  listItemsHandler,
  restoreItemHandler,
  updateItemHandler
} from '../controllers/itemsController.js';

const router = Router();

router.get('/', listItemsHandler);
router.post('/', createItemHandler);
router.get('/:id', getItemHandler);
router.put('/:id', updateItemHandler);
router.post('/:id/archive', archiveItemHandler);
router.post('/:id/restore', restoreItemHandler);

export default router;
