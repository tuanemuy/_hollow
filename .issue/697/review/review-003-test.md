# PR #722 レビュー（Test 観点） — review-003（Round 3 フル再レビュー）

対象: PR #722 / Issue #697「FrontMatter モードを廃止し、メタデータを下部に常設」
計画: `.issue/697/plan.md`
前回: `review-002-test.md`（Round 2: Blocker/Warning なし、Notes 3）

Round2→3 の差分:
- `FrontMatterEditor.test.tsx` に「メタデータ領域が region landmark（`aria-label="メタデータ"`）として
  公開される」ことを pin するテストを 1 本追加（`exposes the editor as a region labelled メタデータ (Issue #697)`、
  90-112 行）。これは Round 2 の **N-001**（landmark 文言を pin するテストが無い）を解消する追加。
- `FrontMatterEditor.tsx` のルートが `<section aria-label="メタデータ">`（コミット済み: `05d95954`）。
  Round 2 時点では未コミットの作業ツリー変更だったが、Round 3 では両者ともコミット済み。

実行結果: `pnpm vitest run app/components/note/editor/__tests__/` = 18 files / 319 tests すべて pass。
（前回 Round 2 で確認した 5 files / 154 tests を内包し、新規 landmark テスト込みで全 pass。）

## Test

### Blockers

なし。

AC-1〜AC-5/AC-7 の pin は Round 2 から無傷で維持されており、今回追加の landmark テストも意味のある pin で
false positive にならない。

- **新規 landmark テストの pin 妥当性**: `container.querySelector("section")` 非 null +
  `aria-label === "メタデータ"` を assert（109-111 行）。コンポーネント内の `<section>` は唯一
  （`FrontMatterEditor.tsx` 内 grep で 284 行の 1 箇所のみ）なのでセレクタは一意で曖昧さが無い。
  ルートを `<div>` へ戻す回帰では `querySelector("section")` が null を返してテストが落ち、
  ラベル文言を変えれば `aria-label` の `toBe("メタデータ")` が落ちる。N-001 が懸念した
  「bare `<div>` への退行」「ラベル文言の意図しない変更」の双方を確実に捕捉する。false positive ではない。
- **section セレクタの妥当性**: `getByRole("region")` ではなく `querySelector("section")` を使っている点は
  むしろ堅牢。`<section>` の implicit role が `region` になるのは aria-label/aria-labelledby が付いている
  ときのみ、という暗黙ルールに依存せず「要素種別 + 明示ラベル」を直接 pin しており、
  ラベルが外れた場合（＝region でなくなる退行）でも要素種別の検証は残る。テスト基盤（happy-dom +
  `container.querySelector`）も既存テストと同一手法で、新たな環境依存を持ち込んでいない。
- **既存セレクタとの衝突なし**: editor `__tests__` 全体で `querySelector("section")` を使うのは
  本テストのみ（grep 0 件の他ファイル）。`getByRole` / `role="region"` を使うテストも存在しないため、
  section/region landmark の追加で既存テストが壊れる経路はそもそも無い。実際に 319 tests 全 pass。
- **AC カバレッジ（Round 2 から不変、再確認済み）**:
  - AC-1: `editorModeSwitch.test.tsx` が両 surface のタブ列を `toEqual` で完全一致 pin（FrontMatter 消失 +
    WYSIWYG 温存）。
  - AC-2: `noteEditorModeChange.test.tsx` の `frontMatterKeyInput()` が inline/HTML/ビジュアル切替後すべてで
    非 null。常設マウントを本文モード非依存で検証。
  - AC-3: `FrontMatterEditor.test.tsx` の構造 ⇔ 生トグル系テストが温存・pass。
  - AC-4: `snapshotForSubmit` の JSON シリアライズ回帰は既存 `editorState.test.ts` で pin 済み、本 PR は未改変。
  - AC-5: `noteEditorModeChange.test.tsx` が「キー追加 → dirty → unsaved-confirm accept → 本文モード切替 →
    キー残存」を順に assert。`confirmMock` 呼び出し回数 + `hasFrontMatterKeyRow` で意味のある pin。
  - AC-7: 全関連テスト更新済み、`setMode mode:"frontMatter"` の dead test は除去/置換済みで過不足なし。
  - WYSIWYG ゲート（#696/#715）系テストもすべて温存・pass。常設化・section 化による回帰なし。

### Warnings

なし。

### Notes

- **[N-001]** landmark テストの値入力が assert 対象に対して過剰（軽微・害なし）
  - 場所: `app/components/note/editor/__tests__/FrontMatterEditor.test.tsx:100-107`
  - `parsed={{ a: "1" }}` を渡しているが、本テストの assert はルート `<section>` の存在とラベルのみで、
    レンダリングされる行の内容には依存しない。`parsed={{}}`（空）でも同じ結論が得られ、より「ラベルは
    キーの有無に依らない region の属性」という意図が鮮明になる。ただし現状でも検証は正しく、
    他テストと同じ `parsed={{ a: "1" }}` パターンに揃えているとも読めるため害は無い。Note 止まり。

- **[N-002]** `autosaveLogic.test.ts:164` の置換後ケースが既存 inline ケースと実質重複（Round 1 N-001 /
  Round 2 N-002 を継続）
  - 場所: `app/components/note/editor/__tests__/autosaveLogic.test.ts:149-173`
  - 旧 FrontMatter ケースを inline へ置換した結果、直上の "returns true in inline mode even when unsupported
    tags are detected" とほぼ同一経路になっている。旧テスト固有の価値は inline 既存ケースに吸収済みで
    カバレッジ欠落は無く、害も無いため Round 3 でも Note 維持。

- **[N-003]** 追加テストの命名・WHY コメント・マーカーのヘルパー化は既存規約に準拠（Round 1〜2 から継続）
  - 場所: `editorModeSwitch.test.tsx` / `noteEditorModeChange.test.tsx` / `FrontMatterEditor.test.tsx:93-112`
  - 新規 landmark テストも Issue 番号付き describe 文言 + 「なぜ pin するか（screen-reader regression を落とす）」の
    WHY コメントを備え、既存テストの記述スタイルと一貫している。可読性・保守性ともに良好。
