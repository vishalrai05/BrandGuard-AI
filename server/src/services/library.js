import Brand from '../models/Brand.js'
import LibraryChange from '../models/LibraryChange.js'

export async function defaultBrand() { return Brand.findOne({ isDefault: true }) }
export async function resolveBrand(id) {
  if (!id) return defaultBrand()
  return Brand.findById(id)
}
export async function logLibraryChange({ brand, entityType, entity, user, action, changedFields = [], note = '' }) {
  return LibraryChange.create({ brand, entityType, entityId: entity?._id, code: entity?.code, actor: user?._id ?? user?.id, actorName: user?.name ?? '', actorRole: user?.role ?? '', action, changedFields, note })
}
export function slugBase(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56) || 'brand'
}
export function nextFreeCode(prefix, codes) {
  const escapedPrefix = String(prefix).trim().toUpperCase()
  if (!/^[A-Z]{2,8}$/.test(escapedPrefix)) throw new TypeError('prefix must contain 2 to 8 letters.')
  const used = new Set(codes.map((code) => Number(String(code).match(/-(\d+)$/)?.[1])).filter(Number.isFinite))
  let number = 1
  while (used.has(number)) number += 1
  return `${escapedPrefix}-${number}`
}
