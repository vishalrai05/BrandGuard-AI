export async function migrateBrands(db, { dryRun = false, now = () => new Date(), makeId = () => `dry-run-${Date.now()}` } = {}) {
  const brands = db.collection('brands')
  const rules = db.collection('rules')
  const facts = db.collection('facts')
  const reviews = db.collection('reviews')
  let brand = await brands.findOne({ name: /^Nimbus Notes$/i })
  const counts = { brands: 0, rules: 0, facts: 0, reviews: 0 }
  const currentDefault = await brands.findOne({ isDefault: true })
  if (!brand) {
    counts.brands = 1
    if (!dryRun) {
      if (currentDefault) await brands.updateOne({ _id: currentDefault._id }, { $set: { isDefault: false, updatedAt: now() } })
      const timestamp = now()
      const slug = 'nimbus-notes'
      const inserted = await brands.insertOne({ name: 'Nimbus Notes', slug, description: '', isDefault: true, createdAt: timestamp, updatedAt: timestamp })
      brand = { _id: inserted.insertedId, name: 'Nimbus Notes', slug, isDefault: true }
    } else brand = { _id: makeId(), name: 'Nimbus Notes', isDefault: true }
  } else if (!brand.isDefault) {
    counts.brands = 1
    if (!dryRun) {
      if (currentDefault && String(currentDefault._id) !== String(brand._id)) await brands.updateOne({ _id: currentDefault._id }, { $set: { isDefault: false, updatedAt: now() } })
      await brands.updateOne({ _id: brand._id }, { $set: { isDefault: true, updatedAt: now() } })
    }
  }
  const brandId = brand._id
  counts.rules = await rules.countDocuments({ $or: [{ brand: { $exists: false } }, { brand: null }, { status: { $exists: false } }, { origin: { $exists: false } }] })
  counts.facts = await facts.countDocuments({ $or: [{ brand: { $exists: false } }, { brand: null }, { status: { $exists: false } }, { origin: { $exists: false } }] })
  counts.reviews = await reviews.countDocuments({ brand: { $in: [null] }, brandName: /^Nimbus Notes$/i })
  if (!dryRun) {
    await rules.updateMany({ $or: [{ brand: { $exists: false } }, { brand: null }] }, [{ $set: { brand: brandId, status: { $cond: [{ $eq: ['$active', false] }, 'archived', 'active'] }, origin: { $ifNull: ['$origin', 'seed'] }, active: { $ifNull: ['$active', true] } } }])
    await facts.updateMany({ $or: [{ brand: { $exists: false } }, { brand: null }] }, { $set: { brand: brandId, status: 'active', origin: 'seed' } })
    await rules.updateMany({ status: { $exists: false } }, [{ $set: { status: { $cond: [{ $eq: ['$active', false] }, 'archived', 'active'] }, origin: { $ifNull: ['$origin', 'seed'] } } }])
    await facts.updateMany({ status: { $exists: false } }, { $set: { status: 'active', origin: 'seed' } })
    await facts.updateMany({ origin: { $exists: false } }, { $set: { origin: 'seed' } })
    await rules.updateMany({ origin: { $exists: false } }, { $set: { origin: 'seed' } })
    await reviews.updateMany({ brand: { $in: [null] }, brandName: /^Nimbus Notes$/i }, { $set: { brand: brandId } })
    for (const collection of [rules, facts]) {
      const indexes = await collection.indexes()
      if (indexes.some((index) => index.name === 'code_1' && index.unique)) await collection.dropIndex('code_1')
    }
    await rules.createIndex({ brand: 1, code: 1 }, { unique: true })
    await facts.createIndex({ brand: 1, code: 1 }, { unique: true })
    await brands.createIndex({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })
    await brands.createIndex({ slug: 1 }, { unique: true })
    await brands.createIndex({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } })
  }
  return counts
}
