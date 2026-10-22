import Pill from './Pill.jsx'

function SeverityBadge({ severity }) {
  return <Pill tone={['high', 'medium', 'low'].includes(severity) ? severity : 'neutral'}>{severity ?? 'unknown'}</Pill>
}

export default SeverityBadge
