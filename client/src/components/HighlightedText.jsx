import { useMemo } from 'react'
import { AlertTriangle, BadgeCheck, CircleAlert } from 'lucide-react'
import { findingTypeLabel } from '../utils/findingLabels.js'

function segmentTone(findings) {
  if (findings.some((finding) => finding.type === 'needs_verification')) return 'verification'
  if (findings.some((finding) => finding.type === 'fact_mismatch')) return 'mismatch'
  return 'rule'
}

function signalIcon(tone) {
  if (tone === 'verification') return BadgeCheck
  if (tone === 'mismatch' || tone === 'high') return AlertTriangle
  return CircleAlert
}

function HighlightedText({ text, findings, selectedFindingId, onSelect, evidenceByCode = {} }) {
  const { segments, findingByKey, findingRank } = useMemo(() => {
    const validFindings = findings
      .map((finding, index) => ({
        ...finding,
        _key: finding._id ?? `finding-${index}`,
        start: Math.max(0, Math.min(text.length, finding.startIndex)),
        end: Math.max(0, Math.min(text.length, finding.endIndex)),
      }))
      .filter((finding) => finding.end > finding.start)
    const boundaries = new Set([0, text.length])
    const starts = new Map()
    const ends = new Map()
    for (const finding of validFindings) {
      boundaries.add(finding.start)
      boundaries.add(finding.end)
      starts.set(finding.start, [...(starts.get(finding.start) ?? []), finding._key])
      ends.set(finding.end, [...(ends.get(finding.end) ?? []), finding._key])
    }
    const points = [...boundaries].sort((a, b) => a - b)
    const active = new Set()
    const computed = points.slice(0, -1).map((start, index) => {
      for (const key of ends.get(start) ?? []) active.delete(key)
      for (const key of starts.get(start) ?? []) active.add(key)
      const end = points[index + 1]
      return { start, end, findingIds: [...active] }
    })
    return {
      segments: computed,
      findingByKey: new Map(validFindings.map((finding) => [finding._key, finding])),
      findingRank: new Map(validFindings.map((finding, index) => [finding._key, index + 1])),
    }
  }, [findings, text])

  return (
    <section aria-labelledby="highlighted-copy-title" className="highlight-panel">
      <div className="highlight-panel-head">
        <div>
          <h2 id="highlighted-copy-title">Reviewed content</h2>
          <p>Select a highlighted passage to open its finding details.</p>
        </div>
        <span className="original-label">Original text</span>
      </div>
      <div className="highlight-content">
        <p>
          {segments.map((segment) => {
            const content = text.slice(segment.start, segment.end)
            if (segment.findingIds.length === 0) return <span key={`text-${segment.start}`}>{content}</span>
            const findingId = segment.findingIds.includes(selectedFindingId) ? selectedFindingId : segment.findingIds[0]
            const active = segment.findingIds.map((key) => findingByKey.get(key)).filter(Boolean)
            const tone = segmentTone(active)
            const primary = active.find((finding) => finding._id === findingId) ?? active[0]
            const typeLabel = findingTypeLabel(primary, evidenceByCode[primary?.evidence?.refCode])
            const SignalIcon = signalIcon(tone)
            const showSignal = primary && primary.startIndex === segment.start
            const findingNumber = findingRank.get(findingId) ?? 1
            return (
              <mark
                aria-label={`${active.map((finding) => findingTypeLabel(finding, evidenceByCode[finding.evidence?.refCode])).join(', ')} finding`}
                className={`highlight-mark ${tone} ${active.every((finding) => finding.status === 'dismissed') ? 'highlight-dismissed' : ''} ${segment.findingIds.includes(selectedFindingId) ? 'selected review-highlight-pulse' : ''}`}
                id={active.some((finding) => finding._id === findingId && finding.startIndex === segment.start) ? `highlight-${findingId}` : undefined}
                key={`mark-${segment.start}`}
                onClick={() => onSelect(findingId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(findingId)
                  }
                }}
                role="button"
                tabIndex={0}
                title={active.map((finding) => `${findingTypeLabel(finding, evidenceByCode[finding.evidence?.refCode])} · ${finding.severity}`).join(' | ')}
              >
                {showSignal && (
                  <span className="highlight-signal">
                    <sup aria-hidden="true" className="highlight-number">{findingNumber}</sup>
                    <SignalIcon aria-hidden="true" size={11} />
                    {primary?.evidence?.kind === 'check' && <><span className="highlight-origin-label">CHECK</span><span className="highlight-code-label">{primary.evidence.refCode}</span></>}
                    <span className="highlight-signal-label">{typeLabel}</span>
                  </span>
                )}
                {content}
              </mark>
            )
          })}
        </p>
      </div>
      <div className="highlight-legend">
        <span><i className="legend-dot" /><AlertTriangle size={12} /> High / mismatch</span>
        <span><i className="legend-dot medium" /><CircleAlert size={12} /> Medium</span>
        <span><i className="legend-dot low" /><CircleAlert size={12} /> Low</span>
        <span><i className="legend-dot verification" /><BadgeCheck size={12} /> Needs verification</span>
      </div>
    </section>
  )
}

export default HighlightedText
