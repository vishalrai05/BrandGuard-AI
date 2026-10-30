import mongoose from 'mongoose'

const ingestionRunSchema = new mongoose.Schema({
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  createdBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    role: { type: String, enum: ['reviewer', 'approver'], required: true },
  },
  filename: { type: String, required: true, maxlength: 120 },
  charCount: { type: Number, required: true, min: 0 },
  chunksTotal: { type: Number, required: true, min: 0 },
  chunksAnalysed: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['ok', 'partial', 'failed'], required: true },
  counts: {
    rulesDrafted: { type: Number, default: 0, min: 0 },
    factsDrafted: { type: Number, default: 0, min: 0 },
    dropped: [{ reason: { type: String, required: true }, count: { type: Number, required: true, min: 0 } }],
  },
}, { timestamps: { createdAt: true, updatedAt: false } })

ingestionRunSchema.index({ brand: 1, createdAt: -1 })
export default mongoose.model('IngestionRun', ingestionRunSchema)
