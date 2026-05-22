# 実装計画 — Issue #104: feat(ui): Dialog プリミティブの背景クリック / × ボタンによる close オプションを追加

**Issue:** #104
**作成日:** 2026-05-22
**複雑度:** 中〜大規模

---

## 目的

共通 `Dialog` プリミティブ（`app/components/common/Dialog.tsx`）に opt-in props を追加し、WAI-ARIA / 一般的な Modal UX として期待される **背景（overlay）クリック** と **× アイコンボタン** での close 経路を提供する。コンシューマが個別に実装しなくても標準的な close 経路を有効化できるようにする。

## スコープ

### 含まれるもの

- `app/components/common/Dialog.tsx` に `closeOnBackdropClick?: boolean`（default `false`）と `showCloseButton?: boolean`（default `false`）の opt-in props を追加。
- backdrop click ハンドラの実装（mousedown→click の origin 一致チェックで誤閉じ防止）。
- × アイコンボタンの描画（`aria-label="閉じる"`、focus trap 内・初期 focus 候補からは除外、`closable=false` 中は disabled）。
- panel の位置決め用に `dialog` 定数へ `relative` 追加（× の `absolute` 配置の前提）。
- × ボタン用 utility hoist を `app/components/note/styles.ts` に追加（既存 hoist 規約に合わせる）。
- 単体テストの新規追加（`app/components/common/__tests__/Dialog.test.tsx`）。
- 関連 JSDoc の更新（WHY を明文化）。

### 含まれないもの

- 既存 7 コンシューマ（`NotePickerDialog` / `MoveNoteDialog` / `SaveViewDialog` / `BulkVisibilityDialog` / `BulkExportDialog` / `MergeTagDialog` / `ConfirmDialog`）の改修。opt-in default false で既存挙動は維持する。
- 各 Dialog で × / backdrop close を採用するかどうかの判断（コンシューマ側 UX 文脈の判断であり、別 Issue が妥当）。
- `.issue/63/.manual-test/results/TC-010.md` の testing.md 表現更新（Issue #63 の文脈で完結済み。再オープンするなら別 Issue）。
- アイコンライブラリ導入（U+00D7 文字で十分、依存最小方針と整合）。
- i18n 対応（`aria-label` 文字列の props 化）。プロジェクト全体が日本語 UI 前提。将来必要になれば破壊変更なしで `closeButtonLabel?: string` を追加可能。

## 実装ステップ

### 1. `DialogProps` に opt-in props を追加（型 + JSDoc）

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:**
  - `closeOnBackdropClick?: boolean`（default `false`）と `showCloseButton?: boolean`（default `false`）を `DialogProps` に追加。
  - 既存 JSDoc を拡張し、両 props のデフォルトが `false`（既存互換）であること、`closable=false` 中は両経路ともに無効化されること、× ボタンは focus trap 内に含まれるが初期 focus 候補からは除外されること、backdrop close は「mousedown→click の双方が backdrop で発生したとき」のみ発火することを明記。
- **理由:** Issue 要件の中核。型レベルで opt-in を表現し、既存コンシューマの呼び出しサイトを型エラーから守る（`?:` で省略可能）。

### 2. `DialogInner` の引数追加と既存 ref パターンの活用

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:** `closeOnBackdropClick = false`, `showCloseButton = false` を引数に追加。新ハンドラ内でも `closableRef.current` / `onCloseRef.current` を再利用する。
- **理由:** 既存の「ref 越しに最新値を読む」設計（IME / pending toggling 由来の churn 回避）と一貫させる。

### 3. バックドロップクリックハンドラ実装

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:**
  - `mousedownTargetRef = useRef<EventTarget | null>(null)` を追加。
  - backdrop `<div>` に `onMouseDown` と `onClick` を付与。click ハンドラで以下を順に判定し、すべて通れば `onClose` を呼ぶ:
    1. `closeOnBackdropClick === false` なら no-op
    2. `closableRef.current === false` なら no-op（pending 中の保護）
    3. `e.target !== e.currentTarget` または `mousedownTargetRef.current !== e.currentTarget` なら no-op（panel 内ドラッグからの誤閉じ防止）
  - panel `<div>` に `onMouseDown={(e) => e.stopPropagation()}` を追加し、panel 起点の drag/click が backdrop に到達するのを完全に絶つ。
