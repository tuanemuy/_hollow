/**
 * Date formatting shared by the public surfaces (P30 listing / P32 search)
 * so the「更新」表記 and the right-rail short date stay consistent.
 *
 * 公開面の日付は UTC 基準で表示する（SSR/CSR・実行環境間で値を一致させるため）。
 */
export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 更新`;
}

export function formatShort(date: Date): string {
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}
