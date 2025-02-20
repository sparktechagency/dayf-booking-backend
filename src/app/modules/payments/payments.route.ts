
import { Router } from 'express';
import { paymentsController } from './payments.controller';

const router = Router();

router.post('/', paymentsController.createPayments);
router.patch('/:id', paymentsController.updatePayments);
router.delete('/:id', paymentsController.deletePayments);
router.get('/:id', paymentsController.getPaymentsById);
router.get('/', paymentsController.getAllPayments);

export const paymentsRoutes = router;