# General Review — PR #724 (Issue #623)

対象: 公開系単票ページ P33 共有リンクゲート / P34 エラーページの軽微なモック差分解消（presentational 限定）。

## 検証サマリー

- 差分は計画（`.issue/623/plan.md`）の S1〜S5 と影響範囲に完全一致。バックエンド/ルーティング/ドメインへの波及なし。
- 受け入れ基準 AC-1〜AC-5 はすべて実装・テストで満たされていることを確認。
- 対象 2 テストファイルを実行 → 14 passed（緑）。

| AC | 状態 | 根拠 |
|----|------|------|
| AC-1 | 充足 | `ShareLinkGate/index.tsx:156-158` で `isExpiredOrGone`（revoked + notFound 両方）分岐内に `GATE_FOOT` を CTA 直後に配置。文言はモック `P33-share-link.html:482` と完全一致。`GATE_FOOT` のクラス（`mt-6 pt-5 border-t border-hairline text-xs text-ink-tertiary text-center`）はモック CSS（mt24/pt20/border-top hairline/12px/ink-tertiary/center）と整合。`--text-xs` は `clamp(11px, .., 12px)` で最大 12px、モック値に一致。 |
| AC-2 | 充足 | `ShareLinkGate/index.tsx:182-184` でインラインエラー `<p>` を `GATE_ERROR` 定数に統一し、`<Icon icon={AlertCircle} size={16} />` をメッセージ先頭に配置。モック `.gate-error`（flex/align-center/gap6px=gap-1.5）と整合。 |
| AC-3 | 充足 | `ErrorPage.tsx:121` で 404 のみ `<HomeLink primary icon />`、`SearchLink` に Search アイコン（`:42`）。 |
| AC-4 | 充足 | `HomeLink` の `icon` は default `false`。403(`:130`)/410(`:133`)/500(`:137`) は `icon` を渡さずアイコン非表示。モック `P34-error.html:372,399,425` の icon-less「ホームへ戻る」と一致。テストで 403/410/500 の home が `svg` を持たないことをロック。 |
| AC-5 | 充足 | 既存テストは緑、新規アサーションが gate-foot 文言・インラインエラー svg・404 home/search svg 有・403/410/500 home svg 無 を網羅。 |

## Blockers

なし

## Warnings

なし

## Notes

- **[N-001]** 404 限定アイコン化のスコープ封じ込めが適切。`HomeLink` を 4 バリアントで共有しているなか、`icon?: boolean`（default false）+ 404 のみ opt-in という設計で AC-4 違反のリグレッションリスクを構造的に排除している。コメント（`ErrorPage.tsx:20-21`）も WHY（404 のみアイコン付きというモック仕様）を簡潔に説明しており CLAUDE.md のコメント方針に合致。

- **[N-002]** スタイリング規約準拠を確認。`GATE_FOOT` は Tailwind ユーティリティのみ、既存トークン（`border-hairline`/`text-ink-tertiary`/`text-xs`）を使用しハンドCSS/`@apply` を導入していない。`Icon` ラッパー経由で `size={16}`（型制約 16/20/24 内）・`strokeWidth` 固定を遵守。`w-*/h-*` の直指定もなし。インラインの素の `<p className="...">` リテラルを `GATE_ERROR` 定数へ巻き取ったのも「繰り返しユーティリティの定数化」方針に沿う改善。

- **[N-003]** アクセシビリティ良好。3 アイコン（AlertCircle/Home/Search）はいずれも `label` 未指定のため `Icon` 実装（`Icon.tsx:52-58`）により `aria-hidden="true"` の装飾扱いになる。隣接テキスト（「ホームへ戻る」等）がアクセシブルネームを担保するため、装飾アイコンの扱いとして適切。インラインエラー `<p role="alert">` も維持され支援技術への通知は不変。

- **[N-004]** テストの品質。`ErrorPage.test.tsx` は実 DOM（happy-dom）でリンク要素を特定し `home?.querySelector("svg")` で svg 有無を検証する堅実なアサーション。`ShareLinkGate.test.tsx` のインラインエラー検証 `/role="alert"[^>]*>\s*<svg/` は、`<p>` の属性が JSX 順（id→className→role）で `role="alert"` が末尾属性となるため安定して一致する。偽陽性・脆さは認められない。

- **[N-005]** モック整合の補足。モック 410(gone) は検索ボックスを表示するが「検索ページを開く」CTA は持たない（`P34-error.html` の 410 セクション）。実装も `SearchLink` を notFound 分岐のみに置き、`showSearch` で 404/410 双方に検索ボックスを出す既存挙動を維持しており、本 PR で触れていない。リグレッションなし。

- **[N-006]** モックのアイコンは 13px、実装は `size={16}`。計画リスク欄で「Icon の型制約 16/20/24 を優先し 16 採用」と明記され、デザインシステム契約を優先する妥当な判断。意図的な逸脱として記録済み。
