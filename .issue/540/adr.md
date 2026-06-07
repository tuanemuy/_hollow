# ADR — Issue #540: 領域1（P10/P11/P12/P20）モック実装追従

## ADR-001: 「最近更新」「お気に入り」サイドバー項目は本 Issue スコープ外

### Status
Proposed

### Context
P10/P11/P12 のサイドバーモック（`spec/design/pages/*.html` の `ライブラリ` セクション）には `すべてのノート`（件数バッジ付き）に加えて `最近更新` と `お気に入り` の nav-item が描かれている。一方、現状のバックエンドには「お気に入り（favorites）」のドメイン概念も、「最近更新」専用のルート/フィルタも存在しない（`app/routes` / `app/core/application` に該当なし）。

### Decision
本 Issue は「モック追従（実装を確定済みデザインに寄せる）」が目的であり、新機能の実装は含めない。`最近更新` / `お気に入り` は backend 非対応の新機能のため追従対象から除外する。`すべてのノート` の件数バッジ・`保存したビュー` 列挙は既存 loader で実現可能なため実施する。`最近更新`（更新日降順ソート）/ `お気に入り`（favorites ドメイン）が必要なら別 Issue で機能込みで起票する。

### Consequences
- 良い点: スコープがモック追従に収まり、未設計の機能を場当たり実装しない。
- トレードオフ: サイドバーがモックと完全一致しない（2 項目欠落）。意図的な差分として記録し、フォローアップ Issue で扱う。

---

## ADR-002: P11 メタの「場所」行は追従して追加、「公開状態」行は追加しない

### Status
Proposed（改訂: 初版は「場所/公開状態とも追加しない」としていたが、SSOT 読み直しにより「場所は追加」へ訂正）

### Context
P11 モックの本文下メタブロック（`.note-meta-block`）は `作成 / 更新 / 場所 / タグ / 公開` を列挙する。`場所` と `公開状態` の扱いは別個に判断する必要がある:

- **場所（ディレクトリパス）**: `spec/design/index.md` §2.1 は本文下メタ項目を「作成日 / 更新日 / **場所** / タグ」と**明示列挙**し、場所を下部メタに置くことを SSOT として要求している。P11 モックも `場所` 行（`Research / 論文メモ`）を持ち、コメントで「場所はここに集約（#356 ADR-002）」と明記。#356 で廃止されたのは「右メタレール」であって本文下メタの場所行ではない。breadcrumb（上部・回遊導線）と下部メタの場所行（プロパティ表示）の併存は、廃止済み右メタレールとの二重化には当たらない。現実装（`NoteMetaPanel`）には場所行が無く、**追従漏れ**。データは `NoteDetail.tsx` が `directorySegments` を取得済みで DTO 拡張不要。
- **公開状態**: index.md §2.1 のメタ項目列挙には**含まれない**。#356 ADR-003 / #459 により公開状態はトップ `action-toolbar` の公開設定ピル（ラベル付き・状態ドット、「 stateful な唯一の例外」）に集約済み。モックは下部メタにも pub-pill を描くが、これをメタに追加するとトップピルとの二重化になる。

### Decision
- **場所行**: index.md §2.1 + P11 モック双方が要求するため、`NoteMetaPanel` に追加する（`directorySegments` を流用）。
- **公開状態行**: index.md §2.1 非列挙 + #459 のトップ集約を上位の真実とし、メタブロックに追加しない（トップピルとの二重化回避）。
- **提示順**: モックが示す プロパティ → バックリンク 順に追従し、現状の バックリンク → プロパティ 順を反転する。

### Consequences
- 良い点: SSOT（index.md §2.1 + モック）が要求する場所行の追従漏れを解消し、提示順もモックに合わせつつ、公開状態の二重化（#459 集約）は避ける。
- トレードオフ: 公開状態についてはモック図（下部メタの pub-pill）と一致しない。index.md §2.1 のメタ項目列挙 + #459 集約を優先根拠として本 ADR に明記し整合を担保する。実装前にレビューで合意を取る。

---

## ADR-003: P12 エディタ追従のスコープ線引き

### Status
Proposed

### Context
P12 モックは document スタイルの大型タイトル入力・モードタブ/autosave/アクションを 1 行に束ねた topbar・× 付きタグ chip・本文ツールバーなど、現状のフォーム型エディタ（ラベル付き入力 + 分散レイアウト）と大きく異なる。同時に #522（フォーカス枠線・余白）/#287（inline メディア）/#157（リアルタイム編集衝突）/#77-80（WYSIWYG 拡張）が明示的にスコープ外。

