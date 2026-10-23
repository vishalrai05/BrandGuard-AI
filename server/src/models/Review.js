import mongoose from 'mongoose'

const findingSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['rule_violation', 'needs_verification', 'fact_mismatch'],
  },
  severity: { type: String, required: true, enum: ['high', 'medium', 'low'] },
  matchedText: { type: String, required: true },
  startIndex: { type: Number, required: true, min: 0 },
  endIndex: { type: Number, required: true, min: 0 },
  evidence: {
    kind: { type: String, required: true, enum: ['rule', 'fact', 'none'] },
    refCode: { type: String, default: '' },
    excerpt: { type: String, default: '' },
  },
  suggestion: { type: String, default: '' },
  suggestedRewrite: { type: String, default: '' },
  reason: { type: String, default: '' },
  source: { type: String, enum: ['rules', 'ai'], default: 'rules' },
  status: {
    type: String,
    enum: ['open', 'accepted', 'dismissed'],
    default: 'open',
  },
})

const summarySchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0, min: 0 },
    high: { type: Number, default: 0, min: 0 },
    medium: { type: Number, default: 0, min: 0 },
    low: { type: Number, default: 0, min: 0 },
    needsVerification: { type: Number, default: 0, min: 0 },
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

const reviewSchema = new mongoose.Schema(
  {
    inputText: { type: String, required: true },
    brandName: { type: String, required: true, trim: true },
    findings: { type: [findingSchema], default: [] },
    summary: { type: summarySchema, default: () => ({}) },
    counts: { type: countsSchema, default: () => ({}) },
    aiStatus: { type: String, enum: ['ok', 'unavailable', 'disabled'], default: 'disabled' },
  },
  { timestamps: true },
)

export default mongoose.model('Review', reviewSchema)
