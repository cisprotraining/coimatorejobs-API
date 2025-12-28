import nodemailer from 'nodemailer';
import { Resend } from 'resend';  //resend for mail configurations 
import ResumeAlert from '../models/resumeAlert.model.js';
import { BadRequestError } from './errors.js';


const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('Email transporter error:', error);
  } else {
    console.log('✅ Email transporter ready');
  }
});

// Initialize Resend with API key
// const resend = new Resend(process.env.RESEND_API_KEY);

// /**
//  * Get safe FROM address
//  * - Local / unverified → onboarding@resend.dev
//  * - Production verified → custom domain
//  */
// const getFromAddress = () => {
//   const appName = process.env.APP_NAME || 'Coimbatore Jobs';

//   if (process.env.NODE_ENV === 'production' && process.env.MAIL_FROM_EMAIL) {
//     return `${appName} <${process.env.MAIL_FROM_EMAIL}>`;
//   }

//   // Fallback (always works)
//   return `${appName} <onboarding@resend.dev>`;
// };

// test 
// if (process.env.NODE_ENV !== 'test') {
//   resend.emails.send({
//     from: 'onboarding@resend.dev', // Required for testing
//     to: 'delivered@resend.dev',
//     subject: 'Resend Test',
//     text: 'Resend is ready!',
//   }).catch(err => {
//     console.error('Resend connection failed:', err);
//   }).then(() => {
//     console.log('Resend email service ready');
//   });
// }


// commented for now due to production mail issue in gmail configuration
// Configure transporter (use environment variables for security)
// const transporter = nodemailer.createTransport({
//   service: 'gmail', // Use 'smtp.sendgrid.net' for SendGrid, etc.
//   auth: {
//     user: process.env.EMAIL_USER, // e.g., 'your-email@gmail.com'
//     pass: process.env.EMAIL_PASS, // Gmail App Password or API key
//   },
// });

// test mail configuration
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: { user: 'avarvind3765@gmail.com', pass: 'pogdwcemqatjvonk' },
// });
// transporter.sendMail({
//   from: 'avarvind3765@gmail.com',
//   to: 'aravindakumar3315@gmail.com',
//   subject: 'Test',
//   text: 'Test email',
// }, (err, info) => {
//   console.log(err || info);
// });

// Verify transporter configuration
// transporter.verify((error, success) => {
//   if (error) {
//     console.error('Email transporter error:', error);
//   } else {
//     console.log('Email transporter ready');
//     // In mailer.js, add at the top
//   }
// });

// Function to send job alert email
const sendJobAlertEmail = async ({ recipient, jobTitle, companyName, jobId }) => {
  try {

    if (!recipient) {
      throw new Error('Recipient email is missing');
    }
    
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [recipient],
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
    });

    if (error) {
      console.error('Resend job alert error:', error);
      throw new BadRequestError('Failed to send job alert email');
    }

    console.log(`Job alert sent to ${recipient} for ${jobTitle}`);
  } catch (error) {
    console.error(`Failed to send job alert to ${recipient}:`, error);
    throw new BadRequestError('Failed to send job alert email');
  }
};


// PASSWORD RESET EMAIL FUNCTION
const sendPasswordResetEmail = async ({ recipient, name, resetUrl }) => {
  try {
    if (!recipient) {
      throw new Error('Recipient email is missing');
    }

   const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [recipient],
      subject: 'Password Reset Request',
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
    });

    if (error) throw error;
    console.log(`Password reset email sent to ${recipient}`);
  } catch (error) {
    console.error('Password reset email failed:', error);
    throw new Error('Failed to send password reset email');
  }
};


// resume alert function
// const sendResumeAlertEmail = async ({ recipient, candidateName, jobTitle, profileId, alert }) => {
//   try {
//     if (!recipient) {
//       throw new Error('Recipient email is missing');
//     }
//     const mailOptions = {
//       from: `"Talent Alerts" <${process.env.EMAIL_USER}>`,
//       to: recipient,
//       subject: `New Resume Alert: ${candidateName} for "${alert.title}"`,
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2 style="color: #2563eb;">New Candidate Match!</h2>
//           <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
//             <h3 style="margin-top: 0;">Alert: ${alert.title}</h3>
//             <p><strong>Candidate:</strong> ${candidateName}</p>
//             <p><strong>Job Title:</strong> ${jobTitle}</p>
//             <p><strong>Criteria:</strong></p>
//             <ul>
//               ${alert.criteria.categories?.length > 0 ? `<li>Categories: ${alert.criteria.categories.join(', ')}</li>` : ''}
//               ${alert.criteria.location?.city ? `<li>Location: ${alert.criteria.location.city}</li>` : ''}
//               ${alert.criteria.experience ? `<li>Experience: ${alert.criteria.experience}</li>` : ''}
//               ${alert.criteria.skills?.length > 0 ? `<li>Skills: ${alert.criteria.skills.join(', ')}</li>` : ''}
//               ${alert.criteria.educationLevels?.length > 0 ? `<li>Education: ${alert.criteria.educationLevels.join(', ')}</li>` : ''}
//             </ul>
//           </div>
//           <div style="text-align: center; margin-top: 20px;">
//             <a href="${process.env.FRONTEND_URL}/employer/candidates/${profileId}" 
//                style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
//               View Candidate Profile
//             </a>
//           </div>
//           <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
//             <p style="color: #64748b; font-size: 14px;">
//               You're receiving this email because you set up a resume alert on our platform.<br>
//               <a href="${process.env.FRONTEND_URL}/employer/resume-alerts/${alert._id}/manage" style="color: #2563eb;">Manage this alert</a> |
//               <a href="${process.env.FRONTEND_URL}/employer/notification-settings" style="color: #2563eb;">Notification Settings</a>
//             </p>
//           </div>
//         </div>
//       `,
//     };
//     await transporter.sendMail(mailOptions);
//     console.log(`Resume alert email sent to ${recipient} for candidate ${candidateName}`);
//     await ResumeAlert.findByIdAndUpdate(alert._id, {
//       $inc: { 'stats.emailsSent': 1, 'stats.totalMatches': 1 },
//       $set: { 'stats.lastMatch': new Date() },
//     });
//   } catch (error) {
//     console.error(`Failed to send resume alert email to ${recipient}:`, error);
//     throw new BadRequestError('Failed to send resume alert email');
//   }
// };



