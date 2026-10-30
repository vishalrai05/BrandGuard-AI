function safeCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${protectedText.replaceAll('"', '""')}"`
}

function csv(rows, columns) {
  return `\uFEFF${[columns.map(([, label]) => safeCsvCell(label)).join(','), ...rows.map((row) => columns.map(([key]) => safeCsvCell(key.split('.').reduce((value, part) => value?.[part], row))).join(','))].join('\r\n')}`
}

export function findingsCsv(report) {
  const rows = report.findings.map((finding) => ({
    ...finding,
    evidenceCode: finding.evidence.refCode,
    evidenceTitle: finding.evidence.title,
    statusChangedBy: finding.statusChangedBy?.name ?? '',
    commentCount: finding.comments.length,
  }))
  return csv(rows, [
    ['number', 'Number'], ['severity', 'Severity'], ['type', 'Type'], ['category', 'Category'],
    ['source', 'Source'], ['evidenceCode', 'Evidence code'], ['evidenceTitle', 'Evidence title'],
    ['matchedText', 'Matched text'], ['suggestion', 'Suggestion'], ['status', 'Status'],
    ['statusChangedBy', 'Status changed by'], ['statusChangedAt', 'Status changed at'], ['commentCount', 'Comment count'],
  ])
}

export function summaryCsv(rows) {
  return csv(rows, [
    ['brandName', 'Brand'], ['source', 'Source'], ['createdAt', 'Created at'], ['createdBy.name', 'Created by'],
    ['workflowStatus', 'Workflow status'], ['total', 'Total findings'], ['high', 'High'], ['medium', 'Medium'],
    ['low', 'Low'], ['needsVerification', 'Needs verification'], ['complianceScore', 'Compliance score'],
    ['aiStatus', 'AI status'], ['fingerprint', 'Fingerprint'], ['id', 'Review ID'],
  ])
}

export function safeReportFilename(label, date, extension) {
  const slug = String(label || 'review').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'review'
  const day = new Date(date ?? Date.now()).toISOString().slice(0, 10)
  return `brandguard-report-${slug}-${day}.${extension}`
}

export function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function reportSummaryText(report) {
  const { summary, review, approval } = report
  return [
    `Brand Compliance Report — ${review.brandName}`,
    `Status: ${approval.status.replaceAll('_', ' ')}`,
    `Compliance score: ${summary.complianceScore}/100`,
    `Findings: ${summary.total} total (${summary.high} high, ${summary.medium} medium, ${summary.low} low)`,
    `Needs verification: ${summary.needsVerification}`,
    `Triage: ${summary.byStatus.open} open, ${summary.byStatus.accepted} accepted, ${summary.byStatus.dismissed} dismissed`,
    `Fingerprint: ${report.fingerprint}`,
  ].join('\n')
}
