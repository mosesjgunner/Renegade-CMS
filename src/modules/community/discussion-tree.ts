/** Stable preorder keeps children beside their parent; missing/hidden parents and cycles remain bounded. */
export function discussionRows<T extends { id: string; parent?: string | null }>(posts: T[]) {
  const byId = new Map(posts.map((post) => [post.id, post]))
  const children = new Map<string, T[]>()
  for (const post of posts) {
    const key = post.parent && byId.has(post.parent) && post.parent !== post.id ? post.parent : ''
    children.set(key, [...(children.get(key) ?? []), post])
  }
  const rows: Array<{ post: T; depth: number }> = []
  const seen = new Set<string>()
  const visit = (post: T, depth: number) => {
    if (seen.has(post.id)) return
    seen.add(post.id)
    rows.push({ post, depth })
    for (const child of children.get(post.id) ?? []) visit(child, depth + 1)
  }
  for (const root of children.get('') ?? []) visit(root, 0)
  for (const post of posts) visit(post, 0)
  return rows
}
