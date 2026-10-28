import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema(
  {
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
    findingId: { type: mongoose.Schema.Types.ObjectId },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'review_created',
        'finding_status_changed',
        'review_submitted',
        'review_approved',
        'changes_requested',
        'comment_added',
      ],
    },
    from: { type: String },
    to: { type: String },
    matchedText: {
      type: String,
      maxlength: 120,
      set: (value) => typeof value === 'string' ? value.slice(0, 120) : value,
    },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

const immutableError = () => new Error('Audit logs are append-only.')
auditLogSchema.pre('save', function () {
  if (!this.isNew) throw immutableError()
})
for (const operation of [
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
]) {
  auditLogSchema.pre(operation, function () {
    throw immutableError()
  })
}

export default mongoose.model('AuditLog', auditLogSchema)
