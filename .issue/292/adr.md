# ADR — Issue #292: ボタンの「テキストのみ／アイコンのみ／アイコン+ラベル」使い分けガイドライン

## ADR-001: ConfirmDialog のアイコン指定は `confirmIcon` prop で受ける

### Status
Accepted

### Context

`ConfirmDialog` の confirm ボタンを「アイコン+ラベル」化する方法として、以下の選択肢があった:

- A. 呼び出し側で `confirmLabel` に JSX を許容し、`<Icon />` を含めて渡す
- B. `confirmIcon?: LucideIcon` prop を追加し、ConfirmDialog 側で `<Icon icon={confirmIcon} />` をテキスト前に挿入する

A は柔軟だが、ラベル組み立てが呼び出し側依存になり、`Icon` のサイズ（`size={16}`）や a11y 契約（`aria-hidden`）が箇所ごとにズレる懸念がある。

### Decision

**B を採用**: `confirmIcon?: LucideIcon` を追加し、ConfirmDialog 内部で `<Icon icon={confirmIcon} />` を組み立てる（`size` 指定なし＝デフォルト 16。spec §7.1「アイコン+テキスト併用は `size={16}`」と整合）。

**サイズ判断の補足**: 既存の `AlertTriangle` アイキャッチは `size={20}` で、これは spec「確認ダイアログのアイキャッチは `size={20}`」と整合。confirm ボタン側のアイコンは「アイコン+テキスト併用」カテゴリなので `size={16}`。同じダイアログ内で 16 と 20 が混在するのは spec の意図通り（アイキャッチと本文ボタンは別カテゴリ）。

### Consequences

- 良い点:
  - `LucideIcon` 型で型安全
  - `Icon` ラッパー経由のサイズ・配色・a11y 契約がダイアログ全体で統一される
  - prop 省略時は従来動作（アイコンなし）にフォールバック → 既存呼び出しの破壊変更なし
- トレードオフ:
  - 既存呼び出し全箇所に手を入れて `confirmIcon` を渡す作業が発生（grep で網羅）

---

## ADR-002: DisplayModeSwitch はテキストのみで維持し、spec に「タブ／セグメントは混在ルールの例外」と明記する

### Status
Accepted

### Context

Issue 本文では「同一ツールバー内では形態を揃える」「アイコン+ラベルとアイコンのみを混在させない」とある。`DisplayModeSwitch`（リスト／タイル／カレンダー）は `NoteListToolbar` 内に配置され、周囲のアイコン+ラベルボタン群と隣接している。

- A. DisplayModeSwitch にもアイコンを付ける（混在ルールに従う）
- B. テキストのみのまま、spec に「タブ／セグメントは混在ルールの例外」と明記する

A は §7.1「使わない場面」の「情報伝達に不要な賑やかしを増やさない」と矛盾する。タブ／セグメントは「選択 UI」であり、ボタン群とは別カテゴリのコントロールである。

### Decision

**B を採用**: DisplayModeSwitch は現状維持。spec §7.1 の新サブセクションに「タブ／セグメントコントロールは混在ルールの例外」と明記する。

### Consequences

- 良い点:
  - 「賑やかしアイコン禁止」原則と整合
  - タブ／セグメントの視覚的シンプルさが保たれる
- トレードオフ:
  - レビュアーが混在ルール違反と誤判定する余地が残るため、spec の例外記述を明確に書く必要がある

---

## ADR-003: Dialog 閉じるボタンは `max-sm:min-*` で対応（モバイル時は視覚サイズも 44px に拡大）

### Status
Accepted

### Context

`Dialog.tsx` の閉じるボタンは現状 32×32px。§3「タップ領域 44×44px 確保」に対してデスクトップ環境では妥当（マウス精度）だが、モバイル環境では未達。

選択肢:

- A. 全画面サイズで視覚サイズも 44×44px に拡大する
- B. `max-sm:min-w-[44px] max-sm:min-h-[44px]` を追加し、モバイル時のみ 44px、デスクトップは 32px のまま（既存 `ICON_BTN` と同パターン）

