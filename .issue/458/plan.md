# 実装計画 — Issue #458: 管理画面UIの崩れ・冗長表現をまとめて修正

**Issue:** #458
**作成日:** 2026-06-04
**複雑度:** 小規模（presentation 層のみ・5ファイルの局所的なスタイル/文言修正）

---

## 目的

管理画面（admin）のUIに点在する細かい崩れ・冗長表現をまとめて解消する。見た目（presentation 層のコンポーネント）のみの修正で、ドメイン/アプリケーション層の変更は不要。

## スコープ

### 含まれるもの

- プロンプト設定: カード説明と textarea placeholder の重複解消（placeholder を具体的な記入例に）
- デザイントークン: フォーム行レイアウトの整列修正
- デザイントークン: 説明文からリポジトリ内ファイルパス（`spec/design/tokens.md`）の除去
- LLM設定: ラベルテキストとバッジ（「環境変数で固定中」「必須」）の基準線揃え
- ジョブ監視: ステータスタグの折り返し防止（ピル形状の維持）

### 含まれないもの

- ドメイン/アプリケーション層の変更
- 新規UI画面の追加・画面レイアウトの再設計
- 文言以外の機能変更（保存処理・バリデーション等のロジック）

## 実装ステップ

### 1. プロンプト設定: 説明と placeholder の役割分離

- **対象ファイル:** `app/components/admin/PromptsForm/index.tsx`
- **変更内容:**
  - `PromptDescriptor` 型に `placeholder: string`（具体的な記入例）を追加する。
  - `PROMPT_DESCRIPTORS` の各 purpose に、説明の言い換えではない**具体的な記入例**を設定する。
    - structure: `例: 箇条書きの見出しを残しつつ、要点を3行で要約してほしい`
    - title: `例: 内容が一目で分かる体言止めのタイトルにしてほしい`
    - directory: `例: 日付よりも内容のテーマを優先して配置先を決めてほしい`
    - metadata: `例: 技術トピックは固有名詞をそのままタグにしてほしい`
    - ocr_assist: `例: 誤認識しやすい数字と記号を文脈から補正してほしい`
  - 共有定数 `INTENT_PLACEHOLDER`（L70-72）を削除し、textarea の `placeholder` を `descriptor.placeholder` に差し替える。
- **理由:** 説明（何を入力する欄か）と placeholder（具体的な記入例）の役割が重複していたため、役割を分離して入力イメージを掴みやすくする。

### 2. デザイントークン: フォーム行の整列修正

- **対象ファイル:** `app/components/admin/DesignTokensForm/index.tsx`（L222付近）
- **変更内容:**
  - 行ラッパーの `grid grid-cols-[220px_1fr] ... items-start` で、ラベル列・値列の先頭入力欄が縦にずれている原因を解消する。
  - ラベル列ラッパー（`flex flex-col gap-1 pt-2`）と値列ラッパー（`flex items-center gap-2 pt-1`）のアドホックな `pt-2`/`pt-1` を揃え、両列の先頭要素（`h-8` の input）が同じ上端で整列するようにする。
- **理由:** ラベル/入力の基準がずれて見えるため。両列の上端パディングを統一して整列させる。
- **スコープ判断:** Issue 本文は「列幅・`items-start` の見直し」を例示するが、ずれの実体はラベル列 `pt-2` と値列 `pt-1` のアドホックな差分にある。列構造（`grid-cols-[220px_1fr]` / `items-start`）は据え置き、両列の `pt` を `pt-1` に統一するだけで先頭 input（ともに `h-8`）が整列するため、最小修正に留める。整列は manual-test TC-2 で目視検証済み。

### 3. デザイントークン: 説明文からファイル名を除去

- **対象ファイル:** `app/components/admin/DesignTokensForm/index.tsx`（L204-209）
- **変更内容:** 説明 `<p>` 末尾の「トークンの一覧は `spec/design/tokens.md` を参照してください。」（`<code>` を含む）を削除する。残りの「ビルトインの既定値が…エクスポート時の CSS に注入されます。」は維持。
- **理由:** 運用者向けUIにリポジトリ内部のファイルパスを出すのは不適切なため。

### 4. LLM設定: ラベルとバッジの整列

- **対象ファイル:** `app/components/admin/LLMSettingsForm/index.tsx`
- **変更内容:**
  - `FIELD_LABEL_CLASS`（L42）を `block` から `flex items-center gap-2` に変更し、ラベルテキストとバッジを flex で水平整列させる（`mb-[6px]` 等は維持）。
  - `REQUIRED_BADGE_CLASS`（L55-56）/ `LOCK_BADGE_CLASS`（L57-58）から `ml-2` と `align-middle` を除去する（gap で間隔を取るため不要）。
- **理由:** バッジが `block` ラベル内にインライン配置され `align-middle` だけで縦位置調整していたため基準線がずれていた。flex で確実に中央揃えする。

### 5. ジョブ監視: ステータスタグの折り返し防止

- **対象ファイル:** `app/components/admin/Jobs/index.tsx`（`TAG_BASE`, L42-43）
- **変更内容:** `TAG_BASE` に `whitespace-nowrap` を付与する。
- **理由:** 狭い列幅で日本語ラベル（「キャンセル」「期限切れ」等）がタグ内で改行し、ピル形状が崩れて潰れていたため。1行表示を保証する。

## 設計判断

トレードオフを伴う技術的設計判断はなし（ADR 不要）。placeholder の文言は「説明の言い換えではなく具体的な記入例」という Issue の要件に沿って設定する。

## リスクと注意点

- `FIELD_LABEL_CLASS` は LLMSettingsForm 内の全ラベルで共有されているため、`flex` 化が全ラベル（バッジ無しのものも含む）に影響する。バッジ無しラベルは単一テキスト子なので flex でも表示は変わらない見込み。実機で全ラベルを確認する。
- デザイントークンの整列は固定幅 `220px` 列を維持しつつパディング調整で対応する（列構造自体の作り替えはスコープ外）。
- いずれも CSS ユーティリティ（Tailwind）の範囲内の調整。新規トークン定義・新規CSSファイルは作らない（CLAUDE.md のスタイル方針に従う）。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` で静的検証。
- ローカル dev サーバーで `/admin` 配下の各画面（プロンプト設定 / デザイントークン / LLM設定 / ジョブ監視）を目視確認する。詳細は testing.md を参照。
