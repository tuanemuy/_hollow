# 実装計画 — Issue #285: inline モードで `<pre>` コードブロックの編集をサポートする

**Issue:** #285
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

Issue #233 で導入した `inline` エディタモードは、許可リストブロック要素（`p`/`h1-6`/`li`/`td`/`th`/`blockquote`/`figcaption`/`caption`/`dt`/`dd`）のインライン編集をサポートしているが、`<pre>` を許可リストから除外している（Issue #233 ADR-002）。そのためコードブロックを含むノートを `inline` モードで開くと `<pre>` は表示のみで編集不可になる。

本 Issue では `inline` モードのまま `<pre>`（および内包する `<code>`）のテキストを編集可能にし、仕様 `spec/scenario/authoring.md` C2-2 の `<pre>` カバレッジを達成する。

## スコープ

### 含まれるもの

- `<pre>`（および `<pre><code>` 構造）の `inline` モードでのテキスト編集サポート
- `<pre>` 内での `Enter` キーによる改行入力（リテラル `\n` 挿入）
- 構造保持（MutationObserver ロールバック）が `<pre>` 内のテキスト編集でも正しく機能すること
- 上記を pin する単体テストの追加・既存テスト #14 の更新

### 含まれないもの

- **シンタックスハイライト連動** — `tokens.css` に `--code-*` 色定義はあるが実装は無い。本 Issue のスコープ外（別 Issue）。
- **`Tab` キーによるインデント挿入** — `Tab` は引き続き `preventDefault`（フォーカス・トラップ回避）。既存コードのインデントはテキストとして自動的に保持される。新規インデント挿入は見送り（ADR-003 参照）。
- **`<pre>` の言語指定・装飾 UI** — 別 UI の領域（仕様 C2-3「タグ削除や入れ替えは別 UI」）。
- `html` モード・読み取り専用ビューの挙動変更。

## 調査結果

### 関連ファイル

- `app/components/note/editor/InlineEditor.tsx` — `inline` エディタ本体。許可リスト・`applyEditable`・`classifyRecords`・`onKeyDown`・`onPaste` などすべてここに集約。本 Issue の変更はほぼこのファイルに閉じる。
- `app/components/note/editor/__tests__/inlineEditor.test.tsx` — 既存 19 ケースの単体テスト。テスト #14 が現状の「`<pre>`/`<code>` は contentEditable にしない」を pin している（要更新）。
- `app/styles/index.css`（`.note-detail-content pre` / `pre code`）— `<pre>` の読み取り専用スタイル。`white-space` を上書きしていないため `<pre>` デフォルトの `white-space: pre` が効き、`\n` は改行として描画される。**変更不要**。

### あるべきアーキテクチャ

- フロントエンドのみの変更。プレゼンテーション層のコンポーネント内部ロジックに閉じる。ドメイン・アプリケーション・アダプター層への波及なし。
- 構造保持の不変条件（Issue #233 ADR-002 / ADR-003）を壊さないことが最重要。`<pre>` 編集は「許可リストブロックのテキストをインライン編集する」既存パターンの自然な拡張として実装する。
- スタイリングは utility-first 方針だが `.note-detail-content` は DOM 注入要素向けの documented exception（`.issue/70/adr.md` ADR-002）。`<pre>` スタイルは既存のものを再利用するため新規 CSS は追加しない。

### 既存実装の状態と本 Issue での扱い

- 既存の許可リスト方式・MutationObserver ロールバックは「あるべき姿」と一致している。本 Issue はこのパターンを `<pre>` に拡張するだけで、設計を覆さない。
- ただし `<pre>` には他のブロック要素と異なる 2 つの特性があり、単純な許可リスト追加では不十分：
  1. **`<pre><code>` 構造**: `<pre>` が直接テキスト子を持たず `<code>` のみを子に持つため、`applyEditable` の `hasDirectTextChild` ゲートで弾かれる（→ ADR-001 で対応）。
  2. **`Enter` が改行**: 他ブロックは `Enter` を `preventDefault` するが、`<pre>` 内では改行が本質的に必要（→ ADR-002 で対応）。

### 依存関係

- `NoteEditor.tsx` の `onInitFailed` フォールバック・モード切替・autosave 配管には影響しない（I/O コントラクト不変）。
- `serializeHostContent` が `contenteditable` を除去するため、`<pre>` に付与した `contenteditable` も出力 HTML に漏れない（既存の保証がそのまま効く）。

## 実装ステップ

