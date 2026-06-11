/**
 * Date formatting shared by the public surfaces (P30 listing / P32 search)
 * so the「更新」表記 and the right-rail short date stay consistent.
 */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 更新`;
}

export function formatShort(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
