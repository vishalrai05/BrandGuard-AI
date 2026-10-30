import mongoose from 'mongoose'

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  slug: { type: String, required: true, trim: true },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true })

brandSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })
brandSchema.index({ slug: 1 }, { unique: true })
brandSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } })

export default mongoose.model('Brand', brandSchema)
