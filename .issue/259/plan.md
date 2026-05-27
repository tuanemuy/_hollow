# 実装計画 — Issue #259: プレビュー編集モーダルの情報設計改善（本文優先・AI 提案文脈の可視化）

**Issue:** #259
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

Issue #226 (PR #251) のデザインクリティーク（critique）H-1 / H-2 を解消し、`IngestionPreviewForm` の情報設計を「LLM 提案を確認する」という主動詞に揃える。

- **H-1**: 情報優先度を是正する。現状の `タイトル → ディレクトリ → タグ → FrontMatter → 本文プレビュー` は、JSON 上級者向けの FrontMatter を主コンテンツ（本文プレビュー）より上に置いており、確認 → 整理 → メタ調整の認知的流れに合っていない。並びを `タイトル → 本文プレビュー → ディレクトリ → タグ → FrontMatter（折りたたみ）` に再構成する。
- **H-2**: 各フィールドの初期値が「LLM 提案」であることを視覚化する。未編集時には「✨ AI 提案」のような極小キャプションを添え、ユーザーが値を変更した瞬間に消える（`data-edited` 属性）形にする。

## スコープ

### 含まれるもの

1. `app/components/ingestion/IngestionPreviewForm.tsx` のフィールド順序入れ替え
2. FrontMatter セクションを `<details>` 折りたたみ化（デフォルト閉）
3. 各フィールド（タイトル / ディレクトリ / タグ / FrontMatter）に「AI 提案」キャプション + `data-edited` 状態を導入
4. 既存の Vitest（`IngestionPreviewForm.test.tsx`）が壊れないことの確認、必要に応じて新規ケース追加（提案バッジ表示・編集後の消去・FrontMatter 折りたたみのデフォルト閉）
5. `spec/design/pages/P13a-upload-modal.html` の editing view モックを新順序＋折りたたみ＋AI 提案バッジに合わせて更新

### 含まれないもの

- critique H-3（failed view の `errorCode/errorReason` 生表示の改善）
- critique 中の「sticky bar の主従強調」「fieldset 縁取りの差別化」など他のミディアム/ロー優先度項目
- `DirectoryPicker` 自体の UI 改修（提案バッジは外側に出す）
- 本文プレビューの高さ token 化や `clamp` 化（critique で言及されているが H-1/H-2 とは独立）

## 実装ステップ

### 1. フィールド順序の入れ替え（H-1）

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`
- **変更内容:** JSX の field ブロック順を以下に変更する。
  1. タイトル（現状維持）
  2. **本文プレビュー（現状の最下段から 2 番目に繰り上げ）**
  3. ディレクトリ（`DirectoryPicker`）
  4. タグ
  5. FrontMatter（`<details>` でラップ、デフォルト閉）
- **理由:** 「内容を確認 → ディレクトリ/タグでファイリング → メタ調整」という認知的流れを優先する。FrontMatter は JSON 上級者向けで頻度・重要度が低いので一番下＋折りたたみ。

### 2. FrontMatter を `<details>` 折りたたみ化（H-1）

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`
- **変更内容:**
  - 既存の `<div className={field}>` を `<details>` でラップし、`<summary>` に「FrontMatter（JSON）」＋ AI 提案バッジ（後述）を置く
  - デフォルトは閉。初期値で FrontMatter が空でない（＝LLM が提案を返した）ケースでも、ユーザーが必要なときだけ開く運用を優先する（critique の「初心者の負荷を下げる」要請に従う）
  - `summary` のスタイル（カーソル / マーカー余白 / 縦リズム）は最低限。Tailwind ユーティリティで `cursor-pointer select-none flex items-center gap-2 text-[13px] font-medium text-ink-secondary` 程度
- **理由:** critique の H-1 提案そのもの。`<details>` ネイティブ要素は a11y / キーボード操作が標準で揃っており追加コードがほぼ不要。

