import { PATCH as catalogTransition } from '../../src/app/(frontend)/api/admin/catalog/route'

/** Fixture session drives the same catalog transitions as the operator API. */
export async function reviewCatalogFixture(cookie: string, productId: string, publish = true) {
  const actions = publish ? ['request-review', 'approve', 'publish'] : ['request-review', 'approve']
  for (const action of actions) {
    const response = await catalogTransition(
      new Request('http://localhost/api/admin/catalog', {
        method: 'PATCH',
        headers: { host: 'localhost', cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ productId, action }),
      }),
    )
    if (response.status !== 200) {
      throw new Error(
        `Catalog fixture ${action} failed: ${response.status} ${await response.text()}`,
      )
    }
  }
}
