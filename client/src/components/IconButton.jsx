function IconButton({ label, children, className = '', ...props }) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${className}`}
      title={label}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export default IconButton
