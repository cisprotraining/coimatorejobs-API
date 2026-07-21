import { Router } from 'express';
import pushNotificationController from '../controller/pushNotification.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const pushNotificationRouter = Router();
const allRoles = ['candidate', 'employer', 'hr-admin', 'superadmin'];

pushNotificationRouter.get('/config', pushNotificationController.getConfig);
pushNotificationRouter.post('/token', authenticate, authorize(allRoles), pushNotificationController.registerToken);
pushNotificationRouter.delete('/token', authenticate, authorize(allRoles), pushNotificationController.unregisterToken);

export default pushNotificationRouter;
