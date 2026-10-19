import Link from 'next/link'

export function archivePageNumber(raw?: string | null): number | null {
  if (!raw) return 1
  if (!/^[1-9]\d*$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

export function paginateArchive<T>(items: T[], page: number, size = 12) {
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  return {
    docs: items.slice((page - 1) * size, page * size),
    totalPages,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
    valid: Number.isSafeInteger(page) && page >= 1 && page <= totalPages,
  }
}

export function ArchivePagination({
  path,
  page,
  totalPages,
}: {
  path: string
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null
  return (
    <nav aria-label="Archive pagination" className="flex justify-between gap-4 py-6">
      {page > 1 ? (
        <Link rel="prev" href={`${path}?page=${page - 1}`}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span aria-current="page">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link rel="next" href={`${path}?page=${page + 1}`}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
