# TC-1 「+ タグ」チップの表示位置とスタイル（AC-1, AC-2）

結果: **PASS**（2026-06-13, セッション verify-tc-001b, http://localhost:3001）

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | ホームの FilterBar を snapshot で観察 | タグチップ群（「もっと見る (+N)」含む）の直後・「期間」の前に「+ タグ」チップ | snapshot 順: `#test-tag-01〜12` → `もっと見る (+2)` → `button "タグで絞り込み"（StaticText "タグ"）` → `期間` → `公開状態` → `内部リンク参照` | PASS |
| 2 | `document.querySelector('[aria-label="タグで絞り込み"]').outerHTML` | 破線枠ゴーストチップ系クラス、先頭に `+` svg、ラベル「タグ」 | class は `filterChipGhost`（`app/components/note/list/styles.ts:80`）と一致: `bg-transparent border border-dashed border-hairline-strong text-ink-secondary rounded-pill ...`。先頭子要素は `lucide-plus` svg（`aria-hidden="true"`, `size-[11px]`）、テキストは「タグ」 | PASS |

## 備考

- 前回 FAIL は接続先ポート誤り（3000 = 別プロジェクト）による環境問題であり、実装の不具合ではなかった。今回は 3001 で実施し問題なし。
- シードデータ: test-tag-01〜14 / test-note-01〜14 を確認済み（「14 件のノート」表示）。