### 1. `<pre>` を許可リストに追加し、`applyEditable` の `hasDirectTextChild` ゲートを `<pre>` で迂回する

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:**
  - `EDITABLE_TAGS` に `"pre"` を追加する。
  - `applyEditable` 内の decorate 判定を、`<pre>` のときは `hasDirectTextChild` ゲートをスキップして必ず `contentEditable=true` にするよう変更する。`<pre><code>text</code></pre>` のように `<pre>` が直接テキスト子を持たないケースでも `<pre>` を editable にすることで、子孫の `<code>` テキストが HTML5 の contentEditable 継承で編集可能になる。
    ```ts
    if (!isEditableTag(el)) continue;
    const isPre = el.tagName.toLowerCase() === "pre";
    // <pre> は <code> ラップ時に直接テキスト子を持たないため、
    // hasDirectTextChild ゲートを迂回して常に decorate する。
    // 子孫 <code> のテキストは contentEditable 継承で編集可能になる。
    if (!isPre && !hasDirectTextChild(el)) continue;
    ```
  - JSDoc のコア不変条件 1.（「Tags outside the allow-list (notably `<pre>`) stay read-only」）を `<pre>` 編集サポートに合わせて更新する。
- **理由:** `<pre><code>` は Markdown レンダリングの標準的なコードブロック構造であり、これを編集可能にしないと Issue のゴールを満たさない。許可リスト追加だけでは `hasDirectTextChild` ゲートで `<pre><code>` が弾かれる。

### 2. `Enter` キー処理を `<pre>` 内では「リテラル `\n` 挿入」に変える

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:**
  - キャレットが `<pre>` 配下にあるかを判定するヘルパー `isWithinPre(node, host)` を追加する。`sel.anchorNode` は `<code>` 直下の **text node**（`nodeType === 3`）を返すため、`closest("pre")` は使えない（text node に `closest` が無い）。**起点ノードから `parentNode`/`parentElement` を `host` まで遡り**、途中に `pre` があれば true とする。`node === null`（選択なし）は false で安全に抜ける（既存テスト #4 が selection 無しの bare `KeyboardEvent` を投げるため必須）。
  - キャレット位置にテキストを挿入する処理を `onPaste` のインライン実装から `insertTextAtCaret(host, text)` ヘルパーに切り出し、`onPaste` と新しい `Enter` 処理で共有する。
  - `onKeyDown` を次のように変更する：
    - `Enter`: キャレットが `<pre>` 内なら `preventDefault` + `insertTextAtCaret(host, "\n")`。`<pre>` 外なら従来どおり `preventDefault`（新規ブロック生成を防止）。
    - `Tab`: 従来どおり常に `preventDefault`（`<pre>` 内外問わず。ADR-003）。
    ```ts
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const sel = host.ownerDocument.getSelection();
        const anchor = sel?.anchorNode ?? null;
        if (isWithinPre(anchor, host)) {
          insertTextAtCaret(host, "\n");
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
      }
    };
    ```
- **理由:** `<pre>` 内の `Enter` をネイティブの contentEditable に任せると、ブラウザによって `<br>` や `<div>` が挿入され、`classifyRecords` が Element の `addedNodes` を検出してバッチ全体をロールバックする（編集不能化）。リテラル `\n` テキストノードを手動挿入すれば、変化が text-only に収まり classifier に許可され、構造署名（`structureSignature` は要素のみを走査）も変わらないため `compositionend` ロールバックも誤発火しない。

### 3. `classifyRecords` / `structureSignature` / `compositionend` は変更しないことを確認する

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:** なし（確認のみ）。
  - `<pre>`/`<code>` のテキスト編集は `target` が `isContentEditable === true`（`<pre>` は明示付与、`<code>` は継承）かつ `addedNodes`/`removedNodes` が TEXT_NODE のみになるため、既存の `classifyRecords` で許可される。
  - `\n` 挿入による text node 分割も text-only childList に収まる。
  - `structureSignature` は ELEMENT_NODE のみを走査するため、`\n` 追加でも署名は不変。
- **理由:** 既存の構造保持ロジックが `<pre>` でもそのまま機能することを明示し、不要な変更を避ける（あるべき姿に一致している箇所は尊重する）。

### 4. テストの追加・更新

- **対象ファイル:** `app/components/note/editor/__tests__/inlineEditor.test.tsx`
- **変更内容:**
  - **既存テスト #14 を更新**（現状「`<pre>`/`<code>` は contenteditable にしない」を pin）→ 「`<pre>` が `contenteditable=true` になり、内側 `<code>` は継承で editable（`<code>` 自身の属性は null だが `isContentEditable` が true）」を pin するよう反転。
  - **追加:** `<pre>` 内で `Enter` を押すと `preventDefault` され、リテラル `\n` テキストが挿入され、`<br>`/要素が増えないこと。**このテストはペーストテスト（既存 #6）と同様に、事前に `<pre><code>` 内テキストノードへ `Range`/selection をシードしてから `Enter` を dispatch する**（`insertTextAtCaret` の挿入位置を検証するため）。
  - **追加:** `<pre><code>` 内のテキスト characterData 編集が onChange を発火し、ロールバックされないこと。
  - **追加:** `<pre>` 内に要素を強制挿入する構造変化は従来どおりロールバックされること。
  - **追加（任意）:** `<pre>` 内で `Tab` を押しても `preventDefault` され、タブ文字が挿入されないこと（ADR-003 の挙動を pin）。
  - 既存テスト #4（`<pre>` 外で Enter が新規ブロックを生まない）が引き続き PASS することを確認する。