### 3. AI 提案バッジ＋`data-edited` 状態の導入（H-2）

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`
- **変更内容:**
  - 各フィールド（タイトル / ディレクトリ / タグ / FrontMatter）の現在値が「初期 LLM 提案値と一致するか」を `useMemo` で算出する `isXxxEdited` フラグを導入する
    - タイトル: `title !== (preview.title ?? "")`
    - タグ: `tagInput !== preview.suggestedTagNames.join(", ")`
    - FrontMatter: `frontMatterJson !== initialFrontMatter`
    - ディレクトリ: `directoryId !== initialDirectoryId || pendingDirectoryName !== initialPendingDirName`
  - 各 `<label>`（およびディレクトリの `<legend>` / FrontMatter の `<summary>`）の右側に、極小キャプションコンポーネント `<AiSuggestionBadge edited={isXxxEdited} />` を添える
  - バッジ内容: 未編集時は「✨ AI 提案」、編集後は表示しない（critique の "編集後にバッジが消えるなど" を採用）
  - フィールドのルート `<div>` に `data-edited={isXxxEdited || undefined}` を付与し、将来のスタイル差別化に備える
- **理由:** critique H-2 そのもの。`useMemo` 計算は安価。バッジは表示専用 React コンポーネントを 1 つ追加するだけで他のフィールドにも同じ形で適用できる。

#### `AiSuggestionBadge` の場所

`IngestionPreviewForm.tsx` 内のモジュールスコープに `function AiSuggestionBadge({ edited }: { edited: boolean })` として定義する。1 ファイル限定の表現で、`app/components/common/` への昇格は他箇所での再利用要求が出てから（YAGNI）。

#### バッジのスタイル

`text-ink-tertiary` の極小キャプション（`text-[11px] font-normal`）。アイコン部分は絵文字 `✨` でテキストとして埋め込み、Apple Calm のトーンを壊さない単純な水平並び。`aria-hidden` は付けず、テキストとして読み上げ可能にしておく（"AI 提案" は SR ユーザーにも意味がある）。

### 4. テストの追加・調整

- **対象ファイル:** `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx`
- **変更内容:**
  - 既存テストは順序非依存（first input / single textarea / button-by-text）なので原則そのまま通る想定
  - 新規テスト:
    1. 初期表示で各フィールドの近傍に「AI 提案」テキストが出る
    2. タイトル / FrontMatter を編集すると、当該フィールドの「AI 提案」キャプションが消える
    3. FrontMatter は `<details>` でデフォルト閉（`<details>` 要素を取得して `open` 属性を確認）
  - `getFrontMatterTextarea` は `<details>` 内部の `<textarea>` でも DOM クエリ的には引き続き 1 個だけ存在するので変更不要
- **理由:** H-2 のユーザー可視な変化は「バッジが出る / 消える」なので、これは振る舞いテストとして残す価値がある。

### 5. デザインモックの更新

- **対象ファイル:** `spec/design/pages/P13a-upload-modal.html`
- **変更内容:**
  - editing view（State 3）と Mobile editing の `field-block` 順を新順序に並べ替える
  - FrontMatter を `<details>` でラップし、`<summary>` に「FrontMatter（JSON）」＋ AI 提案バッジを表示
  - 各 `field-label` に AI 提案バッジ（プレーン HTML での `<span class="ai-badge">✨ AI 提案</span>` 程度）を追加し、関連 CSS をモック内 `<style>` に追記
- **理由:** spec/design がデザイントークン・モックの SSOT なので、実装変更と同時に追従させる。critique 関連の Issue を後から見直す際に整合が取れていないと混乱する。

## 設計判断

- **`<details>` を採用（FrontMatter 折りたたみ）**: ADR-001 を参照。
- **`AiSuggestionBadge` をローカルコンポーネントに留める**: ADR-002 を参照。
- **編集判定の方法（参照値比較 vs `dirty` フラグ）**: ADR-003 を参照。

## リスクと注意点

- **テスト互換性**: 既存テストは順序・構造に強く依存していないが、`getFrontMatterTextarea` が `<details>` 内に入っても DOM クエリで取れる前提。`<details>` が `open=false` の場合でも `<textarea>` は DOM 上には存在する（描画されないだけ）ので、`document.body.querySelector<HTMLTextAreaElement>("textarea")` は引き続き機能する。ただしユーザー操作のシミュレートで「閉じた状態の textarea に input する」のはユースケースとして不自然なので、編集系の新規テストでは `<details>` を `open` にしてから操作する。
- **`useMemo` 依存の網羅性**: `isXxxEdited` の `useMemo` には初期値と現在値の両方を依存に入れる。`preview` 自体は親が変えない前提（モーダルが editing view を出した時点で固定）なので初期値計算は安定する。
- **a11y**: バッジを `aria-hidden` にしないので、スクリーンリーダーには「タイトル, AI 提案」と読み上げられる。これは critique の主張する「主動詞 = 確認」に揃う行動誘導なので意図的。
- **デザインモックと実装の差異**: モック側はクラス（`.ai-badge`）で実装し、本体は Tailwind ユーティリティで実装する。両者の見た目が大きくぶれないよう、フォントサイズと色だけは合わせる（`text-[11px]` / `text-ink-tertiary` = `--color-ink-tertiary`）。
- **スコープ膨張の抑制**: critique 中の H-3 や medium 群（sticky bar の主従、failed view の errorCode 隠蔽など）に踏み込まない。それらは別 Issue へ。

## テスト方針

- `pnpm test:unit` で `IngestionPreviewForm.test.tsx` を含むユニットテストを実行（既存通過 + 新規ケースが通る）
- `pnpm typecheck && pnpm lint && pnpm format:check` をローカルでクリーンにする
- manual-test スキルでブラウザ動作確認（testing.md 参照）

## レビュー履歴

なし（小〜中規模で内容が明確、サブエージェントによるレビューループはスキップして実装フェーズの PR レビューで担保する方針）。
