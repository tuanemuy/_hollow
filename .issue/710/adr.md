# ADR — Issue #710: ノート一覧 ディレクトリ表示のパンくず化

## ADR-001: `NoteBreadcrumb` を流用せず一覧用 `DirectoryBreadcrumb` を新設する

### Status
Proposed

### Context
ノート詳細側に既存の `NoteBreadcrumb`（`app/components/note/detail/NoteBreadcrumb.tsx`）があり、`nav` + `Separator`（ChevronRight）+ `{ ...HOME_SEARCH, directoryId }` リンクという、本 Issue が求めるパンくず描画のパターンを持つ。再利用候補だが、`NoteBreadcrumb` は末尾に必ず「ノートタイトル」（`aria-current="page"` のテキスト）を置く前提で、`noteTitle: string` を必須 props に持つ。一覧側のディレクトリパンくずは末尾が「タイトル」ではなく「ディレクトリフィルタ解除 `×`」であり、末尾要素の意味と props 形が根本的に異なる。

選択肢:
- (A) `NoteBreadcrumb` を汎用化し、末尾要素を props で差し替え可能にして両者で共有する。
- (B) `DirectoryBreadcrumb`（一覧専用）を新設し、共通の描画パターン（区切り・リンク・key 規約）だけを踏襲する。

### Decision
(B) を採用。一覧パンくずと詳細パンくずは「末尾要素（解除ボタン / 不変のタイトル）」「表示文脈（フィルタ行 / 記事ヘッダ）」が異なり、(A) の汎用化は `NoteBreadcrumb` に分岐 props（末尾を render-prop 化する等）を持ち込んで両用途に引っ張られる。Issue の指示も「`NoteBreadcrumb` と同じパンくず表示に置き換える」＝同じ見た目・パターンの踏襲であって同一コンポーネントの共有を要求していない。描画パターン（`Separator`・`CRUMB_LINK`・累積 id key・要素間のみの区切り）は `NoteBreadcrumb` を正として揃える。

### Consequences
- 良い点: 各コンポーネントが単一用途に保たれ、末尾要素の差異を分岐なく表現できる。`NoteBreadcrumb` の安定した契約（commit 322516ee で確定）を壊さない。
- トレードオフ: パンくず描画の見た目ロジックが2ファイルに重複する。将来3つ目のパンくずが出たら共通化（`Separator`/`CRUMB_LINK` の抽出）を検討するフォローアップ余地が残る。

---

## ADR-002: ディレクトリの表示形態を「active チップ」から「パンくず」に変更し #497 ADR-001 を上書きする

### Status
Proposed

### Context
`.issue/497/adr.md` ADR-001 は「ディレクトリはツリーから設定するため in-bar トリガーを持たず、active チップのみ表示する」と決めた。本 Issue #710 はこの表示形態そのものを再検討する。タグ（複数選択・フラットな絞り込み）とディレクトリ（単一パス・階層の現在地）は意味が異なるのに `filterChip data-active` で同形に見えるのが問題で、加えて末端名しか出ず階層が分からない。

### Decision
ディレクトリの表示を `filterChip`（チップ語彙）から `nav` パンくず（ナビゲーション語彙）に変更する。#497 ADR-001 の「active チップのみ表示」は本 ADR-002 で上書きされる。ただし:
- セグメント解決不能（id がツリーに無い／削除直後等で segments が空）の場合は、回帰回避のため従来の汎用 active チップ + `×` をフォールバックとして残す。directory の optimistic は解除（undefined 化）のみで set 系を持たないため、「optimistic≠baseline の過渡状態」は構造上発生せず、フォールバックの発火条件は segments 空に一本化される。
- root セグメントはリンク化・表示しない（`.issue/356/adr.md` ADR-002「root の directoryId はフィルタに渡さない」を踏襲）。
- パンくずはチップ列とは別行に置く（チップ群の横スクロール／折り返しと混在させない）。

### Consequences
- 良い点: 「絞り込みをかけた」ではなく「このフォルダの中を見ている」状態が正しく伝わる。途中階層へのジャンプが可能になり、ノート詳細のパンくず体験と一貫する。
- トレードオフ: フィルタ行内に「チップ語彙」と「ナビ語彙」の2系統が同居する。ただしディレクトリ＝居場所という意味の違いを表現するための意図的な差異であり、Issue の主目的そのもの。#497 ADR-001 はファイルとして履歴に残し、本 ADR で上書きされた旨を本計画で明示する。