### Decision
本 Issue の P12 追従は以下に限定する:
- 実施: タイトルの document スタイル化（borderless 大型・ラベル sr-only）、モードタブ + autosave 表示 + 主アクションの topbar 配置（JSX 再配置のみ）。
- 対象外: タグの chip UI 化（`editorState` のタグモデル変更を伴うため）、フォーカス枠線・余白の作り込み（#522）、メディア挿入 UX（#287）、編集ロック/衝突の挙動（#157）、WYSIWYG 機能拡張（#77-80）。
`editorReducer` のロジック（autosave/lock/dirty 判定）には手を入れず、見た目の再配置に閉じる。

### Decision 追補（review-001 M-W-002）
編集モードのモックは topbar に加えて本文末尾にも下部 save-row（save-status + 保存/キャンセル）を持つが、実装は新規/編集とも **topbar 単一に集約し下部 save-row は設けない**。保存導線を 1 箇所に集約する方が状態（autosave 表示・dirty）の二重描画を避けられ、topbar 配置という本 ADR の方針と整合するため。長い本文末尾からの保存性が課題になった場合は別途検討する（本 Issue では意図的に下部 save-row を持たない）。

### Consequences
- 良い点: エディタ体験の中核（document 化された書き味の枠組み）を追従しつつ、隣接 Issue との二重作業・不変条件破壊を避ける。保存導線が topbar の 1 箇所に集約され状態表示が重複しない。
- トレードオフ: P12 が一度の PR でモック完全一致にはならない（編集モードの下部 save-row を持たない）。残差は各担当 Issue で埋まる。

---

## ADR-004: 内部リンク/hashtag ピル・行アクションメニュー・broken `.alert` は「見た目に閉じる範囲」のみ

### Status
Proposed

### Context
- C-3（wikilink/hashtag ピル）: 現状 `[[...]]` / `#...` は本文 HTML 内のプレーンテキストで保持され、レンダリング時にマークアップ化されていない（`NoteService.extractMetadataFromHtml` は抽出のみ）。ピル/hashtag スタイルを効かせるにはドメイン/アダプタのレンダリングパイプライン変更が必要で、#287/#77-80 と隣接する。
- E-2（P20 行アクション overflow メニュー化）: 現状のフラットなテキストアクション列でも機能等価・a11y 担保済み。
- E-3（broken バナー `.alert` 案D 化）: index.md §9 は P20 を `.alert` 採用ページに挙げつつ「`.alert` 基盤刷新の追従は別 Issue」と明記。

### Decision
本 Issue では「CSS/JSX の見た目追従に閉じられる範囲」のみ実施し、パイプライン変更・横断基盤刷新が必要な部分は別 Issue に切り出す:
- C-3: レンダリングパイプライン変更が確認された場合は本 Issue で行わず別 Issue 化（CSS だけ先行追加して死にコード化しない）。
- E-2: overflow メニュー化は `common/Menu` で安価に実現できるなら実施可、コスト過大なら現状維持（意図的差分として記録）。
- E-3: `.alert` 案D 化は §9 の「別 Issue」記述に従い、本 Issue では原則見送り（横断テーマとして別 Issue）。

### Consequences
- 良い点: ドメイン変更・横断刷新の混入によるスコープ肥大とレビュー困難化を防ぐ。
- トレードオフ: P11 本文の内部リンク見た目・P20 の broken バナー見た目が一部モック未達のまま。フォローアップ Issue へ引き継ぐ。

---

## ADR-005: SHELL サイドバー「管理」セクションは実装の導線をモック簡略表記より優先

### Status
Proposed

### Context
P10/P11/P12 のサイドバーモック末尾セクションは `タグ / ゴミ箱 / エクスポート` の簡略表記。実装の「管理」セクションは `タグ / ゴミ箱 / エクスポートジョブ / アップロード` で、モックに無い「アップロード」「エクスポートジョブ」導線を持つ。これらは機能上必要な実在ルート（`/upload` / `/exports`）への導線。

### Decision
モックは設計プロトタイプであり全導線を網羅していない。既存の必要導線（アップロード・エクスポートジョブ）はモック簡略表記に合わせて削らず現状維持する。文言の軽微な整合（「エクスポート」表記など）はモックに寄せてよいが、導線そのものは削除しない。