/**
 * Sends a Resume Alert Email (Employer) using Resend
 */
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

    const { data, error } = await resend.emails.send({
      from: `Talent Alerts ${getFromAddress()}`, // Update to your verified domain later
      to: [recipient],
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
            <a href="${process.env.FRONTEND_URL}/employer/candidates/${profileId}" 
               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Candidate Profile
            </a>
          </div>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 14px;">
              You’re receiving this email because you set up a resume alert on our platform.<br>
              <a href="${process.env.FRONTEND_URL}/employer/resume-alerts/${alert._id}/manage" style="color: #2563eb;">Manage this alert</a> |
              <a href="${process.env.FRONTEND_URL}/employer/notification-settings" style="color: #2563eb;">Notification Settings</a>
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error(`Failed to send resume alert email to ${recipient}:`, error);
      throw new Error('Failed to send resume alert email');
    }

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


// Send welcome email to new user
// const sendWelcomeEmail = async ({ recipient, name }) => {
//   try {
//     const { data, error } = await resend.emails.send({
//       from: `Coimbatore Jobs ${getFromAddress()}`,
//       to: [recipient],
//       subject: 'Welcome to Coimbatore Jobs!',
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
//           <h2 style="color: #10b981;">Welcome, ${name}!</h2>
//           <p>Congratulations! Your account has been successfully created on <strong>Coimbatore Jobs</strong>.</p>
//           <p>Start exploring thousands of job opportunities in Coimbatore and beyond.</p>
//           <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
//             <strong>Next Steps:</strong>
//             <ul>
//               <li>Complete your profile for better job matches</li>
//               <li>Set up job alerts</li>
//               <li>Apply to jobs instantly</li>
//             </ul>
//           </div>
//           <div style="text-align: center;">
//             <a href="${process.env.FRONTEND_URL}/dashboard" style="background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px;">
//               Go to Dashboard
//             </a>
//           </div>
//           <p>Need help? Contact us at support@coimbatorejobs.com</p>
//           <hr>
//           <p style="color: #666; font-size: 12px;">© ${new Date().getFullYear()} Coimbatore Jobs by Cispro</p>
//         </div>
//       `,
//     });

//     if (error) throw error;
//     console.log(`Welcome email sent to ${recipient}`);
//   } catch (error) {
//     console.error('Welcome email failed:', error);
//   }
// };

// // Send alert to superadmin on new registration
// const sendSuperadminAlertEmail = async ({ superadminEmail, newUserEmail, newUserRole }) => {
//   try {
//     if (!superadminEmail) return;

//     const { data, error } = await resend.emails.send({
//       from: `System Alert ${getFromAddress()}`,
//       to: [superadminEmail],
//       subject: 'New User Registration',
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
//           <h2 style="color: #dc2626;">New User Registered</h2>
//           <p>A new user has joined Coimbatore Jobs:</p>
//           <div style="background: #fef2f2; padding: 15px; border-radius: 8px;">
//             <p><strong>Email:</strong> ${newUserEmail}</p>
//             <p><strong>Role:</strong> ${newUserRole}</p>
//             <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
//           </div>
//           <div style="text-align: center; margin: 20px 0;">
//             <a href="${process.env.FRONTEND_URL}/admin/users" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
//               View Admin Dashboard
//             </a>
//           </div>
//         </div>
//       `,
//     });

//     if (error) throw error;
//     console.log(`Superadmin alert sent for ${newUserEmail}`);
//   } catch (error) {
//     console.error('Superadmin alert failed:', error);
//   }
// };

// Send welcome email to new user
const sendWelcomeEmail = async ({ recipient, name }) => {
  try {
    if (!recipient) throw new Error('Recipient email is missing');

    const mailOptions = {
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
            <a href="${process.env.FRONTEND_URL}/dashboard" 
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
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${recipient}`);
  } catch (error) {
    console.error(`Failed to send welcome email to ${recipient}:`, error);
  }
};

// Send alert to superadmin on new registration
const sendSuperadminAlertEmail = async ({ superadminEmail, newUserEmail, newUserRole }) => {
  try {
    if (!superadminEmail) throw new Error('Superadmin email not configured');

    const mailOptions = {
      from: `"System Alert" <${process.env.EMAIL_USER}>`,
      to: superadminEmail,
      subject: 'New User Registration Alert',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #ef4444;">New User Registered</h2>
          
          <p>A new user has registered on Coimbatore Jobs:</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Email:</strong> ${newUserEmail}</p>
            <p><strong>Role:</strong> ${newUserRole.charAt(0).toUpperCase() + newUserRole.slice(1)}</p>
            <p><strong>Registration Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/admin/users" 
               style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Users Dashboard
            </a>
          </div>
          
          <p>This is an automated alert for monitoring purposes.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} Coimbatore Jobs by Cispro. All rights reserved.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Superadmin alert sent for new user ${newUserEmail}`);
  } catch (error) {
    console.error(`Failed to send superadmin alert:`, error);
  }
};

export { sendJobAlertEmail, sendResumeAlertEmail, sendPasswordResetEmail, sendWelcomeEmail, sendSuperadminAlertEmail };