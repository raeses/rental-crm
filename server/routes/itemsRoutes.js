import { Router } from 'express';
import {
  createItemHandler,
  getItemHandler,
  listItemsHandler,
  updateItemHandler
} from '../controllers/itemsController.js';

const router = Router();

router.get('/', listItemsHandler);
router.post('/', createItemHandler);
router.get('/:id', getItemHandler);
router.put('/:id', updateItemHandler);

export default router;