- **理由:** 仕様 C2-2 の `<pre>` カバレッジと、構造保持の不変条件が `<pre>` でも維持されることを回帰テストで固定する。

## 設計判断

詳細は `.issue/285/adr.md` を参照。

- **ADR-001:** `<pre>` の編集可能化は「`EDITABLE_TAGS` への `"pre"` 追加 + `applyEditable` の `hasDirectTextChild` ゲートを `<pre>` で迂回」する方式。`<pre><code>` 構造を contentEditable 継承で編集可能にする。
- **ADR-002:** `<pre>` 内の `Enter` は preventDefault + リテラル `\n` テキストノード手動挿入。ネイティブ任せの `<br>`/`<div>` 挿入によるロールバックを回避。Shift+Enter / Enter 単独の区別はしない（`<pre>` 内は両方改行）。
- **ADR-003:** `Tab` は `<pre>` 内外を問わず `preventDefault` を維持。タブ・キーによるインデント挿入は見送り（フォーカス・トラップ回避 + スコープ）。既存インデントはテキストとして保持される。

## リスクと注意点

- **`<pre>` 末尾改行の表示クォーク:** contentEditable な `<pre>` で最終行に `\n` を挿入すると、後続テキストが無い場合ブラウザによっては視覚的な新規行が表示されないことがある。保存される HTML には `\n` が正しく入るため意味的には正しい。視覚クォークは既知の制限として扱う（深追いしない）。
- **`<pre>` 直下テキスト vs `<pre><code>`:** 両構造を確実にカバーするため、テストで両方のケースを pin する。
- **IME 入力:** `<pre>` 内での日本語入力も既存の `compositionstart`/`compositionend` 経路に乗る。`structureSignature` が要素のみ走査するため、IME 確定で改行を含むテキストが入っても構造ドリフト誤検出は起きない。
- **`onPaste` リファクタの回帰:** `insertTextAtCaret` 切り出しで既存のペースト挙動（プレーンテキスト化）を壊さないこと。既存テスト #6（paste で構造が変わらない）が回帰検出に効く。
- **`disabled` トグル:** `clearEditable` は全 `contenteditable` 要素から属性を除去するため、`<pre>` に付与した属性も正しく外れる（既存ロジックで担保）。
- **`<pre>` 外 `Enter` の回帰:** `onKeyDown` を Enter 分岐 → 早期 return → Tab 分岐へ展開する際、`isWithinPre` が false のケースで `preventDefault` のみ実行して return する経路を取りこぼさないこと（取りこぼすと `<pre>` 外で新規ブロック生成防止が壊れる）。既存テスト #4 が回帰を検出する。

## レビュー履歴

### 1周目
**修正した点**:
- 問題点（要修正）は両視点とも「問題点ゼロ」。要件カバレッジ・スコープ整合性・実現可能性すべて妥当と判定された（アーキ視点は happy-dom 上で ADR-001/ADR-002 の核心挙動を実測検証し、`<code>` の `isContentEditable` 継承・`\n` 挿入の text-only 収束・`structureSignature` 不変を確認）。

**取り込んだ改善提案**:
- [S-001（arch）] `isWithinPre` は text node 起点で `parentNode` を `host` まで遡る実装にし、`null` を安全に扱う旨を実装ステップ2に明記。
- [S-002（arch）] Enter 改行テストは事前に `Range`/selection をシードする旨を実装ステップ4に明記。
- [S-001（req）] `<pre>` 外 `Enter` の `preventDefault` 維持をリスク欄に追記。

**見送った提案とその理由**:
- [S-003（arch）] 複数行ペーストの追加テストは不要（ADR-002 と同経路で text-only に収まるため追加リスクなし）。スコープを広げない判断。
- [S-002（req）] Shift+Enter 区別は ADR-002 で「しない」と一貫しており追加対応不要（将来は別 Issue）。

### 終了理由
両視点とも問題点ゼロのため 1 周で終了。

## テスト方針

- **単体テスト**（`pnpm test:unit`）: 上記ステップ4のケースで `<pre>` 編集・改行・構造保持・disabled・paste 回帰を pin する。
- **ブラウザ検証**（manual-test）: 実機で `<pre><code>` を含むノートを `inline` モードで開き、コードブロックのテキスト編集・改行入力・保存後の HTML 反映・モード切替を確認する。
- **型・lint**: `pnpm typecheck && pnpm lint:fix && pnpm format`。
