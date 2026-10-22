function LoadingState({ label = 'Loading review...' }) {
  return (
    <div aria-live="polite" className="loading-state" role="status">
      <span className="loading-spinner" />
      <span className="skeleton" />
      <p>{label}</p>
    </div>
  )
}

export default LoadingState
