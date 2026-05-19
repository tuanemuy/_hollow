# 実装計画 — Issue #37: P12 WYSIWYG モード切替時に未対応タグの損失を警告する

**Issue:** #37
**作成日:** 2026-05-19
**複雑度:** 中〜大規模

---

## 目的

HTML モードで保存された `<table>` / `<figure>` / `<mark>` / `<kbd>` 等 — サニタイザは通すが TipTap StarterKit + Link + Image は解釈できないタグ — を含むノートを WYSIWYG タブで開いたとき、ユーザーへ警告を表示し、確認するまで autosave を抑止することでサイレントなデータロスを防ぐ。

## スコープ

### 含まれるもの
- WYSIWYG タブで未対応タグの検出を行う **pure 関数** の切り出し（受入条件で明示）
- 未対応タグ検出時の **警告 banner 表示**
- 警告未確認時の **autosave 抑止**（WYSIWYG モード時に限る）
- `useAutosave` の早期 return 条件を pure 述語 `shouldFlushAutosave` として切り出し
- 単体テスト（pure 関数 / reducer / autosave ガード）
- マニュアルテスト手順（TC-008 を発展させる形）

### 含まれないもの
- 「TipTap parse 後 HTML との構造 diff」— 元 HTML のタグ集合差分で十分（ADR-001）
- 別画面・別ノート種別への警告横展開
- HTML サニタイザ側のタグ集合変更
- HTML モードの autosave / 既存挙動への変更
- 警告された状態でユーザーに「WYSIWYG モードへ切替えない」選択肢を提示する UI（受入条件外）

## 実装ステップ

### 1. 未対応タグ検出の pure 関数を新規追加

- **対象ファイル:** `app/components/note/editor/wysiwygUnsupportedTags.ts`（新規）
- **変更内容:**
  - `WYSIWYG_SUPPORTED_TAGS: ReadonlySet<string>` を export
    - TipTap StarterKit v3 + Link + Image が emit するタグ集合に、サニタイザが許容しても TipTap が等価変換するため警告対象から除外したい alias タグ（`b, i, u, div, span`）を含める
    - 含めるもの: `p, br, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre, code, strong, em, s, hr, a, img, span, div, b, i, u`
    - 含めないもの（= 警告対象、サニタイザは通すが TipTap が落とす）: `table, thead, tbody, tr, th, td, mark, kbd, figure, figcaption, sub, sup, ins, del, abbr, cite, q, small, video, audio, source, section, article`
    - `section` / `article` を含めない理由: StarterKit はこれらを解釈しないため、中身が `<p>` 群に flatten される（警告対象とするのが妥当）
  - `detectUnsupportedTags(html: string): readonly string[]` を export
    - 入力 HTML から開始タグ名集合を正規表現で抽出（`/<\s*([a-zA-Z][a-zA-Z0-9-]*)/g`、lowercase 正規化）
    - HTML コメント（`<!--…-->`）は事前に除去
    - 抽出した集合から `WYSIWYG_SUPPORTED_TAGS` に含まれないものを **アルファベット昇順** で返す（同タグの重複は 1 回）
    - 空 HTML や parse 結果ゼロのとき `[]`
  - JSDoc に以下を明記:
    - 「StarterKit v3 + Link + Image 構成に依存。TipTap を upgrade して新規 mark / node を追加した場合は `WYSIWYG_SUPPORTED_TAGS` も更新する」
    - 「入力 HTML は HTML サニタイザ通過後のもの（`<script>` / `<style>` 等は来ない前提）」
    - 「StarterKit v3 は `Underline` を同梱するため `u` を supported に含める。v4 等で外部パッケージ化された場合は本ファイルと `WysiwygEditor.tsx` を同時に見直す」
- **理由:**
  - Issue 受入条件「どのタグが落ちるかを diff 検出する pure 関数を切り出して単体テスト可能にする」を直接満たす
  - 正規表現一発の O(n) スキャンなので大本文（10 万文字級）でも 1ms 未満で完了し入力遅延に影響しない
  - DOM API ではなく正規表現を採るのは、SSR / Worker / Node テスト環境のいずれでも動作させ依存を増やさないため（既存 `htmlSanitizer.ts` の tokenizer 路線と一貫）

### 2. `editorState` に警告状態と ack フラグを追加

- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:**
  - `EditorState` に以下フィールドを追加:
    - `wysiwygUnsupportedTags: readonly string[]` — 初期値 `[]`
    - `wysiwygUnsupportedAck: boolean` — 初期値 `false`
  - `EditorAction` に以下を追加:
    - `{ type: "wysiwygUnsupportedDetected"; tags: readonly string[] }`
    - `{ type: "wysiwygUnsupportedAck" }`
  - reducer 実装:
    - `wysiwygUnsupportedDetected`:
      - **空集合 `[]` の dispatch は無視する（state を変更しない）**。これにより「ユーザーが ack せず編集 → onChange で `value` がロス済み HTML になる → 仮に再検出が走って空集合になっても banner を消さない」というロス防止 latch を reducer 側に持たせる（レビュー P-001 対応 / ADR-005）
      - 非空集合かつ既存 `wysiwygUnsupportedTags` と **Set 比較で同一** なら referential no-op で `state` を返す（順序非依存比較。レビュー P-003 対応）
      - 非空集合かつ既存と異なるなら `wysiwygUnsupportedTags = [...action.tags].sort()`（昇順固定）、`wysiwygUnsupportedAck = false` で上書き（タグ集合が変わったら再確認させる）
    - `wysiwygUnsupportedAck`: `wysiwygUnsupportedAck = true` のみ更新
  - **どちらも `dirtyKeys` には触らない**（autosave のキックではなくゲート）
  - `createInitialEditorState` で `[]` / `false` を初期化
  - reducer の JSDoc に「`wysiwygUnsupportedDetected` は空集合では state を変更しない (`Issue #37` の latch 規約)」と明記
- **理由:**
  - 既存の reducer 駆動 / `dirtyKeys` パターンに揃え、pure に保ってユニットテスト可能にする
  - 「空集合で上書きしない」latch を reducer に閉じ込めることで、上位コンポーネントは検出をいつ何度走らせても安全になる
  - Set 比較に統一することで `detectUnsupportedTags` のソート契約に依存しない（呼出側の順序を信用しなくて済む）

### 3. `useAutosave` の早期 return 条件を pure 述語に切り出し、ガードを追加

- **対象ファイル:** `app/components/note/editor/useAutosave.ts`
- **変更内容:**
  - 新規 export: `shouldFlushAutosave(state: EditorState, noteId: string | null): boolean`
    - `noteId === null` → `false`（新規ノートは autosave 対象外）
    - `state.dirtyKeys.size === 0` → `false`
    - `state.frontMatterJsonError !== null` → `false`
    - `state.mode === "wysiwyg" && state.wysiwygUnsupportedTags.length > 0 && !state.wysiwygUnsupportedAck` → `false`
    - それ以外 → `true`
  - `useEffect` 内の早期 return 群を `if (!shouldFlushAutosave(state, noteId)) return;` 一本にまとめる
- **理由:**
  - レビュー P-004 対応: pure 述語化することで `autosaveLogic.test.ts` から直接テスト可能になる
  - WYSIWYG モード時のみ抑止することで、ユーザーが HTML タブで autosave を活用しながらノート全体を保全できる動線を残す（ADR-002）
  - 既存の早期 return パターンを 1 関数にまとめても autosave エンジン本体（debounce / backoff / inFlight）には手を入れない

### 4. `WysiwygEditor` で検出を実行し親に通知（`onCreate` のみ）

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:**
  - Props に optional `onUnsupportedTagsDetected?: (tags: readonly string[]) => void` を追加
  - 既存 `onChange` と同じく `onUnsupportedTagsDetectedRef` で latest-ref を保持
  - **検出は `onCreate` 内で 1 回だけ実行**:
    ```ts
    onCreate: ({ editor: instance }) => {
      lastEmittedHtmlRef.current = instance.getHTML();
      // `value` は TipTap parse 前の元 HTML。`instance.getHTML()` は parse 後で既にロス済みになっているので使わない（ADR-001）
      const lost = detectUnsupportedTags(value);
      if (lost.length > 0) {
        onUnsupportedTagsDetectedRef.current?.(lost);
      }
    }
    ```
  - **`useEffect([editor, value])` 内では検出を呼ばない**（レビュー P-001 対応 / ADR-005）
    - 理由: ユーザーが ack 前に編集 → `onUpdate` → `onChange(getHTML())` → 親の `state.contentHtml` がロス済み HTML に置き換わる → 親が `value` prop を更新 → `useEffect` が走って `detectUnsupportedTags(value)` が `[]` を返してしまうという致命的経路を避けるため
  - WYSIWYG タブから出た場合は `NoteEditor.tsx` の条件レンダリング (`state.mode === "wysiwyg" ? <WysiwygEditor /> : null`) により `WysiwygEditor` が unmount される。再度 WYSIWYG タブに戻ると `<WysiwygEditor>` が新規 mount され `onCreate` が再走るので、新しい `value` を起点に検出される
