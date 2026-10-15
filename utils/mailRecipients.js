export const cleanRecipients = (recipients = []) => [...new Set(
  [recipients].flat(Infinity).filter(Boolean)
    .flatMap((recipient) => String(recipient).split(/[,;]/))
    .map((recipient) => recipient.trim().toLowerCase())
    .filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
)];

// Notification exclusions never change account ownership or login emails.
export const getAdminAlertRecipients = (to, cc, blocked = '') => {
  const excluded = new Set(cleanRecipients(blocked));
  const primary = cleanRecipients(to).filter((email) => !excluded.has(email));
  return {
    to: primary,
    cc: cleanRecipients(cc).filter((email) => !excluded.has(email) && !primary.includes(email)),
  };
};
