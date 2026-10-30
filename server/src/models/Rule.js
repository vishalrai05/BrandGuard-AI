import mongoose from 'mongoose'

export const RULE_CATEGORIES = [
  'tone',
  'terminology',
  'legal',
  'claims',
  'formatting',
]

const ruleSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2,8}-\d{1,3}$/ },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: RULE_CATEGORIES },
    type: {
      type: String,
      required: true,
      enum: ['banned_term', 'required_phrase', 'regex_pattern'],
    },
    values: { type: [String], default: [] },
    trigger: { type: String, trim: true },
    pattern: {
      type: String,
      trim: true,
      required: function () {
        return this.type === 'regex_pattern'
      },
    },
    severity: {
      type: String,
      required: true,
      enum: ['high', 'medium', 'low'],
    },
    suggestion: { type: String, required: true, trim: true },
    replacement: { type: String, trim: true },
    active: { type: Boolean, default: true },
    status: { type: String, enum: ['draft', 'active', 'rejected', 'archived'], default: 'active' },
    origin: { type: String, enum: ['seed', 'manual', 'ai_draft'], default: 'seed' },
    sourceExcerpt: { type: String, maxlength: 500 },
    sourceDocument: { type: String },
    ingestionRun: { type: mongoose.Schema.Types.ObjectId, ref: 'IngestionRun' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    decisionNote: { type: String, maxlength: 300, default: '' },
  },
  { timestamps: true },
)

ruleSchema.index({ brand: 1, code: 1 }, { unique: true })
ruleSchema.index({ brand: 1, status: 1, code: 1 })

export default mongoose.model('Rule', ruleSchema)
