# 実装計画 — Issue #498: inline モードのコードブロック編集体験の向上（Tab インデント / シンタックスハイライト）

**Issue:** #498
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

Issue #285（PR #494）で意図的に見送った 2 点を実装し、`inline` モードのコードブロック編集体験を向上させる。

1. **Tab インデント挿入**（ADR-003 で見送り）— フォーカストラップを避けるエスケープ手段とセットで `<pre>` 内に Tab インデントを入れられるようにする。
2. **シンタックスハイライト**（スコープ外だった）— 読み取り専用ビューと `inline` 編集ビューの双方で `<pre><code>` にハイライトを当てる。ライブラリは **shiki**（ユーザー確定要件）。

## スコープ

### 含まれるもの

- shiki によるシンタックスハイライト（読み取り専用ビュー全般 + inline 編集ビュー）
- `<pre>` 内の Tab インデント挿入（スペース2）、Shift+Tab デデント（行頭スペース最大2除去）、`Esc` でのフォーカス離脱
- 保存 HTML（`contentHtml`）に span を含めない clean な `<pre><code>text</code></pre>` の維持
- 既存 `--code-*` デザイントークンを参照する配色

### 含まれないもの

- ダークモード対応（`spec/design/tokens.md` 12節でスコープ外。ただしトークン参照にして将来拡張に開く）
- 複数行選択の一括インデント／デデント（初版は単一キャレット行のみ）
- タブ文字（`\t`）でのインデント（スペースに寄せる）
- markdownConverter 自体でのハイライト焼き込み（保存経路に無く、span は保存しない方針のため不要）

## 実装ステップ

### 1. shiki 導入とハイライターのシングルトン・モジュール新設

- **対象ファイル:** `package.json`、新規 `app/components/note/content/highlighter.ts`
- **変更内容:** `shiki` を dependencies に追加。`shiki/core` の `createHighlighterCore` + **`shiki/engine/javascript`（`createJavaScriptRegexEngine`、WASM 回避）** + 言語/テーマの個別 import で、クライアント限定のシングルトン `getHighlighter()` を実装。テーマは ADR-003 の sentinel カスタムテーマ 1 つ。対応言語は固定リスト（js/ts/tsx/jsx/json/html/css/bash/python/go/rust/sql/yaml/markdown 等）。`<code class="language-X">` の `X` を解決する `resolveLang(codeEl)` を置き、リスト外・無指定は `plaintext` フォールバック。**shiki 本体・grammar・テーマの import はすべて関数内 `await import()` に閉じ込め、モジュールトップレベルでは import しない**（ADR-005 の不変条件）。
- **検証条件:** 実装後 `pnpm build` し、`dist/server`（および `dist/server/rsc`）に shiki/grammar/onig が混入しないことを grep で確認する（0 件）。`dist/client` には出てよい。
- **理由:** read-only / inline で同一ロジックを共有し、grammar の重複ロードを防ぐ。クライアント限定 + WASM 回避で Cloudflare Workers バンドルを汚さない。

### 2. ハイライト適用ヘルパー（DOM操作）の実装

- **対象ファイル:** `app/components/note/content/highlighter.ts`（同上）
- **変更内容:** `highlightCodeElement(codeEl)` を実装。`codeEl.textContent`（plain source）を `codeToTokens`（または `codeToTokensBase`）でトークン化し、各トークンの `.color`（= ADR-003 の sentinel hex）を `SENTINEL_TO_CLASS` で CSS class（`shiki-token-keyword` 等）に変換、`<span class="…">` 群で中身を置換する。インライン `style` は使わない。置換後も `textContent` が元と一致することを保証する。ロード／トークン化失敗時は例外を握りつぶし plain 表示を維持（best-effort）。
- **理由:** read-only / inline 双方が「plain text の `<code>` を装飾 span に置換」という同一操作を呼べるようにする。sentinel テーマ方式によりエンジン非依存でスコープ → class を決定的に解決する。

### 3. 読み取りビュー用クライアント・エンハンサーの追加

