function Card({ children, className = '', ...props }) {
  return <section className={`dashboard-card ${className}`} {...props}>{children}</section>
}

export default Card
