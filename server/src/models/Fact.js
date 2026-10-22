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
    code: { type: String, required: true, unique: true, trim: true },
    statement: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [] },
    value: { type: Number },
    unit: { type: String, trim: true },
    source: { type: sourceSchema, required: true },
    verifiedAt: { type: Date, required: true },
  },
  { timestamps: true },
)

export default mongoose.model('Fact', factSchema)