- **理由:** WAI-ARIA Dialog (Modal) Pattern に沿う標準 UX。mousedown↔click の origin 一致チェックは Radix UI / Headless UI 等が採用する事実上の標準で、フォーム中の誤閉じを防ぐ。

### 4. × ボタンの描画と a11y

- **対象ファイル:** `app/components/common/Dialog.tsx`、`app/components/note/styles.ts`
- **変更内容:**
  - `showCloseButton === true` のとき panel の最初の子として close button を描画:
    ```tsx
    <button
      type="button"
      aria-label="閉じる"
      data-dialog-close=""
      onClick={() => { if (closableRef.current) onCloseRef.current(); }}
      disabled={!closable}
      className={dialogCloseButton}
    >
      <span aria-hidden="true">×</span>
    </button>
    ```
  - `dialog` 定数に `relative` を 1 トークン追加（× の `absolute` 配置の親基準）。
  - `app/components/note/styles.ts` に `dialogCloseButton` を新規 hoist（`absolute top-3 right-3` + focus-visible リング + hover surface + disabled スタイル）。
- **理由:** × 記号は SR にとってノイズなので `aria-hidden` で隠してラベル `閉じる` を提供。`data-dialog-close=""` で初期 focus 探索から除外（ステップ5参照）。`disabled` 属性で `closable=false` 中の物理無効化（Tab cycle からも自動で外れる）。

### 5. focus trap への組み込みと初期 focus の調整

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:**
  - **Tab cycle 用 `FOCUSABLE_SELECTOR` は変更しない**。`button:not([disabled])` で × ボタン（有効時）が自動的に対象になる。disabled 時は selector から外れる。
  - **初期 focus 探索ブロックの selector を分離**: モジュールスコープ定数 `INITIAL_FOCUS_SELECTOR = \`${FOCUSABLE_SELECTOR}:not([data-dialog-close])\`` を新設し、`useEffect` 内 `requestAnimationFrame` 部分の `role !== "alertdialog"` 枝で使用する。`alertdialog` 枝は panel 自体に focus するため影響なし。
- **理由:** WAI-ARIA Dialog Pattern「最初に focus が当たるのは意味のあるコントロール」に従う。× ボタンが panel 先頭にあっても初期 focus されない一方、キーボードユーザーは Tab で × にも辿り着ける。定数命名で「Tab 用 / 初期 focus 用」の使い分けを明示する。

### 6. library-level JSDoc 拡充

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:** `Dialog` 関数の JSDoc に追記:
  - 両 props はデフォルト false で既存挙動を変えないこと
  - `closeOnBackdropClick=true` の場合、panel 起点のドラッグ離脱では閉じないこと
  - `showCloseButton=true` のとき × は focus trap 内（Tab で移動可）だが初期 focus 候補からは除外されること
  - 両経路とも `closable=false` 中は無効化される（× は disabled、backdrop click は no-op）
  - キャンセルボタン併設は consumer 判断（プリミティブは経路提供のみ）
- **理由:** CLAUDE.md「library-level JSDoc on exported APIs is welcome」。共通プリミティブで利用者が多いため WHY を一箇所に集約する価値が高い。

### 7. Dialog 単体テスト追加

- **対象ファイル:** 新規 `app/components/common/__tests__/Dialog.test.tsx`
- **テストケース:**
  - default では backdrop click で閉じない（mousedown→click を backdrop で順に発火）
  - `closeOnBackdropClick=true` のとき backdrop 上で mousedown→click を順に発火すると `onClose` が呼ばれる
  - `closeOnBackdropClick=true` でも panel 内で mousedown → backdrop で click では閉じない（origin guard の効きを検証）
  - `closeOnBackdropClick=true` かつ `closable=false` のとき backdrop click で閉じない
  - default では × ボタンが描画されない
  - `showCloseButton=true` のとき `button[aria-label="閉じる"]` が描画され、click で `onClose` が呼ばれる
  - `showCloseButton=true` かつ `closable=false` のとき × ボタンが `disabled` 属性を持つ（React は disabled な button の click を発火しないため、属性検証で十分。ハンドラ内 `closableRef.current` ガードは「非同期で `closable=false` へ切り替わる瞬間のレース対策の防御コード」として JSDoc に注記する）
  - `showCloseButton=true` で dialog を開いた直後、初期 focus が × ボタンに当たらない
