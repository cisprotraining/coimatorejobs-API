import isEmail from "validator/lib/isEmail.js";

export const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

export const isValidEmailAddress = (value = "") => {
  const email = normalizeEmail(value);
  if (!email) return false;

  return isEmail(email, {
    require_tld: true,
    allow_utf8_local_part: false,
    ignore_max_length: false,
  });
};
