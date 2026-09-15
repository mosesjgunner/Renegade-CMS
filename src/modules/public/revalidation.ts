/** Keep HTML metadata, previews, sitemap, search/feed projections and media cards coherent. */
export async function revalidateDiscoveryOutputs(paths: Array<string | null | undefined> = []) {
  try {
    const { revalidatePath } = await import('next/cache.js')
    for (const path of new Set(['/', '/sitemap.xml', '/feed.xml', '/search', ...paths])) {
      if (path) revalidatePath(path, path === '/' ? 'layout' : 'page')
    }
  } catch {
    // Payload CLI/worker writes do not have a Next cache. Dynamic consumers still read source state.
  }
}
