# ADR — Issue #88: common/styles.ts 新設で Dialog 周りの cross-domain import を解消

## ADR-001: MergeTagDialog の layout 系 utility から common 系 utility への置換

### Status
Proposed

### Context

`MergeTagDialog` は現在 2 系統の utility に依存:
- `@/components/layout/styles` から `PILL_BTN`, `FIELD_INPUT`, `FIELD_LABEL`, `FORM_ERROR`
- `@/components/note/styles` から `dialogActions`, `dialogTitle`

Issue 本文の要件「primary ボタンを `${pillBtn} ${pillBtnPrimary}` + `data-primary` パターンに揃える」を満たすには `PILL_BTN` から `pillBtn` 系に切り替える必要がある。あわせて他のフォーム系 utility (`FIELD_*`, `FORM_ERROR`) も layout 系から common 系に切り替えると、Dialog 文脈で参照先が 1 系統に統一される。

両者には次の差分がある:

| 旧 (layout) | 新 (common) | 差分 |
|---|---|---|
| `PILL_BTN` | `pillBtn` + `pillBtnPrimary` | `active:scale-[0.985] motion-reduce:active:scale-100` 喪失 / `max-sm:min-h-[44px]` 喪失（タップターゲット縮小） / `data-[danger]` バリアント喪失（MergeTagDialog は未使用） |
| `FIELD_INPUT` | `fieldControl` | `transition-all` → `transition-colors`（実害微小） / `disabled:*` utility 追加（正しく機能する側に変化） / `py-2.5` → `py-[10px]`（10px に揃うので実質同等） |
| `FIELD_LABEL` | `fieldLabel` | 完全一致 |
| `FORM_ERROR` | `formError` | 完全一致 |

### Decision

MergeTagDialog のフォーム系 utility をすべて `common/styles` 由来に切り替える。`active:scale` および `max-sm:min-h-[44px]` の喪失は許容する（Dialog 内ボタンは画面占有率が低くタッチターゲットも縮小度合いが軽微 — `max-sm:min-h-[44px]` はモバイル時のみ効くが Dialog は常時 `p-4` の余白下に表示される）。

将来必要になれば `common/pillBtn` 側に `active:scale` `max-sm:min-h-[44px]` を統合するルートを残す（その場合 note ダイアログ群にも一斉適用される）。本 Issue ではスコープを広げない。

### Consequences

- 良い点: MergeTagDialog の参照先が `common/styles` 1 系統に統一され、他のダイアログ（ConfirmDialog 等）と挙動が揃う
- トレードオフ: モバイル時のタップターゲット縮小（44px → 36px）と active スケールアニメ喪失。視覚 regression として testing.md のビジュアル確認項目に明記する
- **WCAG 2.5.5 (Target Size Enhanced) について:** 推奨値 44×44 を割る選択になるが、`dialogActions` の `inline-flex gap-2 mt-4 justify-end w-full` により隣接ターゲットとの間隔（≥8px）と Dialog 内部余白（`p-6`）でタップ誤動作リスクは低減される。Minimum レベル (WCAG 2.5.8 = 24×24) は満たす。Enhanced 準拠が必要になった時点で `common/pillBtn` 側統合を再検討する
- **モバイル確認:** testing.md にモバイルビューポート（〜639px）でのキャンセル/統合ボタン目視確認チェックを含める。タップ操作に支障が出る場合は別 Issue を起こし、`common/pillBtn` に `max-sm:min-h-[44px]` を統合する判断を行う（その変更は note 配下 21 ファイルの全ダイアログボタンに一斉適用されるため、本 Issue とは独立した検証が必要）

---

## ADR-002: `app/components/note/styles.ts` を削除し、re-export シムを置かない

### Status
Proposed

### Context

`note/styles.ts` の中身を精査したところ、全 export が dialog/ field/ pillBtn/ chip 等のドメイン非依存 utility で、note 固有のものはゼロだった。Issue 本文では「note 固有のもの（あれば）だけ残す」「共通分は `common/styles.ts` から re-export するか、note の各 callsite を `common/styles.ts` 参照に書き換える」と二択の余地を残している。

選択肢:
- **A. note/styles.ts を残し、common/styles.ts から re-export する**: note 内 callsite の `../styles` を書き換えなくて済む。
- **B. note/styles.ts を削除し、note 内 callsite も `@/components/common/styles` 参照に書き換える**: SSOT 1 個に絞る。

### Decision

**B. 削除する**。note 内 callsite 約 21 ファイルを `@/components/common/styles` 参照に機械的書き換え。

### Consequences

- 良い点: SSOT が 1 ファイルに絞られ、「note 専用 styles のように見えるが中身は共通」という紛らわしさが消える。将来 note 固有スタイルが必要になっても note/styles.ts を別目的で再導入できる
- トレードオフ: 21 ファイルの import 文を書き換える必要がある。ただし機械的置換 (`from "../styles"` → `from "@/components/common/styles"`) で完了する
- **副次効果:** `common/styles.ts` に汎用 utility がすべて集約されることで、将来 `layout/styles.ts` の同名・類似定数（`PILL_BTN` / `FIELD_INPUT` / `FORM_ERROR` 等）との重複が顕在化しやすくなる。layout shell 系と dialog/form 系で意図的に分離された差分（`active:scale` / `max-sm:min-h-[44px]` / `data-[danger]` / `transition-all` vs `transition-colors`）の整理は本 Issue スコープ外として残るが、`common/styles.ts` の存在が後続 Issue で「重複定数を統合する SSOT 候補」として明示的に意識される効果がある

---