CSS の `min-width` / `min-height` は `width` / `height` を上書きするため、B を採用するとモバイル時には **実描画サイズも 44×44px に拡大される**（タップ領域だけが透明拡張されるわけではない）。1周目レビューで初版 ADR の記述（"視覚は維持"）が実挙動と乖離していた点を訂正。

### Decision

**B を採用**: `dialogCloseButton` 文字列に `max-sm:min-w-[44px] max-sm:min-h-[44px]` を追加。

**挙動仕様（訂正後）**:
- デスクトップ (`min-width: 640px` 以上): `w-8 h-8` の 32×32px が維持される
- モバイル (`max-width: 639px`): `min-w-[44px] min-h-[44px]` が `w-8 h-8` を上書きし、視覚・実描画ともに 44×44px

### Consequences

- 良い点:
  - §3 タップ領域要件をモバイルで満たす
  - デスクトップでの視覚バランスを維持
  - `ICON_BTN` と同じパターンで一貫性あり（既存実装と挙動が揃う）
- トレードオフ:
  - モバイル時、ボタンが `absolute top-3 right-3` で配置されているため、44×44px に拡大されると `dialogTitle`（`pr-*` 未設定）と視覚的に重なる可能性がある。
  - 現状の各ダイアログのタイトル長（「アップロード」「インポート結果」「公開設定」「履歴の復元」「削除の確認」など）では実害なし。
  - 将来タイトルが長くなる場合、`dialogTitle` に `max-sm:pr-12` を追加するか、`dialogCloseButton` に `max-sm:top-2 max-sm:right-2` でオフセットを縮めるなどの対処を別 Issue で行う。

---

## ADR-004: TagActions の行アクションボタン全体の icon+label 化はスコープ外、ConfirmDialog の `confirmIcon` 付与のみ含める

### Status
Accepted

### Context

棚卸し中に、`TagActions`（リネーム／統合／削除がテキストのみの行アクション）など、Issue 本文の名指しに含まれない既存実装の不整合が見つかった。一方で `TagActions` は `<ConfirmDialog>` を呼び出しているため、Step 3（ConfirmDialog 呼び出し側への `confirmIcon` 付与）の対象には含まれる。

選択肢:

- A. `TagActions` 全体（行アクションボタン + ConfirmDialog）をスコープに含めて icon+label 化する
- B. `TagActions` 全体をスコープ外とし、`ConfirmDialog` の `confirmIcon` 付与も省く
- C. `TagActions` の行アクションボタン全体は スコープ外、ただし `ConfirmDialog` の `confirmIcon` 付与は Step 3 の一括対応に含める（ガイドライン違反の確認ダイアログ側だけは整合させる）

### Decision

**C を採用**:
- `TagActions` の行アクションボタン（「リネーム」「統合」「削除」がテキストのみで他の行アクション群と不整合な点）は **本 Issue スコープ外** とし、plan.md 末尾の「フォローアップ Issue 候補」に記録
- `TagActions` 内の `<ConfirmDialog confirmIcon={Trash2}>` への対応は **Step 3 の一括対応に含める**（ConfirmDialog 側の対応漏れを作らないため）

理由:
- Issue 本文の「修正時の確認事項」と「既存実装の修正」は明示された候補リスト範囲内
- 行アクション群全体の icon+label 化は別 Issue として独立して扱う方が、デザイン判断（適切なアイコン選定 等）を丁寧に行える
- `ConfirmDialog` 側の整合は破壊変更にならず、Step 3 で一括対応するのが自然

### Consequences

- 良い点:
  - 本 Issue のスコープが明確に保たれる
  - `ConfirmDialog` 経由の整合は漏れなく取れる
  - フォローアップで `TagActions` の行アクションを設計判断込みで改修できる
