import nodemailer from 'nodemailer';
import ResumeAlert from '../models/resumeAlert.model.js';
import { BadRequestError } from './errors.js';

const isProd = process.env.NODE_ENV === "production";

// mail delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// SMTP TRANSPORTER (HYBRID)
const transporter = nodemailer.createTransport(
  isProd
    ? {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          ciphers: "SSLv3",
          rejectUnauthorized: false, // REQUIRED on Render
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      }
    : {

         // 🧪 DEVELOPMENT → Mailtrap
        host: process.env.MAILTRAP_HOST,
        port: process.env.MAILTRAP_PORT,
        auth: {
          user: process.env.MAILTRAP_USER,
          pass: process.env.MAILTRAP_PASS,
        },
         pool: false,

        //  development → Gmail SMTP
        // host: "smtp.gmail.com",
        // port: 587,
        // secure: false,
        // auth: {
        //   user: process.env.EMAIL_USER,
        //   pass: process.env.EMAIL_PASS,
        // },
      }
);

transporter.verify((error) => {
  if (error) {
    console.error("❌ Gmail transporter error:", error);
  } else {
    console.log("✅ Gmail SMTP connected successfully");
  }
});

// BASE EMAIL SENDER (DO NOT CHANGE UI)
const sendMail = async ({ to, subject, html, cc = [] }) => {
  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    cc,  // Provision for additional recipients (e.g., support@, admin@)
    subject,
    html,
  });
};

// Function to send job alert email
const sendJobAlertEmail = async ({ recipient, jobTitle, companyName, jobId }) => {
  try {
    if (!recipient) {
      throw new Error('Recipient email is missing');
    }
   
    await sendMail({
      to: recipient,
      subject: `New Job Alert: ${jobTitle}`,
      html: `
        <h2>New Job Opportunity!</h2>
        <p>A new job matching your alert criteria has been posted:</p>
        <p><strong>Job Title:</strong> ${jobTitle}</p>
        <p><strong>Company:</strong> ${companyName}</p>
        <p><a href="${process.env.FRONTEND_URL}/job-single-v3/${jobId}">View Job Details</a></p>
        <p>Update your job alerts or apply directly via your dashboard.</p>
        <p>Best regards,<br><strong>Coimbatore Jobs Team</strong></p>
      `,
      cc: [process.env.MAIL_JOBS] // Provision for other mails (e.g., jobalerts@)
    });
    console.log(`Job alert sent to ${recipient} for ${jobTitle}`);
  } catch (error) {
    console.error(`Failed to send job alert to ${recipient}:`, error);
    throw new BadRequestError('Failed to send job alert email');
  }
};

// Send resume alert email
const sendResumeAlertEmail = async ({
  recipient,
  candidateName,
  jobTitle,
  profileId,
  alert,
  matchScore,
}) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
     await sendMail({
      to: recipient,
      subject: `New Resume Match: ${candidateName} for "${alert.title}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🎯 New Candidate Match!</h2>
          <p>We found a new candidate who closely matches your alert <strong>"${alert.title}"</strong>.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Candidate:</strong> ${candidateName}</p>
            <p><strong>Job Title:</strong> ${jobTitle}</p>
            <p><strong>Match Score:</strong> ${matchScore ? matchScore.toFixed(1) + '%' : 'N/A'}</p>
            <p><strong>Criteria:</strong></p>
            <ul>
              ${
                alert.criteria.categories?.length
                  ? `<li>Categories: ${alert.criteria.categories.join(', ')}</li>`
                  : ''
              }
              ${
                alert.criteria.location?.city
                  ? `<li>Location: ${alert.criteria.location.city}</li>`
                  : ''
              }
              ${
                alert.criteria.experience
                  ? `<li>Experience: ${alert.criteria.experience}</li>`
                  : ''
              }
              ${
                alert.criteria.skills?.length
                  ? `<li>Skills: ${alert.criteria.skills.join(', ')}</li>`
                  : ''
              }
              ${
                alert.criteria.educationLevels?.length
                  ? `<li>Education: ${alert.criteria.educationLevels.join(', ')}</li>`
                  : ''
              }
            </ul>
          </div>
          <div style="text-align: center; margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL}employer-dashboard/candidates/${profileId}"
               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Candidate Profile
            </a>
          </div>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 14px;">
              You’re receiving this email because you set up a resume alert on our platform.<br>
              <a href="${process.env.FRONTEND_URL}employer-dashboard/resume-alerts/${alert._id}/manage" style="color: #2563eb;">Manage this alert</a> |
              <a href="${process.env.FRONTEND_URL}employer-dashboard/notification-settings" style="color: #2563eb;">Notification Settings</a>
            </p>
          </div>
        </div>
      `,
      cc: [process.env.MAIL_SUPPORT] // Provision for other mails (e.g., support@)
    });
    console.log(
      `📧 Resume alert sent to ${recipient} for candidate ${candidateName} (${matchScore?.toFixed(1) || 'N/A'}%)`
    );
    // Update alert stats in DB
    await ResumeAlert.findByIdAndUpdate(alert._id, {
      $inc: { 'stats.emailsSent': 1, 'stats.totalMatches': 1 },
      $set: { 'stats.lastMatch': new Date() },
    });
  } catch (error) {
    console.error(`Failed to send resume alert email to ${recipient}:`, error);
    throw new Error('Failed to send resume alert email');
  }
};

