function Tabs({ items, active, onChange, label = 'Views' }) {
  return (
    <div aria-label={label} className="tabs" role="tablist">
      {items.map((item) => (
        <button
          aria-selected={active === item.value}
          className={`tab ${active === item.value ? 'tab-active' : ''}`}
          key={item.value}
          onClick={() => onChange(item.value)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default Tabs
