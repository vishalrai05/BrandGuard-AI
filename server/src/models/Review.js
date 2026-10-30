import mongoose from 'mongoose'

const findingSchema = new mongoose.Schema({
  code: { type: String, trim: true },
  type: {
    type: String,
    required: true,
    enum: ['rule_violation', 'needs_verification', 'fact_mismatch', 'quality_check'],
  },
  severity: { type: String, required: true, enum: ['high', 'medium', 'low'] },
  matchedText: { type: String, required: true },
  startIndex: { type: Number, required: true, min: 0 },
  endIndex: { type: Number, required: true, min: 0 },
  evidence: {
    kind: { type: String, required: true, enum: ['rule', 'fact', 'none', 'check'] },
    refCode: { type: String, default: '' },
    excerpt: { type: String, default: '' },
  },
  category: { type: String, enum: ['tone', 'terminology', 'legal', 'claims', 'formatting', 'readability', 'accessibility'] },
  suggestion: { type: String, default: '' },
  suggestedRewrite: { type: String, default: '' },
  reason: { type: String, default: '' },
  source: { type: String, enum: ['rules', 'ai', 'quality'], default: 'rules' },
  status: {
    type: String,
    enum: ['open', 'accepted', 'dismissed'],
    default: 'open',
  },
  statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  statusChangedAt: { type: Date },
  comments: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true, enum: ['reviewer', 'approver'] },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  }],
})

const summarySchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0, min: 0 },
    high: { type: Number, default: 0, min: 0 },
    medium: { type: Number, default: 0, min: 0 },
    low: { type: Number, default: 0, min: 0 },
    needsVerification: { type: Number, default: 0, min: 0 },
    totalDetected: { type: Number, min: 0 },
    readability: {
      type: new mongoose.Schema({
        wordCount: { type: Number, default: 0, min: 0 },
        sentenceCount: { type: Number, default: 0, min: 0 },
        avgSentenceLength: { type: Number, default: 0, min: 0 },
        fleschReadingEase: { type: Number, default: 0 },
        fleschKincaidGrade: { type: Number, default: 0 },
        longSentenceCount: { type: Number, default: 0, min: 0 },
      }, { _id: false }),
      default: undefined,
    },
  },
  { _id: false },
)

const countsSchema = new mongoose.Schema(
  {
    returned: { type: Number, default: 0, min: 0 },
    kept: { type: Number, default: 0, min: 0 },
    dropped: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const sourceSchema = new mongoose.Schema({
  kind: { type: String, enum: ['text', 'document'], required: true },
  filename: { type: String, maxlength: 120 },
  fileType: { type: String, enum: ['pdf', 'docx'] },
  pageCount: { type: Number, min: 1, default: null },
  charCount: { type: Number, min: 0 },
  truncated: { type: Boolean },
}, { _id: false })

const aiSchema = new mongoose.Schema({
  chunksTotal: { type: Number, min: 0 },
  chunksAnalysed: { type: Number, min: 0 },
  message: { type: String, maxlength: 300 },
}, { _id: false })

const reviewSchema = new mongoose.Schema(
  {
    inputText: { type: String, required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    brandName: { type: String, required: true, trim: true },
    findings: { type: [findingSchema], default: [] },
    summary: { type: summarySchema, default: () => ({}) },
    counts: { type: countsSchema, default: () => ({}) },
    qualityChecksRun: { type: Boolean, default: false },
    source: { type: sourceSchema, default: undefined },
    ai: { type: aiSchema, default: undefined },
    findingsTruncated: { type: Boolean, default: false },
    aiStatus: { type: String, enum: ['ok', 'unavailable', 'disabled', 'partial', 'failed'], default: 'disabled' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    workflowStatus: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'changes_requested'],
      default: 'draft',
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    decidedAt: { type: Date },
    decisionNote: { type: String, maxlength: 500 },
  },
  { timestamps: true },
)

reviewSchema.index({ createdAt: -1 })
reviewSchema.index({ createdBy: 1, createdAt: -1 })

export default mongoose.model('Review', reviewSchema)