// PASSWORD RESET EMAIL FUNCTION
const sendPasswordResetEmail = async ({ recipient, name, resetUrl }) => {
  try {
    if (!recipient) {
      throw new Error('Recipient email is missing');
    }
   await sendMail({
      to: recipient,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Reset Your Password</h2>
          <p>Hello ${name || 'User'},</p>
          <p>You requested to reset your password on Coimbatore Jobs.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p><small>This link expires in 10 minutes.</small></p>
          <p>If you didn't request this, ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">© ${new Date().getFullYear()} Coimbatore Jobs by Cispro</p>
        </div>
      `,
      cc: [process.env.MAIL_SECURITY] // Provision for security@ or other
    });
    console.log(`Password reset email sent to ${recipient}`);
  } catch (error) {
    console.error('Password reset email failed:', error);
    throw new Error('Failed to send password reset email');
  }
};

// Send welcome email to new user
const sendWelcomeEmail = async ({ recipient, name }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
     await sendMail({
      from: `"Welcome to Coimbatore Jobs" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: 'Welcome to Coimbatore Jobs - Your Registration is Successful!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #2563eb;">Welcome, ${name}!</h2>
         
          <p>Thank you for registering with <strong>Coimbatore Jobs</strong>. Your account has been successfully created.</p>
         
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>What’s Next?</strong></p>
            <ul style="list-style-type: disc; padding-left: 20px;">
              <li>Complete your profile to get better job matches</li>
              <li>Browse and apply to jobs in Coimbatore</li>
              <li>Set up job alerts for personalized notifications</li>
            </ul>
          </div>
         
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/login"
               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Go to Dashboard
            </a>
          </div>
         
          <p>If you have any questions, our support team is here to help at support@coimbatorejobs.com.</p>
         
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
         
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.<br />
            This is an automated message — please do not reply.
          </p>
        </div>
      `,
      cc: [process.env.MAIL_SUPPORT] // Provision for support@ or other
    });
    console.log(`Welcome email sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send welcome email to ${recipient}:`, error);
  }
};

// Helper to get status color & icon
const getStatusStyle = (eventType) => {
  switch (eventType) {
    case 'approved':
      return { color: '#22c55e', icon: '✅', label: 'Approved' };
    case 'rejected':
      return { color: '#ef4444', icon: '❌', label: 'Rejected' };
    case 'deleted':
      return { color: '#ef4444', icon: '🗑️', label: 'Deleted' };
    case 'password_reset':
      return { color: '#f59e0b', icon: '🔑', label: 'Password Reset' };
    case 'create_profile':
      return { color: '#0bf5f5', icon: '👍', label: 'Create Profile' };
    case 'new_registration':
    default:
      return { color: '#3b82f6', icon: '🔔', label: 'New Registration' };
  }
};

// Unified superadmin alert sender (used for all events)
const sendSuperadminAlertEmail = async ({
  superadminEmail,
  eventType = 'new_registration', // approved, rejected, deleted, password_reset, new_registration
  userEmail,
  userRole,
  message = '',
  actorEmail = '', // who performed the action (admin/hr-admin)
  dashboardLink = `${process.env.FRONTEND_URL}/super-admin/user-status`
}) => {
  try {
    if (!superadminEmail) throw new Error('Superadmin email not configured');

    const { color, icon, label } = getStatusStyle(eventType);
    const subjectPrefix = {
      new_registration: 'New User Registered',
      approved: 'User / Profile Approved',
      rejected: 'User / Profile Rejected',
      deleted: 'User / Profile Deleted',
      password_reset: 'User Password Reset by Admin'
    }[eventType] || 'Platform Alert';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: ${color};">${icon} ${label} Alert</h2>
        
        <p>A ${eventType.replace('_', ' ')} event occurred on Coimbatore Jobs:</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid ${color};">
          <p><strong>User Email:</strong> ${userEmail}</p>
          <p><strong>Role:</strong> ${userRole.charAt(0).toUpperCase() + userRole.slice(1)}</p>
          ${actorEmail ? `<p><strong>Performed by:</strong> ${actorEmail}</p>` : ''}
          <p><strong>Time:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
          ${message ? `<p><strong>Details:</strong> ${message}</p>` : ''}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardLink}"
             style="background: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View in Dashboard
          </a>
        </div>
        
        <p>This is an automated alert for monitoring and moderation purposes.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
        
        <p style="color: #64748b; font-size: 12px; text-align: center;">
          © ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.<br>
          This is a system-generated notification — please do not reply.
        </p>
      </div>
    `;

    await sendMail({
      from: `"System Alert" <${process.env.EMAIL_USER}>`,
      to: superadminEmail,
      subject: `${subjectPrefix}: ${userEmail} (${userRole})`,
      html,
      cc: [process.env.MAIL_GENERAL, process.env.MAIL_SECURITY].filter(Boolean) // only if set
    });

    console.log(`Superadmin alert sent: ${eventType} for ${userEmail}`);
  } catch (error) {
    console.error(`Failed to send superadmin alert (${eventType}):`, error);
  }
};

// Send user status update email (approved/rejected)
const sendUserStatusUpdateEmail = async ({ recipient, name, status, role }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
    await sendMail({
      from: `"Account Update" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: `Your ${role} Account Status Updated`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: ${status === 'approved' ? '#22c55e' : '#ef4444'};">Account Status Update</h2>
          
          <p>Dear ${name},</p>
          <p>Your ${role} account on Coimbatore Jobs has been <strong>${status}</strong>.</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>
              ${status === 'approved' 
                ? 'You can now log in and start using our platform.' 
                : 'If you believe this is an error, please contact support.'}
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}${status === 'approved' ? '/login' : '/support'}"
               style="background: ${status === 'approved' ? '#22c55e' : '#ef4444'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              ${status === 'approved' ? 'Log In Now' : 'Contact Support'}
            </a>
          </div>
          
          <p>Best regards,<br>Coimbatore Jobs Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.
          </p>
        </div>
      `,
      cc: [process.env.MAIL_SUPPORT] // Provision for support@
    });
    console.log(`User status update (${status}) sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send status update email to ${recipient}:`, error);
  }
};

// Send password reset success email
const sendPasswordResetSuccessEmail = async ({ recipient, name }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
    await sendMail({
      from: `"Security Alert" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: 'Password Reset Successful',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #22c55e;">Password Reset Complete</h2>
          
          <p>Dear ${name},</p>
          <p>Your password has been successfully reset on Coimbatore Jobs.</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>If you didn't request this change, please contact our security team immediately.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/login"
               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Log In to Your Account
            </a>
          </div>
          
          <p>For security, we recommend reviewing your recent account activity.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.
          </p>
        </div>
      `,
      cc: [process.env.MAIL_SECURITY] // Provision for report@
    });
    console.log(`Password reset success email sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send password reset success email to ${recipient}:`, error);
  }
};

