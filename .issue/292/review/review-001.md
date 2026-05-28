# PR Review #001 — feat(issue/292): add button form usage guideline to spec and align existing UI

**PR:** #304
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 24
- Verdict: **APPROVED with suggestions**

---

## Spec / Design Documentation

### Blockers
なし

### Warnings

- **[W-S-001]** `title` 属性を icon-only ボタンの「必ず満たす要件 (4つ全て)」に格上げしている点が Issue 本文の意図とずれる
  - 場所: `spec/design/index.md:136-140`
  - 理由: Issue #292 本文は「title 属性でツールチップ補助を **推奨**（hover 環境のみ）」と書いており、必須ではなく推奨レベル。spec §4 は「タッチデバイスではホバーに依存しない」「ホバー専用効果を限定する」と明記しており、すべての icon-only ボタンで `title` を必須化するとタッチ環境ではユーザーが恩恵を受けない属性を機械的に付与することになる。
  - 提案: 「以下 4 つの要件をすべて満たす」を分割し、「以下の要件を満たす（aria-label と 同種非並置 と 44×44px は必須、title は推奨）」のように MUST/SHOULD を区別する。

- **[W-S-002]** 「テキストのみ」の節で「フィルタチップ」を例に挙げているが、chip は L145 で「チップ内付属の close ボタン」として別途扱われており、文面上の相互参照がなくレビュアーには分かりにくい
  - 場所: `spec/design/index.md:134, 145`
  - 提案: L134 に「close × は L145 の通り付属要素として例外扱い」のような相互参照を追記。

- **[W-S-003]** 「リンク的ボタン」の境界が依然として曖昧で、レビュー時の解釈ぶれを生む
  - 場所: `spec/design/index.md:135`
  - 理由: 「テキストリンクとしての位相が強い」は主観で、ヘッダー primary (アイコン+ラベル) との境界判定ロジックが書かれていない。
  - 提案: 「`<a>` で実装される / 視覚スタイルが下線・テキスト色のみ / 周囲にボタン形状の primary CTA がない、の 3 条件を満たすもの」のような客観基準を 1 行追記。

### Notes

- **[N-S-001]** Plan Step 1 の 8 必須要素すべて記載済み。Issue #292 完了条件「3 形態の使う場面 / 使わない場面 / a11y 要件」は満たされている。
- **[N-S-002]** 既存 §7.1 本文 / §8 / §3 との重複・矛盾は無し。`EMPTY_LIST` 参照は #231 を引用しており plan 方針通り。
- **[N-S-003]** Markdown 構造（見出しレベル、リスト、強調表記、区切り線）は既存と一致。
- **[N-S-004]** 例外 (a) / (b) は ADR 参照と具体例付きで誤読リスク低。
- **[N-S-005]** a11y 4 要件すべて記載済み。`Icon.label` 二重化回避も既存 §7.1 a11y 契約と整合。

---

## Frontend Component API — ConfirmDialog

### Blockers
なし

### Warnings
なし

### Notes

- **[N-C-001]** `confirmIcon` API 設計は ADR-001 通り（型安全 + optional + 破壊変更なし）。JSDoc に size=16 デフォルト・pending 中維持を明記。
- **[N-C-002]** `import { AlertTriangle, type LucideIcon } from "lucide-react";` の inline 修飾子。barrel import 違反なし。
- **[N-C-003]** Icon 挿入位置・サイズ (`size` 未指定＝デフォルト 16) は spec §7.1 整合。
- **[N-C-004]** `isPending` 中もアイコン維持。JSDoc 通りの実装。
- **[N-C-005]** 11 呼び出し箇所すべて確認。plan.md Step 3 表 + ADR-006 (DeleteDirectoryDialog) で網羅。
- **[N-C-006]** ADR-006 はテストサマリにも反映。
- **[N-C-007]** 既存テスト `IngestionPreviewForm.test.tsx` の `textContent` フィルタは SVG が `textContent` 生成しないため引き続き通る。138 ファイル / 2690 テスト全 PASS。
- **[N-C-008]** plan.md Step 3 表で `SavedViewsList` `TagActions` を「既存 import 利用」と書いていたが実際は新規 import が必要。PR は正しく新規 import を追加しているが、plan 表記の事前棚卸し精度の問題として note 化。

---

## Frontend UI Polish

### Blockers
なし

### Warnings

- **[W-U-001]** `NoteActions` trashed 分岐の `MENU` ラッパーに `role="toolbar"` / `aria-label` が無い
  - 場所: `app/components/note/detail/NoteActions.tsx:108`
  - 理由: active 分岐の `MENU` には `role="toolbar" aria-label="ノート操作"` が付与されているが、trashed 分岐は同じクラスを使いながら role を持たない。リンク 1 つのため a11y 上の実害は無いが、形態が揃った今は気になり得る。
  - 判断: **現状維持** — 単一リンクのため toolbar 化不要は spec a11y 観点で正しい。ADR-003 で言及するほどでもなくコメント追加は CLAUDE.md「default to no comments」原則に反するため、レビュー note のみで記録。

- **[W-U-002]** モバイル時 44×44 拡大による `dialogTitle` 重なりリスク
  - 場所: `app/components/common/styles.ts:65-66`
  - 理由: ADR-003 で受容済みだが、`dialogTitle` 側に予防的 padding が無く、将来長文タイトル追加時に regression 余地。
  - 判断: **現状維持** — ADR-003 で明示的に受容しており、将来別 Issue 化方針も plan に記録済み。コメント追記は CLAUDE.md 原則に反するためスキップ。

### Notes

- **[N-U-001]** `BTN_SM_CLASS` (`h-7`) + 16px アイコンは `items-center gap-1.5` で視覚バランス OK、`whitespace-nowrap` で改行抑制済み。
- **[N-U-002]** `lucide-react` の barrel import 違反なし。
- **[N-U-003]** `Icon` の `className` に `w-*` / `h-*` / `size-*` を含めている箇所なし。SSOT 規則遵守。
- **[N-U-004]** `size={...}` 明示の使い分け正しい（16=デフォルト省略 / 20=AlertTriangle / 24=EMPTY_STATE_ICON）。ADR-001 通り。
- **[N-U-005]** `confirmIcon` 描画は `isPending` に依存せず維持。
- **[N-U-006]** confirm ボタン accessible name はテキスト側で担保（spec §7.1 a11y 契約整合）。
- **[N-U-007]** trashed 分岐の Link は `Trash2` + 「ゴミ箱を開く」で他箇所と語彙一致。
- **[N-U-008]** TrashList 空状態は `PILL_BTN` (`h-9` + `max-sm:min-h-[44px]`) でモバイルタップ領域 OK。
- **[N-U-009]** lint / typecheck 通過。既存テストへの影響なし。
- **[N-U-010]** 棚卸し漏れチェック: plan で「維持」とされた箇所はすべて新ガイドラインに整合、混在違反検出なし。
- **[N-U-011]** ADR-003 の挙動説明と実 CSS が一致、TC-006 ランタイム実測でも裏付け済み。

---

## Design Decisions

このラウンドで新たに確定した設計判断:

- **Spec W-001 fix方針**: `title` を「推奨」レベルに格下げ。`aria-label` / 同種非並置 / 44×44px のみ MUST。
- **Spec W-002 fix方針**: フィルタチップの説明に L145 への相互参照を追加。
- **Spec W-003 fix方針**: 「リンク的ボタン」の客観基準（3 条件）を追記。
- **UI W-001/W-002**: 現状維持 — コメント追加は CLAUDE.md 原則違反のため。レビュー note で記録。