- **対象ファイル:** 新規 `app/components/note/content/CodeHighlight.tsx`（"use client"）
- **変更内容:** `.note-detail-content` 要素を `ref` で受け取り（または親を ref で指す**兄弟**として配置）、`useEffect` でその配下の `pre`（`<code>` 子があれば `code`、無ければ `pre` 自身）を全件 `highlightCodeElement` する小さなコンポーネント。`dangerouslySetInnerHTML` した DOM が確実に存在する配置にする。SSR 出力は plain `<pre><code>`（プログレッシブ・エンハンスメント）。
- **マウント箇所（実パス）:** `app/components/note/detail/NoteDetail.tsx`、`app/components/public/PublicNoteDetail.tsx`、`app/components/note/history/NoteRevisionDetail.tsx`、`app/components/public/LegalDocument.tsx`、`app/components/note/editor/HtmlEditor.tsx`（プレビュー枠）の各 `.note-detail-content` 描画箇所。`HtmlEditor` プレビューは Issue 文言「読み取り専用ビュー全般」に含まれる解釈で対象とする（スコープ内）。
- **理由:** 読み取りビューは RSC のため、ハイライトはハイドレーション後のクライアント DOM 強化として実装するのが構成に素直。保存 HTML には手を付けない。

### 4. InlineEditor: `<pre>` サブツリーの opaque 化（衝突回避の中核）

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:**
  - **serialize:** `serializeHostContent` で clone 後、`querySelectorAll("pre")` で各 `<pre>` を正規化（`<code>` 子があれば `code` を、無ければ `pre` 自身を `textContent` でリセット）してから innerHTML を取る。`<pre><code>…</code></pre>` と `<pre>直接テキスト</pre>` の両構造（#285 ADR-001）をカバーし、保存 HTML を常に clean に保つ。
  - **structureSignature:** `<pre>` に達したら子孫を辿らない。ハイライト span の有無で署名が変動しないようにし、`compositionend` の構造比較ロールバック誤発火を防ぐ。
  - **classifyRecords:** mutation の `target` が `<pre>` 配下（`isWithinPre`）なら span 注入/除去（Element add/remove）を allowed にする例外を追加。例外は「`<pre>` 内」かつ／または「再ハイライト中フラグ（`isHighlightingRef`）」に厳密に閉じ込め、`<pre>` 外の構造保護は不変条件として維持。
- **理由:** shiki の span 注入が #285 の rollback 不変条件と衝突する根本原因を、`<pre>` を「テキストが真実・装飾は揮発」な opaque 領域として扱うことで解消する。

### 5. InlineEditor: 編集中プレーン / 非編集時ハイライトのライフサイクル

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:**
  - 初期マウント・rollback・value 再同期の後、各 `<pre>`（code か pre 自身）をハイライト（`isHighlightingRef` を立てて observer の自己トリガを抑制、終わったら下ろす）。
  - `<pre>` に `focusin` した瞬間に当該ブロックをプレーン化（`textContent` に戻す）。編集はプレーン text 上で行う。
  - 再ハイライトは **focusout（blur）時のみ**: キャレット位置（textContent オフセット）を退避 → 再ハイライト → オフセットからキャレット復元。focus 中は再ハイライトしない（プレーン原則と整合）。IME 変換中（`isComposingRef`）は抑止。
- **理由:** 「編集中はプレーン、確定後に装飾」がキャレット・IME・rollback すべてに対して最も安全。focus 単位でプレーン化することで複数コードブロックでも編集対象だけが揮発する。

### 6. InlineEditor: Tab インデント + フォーカストラップ回避

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:** `onKeyDown` を拡張。
  - `<pre>` 内 Tab（Shift なし）: `preventDefault` + `insertTextAtCaret(host, "  ")`（スペース2、text-only）。
  - `<pre>` 内 Shift+Tab: 行頭の連続スペース最大2を除去（text-only）。
  - `<pre>` 外 Tab: 従来どおり `preventDefault`。
  - `<pre>` 内 `Esc`: host の contentEditable から `blur()`（フォーカストラップ脱出）。step 5 の focusout 経由で再ハイライトも走る。
- **理由:** ADR-003 が見送った「フォーカストラップを避けるエスケープ手段付き Tab インデント」を満たす。スペースにするのは保存・描画での見えの安定のため。`insertTextAtCaret` 再利用で text-only 不変条件を維持。

### 7. ハイライト用スタイルの追加

