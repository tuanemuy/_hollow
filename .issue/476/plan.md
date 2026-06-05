# 実装計画 — Issue #476: ノート一覧の絞り込みUI（タグ/期間/公開状態）を再検討する

**Issue:** #476
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

ノート一覧画面（`/`）の `FilterBar` を、絞り込みフォームがメインコンテンツを邪魔せず・必要なときだけ呼び出せて・各フィルターの操作モデルに一貫性のあるUIへ再設計する。

採用方針は **案2（全フィルターをチップ＋ポップオーバーに統一）**。`.issue/476/mockup-case2.html` の詳細モック（状態A〜E＋モバイル）が出荷済みデザイントークンから組まれており、これを実装ターゲットとする。

## スコープ

### 含まれるもの

- **期間フィルター**: むき出しの `<input type="date">` × 2 を廃止し、「期間」トリガーチップ＋ポップオーバー（プリセット＋ from/to 日付入力）に置き換える。適用中はチップに値（例: `期間: 6/1–6/30 ×`）を表示し `×` で個別解除。
- **公開状態フィルター**: むき出しの `<select>` を廃止し、「公開状態」トリガーチップ＋ポップオーバー（状態色スウォッチ付き単一選択）に置き換える。適用中はチップに値（例: `公開状態: 公開 ×`）を表示し `×` で個別解除。
- **タグ**: 現状維持（件数つきトグルチップ＋「もっと見る」折りたたみ #354）。トリガーチップ群との視覚的整合のため微調整のみ。
- **ディレクトリ / 内部リンク参照**: 現状維持（適用時のみチップ表示・`×` 解除、トリガー経路はツリー／ノート選択ダイアログのまま）。見た目を他チップと揃える。
- **すべてクリア**: 1つ以上フィルター適用時に末尾へ表示（現状維持）。
- 上記に必要な共有ポップオーバー部品・スタイル定数・純粋ロジック（期間プリセット計算・チップラベル整形）の追加とユニットテスト。

### 含まれないもの

- 状態管理モデルの変更。URL search params（`noteListSearchSchema`）＋ `useOptimistic` 即時反映＋ `homeSearchUpdater` 部分更新は**維持する**（Issue 明記の制約）。スキーマ（`from`/`to`/`visibility`）も変更しない。
- 既存の3つのインラインメニュー（`NoteActionsMenu` / `DirectoryActionsMenu` / `UserMenu`）の汎用 Popover 化リファクタリング（別 follow-up）。
- ディレクトリ／内部リンク参照の**トリガー方法**そのものの変更（ツリー由来・ダイアログ由来は据え置き）。
- 案1（折りたたみパネル）・案3（faceted chips のメニュー追加方式）・案4（アイコントリガー）の要素。
- 「保存ビュー」「カード/リスト」トグル等、モックに描かれているが本 Issue と無関係の周辺UI。

## 実装ステップ

### 1. 共有ポップオーバー部品の追加

- **対象ファイル:** `app/components/note/list/FilterPopover.tsx`（新規）
- **変更内容:** トリガーチップ＋フローティングパネルの開閉・dismiss（document `mousedown` 外側クリック／`Escape`／focus-out）・フォーカス復帰を内包する小さな部品。`NoteActionsMenu` の確立済みパターン（document-level dismiss + Escape で trigger へ focus 復帰、`aria-haspopup` / `aria-expanded` / `aria-controls`）を踏襲する。期間（フォーム型）と公開状態（単一選択）の両方から使えるよう、トリガー描画は呼び出し側、パネル中身は `children` で受ける汎用形にする。
- **理由:** FilterBar 内に同じ dismiss ロジックを2つ重複させない。既存メニュー群は触らずスコープを閉じる。

