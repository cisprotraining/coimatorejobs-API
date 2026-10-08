import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/user.model.js';

const DEFAULT_HR_ADMIN_ACCESS_TABS = [
  '/hr-admin-dashboard/dashboard',
  '/hr-admin-dashboard/create-candidates',
  '/hr-admin-dashboard/create-employers',
  '/hr-admin-dashboard/profile-status',
  '/hr-admin-dashboard/candidate-profile',
  '/hr-admin-dashboard/company-profile',
  '/hr-admin-dashboard/post-jobs',
  '/hr-admin-dashboard/manage-jobs',
  '/hr-admin-dashboard/all-applicants',
  '/hr-admin-dashboard/shortlisted-resumes',
  '/hr-admin-dashboard/employer-plans',
  '/hr-admin-dashboard/payment-plans',
  '/hr-admin-dashboard/settings',
];

const DEFAULT_EMPLOYER_ACCESS_TABS = [
  '/employers-dashboard/dashboard',
  '/employers-dashboard/company-profile',
  '/employers-dashboard/post-jobs',
  '/employers-dashboard/manage-jobs',
  '/employers-dashboard/all-applicants',
  '/employers-dashboard/shortlisted-resumes',
  '/employers-dashboard/plan-history',
  '/employers-dashboard/resume-alerts',
  '/employers-dashboard/settings',
];

const ACCOUNT_DEFINITIONS = [
  {
    type: 'candidate',
    role: 'candidate',
    nameEnv: 'PLAY_STORE_CANDIDATE_NAME',
    emailEnv: 'PLAY_STORE_CANDIDATE_EMAIL',
    passwordEnv: 'PLAY_STORE_CANDIDATE_PASSWORD',
    defaultName: 'Candidate Test Account',
  },
  {
    type: 'employer',
    role: 'employer',
    nameEnv: 'PLAY_STORE_EMPLOYER_NAME',
    emailEnv: 'PLAY_STORE_EMPLOYER_EMAIL',
    passwordEnv: 'PLAY_STORE_EMPLOYER_PASSWORD',
    defaultName: 'Employer Test Account',
  },
  {
    type: 'subAdmin',
    role: 'sub-admin',
    nameEnv: 'PLAY_STORE_SUBADMIN_NAME',
    emailEnv: 'PLAY_STORE_SUBADMIN_EMAIL',
    passwordEnv: 'PLAY_STORE_SUBADMIN_PASSWORD',
    defaultName: 'Sub Admin Test Account',
  },
];

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const parseCsv = (value = '') =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const buildEmployerId = () => `EMP-${crypto.randomInt(10000000, 100000000)}`;

const generateUniqueEmployerId = async () => {
  let employerId = buildEmployerId();
  while (await User.exists({ employerId })) {
    employerId = buildEmployerId();
  }
  return employerId;
};

export const getConfiguredTestAccounts = () =>
  ACCOUNT_DEFINITIONS.map((definition) => ({
    ...definition,
    name: String(process.env[definition.nameEnv] || definition.defaultName).trim(),
    email: normalizeEmail(process.env[definition.emailEnv]),
    password: String(process.env[definition.passwordEnv] || '').trim(),
  })).filter((account) => account.email && account.password);

export const getConfiguredTestAccountByEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);
  return getConfiguredTestAccounts().find((account) => account.email === normalizedEmail) || null;
};

export const isConfiguredTestAccount = (user) => {
  if (!user?.email) return false;
  const account = getConfiguredTestAccountByEmail(user.email);
  return Boolean(account && account.role === user.role);
};

const applyAccountFields = async (user, account) => {
  user.name = account.name;
  user.email = account.email;
  user.role = account.role;
  user.isActive = true;
  user.status = 'approved';
  user.isDeleted = false;
  user.deletedAt = undefined;
  user.deletedBy = undefined;
  user.assignmentSource = 'system';
  user.isSystemGeneratedEmail = false;
  user.loginOtpHash = undefined;
  user.loginOtpExpiresAt = undefined;
  user.loginOtpAttempts = 0;

  const passwordMatches = user.password
    ? await bcrypt.compare(account.password, user.password)
    : false;
  if (!passwordMatches) {
    user.password = await bcrypt.hash(account.password, 10);
  }

  if (account.role === 'employer') {
    user.employerRoleName = 'Owner';
    user.employerRoleType = 'owner';
    user.employerRoleRef = null;
    user.employerRoleRemoved = false;
    user.employerAccessTabs = parseCsv(process.env.PLAY_STORE_EMPLOYER_ACCESS_TABS).length
      ? parseCsv(process.env.PLAY_STORE_EMPLOYER_ACCESS_TABS)
      : DEFAULT_EMPLOYER_ACCESS_TABS;
    user.employerId = user.employerId || await generateUniqueEmployerId();
  }

  if (account.role === 'sub-admin') {
    user.hrAdminRoleName = String(process.env.PLAY_STORE_SUBADMIN_ROLE_NAME || 'Administrator').trim();
    user.hrAdminRoleType = 'default';
    user.hrAdminRoleRef = null;
    user.hrAdminRoleRemoved = false;
    user.hrAdminAccessTabs = parseCsv(process.env.PLAY_STORE_SUBADMIN_ACCESS_TABS).length
      ? parseCsv(process.env.PLAY_STORE_SUBADMIN_ACCESS_TABS)
      : DEFAULT_HR_ADMIN_ACCESS_TABS;
  }
};

export const syncPlayStoreTestAccounts = async () => {
  const accounts = getConfiguredTestAccounts();
  if (!accounts.length) {
    console.warn('Play Store test account env values are missing. Skipping test account sync.');
    return;
  }

  for (const account of accounts) {
    let user = await User.findOne({ email: account.email }).select('+password');
    if (!user) {
      user = new User({
        name: account.name,
        email: account.email,
        password: await bcrypt.hash(account.password, 10),
        role: account.role,
      });
    }

    await applyAccountFields(user, account);
    await user.save({ validateBeforeSave: false });
    console.log(`Play Store ${account.type} test account synced: ${account.email}`);
  }
};