- **対象ファイル:** `app/styles/index.css`（`@layer components` の `.note-detail-content` ブロック内）
- **変更内容:** shiki が出す class（`shiki-token-keyword` 等）を `--code-*` トークンへマップするセレクタを追加（`color: var(--code-keyword)` など）。既存 `pre` / `pre code` スタイル（背景・角丸・フォント）と共存。
- **理由:** `.note-detail-content` は手書き CSS の許可済み例外（ADR-002 @ `.issue/70`）。トークン参照で #397 のインスタンス上書きが効き、将来のダークモードにも自動追従。

### 8. 仕上げ

- **対象:** 上記すべて
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。InlineEditor 冒頭の JSDoc 不変条件（`<pre>` opaque 化・Tab・Esc）を更新。`.issue/498/adr.md` に A〜D の決定を記録。

## 設計判断

詳細は `.issue/498/adr.md` を参照。

- **A. ハイライト実行場所:** クライアントサイド（マウント後の DOM span 注入）、保存 HTML は plain のまま。
- **B. inline 編集 × MutationObserver 衝突:** 「`<pre>` opaque 化」＋「focus 中プレーン / 非focus 時装飾」の併用。
- **C. shiki テーマ:** 既存 `--code-*` を参照する class ベースの配色。標準テーマ採用・トークン廃止は #397 契約に反するため不可。
- **D. Tab インデント:** `<pre>` 内のみスペース2挿入、Shift+Tab デデント、`Esc` で blur、`<pre>` 外は従来維持。

## リスクと注意点

- **キャレット復元の精度:** 再ハイライトで `<code>` 内が複数 span に分割されるため、textContent オフセット → Range 復元を慎重に実装。失敗時は `<code>` 末尾へフォールバック。
- **IME 入力中のハイライト抑止:** `isComposingRef` ガード必須。変換確定 Enter とフォーカス移動の競合に注意。
- **複数 `<pre>` の同時状態:** focus 中の1ブロックのみプレーン、他はハイライト済みを許す。serialize 時は全 `<pre>` を textContent 正規化するので保存は一貫。
- **`<pre>` opaque 化が保護を緩めすぎないこと:** 例外は `<pre>` 内に厳密に閉じ込める。`<pre>` 外の Element 追加保護は維持。
- **shiki のバンドル/ロード失敗:** 失敗してもエディタ・読み取りは plain で機能継続。highlighter はクライアントでのみ初期化し Workers バンドルに混入させない。
- **未知言語 / 言語クラス無し:** `plaintext` フォールバック。エラーにしない。
- **sanitizer:** `style` は剥がされ `class`/`span` は許可。class ベース配色がこれと整合（万一 span が保存に漏れても色は出ないが、serialize 正規化で漏れ自体を防ぐ）。
- **テスト環境:** vitest は node 環境。shiki の WASM はテストで動かない可能性が高いため、highlighter 呼び出しをモック/ガードできるようにする。

## テスト方針

- **InlineEditor 単体（既存 `inlineEditor.test.tsx` 拡張）:**
  - `serializeHostContent` が `<pre>` 内（`<code>` 有り／bare 両構造）の span を除去し plain な `<pre><code>text</code></pre>` / `<pre>text</pre>` を返す（最重要 = DB 漏れ防止の回帰テスト）。
  - `<pre>` 内 Tab でスペース2挿入・rollback なし／`<pre>` 外 Tab は preventDefault。
  - `<pre>` 内 Esc で blur。
  - structureSignature が `<pre>` 配下の span 有無で変化しない。
  - classifyRecords が `<pre>` 内 span 追加を allowed、`<pre>` 外 Element 追加を rollback と判定。
  - shiki 呼び出しはモック。
- **highlighter ユーティリティ:** `resolveLang` の言語解決・フォールバック、`highlightCodeElement` 後の `textContent` 不変。
- **手動 / ブラウザ確認:** 読み取り各ビューで色が付く・JS 無効で plain、inline 編集の focus→プレーン→編集→blur 再ハイライト・キャレット維持・IME、Tab/Shift+Tab/Esc、保存後 `contentHtml` に span が無いこと。

## 受け入れ基準のトレーサビリティ

