import mongoose from 'mongoose'

export async function connectDB({ quiet = false } = {}) {
  const { MONGODB_URI } = process.env

  if (!MONGODB_URI?.trim()) throw new Error('MONGODB_URI is not set. Add it to server/.env.')

  await mongoose.connect(MONGODB_URI)
  if (!quiet) console.log('Connected to MongoDB.')
}
