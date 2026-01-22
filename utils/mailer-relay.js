import nodemailer from "nodemailer";

// IMPORTANT:
// Replace with YOUR domain MX endpoint
// Example: coimbatorejobs-in.mail.protection.outlook.com
const transporter = nodemailer.createTransport({
  host: "coimbatorejobs-in.mail.protection.outlook.com",
  port: 25,
  secure: false, // MUST be false for port 25
  tls: {
    rejectUnauthorized: false,
  },
  // ❌ NO AUTH
  // auth: NOT USED
});

// Optional verification
transporter.verify((error) => {
  if (error) {
    console.error("❌ SMTP Relay verification failed:", error);
  } else {
    console.log("✅ SMTP Relay transporter ready (No Auth)");
  }
});

// Example send
export const sendTestRelayMail = async () => {
  await transporter.sendMail({
    from: "no-reply@coimbatorejobs.in", // MUST be your tenant domain
    to: "test@gmail.com",
    subject: "SMTP Relay Test (No Password)",
    text: "Sent using Microsoft 365 SMTP Relay (IP authenticated).",
  });

  console.log("📧 Relay email sent");
};
