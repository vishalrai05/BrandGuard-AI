import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import { migrateBrands } from '../src/services/migrateBrands.js'

const dryRun = process.argv.includes('--dry-run')
mongoose.set('autoIndex', false)
await connectDB({ quiet: true })
try {
  const counts = await migrateBrands(mongoose.connection.db, {
    dryRun,
    makeId: () => new mongoose.Types.ObjectId(),
  })
  console.log(JSON.stringify(counts))
} finally {
  await mongoose.disconnect()
}