### 2. 期間フィルターのチップ＋ポップオーバー化

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`、`app/components/note/list/listSelectors.ts`（プリセット計算・ラベル整形）
- **変更内容:**
  - むき出しの date input 2つを削除。
  - 「期間」トリガーチップ（未適用時は破線 ghost、適用時は dark チップに `期間: {from}–{to} ×`）を追加。
  - ポップオーバー中身: プリセット（今日／今週／今月／過去30日／過去90日／今年）グリッド＋ from/to の `<input type="date">`＋フッター（クリア／閉じる）。
  - プリセット押下で from/to をクライアント計算してセット。手で日付を変えるとプリセット選択は外れる。
  - 反映は**既存の即時モデルを維持**（preset 押下・date 変更で `run(...)` → `homeSearchUpdater` で `from`/`to` を即更新）。フッターは「クリア（範囲解除）」と「閉じる」。詳細は ADR-003。
- **理由:** むき出しフォーム要素を排し、タグと同じチップ語彙へ統一。

### 3. 公開状態フィルターのチップ＋ポップオーバー化

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`、`app/components/note/list/styles.ts`（状態色スウォッチ）
- **変更内容:**
  - `<select>` を削除。
  - 「公開状態」トリガーチップ（未適用時 ghost、適用時 dark に `公開状態: {label} ×`）を追加。
  - ポップオーバー中身: すべて／非公開／限定公開／公開 の単一選択リスト。状態色スウォッチ（公開=success／限定公開=warning／非公開・すべて=ink-tertiary、既存 `styles.ts` の `visibilityChipClass` / `visibilityLabel` を再利用・拡張）。選択した瞬間に `visibility` を更新してポップオーバーを閉じる。「すべて」で解除（`visibility=undefined`）。
  - WAI-ARIA: トリガーは `aria-haspopup`、リストは単一選択メニュー（roving tabindex か `role="menu"`＋`aria-checked`／`menuitemradio`）。
- **理由:** `select` の操作モデルをチップ群へ統一しつつ、状態色で識別性を上げる。

### 4. チップ語彙の共通化と全体レイアウト調整

- **対象ファイル:** `app/components/note/list/styles.ts`、`FilterBar.tsx`
- **変更内容:**
  - チップのスタイル定数（通常 / `data-active` / `ghost`（破線トリガー） / `×` 解除ボタン / `caret`）を `styles.ts` に集約し、タグ・期間・公開状態・ディレクトリ・内部リンク参照すべてで共有。
  - 現状 `FilterBar.tsx` ローカルの `CHIP` 定数・むき出し `inputSm` を整理。
  - レイアウト: タグ群 → 区切り（`vsep`）→ トリガーチップ群 → 適用済みチップ → すべてクリア の順。`flex-wrap` でモバイル折返し（`max-sm:`）を維持。
- **理由:** 「すべて同じ pill チップ＋× の語彙、トリガー方法だけ違う」という案2の一貫性ゴールを担保。

### 5. 純粋ロジックのユニットテスト

- **対象ファイル:** `app/components/note/list/__tests__/listSelectors.test.ts`（追記）
- **変更内容:** 期間プリセット → `{from, to}` 変換（境界含む）、期間チップラベル整形（`6/1–6/30` 等）、公開状態ラベル整形のテストを追加。日付計算は決定的にするため基準日を引数で受ける純粋関数にする（`new Date()` をロジック内で直接呼ばない）。
- **理由:** プロジェクト方針（純粋関数を React 非依存にしてテスト）に沿う。日付プリセットは回帰しやすい。

## 設計判断

詳細は `.issue/476/adr.md` を参照。

- **ADR-001:** 案2（チップ＋ポップオーバー統一）の採用。
- **ADR-002:** ポップオーバー実装は新規 `FilterPopover` に既存インラインメニューパターンを踏襲して局所化。既存3メニューの汎用化はしない。
- **ADR-003:** 期間ポップオーバーの反映モデルは**即時反映**（既存 `useOptimistic`＋URL を維持）。モックの明示「適用」ボタンは置かず「クリア／閉じる」に留め、Issue 制約「この設計は維持する」を優先。
- **ADR-004:** ディレクトリ／内部リンク参照はトリガー据え置き・見た目のみ統一。

## リスクと注意点

