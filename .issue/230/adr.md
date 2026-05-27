# ADR — Issue #230: Front Matter エディタを「あれば表示」モデルに

## ADR-001: `KNOWN_KEYS` 完全撤廃 + サジェスト方式へ切り替え

### Status

Proposed

### Context

`FrontMatterEditor` は `KNOWN_KEYS = ["title", "date", "tags", "description", "slug"]` をハードコードし、構造編集モードでは固定 5 フィールドを常に表示していた。Issue #230 は「Front Matter は固定プロパティを持つのではなく、あれば表示する程度」を求めており、ドメイン層（`FrontMatter` 値オブジェクト）はすでに `Record<string, unknown>` で正しいが、エディタ UI だけが固定スキーマ前提になっていた。

選択肢:

- (A) `KNOWN_KEYS` を縮小（`tags` だけ削る）
- (B) `KNOWN_KEYS` を完全撤廃し、`Object.entries(frontMatter)` を任意キーとして列挙
- (C) (B) + サジェスト（よく使うキーを datalist で提示）

### Decision

(C) を採用。`KNOWN_KEYS` 配列は撤廃し、構造編集モードは「ノートに書かれているキーをそのまま列挙 + 任意行追加」とする。`SUGGESTED_KEYS = ["date", "description", "title", "slug"]` を `<datalist>` でサジェスト提供する。

サジェスト対象は「実装側で意味を持つキー（`date` は `parseFrontMatterDate` で読まれる）」と「一般的な Markdown FrontMatter 慣習として書かれることが多いキー（`title` / `description` / `slug`）」のみに絞る。`tags` / `aliases` / `publish` は実装側で何も読まれていないため、サジェストから外す（誤誘導防止）。

### Consequences

- 良い点:
  - Issue の完了条件「任意キーを編集できる」「既存ノートとの後方互換」を直接満たす
  - `tags` を Front Matter に書く動線が物理的に消える（タグソースをハッシュタグに一本化）
  - 「あれば表示」モデルがエディタ・表示で一貫する
- トレードオフ:
  - 配列・ネストオブジェクト値は構造編集モードで編集できなくなる → raw JSON モードに誘導するため UI 上の明示が必要
  - 新規ノート作成時に何のキーから書けばよいか分かりにくくなる可能性 → サジェスト（datalist）でガイド

---

## ADR-002: 既存 `frontMatter.tags` は無視（マイグレーション・自動移行しない）

### Status

Proposed

### Context

過去にエディタから `frontMatter.tags` を書き込まれているノートが存在する可能性がある。新しい仕様では `tags` を Front Matter から外すが、既存値の扱いを決める必要があった。

選択肢:

- (A) マイグレーションで `frontMatter.tags` を Tag テーブルへ自動移入し、Front Matter からは削除
- (B) 表示のみ残し、新エディタでは追加・編集できないようにする（読み取り専用）
- (C) 無視（残置）— 既存値は他の任意キーと同列に汎用レンダリングで表示し、新エディタからも任意キーとして編集可能

### Decision

(C) を採用。

### Consequences

- 良い点:
  - 完了条件「既存ノートで書かれている任意キーが消えない」を最小コストで満たす
  - `frontMatter.tags` はアプリケーション・ドメインのどの経路もタグソースとして参照していない（grep で書き込み・読み込みともにエディタ UI 以外なし）ため、移行を行わなくても機能的副作用がない
  - マイグレーションを書かないことで「文字列がタグ名として妥当か（値オブジェクト検証通過するか）」のリスクを回避
- トレードオフ:
  - 過去ノートを開いたユーザは「タグらしき配列がメタデータに残っている」状態を見ることがある → 詳細画面では `<dl>` の一行として汎用的に表示されるだけなので致命ではない
  - 必要なら将来 (A) を別 Issue で追加可能（後方互換オペレーション）

---

## ADR-003: エディタ UI 形状は「縦並び行リスト + raw JSON モード」、キー rename は専用 reducer action + ローカルバッファ

### Status

Proposed

### Context

任意キー編集 UI の具体形が複数考えられた:

- (a) `<table>` で key/value のグリッド
- (b) 縦並びの行リスト（フレックス）
- (c) JSON エディタのみ（構造モード廃止）

既存実装は「構造編集モード ⇔ raw JSON モード」のトグルを持っており、ユーザはモードを自由に切り替えられる。

さらに、当初は「キー rename は `setFrontMatterField(oldKey, undefined)` + `setFrontMatterField(newKey, oldValue)` の連続 dispatch で対応」を想定していたが、レビューで以下の問題が判明:

1. **キー順序の崩壊**: 既存 reducer は `{ ...current, [key]: value }` で末尾追加するため、rename 後にキーが末尾へジャンプする。「あれば表示」モデルで `Object.entries` 順依存の UI と組み合わせると、編集中に見た目が崩れる
2. **中間状態の rawJson 上書きと autosave 巻き込み**: `setFrontMatterField` は毎回 `frontMatterRawJson` を再生成するため、タイプ中の中間鍵がそれぞれ dirty を発火し autosave snapshot 候補になる。raw モードで編集中の未パース JSON も巻き込まれて消える恐れ
3. **重複キー時の挙動が未定義**: 連続 dispatch では「`b` キーが既に存在する状態で `a → b` rename」が単純に `b` を上書きしてしまう

