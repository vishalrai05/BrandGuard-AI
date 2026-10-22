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
    code: { type: String, required: true, unique: true, trim: true },
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
  },
  { timestamps: true },
)

export default mongoose.model('Rule', ruleSchema)
