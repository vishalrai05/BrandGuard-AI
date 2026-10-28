export const allowSelfApproval =
  (process.env.ALLOW_SELF_APPROVAL ?? 'true').toLowerCase() !== 'false'