- **理由:**
  - `onCreate` のクロージャは初回 render 時の `value` を捕捉する。初回 mount のとき `value` は親が渡した元 HTML なので、これを使うのが正しい（レビュー P-001 Reviewer 2 対応）
  - 「`onCreate` のみで検出」とすることで「ユーザー編集を起点に banner が消える」経路を構造的に排除（最もシンプルかつ safe な解）

### 5. `WysiwygEditor` 内に警告 banner JSX を追加

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:**
  - Props に `unsupportedTags: readonly string[]`, `unsupportedAck: boolean`, `onAcknowledge: () => void` を追加（既存 `disabled` / `value` 等と同形）
  - `<EditorContent editor={editor} />` の直前に banner JSX を挿入:
    - `unsupportedTags.length > 0 && !unsupportedAck` のとき: `role="alert"` + `aria-live="assertive"` で「この本文には WYSIWYG モードで編集できない要素 (`<tag1>`, `<tag2>`) が含まれています。WYSIWYG モードで編集を加えると失われます。確認するまで自動保存は一時停止します。」+「了解した」ボタン
    - `unsupportedTags.length > 0 && unsupportedAck` のとき: 控えめなインラインメッセージ（`role="note"`）で「以下の要素は WYSIWYG モードでは保持されません: tag1, tag2」と表示し、ack 後の編集による損失を継続的に明示
    - `unsupportedTags.length === 0` のとき: 何も描画しない
- **理由:**
  - banner を `WysiwygEditor` 内に置くことで「WYSIWYG タブ表示時のみ表示される」条件レンダリングを追加せずに済む（`NoteEditor` の wysiwyg ブロック内でしか mount されないため）
  - 別コンポーネントに切り出さないのは CLAUDE.md「Don't add features … beyond what the task requires」原則。banner は 1 箇所でしか使われない
  - ack 後も控えめに残す UX は Issue 受入条件「確認後に編集を始めると失われる UX を明示」を満たす（ADR-003）

### 6. `NoteEditor` で `WysiwygEditor` に props を配線

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - `<WysiwygEditor>` の使用箇所に以下を追加:
    ```tsx
    unsupportedTags={state.wysiwygUnsupportedTags}
    unsupportedAck={state.wysiwygUnsupportedAck}
    onUnsupportedTagsDetected={(tags) =>
      dispatch({ type: "wysiwygUnsupportedDetected", tags })
    }
    onAcknowledge={() => dispatch({ type: "wysiwygUnsupportedAck" })}
    ```
- **理由:**
  - `NoteEditor` がオーケストレーターとして `dispatch` と `state` を持つ既存パターンに揃える

### 7. テスト追加

- **対象ファイル:**
  - `app/components/note/editor/__tests__/wysiwygUnsupportedTags.test.ts`（新規）
  - `app/components/note/editor/__tests__/editorState.test.ts`（追記）
  - `app/components/note/editor/__tests__/autosaveLogic.test.ts`（追記）
- **変更内容:**
  - `wysiwygUnsupportedTags.test.ts`:
    - 空文字列 → `[]`
    - StarterKit 範囲内のみ（`<p>`, `<h2>`, `<strong>`, `<a>`, `<img>` 等）→ `[]`
    - `<table><tr><td>x</td></tr></table>` → `["table", "td", "tr"]`（sort）
    - `<mark>` / `<kbd>` 検出
    - `<figure><figcaption>…</figcaption><img/></figure>` → `["figcaption", "figure"]`（img は許可）
    - `<section>` / `<article>` 検出
    - 大文字 `<MARK>` でも検出（lowercase 正規化）
    - 同一タグ重複は 1 回だけ返る
    - HTML コメント `<!-- ... -->` は無視
    - `<b>` / `<i>` / `<u>` は alias なので返らない
    - `<div>` / `<span>` も `[]`
    - サニタイザ `BLOCK_TAGS / INLINE_TAGS / MEDIA_TAGS` 全タグ網羅: supported に含まれないもの全てが検出される（レビュー S-001 対応）
  - `editorState.test.ts`:
    - 初期状態で `wysiwygUnsupportedTags === []` / `wysiwygUnsupportedAck === false`
    - `wysiwygUnsupportedDetected` で非空 tags がセットされ ack は false のまま
    - **空集合 `[]` の dispatch は state を変えない（latch 動作。ADR-005）**
    - 同じ tags 集合での再 dispatch は Set 比較で referential no-op（順序が違っても）
    - 異なる tags での再 dispatch は ack が false にリセット
    - `wysiwygUnsupportedAck` で ack が true になる
    - 上記いずれも `dirtyKeys` を汚さない
  - `autosaveLogic.test.ts`:
    - `shouldFlushAutosave` を新規にカバー:
      - `noteId === null` → false
      - dirtyKeys 空 → false
      - frontMatterJsonError あり → false
      - `mode === "wysiwyg"` かつ未対応タグあり かつ未 ack → false
      - 上記の組合せで「mode === html」「ack 済み」「未対応タグなし」のときはそれぞれ true