- トレードオフ:
  - 一時的に `TagActions` の行アクションボタン群はテキストのみのまま残る
  - 「`TagActions` の削除ダイアログだけアイコン付きで、開く側のボタンはテキストのみ」という非対称が短期的に発生

---

## ADR-005: 管理画面の `BTN_SM_CLASS` (`h-7`) は §3 44px 要件の例外として spec に明記

### Status
Accepted

### Context

`app/components/admin/Jobs/index.tsx` 内のローカル定数 `BTN_SM_CLASS` は `h-7` (28px) で、§3「タップ領域 44×44px 確保」要件に対して未達。

選択肢:

- A. `BTN_SM_CLASS` を `h-11` (44px) 以上に拡大する、または `max-sm:min-h-[44px]` を追加する
- B. 管理画面はデスクトップ前提として §3 の例外を spec に明記し、`BTN_SM_CLASS` は現状維持

A は管理画面の情報密度を犠牲にする。管理画面 (admin) は admin 権限ユーザー専用のオペレーション画面で、リアルなモバイル利用想定が薄く、行数の多いジョブテーブルでは行高を抑える方が一覧性が高い。

### Decision

**B を採用**: spec §7.1 の新サブセクションに「管理画面（admin）の小型行アクション (`h-7` / `BTN_SM_CLASS`) は情報密度優先のデスクトップ前提として §3 44px 要件の例外とする」を明記。`BTN_SM_CLASS` 自体は現状維持。

### Consequences

- 良い点:
  - 管理画面の情報密度・一覧性を維持
  - 例外条件を spec で明文化することで、レビュー時の解釈ぶれをなくす
  - admin 利用者特性に合った設計判断
- トレードオフ:
  - 管理画面をモバイルから操作するケースは想定外（緊急時の手元確認程度を想定）
  - 将来モバイル対応が必要になった場合、`BTN_SM_CLASS` を再設計する必要あり

---

## ADR-006: `DeleteDirectoryDialog` も `confirmIcon={Trash2}` の対象に含める（plan.md の表に未掲載だった11件目）

### Status
Accepted

### Context

plan.md Step 3 の表は `<ConfirmDialog>` 呼び出し10件を列挙していたが、実装着手時に `grep -rln 'ConfirmDialog' app/components/` で再確認したところ `app/components/directory/DeleteDirectoryDialog.tsx` が漏れていた（plan 2 周目で `AccountDeleteForm` を除外した際の検証で見落としたと推定）。

`DeleteDirectoryDialog` はディレクトリ削除確認の UI で、`confirmLabel={isPending ? "削除中..." : "削除"}` のテキストのみで `<ConfirmDialog>` を呼び出している。他の削除系（`TrashRowActions`, `NoteActions`, `SavedViewsList`, `TagActions` 等）はすべて `Trash2` を付与する方針のため、整合性のためにも対応すべき。

選択肢:

- A. plan に従い 10 件のみ対応し、`DeleteDirectoryDialog` は別 Issue で対応
- B. plan の意図（「全 ConfirmDialog で形態を揃える」）に従い 11 件目として本 PR で対応

### Decision

**B を採用**: `DeleteDirectoryDialog.tsx` に `confirmIcon={Trash2}` を追加（`Trash2` を新規 import）。

理由:
- plan の趣旨（ConfirmDialog の confirm ボタンを一律 icon+label にする）に整合
- 「削除」系のため `Trash2` という選定は他の削除確認ダイアログと完全に揃う
- 別 Issue 化すると同じ ConfirmDialog 呼び出しの中で1件だけテキストのみが残り、UI の一貫性が崩れる
- 本対応は破壊変更ゼロで影響範囲が限定的

### Consequences

- 良い点:
  - 全 ConfirmDialog 呼び出し（11件）が形態を揃え、レビュー完了条件「アイコン+ラベルで揃い、混在なし」を完全に満たす
  - 漏れによる短期的な不整合を回避できる
- トレードオフ:
  - plan.md 表の件数（10件）と実装の件数（11件）に乖離が出る（本 ADR で経緯を記録することで補う）
