import { FileText, LoaderCircle, Play, RotateCcw, Sparkles } from 'lucide-react'

const MAX_CHARACTERS = 10_000

function InputPanel({
  inputText, brandName, loading, onTextChange, onBrandNameChange,
  onLoadSample, onReview, onClear,
}) {
  return (
    <section className="input-panel">
      <div className="input-panel-header">
        <div><p className="eyebrow">Content review</p><h2>Check your copy before it ships</h2></div>
        <button className="text-link-button" onClick={onLoadSample} type="button"><Sparkles size={14} /> Load sample</button>
      </div>
      <label className="field-label" htmlFor="brand-name">Brand name</label>
      <input autoComplete="organization" className="text-input single-line" id="brand-name" maxLength={100} onChange={(event) => onBrandNameChange(event.target.value)} value={brandName} />
      <label className="field-label" htmlFor="content">Marketing content</label>
      <textarea
        className="text-input content-input"
        id="content"
        maxLength={MAX_CHARACTERS}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Paste a product announcement, landing page, or campaign copy..."
        value={inputText}
      />
      <div className="input-foot">
        <span aria-live="polite" className="char-count">{inputText.length.toLocaleString()} / {MAX_CHARACTERS.toLocaleString()} characters</span>
        <div className="input-actions">
          <button className="button-secondary button-clear" disabled={loading || (!inputText && !brandName)} onClick={onClear} type="button"><RotateCcw size={14} /> Clear</button>
          <button className="button-primary" disabled={loading || !inputText.trim()} onClick={onReview} type="button">
            {loading ? <><LoaderCircle className="animate-spin" size={14} /> Reviewing</> : <><Play size={14} /> Review copy</>}
          </button>
        </div>
      </div>
      <p className="input-help"><FileText size={12} /> Reviews use approved rules and facts. Unsupported claims are marked <strong>Needs verification</strong>, not automatically called false.</p>
    </section>
  )
}

export default InputPanel