- **理由:**
  - Issue 受入条件「pure 関数として単体テスト可能」を満たす
  - reducer / autosave ガードを単体テストで網羅することで TipTap 起動を伴う統合テストを追加せずに済む
  - 既存 `wysiwygSanitizerIntegration.test.ts` は本 Issue では無変更で動き続ける

### 8. マニュアルテストドキュメント

- **対象ファイル:** `.issue/37/testing.md`（新規）
- **変更内容:** Phase 2 動作確認用のドキュメントを生成。シナリオ:
  1. table/mark/figure/kbd を含む既存ノートを WYSIWYG タブで開く → 警告 banner が表示される
  2. ack 前に WYSIWYG モードで本文を編集する → autosave が走らない（AutosaveIndicator が dirty/編集中のまま）
  3. ack ボタンを押す → 以後の編集で autosave が走る（"保存しました" 表示）
  4. ack 後も control 文言（「以下の要素は WYSIWYG モードでは保持されません」）が継続表示される
  5. WYSIWYG → HTML タブ → WYSIWYG と切替後も警告が再表示される
  6. **HTML タブで未確認警告状態のまま編集して autosave が走る** → HTML タブでは抑止しない仕様確認（ADR-002 / レビュー S-005）
  7. StarterKit 範囲内のみのノートでは banner が出ない（偽陽性なし）

## 設計判断

詳細は `.issue/37/adr.md` を参照。

- **ADR-001**: 検出を「元 HTML vs TipTap parse 後 HTML の diff」ではなく「元 HTML のタグ名から supported 集合を引く」方式にする
- **ADR-002**: autosave 抑止条件に `state.mode === "wysiwyg"` を含める（HTML モードでは抑止しない）
- **ADR-003**: ack 後も banner を控えめに残す（情報の継続的明示）
- **ADR-004**: 警告 banner は `WysiwygEditor` 内 inline で実装する（別コンポーネントに切り出さない）
- **ADR-005**: 検出を `onCreate` のみで実行し、reducer 側でも空集合 dispatch を無視する latch を持つ

## リスクと注意点

- **R-1: 警告対象タグ集合の決定**
  - `WYSIWYG_SUPPORTED_TAGS` から `<div>` / `<span>` / `<b>` / `<i>` / `<u>` を含めない場合、ほぼすべての既存ノートで警告が出てしまう恐れがある。これらは TipTap が等価変換するか保持するので supported に含める（誤検知ゼロを担保）
  - 反対に `<table>` / `<mark>` / `<kbd>` / `<figure>` / `<section>` / `<article>` 等は実害が大きいので必ず警告

- **R-2: TipTap 出力のタグ範囲**
  - TipTap が emit する全タグは StarterKit + Link + Image の範囲のみ。Mention は `internalLinkExtension.ts` の設計上ドキュメント本体には挿入されない（command 経由で `[[...]]` 文字列展開）ので、追加で考慮するタグはない

- **R-3: ack 後に外部 `value` が変わって新しい未対応タグが出てきた場合**
  - 本 Issue では検出を `onCreate` のみで実行する（ADR-005）ため、エディタ mount 中は banner が変化しない。タブを離れて戻ったときに新しい `value` で再検出される。reducer の `wysiwygUnsupportedDetected` は「集合が異なれば ack を false にリセット」する

- **R-4: `value === ""` のとき偽陽性検出を起こさない**
  - `detectUnsupportedTags("")` は `[]`。テストでピン留め

- **R-5: タグ名抽出の正規表現がコメント / 属性内 `<` を誤検知**
  - 入力は「サニタイザ通過済み HTML」前提なので CDATA や属性内 `<` は事実上来ない。コメントだけは事前除去で対応。JSDoc にもこの前提を明記

- **R-6: パフォーマンス**
  - `detectUnsupportedTags` は `onCreate` でのみ実行（毎キーストロークでは走らない）。大本文でも 1ms 未満なので入力遅延に影響しない

