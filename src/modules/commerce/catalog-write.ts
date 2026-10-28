import { assertCatalogReady, catalogProductFromDocument, validateCatalogProduct } from './catalog'

/** Native collection writes and operator routes share this boundary. */
export function validateCatalogWrite(
  data: Record<string, unknown>,
  original: Record<string, unknown> = {},
  workflow = false,
) {
  const merged = { ...original, ...data }
  if (
    ['review', 'approved', 'published'].includes(String(data.state)) &&
    data.state !== original.state &&
    !workflow
  )
    throw new Error('Use the catalog review and publication workflow.')
  // Operational stock updates remain live; editorial changes require another review.
  const editorial = [
    'name',
    'summary',
    'description',
    'offers',
    'productCapabilities',
    'media',
    'digitalDelivery',
    'optionDimensions',
    'slug',
    'canonicalPath',
  ]
  const withoutStock = (value: unknown) =>
    Array.isArray(value)
      ? value.map((item) => {
          const { inventoryQuantity: _quantity, id: _id, ...variant } = item
          return variant
        })
      : value
  const variantsChanged =
    'variants' in data &&
    JSON.stringify(withoutStock(data.variants)) !== JSON.stringify(withoutStock(original.variants))
  if (
    !workflow &&
    ['review', 'approved', 'published'].includes(String(original.state)) &&
    (variantsChanged ||
      editorial.some(
        (key) => key in data && JSON.stringify(data[key]) !== JSON.stringify(original[key]),
      ))
  ) {
    data.state = 'draft'
    merged.state = 'draft'
  }
  if (merged.catalogContractVersion) {
    const product = catalogProductFromDocument(merged)
    const issues = validateCatalogProduct(product)
    if (issues.length) throw new Error(issues.join(' '))
    if (['approved', 'published'].includes(String(merged.state))) assertCatalogReady(product)
  }
  return data
}
