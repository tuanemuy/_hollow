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

/**
 * 公開日メタ表記: 「YYYY年M月D日 公開」 (P30 ノート行のメタ行). UTC 基準で
 * SSR/CSR の値を一致させる (本ファイル冒頭の方針に揃える).
 */
export function formatPublishedDate(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 公開`;
}

/**
 * P30 ノート行右列の相対日付表記。今日は「今日」、昨日は「昨日」、それ以外は
 * 同年なら「M月D日」、年跨ぎは「YYYY年M月D日」。`now` を注入する純粋関数なので
 * クライアント TZ の `new Date()` を渡してテスト可能にする。「今日／昨日」判定は
 * `now` のローカルカレンダー日と `date` のローカルカレンダー日を比較する。
 */
export function formatRelativeDate(date: Date, now: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / oneDay);
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