### Decision

UI レイアウトは (b) を採用。既存の構造モードを縦並び行リストへ作り直し、各行は `[ key input ][ value input ][ 削除 ]` のフレックスレイアウト。複雑値（配列・ネスト）は disabled バッジ + 「raw モードで編集」CTA で表示（削除ボタンは引き続き有効）。raw JSON モードは既存実装そのまま維持。

キー rename は **専用 reducer action `renameFrontMatterKey(oldKey, newKey)` を追加**して 1 dispatch にまとめる:

- 内部で `Object.entries(current)` を走査し、旧キーの位置で新キーに差し替えることで**挿入順を保持**
- 新キーが既存と重複する場合は no-op + `frontMatterJsonError` にエラーメッセージを返却（reducer レベルで reject）
- UI 側はキー入力をローカル state にバッファし、**blur / Enter で 1 度だけ dispatch**（タイプ中の中間鍵を autosave 候補にしない）

新規キー追加も同様に **`addFrontMatterKey(key)` action** を追加し、重複時は no-op + エラー返却。

### Consequences

- 良い点:
  - 既存スタイル定数（`field` / `fieldControl` / `fieldLabel` / `pillBtn`）を流用でき、新規 CSS 不要（CLAUDE.md「utility-first」遵守）
  - レスポンシブ（モバイルで行が縦積みになる）に強い
  - キー rename が「順序保持 + 重複拒否 + autosave 巻き込みなし」で安全
  - 重複時の挙動が型・実装で明示される（インラインエラー UI）
- トレードオフ:
  - 配列・ネスト値は構造モードでは編集不可 → raw モードに誘導する CTA が必要
  - reducer に 2 つの action が増えるため、対応するテストとドキュメント更新が必要
  - キー入力のローカルバッファは「Enter / blur 前にナビゲートすると変更が失われる」UX を生む → input にフォーカスがある間は警告 or pending インジケータで明示する
  - **pending 状態でのモード切替方針**: 構造モード ⇔ raw モードのトグル時はフォーカスを強制 blur して pending な rename を commit する。commit に失敗（重複キーで reject など）した場合はモード切替を中止しエラーメッセージを表示する

---

## ADR-004: `FrontMatterPanel` は単一の `<details open>` で全キーを折り畳み表示

### Status

Accepted（実装時に決定）

### Context

`FrontMatterPanel` から既知キー / その他キーの 2 段構成を撤去するにあたり、全キーを単一 `<details>` に格納する方針は計画（ステップ 3）で決まっていた。残った設計判断は「初期状態を開く（`open`）か閉じるか」。

選択肢:

- (a) `<details>` を初期 closed にする（旧 UI の「その他」サマリーと同じ挙動）
- (b) `<details open>` で初期展開する

旧 UI では「既知キー」は常に展開表示・「その他」のみ折り畳まれており、ユーザは詳細画面を開いた瞬間に主要メタデータを目視できた。

### Decision

(b) を採用。`<details open>` を既定とする。

### Consequences

- 良い点:
  - 旧 UI で常時表示されていた既知キー領域に相当する情報が、新 UI でも初期表示で目視できる（既存ユーザの体験回帰を最小化）
  - 折り畳みインタラクション自体は維持されるため、長大な FrontMatter を持つノートでも `<summary>` をクリックして閉じられる
- トレードオフ:
  - 多数のキーを持つノートでは初期スクロール量が増える可能性があるが、`spec/domains/note.md` のサイズ上限（64 KiB）の範囲では実害なし
  - 折り畳み UX の包括的な再設計（プログレッシブディスクロージャ等）は本 Issue のスコープ外（plan.md ステップ 3 参照）

---

## ADR-005: 新規キー追加時の初期値は空文字列

### Status

Accepted（実装時に決定）

### Context

`addFrontMatterKey(key)` で追加する値の初期型を決める必要があった。FrontMatter は `string | number | boolean | string[] | Record<string, FrontMatterValue>` を許容するが、構造編集モードの値入力は単一の `<input type="text">`。

選択肢:

- (a) `null` で初期化（型としては有効だが、構造モードの input は `null` を表現できない）
- (b) `""`（空文字列）で初期化
- (c) `undefined`（実質「キーだけ作って値は無い」状態。`stringifyFrontMatter` 経由で JSON に出ない）

### Decision

(b) を採用。

### Consequences

- 良い点:
  - 追加直後に空の `<input>` が表示されてユーザがすぐ値を打てる
  - JSON シリアライズ時に `"key": ""` として明示的に出力されるため、autosave snapshot との挙動が直感的
  - 値型が `string` で揃うので、構造編集モードの分類ロジック（`classifyValue`）が `kind: "string"` の単一パスで処理できる
- トレードオフ:
  - 数値・真偽値を後から入れたい場合、raw JSON モードでの再編集が必要（構造モードの `<input>` は文字列しか書き出さない）。これは ADR-003 の「複雑値は raw モードで編集」と整合する制約
