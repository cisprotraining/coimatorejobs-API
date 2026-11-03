// Jobs are public only after any required employer approval is complete.
// Keep older records that predate this field public, matching the schema's
// historical default while excluding every explicitly pending/ignored state.
export const PUBLIC_JOB_APPROVAL_STATUSES = Object.freeze([
  'not_required',
  'accepted',
  null,
]);

export const publicJobApprovalFilter = (filter = {}) => ({
  ...filter,
  jobApprovalStatus: { $in: [...PUBLIC_JOB_APPROVAL_STATUSES] },
});

export const isPublicJobApprovalStatus = (status) =>
  status === undefined ||
  status === null ||
  status === '' ||
  status === 'not_required' ||
  status === 'accepted';
