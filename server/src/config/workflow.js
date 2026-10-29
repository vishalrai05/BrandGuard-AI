export function isSelfApprovalAllowed() {
  return (process.env.ALLOW_SELF_APPROVAL ?? 'true').toLowerCase() !== 'false'
}

export const allowSelfApproval = isSelfApprovalAllowed()
