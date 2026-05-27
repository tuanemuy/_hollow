# PR Review #001 — feat(issue/259): preview-form information design polish

**PR:** #264
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 8（Frontend 4 + Test 4）
- Notes: 8
- Verdict: **BLOCKED**

---

## Frontend

### Blockers

- **[B-001]** `spec/design/index.md` が `max-width` 例外条項を削除する形で書き戻されている
  - 場所: `spec/design/index.md:138`
  - 理由: PR ブランチのマージベースに `5034764`（Issue #250「allow max-width media queries for mobile fixes」）が含まれていなかったため、`origin/main` 側で `max-width` 例外を緩和したばかりの条項を結果として削除してしまっていた
  - 提案: `git rebase origin/main` でブランチを最新にし、`spec/design/index.md` の差分が消えることを確認する
  - **対応:** rebase 完了。`git diff origin/main..HEAD --stat` で `spec/design/index.md` が含まれていないことを確認した

### Warnings

- **[W-001]** プランの「含まれないもの」と実装が乖離している（`DirectoryPicker` の API を拡張している）
  - 場所: `app/components/note/editor/DirectoryPicker.tsx:28,38,46-49`
  - 理由: plan.md のスコープに「`DirectoryPicker` 自体の UI 改修」をスコープ外と書きつつ、`legendSlot?: ReactNode` を追加している
  - 提案: ADR-004 を追加し、`legendSlot` 拡張に切り替えた経緯を残す。plan.md の「含まれないもの」も更新する
  - **対応:** ADR-004 を追記、plan.md のスコープを「`legendSlot` 受け入れのみの最小拡張」に更新

- **[W-002]** `data-edited` 属性を立てているのに consumer が一つも存在しない（YAGNI）
  - 場所: `app/components/ingestion/IngestionPreviewForm.tsx:210,243,261,282`
  - 理由: スタイルセレクタも JS 参照もない属性が 4 箇所にぶら下がっている。「将来のスタイル差別化に備える」前置きは YAGNI
  - 提案: 今回の PR では `data-edited` を全削除する
  - **対応:** `data-edited` を全フィールドから削除

- **[W-003]** 「本文プレビュー」の `<AiSuggestionBadge edited={false}/>` がプランに含まれない 5 個目のバッジになっている
  - 場所: `app/components/ingestion/IngestionPreviewForm.tsx:234`
  - 理由: plan.md で対象は「タイトル / ディレクトリ / タグ / FrontMatter」の 4 フィールド。本文プレビューは編集 UI ではなく、H-2 のメンタルモデル（編集→消える）が成立しない
  - 提案: 本文プレビューの badge は外す
  - **対応:** 本文プレビューのバッジを削除

- **[W-004]** バッジ表示の有無テストが「件数」アサーションで、フィールドとの対応が見えない
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:379-403`
  - 提案: `data-ai-badge-for="{field}"` のような識別属性をバッジに付け、テスト側で個別に存在検証する
  - **対応:** `AiSuggestionBadge` に `field` prop を追加して `data-ai-badge-for` で識別。テストをスコープド・アサーションに変更

### Notes

- [N-001] `<details>` + `[&::-webkit-details-marker]:hidden` + `group-open:rotate-90` の構成は綺麗で utility-first 原則に完全準拠
- [N-002] ADR-003 の「初期値との等価比較」は妥当
- [N-003] `:focus-visible` のグローバルルールが `<summary>` にも自動適用される
- [N-004] `legendSlot` の JSDoc が用途を明示

---

## Test

### Blockers

なし

### Warnings

- **[W-T-001]** バッジ消失テストが「どのフィールドのバッジが消えたか」を区別していない
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:389-404, 408-426`
  - 提案: スコープド・アサーションに変える
  - **対応:** `data-ai-badge-for="{field}"` で個別検証

- **[W-T-002]** `toBeGreaterThanOrEqual(5)` は仕様より緩い
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:385`
  - 提案: `toBe(4)`（本文プレビュー削除後）に強化
  - **対応:** Frontend W-003 と合わせて修正

- **[W-T-003]** フィールド独立性（H-2 critique の主要要件）の単体テスト欠落
  - 場所: 新規テスト全体
  - 提案: タグ・FrontMatter・ディレクトリのうち少なくとも 1 つで独立性ケースを追加
  - **対応:** タグ編集時にタイトル / 他バッジが残ることをアサートするケースを追加

- **[W-T-004]** `document.body.querySelector("details")` が「唯一の details」を仮定している
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:431`
  - 提案: `data-ai-badge-for="frontmatter"` 起点で `closest("details")` を辿る
  - **対応:** ↑ に変更

### Notes

- [N-T-001] ADR-003 と「復元時のバッジ再表示」テストの対応が取れている
- [N-T-002] plan 超過分（復元時テスト）は意図的で適切
- [N-T-003] 既存テストの「first text input」「single textarea」前提は新フィールド順でも維持される
- [N-T-004] `setNativeInputValue` + `act()` 2 回で React の再レンダーを確実に待っている

---

## Design Decisions

- **ADR-004 (追記)**: `DirectoryPicker` への `legendSlot` prop 追加の根拠 — fieldset の semantic を守るためバッジを `<legend>` 内に置く必要があり、外側に出す案では崩れる。
