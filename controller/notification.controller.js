import Notification from '../models/notification.model.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const notificationController = {};

/**
 * Get all notifications for a candidate
 * @route GET /api/v1/candidate-dashboard/notifications
 * @access Private (Candidate only)
 */
notificationController.getNotifications = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const { limit = 10, page = 1, isRead } = req.query;

    const query = { candidate: candidateId };

    // Filter by read status if provided
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    const notifications = await Notification.find(query)
      .populate('jobPost', 'title companyProfile')
      .populate('application')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalCount = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ candidate: candidateId, isRead: false });

    return res.status(200).json({
      success: true,
      notifications,
      totalCount,
      unreadCount,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a notification as read
 * @route PUT /api/v1/candidate-dashboard/notifications/:id/read
 * @access Private (Candidate only)
 */
notificationController.markAsRead = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification || notification.candidate.toString() !== candidateId.toString()) {
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
 * @access Private (Candidate only)
 */
notificationController.markAllAsRead = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    const result = await Notification.updateMany(
      { candidate: candidateId, isRead: false },
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
 * @access Private (Candidate only)
 */
notificationController.deleteNotification = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification || notification.candidate.toString() !== candidateId.toString()) {
      throw new NotFoundError('Notification not found');
    }

    await Notification.deleteOne({ _id: id });

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
 * @access Private (Candidate only)
 */
notificationController.getUnreadCount = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    const unreadCount = await Notification.countDocuments({
      candidate: candidateId,
      isRead: false,
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