- **a11y 回帰:** 現状の `aria-pressed` / `aria-label` / sr-only ラベル / `aria-busy` と同等以上を担保する。ポップオーバーはフォーカストラップ不要（非モーダル）だが、`Escape`／外側クリックで閉じ、トリガーへフォーカス復帰すること。`<select>` 廃止で失われるネイティブ操作性をキーボード操作（矢印キー等）で補う。
- **モバイル:** ポップオーバーが画面端で溢れないこと。`max-sm:` でチップが折り返しても破綻しないこと。タップターゲット（44px 目安）を確保。
- **即時反映の維持:** `run(action, nav)` を経由し `useOptimistic` のパッチ＋ `router.navigate` を崩さない。フィルター追加時の `page` リセット（既存の handlePick と同様）に注意。
- **日付プリセットのタイムゾーン:** `from`/`to` は `YYYY-MM-DD`（`z.string().date()`）。プリセット計算はローカル日付で行い、UTC ずれで日付が1日ずれないようにする。
- **ポップオーバー多重表示:** 期間と公開状態のポップオーバーが同時に開かないよう、開閉状態の管理に注意（個別 state で可、ただし一方を開くと他方が閉じると親切）。

## 実装詳細メモ（レビュー反映）

実装者が判断に迷いやすい点を具体化する。

### 期間プリセット定義（ローカル日付・基準日引数）

純粋関数 `resolveDateRangePreset(preset, baseDate)` を `listSelectors.ts` に追加する。`new Date()` をロジック内で直接呼ばず、基準日を引数で受ける（テスト決定性のため）。返り値は `{ from, to }`（`YYYY-MM-DD`、ローカル日付）。

| プリセット | 定義 |
| --- | --- |
| 今日 | 基準日のみ（from = to = 基準日） |
| 今週 | 月曜〜日曜（基準日を含む週、週初＝月曜） |
| 今月 | 月初〜月末（基準日の月） |
| 過去30日 | 基準日を含む直近30日（from = 基準日 − 29日, to = 基準日） |
| 過去90日 | 基準日を含む直近90日（from = 基準日 − 89日, to = 基準日） |
| 今年 | 1/1〜基準日 |

タイムゾーンはローカルで統一し、UTC 変換で1日ずれないよう `getFullYear/getMonth/getDate` ベースで組む。`existing listSelectors.ts` に同種関数が無いことを確認済み（新規追加）。

### page リセットの統一ルール

`homeSearchUpdater` 呼び出し時、**新しいフィルター条件を追加・変更したら `page: undefined` を含めて1ページ目へ戻す**（プリセット選択・date 変更・公開状態選択）。`×` での個別解除・「すべてクリア」も結果集合が変わるため `page` を落としてよい。既存 `handlePick`（内部リンク参照追加）が既にこの方式。タグトグルの既存挙動と齟齬が出ないよう、本 Issue で触る期間・公開状態は追加時 `page: undefined` を付ける。

### ポップオーバーの排他管理

期間と公開状態が同時に開かないよう、**排他 state** を採用する: `const [openPopover, setOpenPopover] = useState<"date" | "visibility" | null>(null)`。一方を開くと他方は自動で閉じる。

### `FilterPopover` の契約（仮）

```ts
type FilterPopoverProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: (props: { ref: Ref<HTMLButtonElement>; "aria-haspopup": "dialog" | "menu"; "aria-expanded": boolean; "aria-controls": string | undefined }) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
  label: string; // ポップオーバーパネルの aria-label
};
```

呼び出し側がトリガーチップを描画し、パネル中身を `children` で渡す。dismiss（外側 `mousedown`／`Escape`／focus-out）・トリガーへの `.focus()` 復帰は `FilterPopover` が担う（`NoteActionsMenu.tsx` のパターンを踏襲）。

### 公開状態ラベルの型安全な拡張

既存 `visibilityLabel(v: Visibility)` は "すべて" を含まない。"すべて"（解除）を含む選択肢用に `visibilityLabel(v: Visibility | "all")` へオーバーロード/拡張するか、別関数を用意して型安全を保つ。状態色スウォッチは `visibilityChipClass` の色（success/warning/ink-tertiary）を流用する。

