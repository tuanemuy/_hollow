# 実装計画 — Issue #601: 公開検索(P32)スニペットの FTS5 `<mark>` が生文字列で表示される

**Issue:** #601
**複雑度:** 小規模
**作成日:** 2026-06-26

## 目的

公開検索画面 P32 (`/search`) の結果スニペットで、FTS5 が付与するハイライトマーカー `<mark>…</mark>` が、React のテキストエスケープによって**生のタグ文字列**としてユーザーに表示されてしまうバグを解消する。検索語が `<mark>` で意図どおりハイライト表示（背景色付き）されるようにする。

## 原因

- バックエンド `app/core/adapters/d1/searchIndex.ts:219` が FTS5 の `snippet(fts, 1, '<mark>', '</mark>', '…', ...)` でハイライト済みスニペットを生成して返す。
- フロントエンド `app/components/public/PublicSearch.tsx:209` が `{hit.snippet}` を**プレーンテキスト**として描画するため、React が `<` `>` を自動エスケープし、`<mark>` がマークアップとして解釈されず生文字列で出る。

## 方針

Issue 本文・コメントで合意された「ハイライト表示する方向で解決」を採用する（P32 デザインモック `spec/design/pages/P32-public-search.html` が `mark` のスタイルを既に前提にしているため、この方向でモック乖離も同時に解消）。

**安全な描画**: スニペット文字列を `<mark>` / `</mark>` 区切りでトークン分割し、マーカー区間だけ React の `<mark>` 要素として描画、間のユーザー由来テキストは（React が自動エスケープする）テキストノードとして描画する。`dangerouslySetInnerHTML` は使わない。

- マーカー区切り文字はバックエンドの `snippet()` 呼び出しで固定された `<mark>` / `</mark>` のみ。これを唯一の信頼境界として扱う。
- ユーザー本文に万一リテラルの `<mark>` 文字列が含まれても、`dangerouslySetInnerHTML` を使わないため最悪でも「ハイライトの誤分割（見た目だけ）」に留まり、XSS にはならない。

## 設計（レイヤーの内側から）

これはフロントエンドの描画バグであり、ドメイン／ユースケース／アダプターの変更は不要。`hit.snippet` の契約（`<mark>` 付きハイライト済み文字列）は既存のまま尊重し、描画側だけを契約に合わせる。

### 変更点

1. **新規ヘルパー** `app/components/public/highlightSnippet.tsx`
   - `highlightSnippet(snippet: string): React.ReactNode` をエクスポート。
   - 入力文字列を `<mark>` と `</mark>` で分割し、マーカー内側のセグメントを `<mark className={SEARCH_HIT_MARK}>…</mark>`、外側を素のテキストとして配列で返す。各セグメントには安定した `key` を付与。
   - マーカーが無い場合は文字列をそのまま返す（後方互換）。
   - library-level JSDoc を付け、なぜ `dangerouslySetInnerHTML` を避けるか（信頼できる FTS マーカーと信頼できないユーザーテキストの混在）を WHY コメントとして残す。

2. **`app/components/public/styles.ts`**
   - `SEARCH_HIT_MARK` 定数を追加。P32 モック準拠:
     - `bg-[color-mix(in_oklch,var(--color-accent)_18%,transparent)] text-accent-ink rounded-[2px] px-0.5`
   - `text-accent-ink` ユーティリティは `app/styles/index.css` の `@theme inline` で `--color-accent-ink` がブリッジ済み。`px-0.5` = 2px、`rounded-[2px]` = border-radius 2px。

3. **`app/components/public/PublicSearch.tsx`**
   - `{hit.snippet}` を `{highlightSnippet(hit.snippet)}` に置き換える（209 行付近）。
   - import 追加。

### スコープ外（このIssueでは触れない）

- **タイトルのハイライト**: バックエンドは `sd.title` をそのまま返しており（`snippet()` の対象はカラム1=本文のみ）、タイトルに `<mark>` は付かない。タイトルのハイライトはバックエンド変更を要する別機能であり、本バグ（スニペットの生タグ表示）のスコープ外。モックの `.result-title mark` スタイルは将来用として残る。
- バックエンドの `snippet()` マーカー仕様の変更（マーカー除去方向）は採らない。

## 受け入れ基準

| ID | 基準 | 検証方法 |
|----|------|----------|
| AC-1 | スニペット中の `<mark>…</mark>` が生文字列ではなく `<mark>` 要素として描画される | ユニットテスト（`highlightSnippet` が `<mark>` を含むHTMLを出力）／ブラウザで背景色付きハイライト確認 |
| AC-2 | マーカー外のユーザー由来テキストはエスケープされ、HTML インジェクションが起きない | ユニットテスト（`<script>` 等を含む入力がエスケープされる）|
| AC-3 | マーカーを含まないスニペットも従来どおり正しく描画される | ユニットテスト／ブラウザ |
| AC-4 | ハイライトのスタイルが P32 モック（accent 背景・accent-ink 文字色）に一致 | ブラウザ目視 |
| AC-5 | `pnpm typecheck && pnpm lint && pnpm test` が通る | コマンド実行 |

## 実装ステップ

1. `app/components/public/styles.ts` に `SEARCH_HIT_MARK` を追加。
2. `app/components/public/highlightSnippet.tsx` を新規作成（JSDoc・WHY コメント付き）。
3. `app/components/public/PublicSearch.tsx` で `highlightSnippet` を import し、スニペット描画を差し替え。
4. `app/components/public/__tests__/highlightSnippet.test.tsx` を新規作成（AC-1〜AC-3 を検証）。
5. `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test` で検証。

## リスク

- **誤分割**: ユーザー本文にリテラル `<mark>` が含まれる場合の見た目崩れ。XSS にはならず影響は軽微。許容する。
- **スタイル乖離**: `color-mix` arbitrary value のクラス名は JIT スキャン対象。モジュールスコープ定数に置けば既存パターン（`common/styles.ts`）と同様に機能する。

## 未解決事項

なし。