- **R-7: HTML タブで未確認警告状態のまま編集する動線**
  - ADR-002 で `state.mode === "wysiwyg"` のときのみ抑止するので、ユーザーが警告 banner を見た後 HTML タブに切り替えて編集することは autosave で保存される。この動線は HTML タブが未対応タグを保つので意図通り（受入条件「警告 → ユーザーが対応可能な動線を残す」と整合）

## テスト方針

- **単体テスト**:
  - `wysiwygUnsupportedTags.test.ts` で pure 関数の網羅（サニタイザ全タグ網羅含む）
  - `editorState.test.ts` に reducer ケース 5 件追加（空集合 latch / Set 比較 no-op / ack リセット / ack 動作 / dirtyKeys 不変）
  - `autosaveLogic.test.ts` に `shouldFlushAutosave` 述語のテストを追加
- **統合テスト**: 既存 `wysiwygSanitizerIntegration.test.ts` を流用。本 Issue では追加しない（pure 関数のテストで十分）
- **マニュアルテスト**: `.issue/37/testing.md` に従い実行し、`.issue/37/manual-test/results/` に結果を残す

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | △（一部） | △（一部） | ○ |
| 検出方式 | 元 HTML のみから | 元 vs parse 後 diff | 元 HTML のみから |
| banner コンポーネント | 別ファイル | 別ファイル | inline |
| ack 後 banner 表示 | ◯（控えめ） | ◯（控えめ） | ◯（インライン文言） |
| 抑止条件に mode 含む | ○ | × | × |
| 取り込んだ点 | mode 含む抑止条件 / latest-ref / alias タグ除外 | latest-ref パターン / 警告クリア戦略 | 元 HTML のみから検出 / inline banner / 単体テスト中心 |

## レビュー反映

### 修正した点
- **P-001 (Reviewer 1)**: `useEffect([editor, value])` での再検出を削除し `onCreate` のみで検出するよう変更。さらに reducer 側で「空集合 dispatch を無視」する latch を追加。これによりユーザー編集を起点に banner が消える経路を構造的に排除。ADR-005 を新設して根拠を記録
- **P-001 (Reviewer 2)**: `onCreate` 内では `value` を closure で読む（`instance.getHTML()` は parse 後で既にロス済みになっているため不適切）。Step 4 の本文に明記
- **P-002 (Reviewer 1)**: ADR-002 の Consequences に「WYSIWYG タブから離れても `wysiwygUnsupportedTags` 状態は保持され、autosave ガードは mode 条件で開放される。HTML タブでの編集を妨げない意図」と明記（adr.md を更新）
- **P-002 (Reviewer 2)**: `useEffect` での検出を削除したため moot
- **P-003 (Reviewer 2)**: reducer 内で Set 比較に変更（順序非依存）。`[...action.tags].sort()` で昇順固定保存
- **P-004 (Reviewer 2)**: `shouldFlushAutosave` を `useAutosave.ts` から pure 述語として export。`autosaveLogic.test.ts` で直接テスト
- **P-005 (Reviewer 2)**: `WYSIWYG_SUPPORTED_TAGS` に `section`/`article` を含めず警告対象とすることを明記
- **S-001 (Reviewer 1)**: テストにサニタイザ `BLOCK_TAGS / INLINE_TAGS / MEDIA_TAGS` 網羅ケースを追加

### 取り込んだ改善提案
- **S-001 (Reviewer 2)**: TipTap StarterKit v3 が Underline を同梱する根拠を `wysiwygUnsupportedTags.ts` JSDoc に明記
- **S-002 (Reviewer 2)**: `detectUnsupportedTags` の JSDoc に「サニタイザ通過後の HTML を期待する」と明記
- **S-004 (Reviewer 2)**: `WysiwygEditor` 側の `lastReportedUnsupportedRef` を削除（reducer 側の no-op ガードで十分）
- **S-005 (Reviewer 2)**: マニュアルテストに「HTML タブで未確認警告状態のまま編集 → autosave が走る」シナリオを追加
- **S-003 (Reviewer 1)**: マニュアルテストの項目立てを明示（5→7 シナリオに拡張）

### 見送った提案とその理由
- **S-003 (Reviewer 2)**: 「ack 後に新規未対応タグ集合が来たら banner が再 alert になる」JSX レベルテスト — reducer のテストで `ack` リセットを既に確認しており、banner の `role` 切替は条件式 `unsupportedAck` を直接参照するシンプルな JSX。重複テストになるため見送り
- **S-002 (Reviewer 1)**: banner 文言の最終調整 — P-001 を「`onCreate` のみで検出 + latch」で対応した結果、文言「確認するまで自動保存は一時停止します」は嘘ではなくなったのでそのまま採用