Issue 本文・#285 ADR が参照する `spec/scenario/authoring.md` の「C2-2 / C2-3」は spec に実在しない（C2 に小項目番号が無い）。本 Issue の受け入れ基準は authoring.md C2 の実在記述に以下のとおり対応づける（詳細は adr.md 補足）:

- **シンタックスハイライト** = C2「装飾済みの要素はその意匠を保ったままインラインで文字を編集」の見えの保持・強化。
- **Tab インデント** = C2「編集中は構造を壊さない」テキスト編集（text-only 挿入で構造不変）。

spec C2 へのコードブロック編集受け入れ基準の明文化はスコープ外。Phase 4 の起票候補として残す。

## レビュー履歴

### 1周目: 2視点並列レビュー（要件カバレッジ / アーキ・リスク）

**修正した点（要修正 P-XXX への対応）:**

- アーキ P-001（shiki から 5 分類を導く方式が未具体化）: ADR-003 を全面改訂。`includeExplanation` に依存せず、**sentinel カラーのカスタムテーマ**で scope → 5 カテゴリを決定的にマップし、トークンの `.color`（sentinel hex）→ CSS class に変換する具体機構を明記。step1/step2 も更新。
- アーキ P-002（shiki バージョン・エンジン・言語・Workers バンドル分離が未確定）: ADR-005 を新設。`shiki/engine/javascript`（WASM 回避）、`createHighlighterCore`、固定言語リスト + plaintext フォールバック、トップレベル import 禁止、`pnpm build` 後の Workers 出力 grep 検証を明記。step1 に検証条件追記。
- 要件 P-001（C2-2/C2-3 が spec に不在）: plan.md 本節と adr.md 補足を追加し、実在する C2 記述へ対応づけ。spec 追補は Phase 4 起票候補に。

**取り込んだ改善提案:**

- アーキ S-002: 再ハイライトを **focusout 一本化**（debounce 再ハイライト案を排し、focus 中プレーン原則と整合）。ADR-002 / step5 反映。
- アーキ S-003: serialize/適用対象を `querySelectorAll("pre")` ベースにし、`<code>` 無しの bare `<pre>` 構造（#285 ADR-001）もカバー。ADR-002 / step4 反映。
- アーキ S-004 / 要件 S-001: 言語クラス無し／未対応は `plaintext`（装飾なし）が正しい挙動である旨、HtmlEditor プレビューが「読み取り専用ビュー全般」に含まれる解釈を明記（adr.md 補足 / step3）。
- アーキ S-001: CodeHighlight は親 `.note-detail-content` を ref で指す配置を明記（step3）。
- 要件 S-002: adr.md は作成済みのため、Status は実装確定時に `Accepted` 更新する運用（手順の正確化）。

**見送った提案とその理由:** なし（全提案を反映または運用注記として取り込み）。

両視点とも指摘は「設計の具体化・トレーサビリティ」に関するもので、方針自体への反対は無し。修正により実装に必要な具体度に到達。次周は最終確認として実施。

### 2周目: 2視点並列レビュー（最終確認）

**結果: 両視点とも「問題点ゼロ」。** アーキ視点は shiki 4.2.0 のソース（`normalizeTheme`・`ThemedToken`・`applyColorReplacements`・exports）を確認し、sentinel テーマ方式（ADR-003）と bundle 構成（ADR-005）が実 API で成立することを裏取り。#285 rollback 不変条件も壊していないことを確認。

**取り込んだ改善提案:**

- S-001（小文字 sentinel・`toLowerCase()` 比較）/ S-002（sentinel と theme fg/bg の衝突回避）: ADR-003 に実装注意として追記。
- S-005（`createJavaScriptRegexEngine` の `forgiving: true`）: ADR-005 に追記。
- S-003（マウント先の実パス明記）: step3 を実パスに更新。
- S-004（grep 検証対象を `dist/server` に具体化）: ADR-005 / step1 を更新。
- S-001（ADR 番号の昇順整理）/ S-002（step8 文言を「Status 更新」に）: ドキュメント整形の範囲。実装確定時に対応。

**見送った提案とその理由:** なし。

**終了:** 2周目で両視点とも問題点ゼロのため、レビューループを終了（計 2 周）。計画は実装フェーズへ引き継ぎ可能と判断。
