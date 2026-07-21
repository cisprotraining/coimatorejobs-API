import FcmToken from '../models/fcmToken.model.js';
import { getFirebaseWebConfig, isFcmConfigured } from '../utils/fcm.js';

const pushNotificationController = {};

pushNotificationController.getConfig = async (req, res, next) => {
  try {
    const config = getFirebaseWebConfig();
    const isWebConfigured = Boolean(
      config.apiKey &&
        config.projectId &&
        config.messagingSenderId &&
        config.appId &&
        config.vapidKey,
    );

    return res.status(200).json({
      success: true,
      config,
      isWebConfigured,
      isServerConfigured: isFcmConfigured(),
    });
  } catch (error) {
    next(error);
  }
};

pushNotificationController.registerToken = async (req, res, next) => {
  try {
    const { token, platform = 'web' } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required',
      });
    }

    const doc = await FcmToken.findOneAndUpdate(
      { token },
      {
        user: req.user.id,
        token,
        platform,
        userAgent: req.headers['user-agent'] || '',
        isActive: true,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(200).json({
      success: true,
      message: 'Notification token registered',
      id: doc._id,
    });
  } catch (error) {
    next(error);
  }
};

pushNotificationController.unregisterToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required',
      });
    }

    await FcmToken.updateOne(
      { user: req.user.id, token },
      { isActive: false, lastSeenAt: new Date() },
    );

    return res.status(200).json({
      success: true,
      message: 'Notification token unregistered',
    });
  } catch (error) {
    next(error);
  }
};

export default pushNotificationController;
