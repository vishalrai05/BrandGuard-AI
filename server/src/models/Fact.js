import mongoose from 'mongoose'

const sourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false },
)

const factSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2,8}-\d{1,3}$/ },
    statement: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [] },
    value: { type: Number },
    unit: { type: String, trim: true },
    source: { type: sourceSchema },
    verifiedAt: { type: Date },
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

factSchema.index({ brand: 1, code: 1 }, { unique: true })
factSchema.index({ brand: 1, status: 1, code: 1 })

export default mongoose.model('Fact', factSchema)
