import mongoose from 'mongoose'

const libraryChangeSchema = new mongoose.Schema({
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  entityType: { type: String, required: true, enum: ['rule', 'fact', 'brand'] },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  code: { type: String, trim: true },
  action: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  note: { type: String, default: '' },
  changedFields: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false })

libraryChangeSchema.index({ brand:  1, createdAt: -1, _id: -1 })
const immutableError = () => new Error('Library changes are append-only.')
libraryChangeSchema.pre('save', function () { if (!this.isNew) throw immutableError() })
for (const operation of ['updateOne', 'updateMany', 'replaceOne', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace']) {
  libraryChangeSchema.pre(operation, function () { throw immutableError() })
}
export default mongoose.model('LibraryChange', libraryChangeSchema)