### Consequences
- 良い点: 機能到達性を損なわずモック追従できる。過小追従（必要導線の削除）を避ける。
- トレードオフ: サイドバー管理セクションがモック図と完全一致しない。意図的差分として本 ADR に記録し、後続 spec-sync での蒸し返しを防ぐ。

---

## ADR-006: サイドバー件数取得は `loadOwnedNotes(limit:1)` を流用、保存ビューは先頭 8 件 + `/views` 導線

### Status
Accepted（実装時の判断）

### Context
A-1 の「すべてのノート」件数バッジには active ノートの総件数が必要だが、application 層に count-only の usecase は存在せず（`listNotesByOwner` は items + count を返す唯一の経路、`searchOwnNotes` は検索専用）、count だけ返す軽量ポートは未整備。A-2 の保存ビュー列挙は件数上限の扱いを決める必要がある。

### Decision
- **件数取得**: count-only 経路が無いため既存の `loadOwnedNotes`（`cache()` 済み）を `status:"active"` / `limit:1` で呼び、`count` だけ使う。`limit:1` で行フェッチを最小化し、`count` は usecase 側でフィルタ後の総数を返す。サイドバーの 3 fetch（`loadDirectoryTree` / `loadOwnedNotes` / `loadSavedViewsByKind`）は `Promise.all` で束ね、N+1 と直列化を避ける。専用 count-only usecase の新設はバックエンド変更でスコープ肥大のため見送り（必要なら別 Issue）。
- **保存ビュー列挙**: 個人ビューを先頭 8 件（`SIDEBAR_SAVED_VIEW_LIMIT`）まで `<Link to="/" search={{ viewId }}>` で列挙し、超過時は「すべて表示」(`/views`) を追加。0 件時はセクションごと非表示（モックは 0 件状態未描画）。`/views` 導線は 0 件でも到達可能なよう「管理」セクション末尾の `保存ビュー` リンクとして常設（ライブラリ section の単一 `/views` リンクは保存したビュー section へ置換）。

### Consequences
- 良い点: バックエンド変更ゼロでモック追従。`cache()` dedup を尊重し SHELL の I/O 増を最小化。`/views` への到達性を 0 件時も担保。
- トレードオフ: `loadOwnedNotes(limit:1)` は home route の `loadOwnedNotes`（full limit/filters）とは引数が異なるため `cache()` が別キーになり、SHELL と home で 2 回 count クエリが走りうる（行は 1 件のみ、コストは限定的）。count-only usecase 整備で解消可能。

---

## 実装メモ（領域 C）

### C-2: BacklinkDTO がディレクトリパス未保持のため別 Issue（DTO/loader 拡張）

実装時に `app/core/application/dto/note.ts` の `BacklinkDTO`（`noteId` / `title` / `slug` / `snippet` の 4 フィールドのみ）を確認した結果、ディレクトリパス情報を保持していない。モックの `.backlink-card` が持つ `backlink-meta`（uppercase ディレクトリパス）を表示する元データが現状の DTO に無いため、C-2 は本 Issue では見送る。loader/DTO 拡張はバックエンド変更でスコープ肥大のため別 Issue（DTO/loader 拡張）で対応する。バックリンクカードは現状の title + snippet の 2 段を維持。

### C-3: 別 Issue（レンダリングパイプライン変更が前提）

ADR-004 の判断どおり、本 Issue では実施しない。実装時に裏取り済み:
- `app/core/adapters/markdown/markdownConverter.ts` は `[[wikilink]]` プレースホルダを verbatim（プレーンテキスト）で保持する（同ファイル冒頭コメント / `markdownConverter.test.ts` の "verbatim preservation" / `htmlSanitizer.test.ts` の "passthrough"）。
- `app/core/adapters/export/markdownRenderer.ts` のコメントも hashtag / internal link は「textual」のまま素通しと明記。
- `NoteService.extractMetadataFromHtml`（`app/core/domain/note/service.ts`）は抽出のみで `<a class="wikilink">` / `<span class="hashtag">` へのマークアップ化は行わない。
- 現状の `app/styles/index.css` に `.wikilink` / `.hashtag` ルールは存在しない（CSS だけ先行追加すると適用先が無く死にコードになるため正しい状態）。

`[[wikilink]]` / `#hashtag` のピル/着色を効かせるには本文レンダリング時のマークアップ化（ドメイン/アダプタのパイプライン変更）が必要で、#287 / #77-80 と隣接する。別 Issue（レンダリングパイプライン変更が前提）で対応する。

---