// Send admin-initiated password reset email
const sendAdminPasswordResetEmail = async ({ recipient, name, adminEmail }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
    await sendMail({
      from: `"Admin Notification" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: 'Your Password Has Been Reset by Admin',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #ef4444;">Password Reset Notification</h2>
          
          <p>Dear ${name},</p>
          <p>Your password has been reset by an administrator (${adminEmail}).</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>Please log in with your new password and change it immediately for security reasons.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/login"
               style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Log In Now
            </a>
          </div>
          
          <p>If you have any concerns, please contact support.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.
          </p>
        </div>
      `,
      cc: [process.env.MAIL_SECURITY, process.env.MAIL_SUPPORT] // Provisions for report@ and support@
    });
    console.log(`Admin password reset email sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send admin password reset email to ${recipient}:`, error);
  }
};

// Send profile deletion email
const sendProfileDeletionEmail = async ({ recipient, name, role, deletedBy }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
    await sendMail({
      from: `"Account Update" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: 'Your Profile Has Been Deleted',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #ef4444;">Profile Deletion Notification</h2>
          
          <p>Dear ${name},</p>
          <p>Your ${role} profile on Coimbatore Jobs has been deleted by ${deletedBy}.</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>If this was not intended, please contact our support team immediately.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/support"
               style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Contact Support
            </a>
          </div>
          
          <p>We're sorry to see you go. If you'd like to create a new account, visit our website.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.
          </p>
        </div>
      `,
      cc: [process.env.MAIL_PRIVACY, process.env.MAIL_SUPPORT] // Provisions for privacy@ and support@
    });
    console.log(`Profile deletion email sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send profile deletion email to ${recipient}:`, error);
  }
};

