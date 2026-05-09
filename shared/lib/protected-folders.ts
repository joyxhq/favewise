/**
 * FNV-1a 32-bit hash — deterministic across sessions.
 * Used for translation cache keys, suggestion IDs, and duplicate group IDs.
 */
export function hashStr(s: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h.toString(36)
}

/**
 * Build a childrenOf map: parentId → child IDs (folders only).
 * Used by expandProtectedSubtree and protection candidate logic.
 */
export function buildChildrenOf(
  records: Array<{ id: string; url?: string; parentId?: string }>,
): Map<string, string[]> {
  const childrenOf = new Map<string, string[]>()
  for (const r of records) {
    if (r.url || !r.parentId) continue
    const list = childrenOf.get(r.parentId) ?? []
    list.push(r.id)
    childrenOf.set(r.parentId, list)
  }
  return childrenOf
}

/**
 * Expand a list of protected folder IDs into every folder ID in their
 * subtree. Used as the "hands-off set" for any destructive operation.
 */
export function expandProtectedSubtree(
  records: Array<{ id: string; url?: string; parentId?: string }>,
  protectedFolderIds: string[],
): Set<string> {
  if (protectedFolderIds.length === 0) return new Set()
  const childrenOf = buildChildrenOf(records)
  const result = new Set<string>(protectedFolderIds)
  const stack = [...protectedFolderIds]
  while (stack.length) {
    const id = stack.pop()!
    for (const kid of childrenOf.get(id) ?? []) {
      if (!result.has(kid)) { result.add(kid); stack.push(kid) }
    }
  }
  return result
}
