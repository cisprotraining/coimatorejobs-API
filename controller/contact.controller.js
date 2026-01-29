// controllers/contact.controller.js
import ContactInquiry from  '../models/contactInquiry.model.js'; // optional MongoDB model
import { sendContactEmails } from '../utils/mailer.js';

const contactController = {};

/**
 * Submit contact form (dashboard small form or full contact-us page)
 * @route POST /api/v1/contact/submit
 * @access Public
 */
contactController.submitContactForm = async (req, res) => {
  try {
    const {
      name,           // required
      email,          // required
      subject = '',   // optional 
      message,        // required
      formType = 'general', // 'general' or 'dashboard' or any
    } = req.body;

    // validation
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }

    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required',
      });
    }

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }

    // Save to database 
    const inquiry = new ContactInquiry({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim() || 'General Inquiry',
      message: message.trim(),
      formType,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      submittedAt: new Date(),
    });

    await inquiry.save().catch(err => {
      console.error('Failed to save inquiry:', err);
      // don't fail the request if DB save fails
    });

    // Send email notification to admin
    // const adminEmailBody = `
    //   New Contact Form Submission (${formType.toUpperCase()})

    //   Name: ${name}
    //   Email: ${email}
    //   Subject: ${subject || 'N/A'}
    //   Message:
    //   ${message}

    //   Submitted: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
    //   IP: ${req.ip}
    // `;

    // await sendEmail({
    //   to: process.env.ADMIN_EMAIL || 'admin@yourdomain.com',
    //   subject: `New Contact Inquiry - ${formType.toUpperCase()}`,
    //   text: adminEmailBody,
    //   html: adminEmailBody.replace(/\n/g, '<br>'),
    // });

    // // Send auto-reply to user
    // const userReplyBody = `
    //   Thank you for reaching out!

    //   We have received your message:
    //   "${message.substring(0, 150)}${message.length > 150 ? '...' : ''}"

    //   Our team will get back to you within 24-48 hours.

    //   Best regards,
    //   CoimbatoreJobs Team
    // `;

    // await sendEmail({
    //   to: email,
    //   subject: 'Thank You for Contacting Us',
    //   text: userReplyBody,
    //   html: userReplyBody.replace(/\n/g, '<br>'),
    // }).catch(err => {
    //   console.error('Auto-reply failed:', err);
    //   // still succeed the request
    // });

    // send emails
     await sendContactEmails({
      name,
      email,
      subject,
      message,
      formType,
      ipAddress: req.ip
    });


    return res.status(200).json({
      success: true,
      message: 'Thank you! Your message has been sent successfully.',
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
    });
  }
};

export default contactController;