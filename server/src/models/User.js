import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['reviewer', 'approver'], default: 'reviewer' },
  },
  { timestamps: true },
)

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10)
}

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash)
}

userSchema.methods.toPublic = function () {
  return { id: this.id, name: this.name, email: this.email, role: this.role }
}

export default mongoose.model('User', userSchema)
