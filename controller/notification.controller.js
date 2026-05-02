import Notification from '../models/notification.model.js';
import '../models/jobApply.model.js';
import '../models/jobs.model.js';
import { NotFoundError } from '../utils/errors.js';

const notificationController = {};

const buildOwnerQuery = (userId) => ({
  $or: [{ user: userId }, { candidate: userId }],
});

const getOwnerId = (notification) => notification?.user || notification?.candidate;

/**
 * Get all notifications for the logged-in user
 * @route GET /api/v1/candidate-dashboard/notifications
 * @access Private
 */
notificationController.getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 10, page = 1, isRead } = req.query;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - THIRTY_DAYS_MS);

    const query = {
      ...buildOwnerQuery(userId),
      createdAt: { $gte: cutoffDate },
    };

    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    const notifications = await Notification.find(query)
      .populate('jobPost', 'title companyProfile')
      .populate('application')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

    const totalCount = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      ...buildOwnerQuery(userId),
      isRead: false,
      createdAt: { $gte: cutoffDate },
    });

    return res.status(200).json({
      success: true,
      notifications,
      totalCount,
      unreadCount,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a notification as read
 * @route PUT /api/v1/candidate-dashboard/notifications/:id/read
 * @access Private
 */
notificationController.markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notification = await Notification.findById(id);
    const ownerId = getOwnerId(notification);

    if (!notification || ownerId?.toString() !== userId.toString()) {
      throw new NotFoundError('Notification not found');
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notification,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read
 * @route PUT /api/v1/candidate-dashboard/notifications/mark-all-read
 * @access Private
 */
notificationController.markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { ...buildOwnerQuery(userId), isRead: false },
      { isRead: true }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a notification
 * @route DELETE /api/v1/candidate-dashboard/notifications/:id
 * @access Private
 */
notificationController.deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Atomic owner-scoped delete to avoid race-condition 404s
    // (e.g., duplicate delete requests from client).
    const deletedNotification = await Notification.findOneAndDelete({
      _id: id,
      ...buildOwnerQuery(userId),
    });

    if (!deletedNotification) {
      return res.status(200).json({
        success: true,
        message: 'Notification already deleted or not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get unread notification count
 * @route GET /api/v1/candidate-dashboard/notifications/unread/count
 * @access Private
 */
notificationController.getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - THIRTY_DAYS_MS);

    const unreadCount = await Notification.countDocuments({
      ...buildOwnerQuery(userId),
      isRead: false,
      createdAt: { $gte: cutoffDate },
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

export default notificationController;