- **既存パターン:** `app/components/note/list/__tests__/NotePickerDialog.test.tsx` の `happy-dom` + `createRoot` + `act` を踏襲。
- **理由:** プリミティブ層に直接テストがない。新 props は分岐が多く a11y 影響が大きいので回帰防止が必須。

### 8. 後処理コマンド実行

- `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit`（CLAUDE.md 規約）。

## 設計判断

詳細は `adr.md` を参照。主要な判断:

- **ADR-001:** backdrop click の origin guard（mousedown→click の起点一致チェック）採用
- **ADR-002:** × ボタンの a11y label を固定文字列 `閉じる` とする（YAGNI、必要時に props 化可能）
- **ADR-003:** × アイコンの実体は U+00D7 文字（依存最小、SVG ライブラリ不要）
- **ADR-004:** × ボタンは Tab cycle 内・初期 focus 候補外（`data-dialog-close=""` + selector フィルタ）
- **ADR-005:** `dialog` 定数に `relative` を追加（新規 `dialogPanel` 定数を切らず最小変更）
- **ADR-006:** キャンセルボタンとの共存方針はプリミティブで規定せず consumer 判断とする

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**取り込んだ改善提案**:
- [要件カバレッジ S-001 / アーキ S-002] ADR-005 と plan.md のリスク欄に、事前 grep 結果（`SR_ONLY` のみで視覚的 `absolute` なし）を明記し、実装中の判断を先送りしない構造に変更
- [要件カバレッジ S-002] ADR-004 の Decision 冒頭に「Tab cycle 内に含める。ただし初期 focus 候補からは除外」を明示し、Issue 設計判断との trace 性を向上
- [要件カバレッジ S-003] テストケースに「mousedown→click を backdrop で順に発火」の明示と origin guard 検証ケースの記述を追加
- [アーキ S-001] `closable=false` 時のテスト方針を「disabled 属性検証で十分。ハンドラ内ガードはレース対策の防御コード」と整理し、JSDoc 注記方針を明記
- [アーキ S-003] 初期 focus 用 selector を `INITIAL_FOCUS_SELECTOR` 定数として hoist する方針を明記
- [アーキ S-004] 手動確認は「既存挙動の回帰確認に限定、新挙動は単体テストでカバー」と明確化

**見送った提案**: なし

## リスクと注意点

- **`dialog` 定数への `relative` 追加の波及:** 7 既存コンシューマ全てが影響を受けるが、`relative` 自体は子要素に `absolute` がなければ見た目を変えない。事前 grep の結果、`<Dialog>` 子孫の `absolute` 利用は `SR_ONLY`（NotePickerDialog 等の `clip:rect(0,0,0,0)` パターン）のみで、視覚的な `absolute` 配置はない。`SR_ONLY` は clip 済みで `relative` 追加の影響なし。万一実装中に新たな `absolute` 子要素を見つけた場合の代替策は新規 `dialogPanel` 定数への切り替え。
- **× の scroll 追従挙動:** panel が `max-h-[90vh]` + `overflow-y-auto` の中で × を `absolute top-3 right-3` 配置すると、scroll に追従して上端から離れる。Issue では仕様未指定、シンプルさ優先で OK。気になれば将来 `sticky top-0` オプション化を検討。
- **HMR と body scroll lock:** 既存の HMR-leak 注意点に今回の変更は影響しない（counter ロジック未変更）。
- **既存テストへの影響:** `NotePickerDialog.test.tsx` 等は dialog 内 button 総数に依存していない。コンシューマが `showCloseButton` を有効化しない限り × ボタンは DOM に出ないので破壊しない。
- **i18n 未対応:** `aria-label="閉じる"` は日本語固定。プロジェクト全体が日本語 UI 前提なので問題なし。

## テスト方針

- **単体テスト:** `pnpm test:unit` で実装ステップ7のケースを実行。新 props の挙動回帰防止の主要担保はここ。
- **型チェック:** `pnpm typecheck` で既存 7 コンシューマが無改修で通ることを保証。
- **手動動作確認:** 既存コンシューマは全て opt-out なので新挙動を踏める動線がプロジェクト内に存在しない。手動確認は (a) 既存 `ConfirmDialog` 系の **既存挙動の回帰確認**（Esc、focus trap、`closable=false`、Cancel ボタン）に限定し、(b) **新挙動の動作確認は単体テストでカバー** する方針。将来コンシューマが opt-in を有効化したタイミングで手動シナリオを追加する。