// Send company profile status update email
const sendCompanyProfileStatusEmail = async ({ recipient, name, companyName, status, rejectionReason, dashboardUrl }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
    await sendMail({
      from: `"Profile Update" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: `Your Company Profile Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: ${status === 'approved' ? '#22c55e' : '#ef4444'};">Company Profile Update</h2>
          
          <p>Dear ${name},</p>
          <p>Your company profile for <strong>${companyName}</strong> has been <strong>${status}</strong>.</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            ${
              status === 'approved'
                ? '<p>You can now post jobs and manage your company page.</p>'
                : `<p>Reason: ${rejectionReason || 'N/A'}</p><p>Please update and resubmit your profile.</p>`
            }
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}"
               style="background: ${status === 'approved' ? '#22c55e' : '#ef4444'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Go to Dashboard
            </a>
          </div>
          
          <p>If you have questions, contact support@coimbatorejobs.com</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.
          </p>
        </div>
      `,
      cc: [process.env.MAIL_EMPLOYERS] // Provision for employers@
    });
    console.log(`Company profile status (${status}) sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send company profile status email to ${recipient}:`, error);
  }
};

// Send candidate profile status update email
const sendCandidateProfileStatusEmail = async ({ recipient, name, status, rejectionReason, dashboardUrl }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');
    await sendMail({
      from: `"Profile Update" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: `Your Candidate Profile Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: ${status === 'approved' ? '#22c55e' : '#ef4444'};">Candidate Profile Update</h2>
          
          <p>Dear ${name},</p>
          <p>Your candidate profile has been <strong>${status}</strong>.</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            ${
              status === 'approved'
                ? '<p>You can now apply for jobs and be visible to employers.</p>'
                : `<p>Reason: ${rejectionReason || 'N/A'}</p><p>Please update and resubmit your profile.</p>`
            }
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}"
               style="background: ${status === 'approved' ? '#22c55e' : '#ef4444'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Go to Dashboard
            </a>
          </div>
          
          <p>If you have questions, contact support@coimbatorejobs.com</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.
          </p>
        </div>
      `,
      cc: [process.env.MAIL_SUPPORT] // Provision for support@
    });
    console.log(`Candidate profile status (${status}) sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send candidate profile status email to ${recipient}:`, error);
  }
};

export { sendJobAlertEmail, sendResumeAlertEmail, sendPasswordResetEmail, sendWelcomeEmail, sendSuperadminAlertEmail, sendUserStatusUpdateEmail, sendPasswordResetSuccessEmail, sendAdminPasswordResetEmail, sendProfileDeletionEmail, sendCompanyProfileStatusEmail, sendCandidateProfileStatusEmail };