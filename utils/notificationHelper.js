import Notification from '../models/notification.model.js';

/**
 * Create a notification for any user (candidate/employer/admin)
 * @param {string} userId - User ID
 * @param {string} type - Notification type
 * @param {object} data - Notification data
 */
export const createNotification = async (userId, type, data) => {
  try {
    const notification = new Notification({
      user: userId,
      type,
      title: data.title,
      description: data.description,
      jobPost: data.jobPost || null,
      application: data.application || null,
      actionUrl: data.actionUrl || null,
      icon: data.icon || 'la-bell',
      color: data.color || '#2563eb',
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

/**
 * Notification presets
 */
export const notificationPresets = {
  applicationSubmitted: (jobTitle, companyName) => ({
    title: `Application Submitted Successfully`,
    description: `Your application for ${jobTitle} at ${companyName} has been submitted successfully.`,
    icon: 'la-check-circle',
    color: '#22c55e',
  }),

  applicationReviewed: (jobTitle) => ({
    title: `Application Under Review`,
    description: `Your application for ${jobTitle} is being reviewed by the employer.`,
    icon: 'la-eye',
    color: '#f59e0b',
  }),

  applicationSelected: (jobTitle) => ({
    title: `Application Selected`,
    description: `Congratulations! Your application for ${jobTitle} has been selected. The employer will contact you soon.`,
    icon: 'la-thumbs-up',
    color: '#22c55e',
  }),

  applicationRejected: (jobTitle) => ({
    title: `Application Status Update`,
    description: `Your application for ${jobTitle} was not selected. Don't be discouraged, keep applying!`,
    icon: 'la-times-circle',
    color: '#ef4444',
  }),

  jobAlert: (jobTitle, companyName) => ({
    title: `New Job Opportunity`,
    description: `A new job matches your profile: ${jobTitle} at ${companyName}.`,
    icon: 'la-lightning',
    color: '#f59e0b',
  }),

  profileUpdate: (message) => ({
    title: `Profile Update`,
    description: message,
    icon: 'la-user-check',
    color: '#2563eb',
  }),

  emailUpdate: (title, description) => ({
    title: title || 'Notification Update',
    description: description || 'You have a new update.',
    icon: 'la-envelope',
    color: '#1967d2',
  }),
};
