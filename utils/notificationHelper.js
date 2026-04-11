import Notification from '../models/notification.model.js';

/**
 * Create a notification for candidate
 * @param {string} candidateId - Candidate user ID
 * @param {string} type - Notification type
 * @param {object} data - Notification data
 */
export const createNotification = async (candidateId, type, data) => {
  try {
    const notification = new Notification({
      candidate: candidateId,
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
    title: `Application Submitted`,
    description: `You have successfully applied for ${jobTitle} at ${companyName}`,
    icon: 'la-check-circle',
    color: '#22c55e',
  }),

  applicationReviewed: (jobTitle) => ({
    title: `Application Under Review`,
    description: `Your application for ${jobTitle} is being reviewed by the employer`,
    icon: 'la-eye',
    color: '#f59e0b',
  }),

  applicationSelected: (jobTitle) => ({
    title: `Congratulations! Application Selected`,
    description: `Your application for ${jobTitle} has been selected. The employer will contact you soon!`,
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
    description: `A new job matching your profile: ${jobTitle} at ${companyName}`,
    icon: 'la-lightning',
    color: '#f59e0b',
  }),

  profileUpdate: (message) => ({
    title: `Profile Update`,
    description: message,
    icon: 'la-user-check',
    color: '#2563eb',
  }),
};