### a11y 実装ガイド

- トリガーチップ: `aria-haspopup`（期間=`"dialog"`／公開状態=`"menu"` か `"listbox"`）・`aria-expanded`・`aria-controls`。
- 期間ポップオーバー: プリセット群は `role="group"`＋各ボタン、date input は個別 sr-only ラベル（既存踏襲）。Tab で全要素を辿れる。
- 公開状態ポップオーバー: 単一選択。`role="menu"`＋`menuitemradio`／`aria-checked`、または `role="listbox"`＋`aria-selected`。roving tabindex は `NoteActionsMenu` を参照。
- 共通: `Escape`／外側クリック／focus-out で閉じ、トリガーへフォーカス復帰。`aria-busy`（一覧ローディング）・`aria-pressed`（タグトグル）は維持。

### ディレクトリ・内部リンク参照の扱い

現状維持（適用時のみ dark チップ表示・`×` 解除）。ghost トリガーチップは**追加しない**。共有するのはスタイル定数（`data-active` チップ・`×` ボタン）のみ。

### すべてクリアの保持対象

`q`（検索キーワード）と `display`（カード/リスト）は保持し、`tagNames` / `from` / `to` / `visibility` / `directoryId` / `referencingNoteId` のみリセット（既存 `clearAll` 挙動を維持）。

## テスト方針

- `pnpm typecheck` / `pnpm lint:fix` / `pnpm format`。
- `pnpm test:unit`（プリセット変換・ラベル整形の新規テスト＋既存 `listSelectors` 回帰）。
- `pnpm dev` でブラウザ実機確認（manual-test スキル）: 各フィルターの適用／解除／クリア、ポップオーバー開閉、キーボード操作、モバイル幅、URL 同期。複数ノート・タグ・公開状態のシードが必要。

## レビュー履歴

### 1周目

2視点並列レビュー（要件カバレッジ / アーキテクチャ・リスク）を実施。アーキテクチャ視点は「問題点ゼロ」、要件視点は実装時に判断が分かれやすい箇所の明確化を5点指摘。

**反映した点（→「実装詳細メモ」セクション・ADR-003 を追記/強化）:**
- 即時反映モデルの明確化＋モックの「適用」ボタンは仮描画で実装しないことを ADR-003 に明記（要件 P-001）。
- ディレクトリ・内部リンク参照は ghost トリガーを追加せず現状維持・スタイル定数のみ共有（要件 P-002）。
- 期間プリセット定義（今日／今週=月〜日／今月=月初〜末／過去N日=本日含む直近N／今年=1/1〜基準日）と純粋関数 `resolveDateRangePreset(preset, baseDate)` の署名（要件 P-003 / アーキ S-003）。
- 「すべてクリア」が `q`/`display` を保持し他フィルターのみ解除（要件 P-004）。
- a11y 実装ガイド（`aria-haspopup`/`aria-expanded`/`aria-controls`・role・Escape/外側クリックでフォーカス復帰、`NoteActionsMenu` 参照）（要件 P-005）。
- page リセットの統一ルール（新規追加時 `page: undefined`）（要件 S-003 / アーキ S-001）。
- ポップオーバーの排他 state 採用（アーキ S-002）。
- `FilterPopover` の契約（props 型・close）（アーキ S-004）。
- `visibilityLabel` の型安全な拡張（"all" 対応）（アーキ S-005）。

**見送った提案:**
- 汎用 Popover primitive への統合（アーキ S-001/要件関連）: ADR-002 のとおり follow-up。本 Issue はスコープ外。
- date input を外部ライブラリ化（アーキ S-002）: ネイティブ `<input type="date">` 据え置きが既存踏襲かつ a11y 良好なため見送り。

### 2周目

1周目の指摘はすべて plan.md / adr.md に反映済み、アーキ視点は当初から問題点ゼロのため、両視点とも実質クリーンと判断しレビューループを終了。
