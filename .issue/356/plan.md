# 実装計画 — Issue #356: P11 ノート詳細: メタ情報パネルのレイアウト再構成

**Issue:** #356
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

ノート詳細画面（P11）でメタ情報が本文上部を占有して閲覧の邪魔になっている問題を解消する。情報の重要度に応じて配置を再設計し、上部には「パンくず・タイトル・公開状態・主要アクション」のみを残し、重要度の低い情報（作成日 / 更新日 / タグ / バックリンク）は本文下部へ移す。

## スコープ

### 含まれるもの

- ディレクトリをメタ行から外し、本文上部のパンくず（breadcrumb）として表示
- 公開状態をメタ情報から独立させ、公開設定（P14 = `/notes/$noteId/publish`）への導線をその場に含める
- 作成日 / 更新日 / タグ / バックリンクを本文下部へ移動
- `app/components/note/detail/` 配下の presentation 層の再構成（純コンポーネントの分割・組み立て順変更）

### 含まれないもの

- ドメイン / アプリケーション層・ローダー・DTO・ルートの変更（必要なデータは既に解決済み）
- 参考デザインの **デスクトップ右メタレール（lg+ 2カラム）** の導入 — 既存実装は単一カラム（`max-w-[760px] mx-auto`）で、レール導入はレイアウト全体の再設計に波及しスコープを超える。単一カラム下部集約で「本文上部を占有しない」要件は満たせる
- パンくず **中間セグメントの個別リンク化** — DTO（`directoryPath: string`）が中間ディレクトリの id を持たないため。リンク化には `getNoteDetail` の DTO 拡張が必要で別Issue（後述）
- **アクションツールバーの間引き・折りたたみ** — 現状 `NoteActions` は8アクション（編集 / 公開設定 / 移動 / コピー / 複製 / エクスポート / 履歴 / 削除）を持つ。Issue の「主要アクションのみを残し」は満たす方向だが、アクション数自体の削減・折りたたみはレイアウト再構成の本筋（メタ情報の配置）と別テーマのため本Issueではツールバーを基本維持する
- **バックリンク件数の上部表示** — Issue補足の「件数のみ上部・詳細は下部」は *検討可* の任意項目。上部を最小化する Issue 意図を優先し採用しない（ADR-004 参照）

## 実装ステップ

### 1. パンくず presentation コンポーネントを新規作成

- **対象ファイル:** `app/components/note/detail/NoteBreadcrumb.tsx`（新規）
- **変更内容:** props `{ directoryPath: string; directoryId: string; noteTitle: string }`（`directoryId` は `NoteDTO.directoryId` 由来で **常に非null**）。
  - `directoryPath` を `split("/").filter(Boolean)` でセグメント化
  - 先頭に「すべてのノート」リンク（`<Link to="/" search={HOME_SEARCH}>`）
  - 各ディレクトリセグメントはテキスト表示（中間 id を持たないため非リンク）
  - **葉セグメント（= 末尾のディレクトリ名）が存在するとき（セグメント数 >= 1）のみ**、その末尾セグメントを `<Link to="/" search={{ ...HOME_SEARCH, directoryId }}>` でホーム絞り込みリンク化。`directoryPath === "/"`（セグメント空 = ルート直下）の場合は葉リンクを出さない（ルートディレクトリ id を `directoryId` フィルタに渡さない）
  - 末尾にノートタイトルを `current` 相当（`text-ink-secondary`）で表示
  - 区切りに `ChevronRight`（lucide-react）アイコンを `<Icon icon={ChevronRight} size={16} />` で表示（`Icon` ラッパーの許容サイズは 16/20/24 のみ。参考デザインの 11px は design-system 契約上再現せず `size={16}` を採用）
  - `<nav aria-label="パンくず">`、参考デザイン `.breadcrumb`（`flex items-center gap-1.5 text-[13px] text-ink-tertiary flex-wrap mb-6` 相当）を Tailwind utility で再現
  - **フォールバック:** `directoryPath === "/"`（ルート直下）の場合はセグメント空 → 「すべてのノート › （タイトル）」のみ（葉リンクなし）
- **理由:** ディレクトリをメタ行から外し本文上部のパンくずにする要件。既存に breadcrumb コンポーネントが無いため新規作成。

### 2. 上部に公開状態の独立表示を追加（P14 導線同居）

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:** 既存ツールバーは維持しつつ、`visibility` の状態を反映した公開状態チップを「公開設定」リンクに統合する。
  - 現状の「公開設定」`<Link to="/notes/$noteId/publish">` を、状態ドット + ラベル（`公開` / `限定公開` / `非公開`）+「公開設定」テキストを内包した1要素に拡張し、「現在の公開状態 + クリックで P14 へ」を表現
  - 状態色は `data-visibility={visibility}` 属性 + `data-[visibility=public]:` / `data-[visibility=unlisted]:` / `data-[visibility=private]:` の**値マッチ** variant で表現（条件付き class 連結を避ける CLAUDE.md 規約）。値マッチ variant はプロジェクトに `aria-[current=page]:`（`app/components/directory/styles.ts`）の前例があり Tailwind v4 で機能する。JIT がリテラルを拾えるよう、3つの variant 文字列は**分割せず1つのモジュールスコープ定数**にまとめる
  - `aria-label` に現在状態を含める（例: `aria-label="公開状態: 公開 — 公開設定を開く"`）
  - `visibilityLabel` ロジックは現 `NoteMetaPanel` から移設
  - `trashed` 時の早期 return（「ゴミ箱を開く」のみ）は維持。公開状態チップは active 時のみ表示
- **理由:** 「公開状態を独立させ、公開設定への導線をその場に含める」要件。P14 はモーダルではなくページ route で、既に `NoteActions` に導線があるため、新規モーダルを発明せずここに集約するのが整合的。

### 3. 下部メタパネルへ作り替え（`NoteMetaPanel` の再構成）

- **対象ファイル:** `app/components/note/detail/NoteMetaPanel.tsx`
- **変更内容:**
  - props から `directoryPath`・`visibility` を削除（ステップ1・2へ移管）。`visibilityLabel` / `visibilityChipClass` も `NoteActions` へ移設して削除。**未使用になる props・ヘルパは props 定義から削除まで含める**（typecheck/lint の未使用検出を残さない）
  - **`publishedAt`（公開日）は下部プロパティに「公開日」行として残す**（`publishedAt !== null` のとき `meta-row` で表示）。これは ADR-003 で再掲しないと決めた「公開状態チップ」とは別物（日付メタ）で、作成日 / 更新日と並ぶのが自然。`publishedAt` prop は `NoteMetaPanel` に残す（ADR-003 補足参照）
  - 残る「作成日 / 更新日 / 公開日 / タグ / バックリンク」を**本文下部用**レイアウトに変更
  - 参考デザインに倣い、(a) バックリンクを `backlinks-inline` 相当のカード一覧 + 件数 + 参照ノート一覧リンク、(b) 作成日 / 更新日 / タグを `mobile-meta`（プロパティ）相当の `meta-row` 群として構成
  - 注: `BacklinkDTO` は `{ noteId, title, slug }` のみで参考デザインの `backlink-snippet`（抜粋）は持たない。カードはタイトルのみ表示し snippet は再現しない（DTO 拡張は別Issue）
  - 本文との分離は `mt-12 pt-6 border-t border-hairline` 等（参考デザインの間隔・ヘアライン準拠）
  - `trashed` バッジは引き続き表示
  - `<dl>`/`<dt>`/`<dd>` のセマンティクスは維持
- **理由:** 「重要度の低い情報は本文下部へ移動」「上部には残さない」要件。

### 4. `NoteDetail` の組み立て順を再構成

- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx`
- **変更内容:**
  - `<header>` 内を「`<NoteBreadcrumb>` → `<h1>`（タイトル）→ `<NoteActions>`（公開状態同居）」の順に
  - `<NoteMetaPanel>` を本文 `dangerouslySetInnerHTML` の **後**（`FrontMatterPanel` と並ぶ下部領域）へ移動
  - `NoteBreadcrumb` に `directoryPath`・`note.directoryId`（`NoteDTO.directoryId` 存在を確認済み）・`note.title` を渡す
  - `NoteMetaPanel` への `directoryPath` 受け渡しを削除
- **理由:** 上部に重要情報のみ・下部に補助情報、という情報設計を組み立て順で実現。データ取得は既存のまま。

### 5. スタイル整合の確認

- **対象ファイル:** 上記コンポーネント群 + 参照 `app/components/common/styles.ts` / `app/styles/tokens.css`
- **変更内容:** 新規に使う色トークン（`text-ink-tertiary`, `border-hairline`, `bg-success-surface` 等）とアイコン（`ChevronRight`）が既存トークン / `lucide-react` で賄えることを確認。新規トークンは追加しない。繰り返すユーティリティ文字列はモジュールスコープ定数へ集約。
- **理由:** utility-first・トークン SSOT の規約遵守。

## 設計判断

詳細は `adr.md` を参照。要点:

- **ADR-001 公開状態の置き場所:** 独立要素として `NoteActions` 内の公開設定リンクに状態チップを内包（状態と導線を1箇所に統合）。
- **ADR-002 パンくずのリンク粒度:** 中間セグメントは非リンク、葉ディレクトリのみ `note.directoryId` でホーム絞り込みリンク化。DTO がセグメント id を持たない制約への妥協点。
- **ADR-003 下部プロパティでの公開状態再掲:** 上部に独立表示する以上、下部プロパティでの重複表示はしない（情報の重複回避）。参考デザインは右レールにも公開を出すが、本実装は上部集約とする。

## リスクと注意点

- `directoryPath === "/"`（ルート直下）でパンくずのセグメントが空になる → フォールバック分岐必須。
- ディレクトリ名・タイトルにユーザー命名文字列が入る → `[overflow-wrap:anywhere]` / `flex-wrap` で長文・特殊文字の折返しを担保。
- `NoteActions` は `"use client"`。公開状態チップは props（`visibility`）由来でクライアント状態追加は不要。SSR で状態色が確定すること。
- `trashed` 時は `NoteActions` が早期 return。公開状態チップは active 時のみ表示し表示崩れを避ける。
- バックリンクの既存リンク（`HOME_SEARCH` + `referencingNoteId`、各 backlink への `to="/notes/$noteId"`）が下部移動後も壊れないこと。
- `NoteMetaPanel` の props 変更（`directoryPath` 削除）は呼び出し元 `NoteDetail.tsx` のみ（grep 確認済み）。typecheck で波及を検出。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。
- ブラウザ（`pnpm dev`）で `/notes/$noteId` を確認:
  - 上部が「パンくず → タイトル → アクション（公開状態チップ + 公開設定リンク）」のみで、本文がすぐ読み始められる
  - 公開状態チップが visibility（public/unlisted/private）ごとに色・ラベルが変わり、クリックで P14 へ遷移
  - 本文の下に「バックリンク」「作成日 / 更新日 / タグ」が表示される
  - ルート直下ノート（`directoryPath === "/"`）でパンくずが破綻せず、「すべてのノート › タイトル」だけになり**葉ディレクトリリンクが出ない**こと
  - 葉ディレクトリリンク（非ルートノート）をクリックするとホームが当該ディレクトリで絞り込まれること
  - `trashed` ノートで上部が「ゴミ箱を開く」のみ、下部メタが崩れない
  - 長いディレクトリ名 / タイトルで折返しが効く（~375px と デスクトップ）
- 既存ユニットテスト（`app/components/note/**/__tests__`）が presentation 変更で壊れないことを `pnpm test:unit` で確認。

## レビュー履歴

### 1周目
**修正した点（要件カバレッジ + アーキ・リスク 両視点）**:
- P-001（両視点一致）: `note.directoryId` は `DirectoryId`（非null）。props 型を `directoryId: string` に修正し、葉リンクの出し分けを `directoryId !== null` ではなく **`directoryPath` のセグメント有無**で判定するよう plan.md ステップ1・ADR-002 を修正。
- P-002: ルート直下ノートでルートディレクトリ id を `directoryId` フィルタに渡さない（葉リンク抑止）方針を明文化。
- P-003: バックリンク段階表示の不採用を ADR-004 として明示記録。スコープ「含まれないもの」にも追記。
- S-001（アーキ視点）: 区切りアイコンは `Icon` ラッパー制約により `size={16}` 採用、11px 非再現を明記。
- S-002（アーキ視点）: `data-[visibility=...]` 値マッチ variant は `aria-[current=page]` の前例あり・Tailwind v4 で機能。3 variant を1定数にまとめる旨を明記。
- S-001（要件視点）: `BacklinkDTO` に snippet が無く、カードはタイトルのみ表示する旨をステップ3に追記。
- S-002（要件視点）: アクションツールバーの間引き・折りたたみをスコープ外に明記。
- S-003（アーキ視点）: ルート直下ノートで葉リンクが出ないことをテスト観点に追加。

**見送った提案**: なし（全指摘を反映）。

### 2周目
**修正した点**:
- P-001（要件視点）: `publishedAt`（公開日）の行き先が未定義だった。下部プロパティに「公開日」行として残す方針を plan.md ステップ3に明記。ADR-003 に「公開状態チップ（再掲しない）と公開日メタ（下部に残す）の区別」を補足。
- S-002（アーキ視点）: `NoteMetaPanel` から未使用になる props（`visibility`）・ヘルパ（`visibilityChipClass`）を定義から削除まで含める旨をステップ3に明記。

**取り込んだ改善提案**:
- S-001（アーキ視点）: branded 型受け渡しの慣習（`as unknown as string`）は実装時に既存箇所へ寄せる（必須でないため実装裁量）。

**アーキ視点**: 問題点ゼロ（1周目修正がすべてコードベースの事実と整合・実装可能と確認）。

### 3周目
**両視点とも問題点ゼロで終了。** load-bearing な前提（`note.directoryId` 非null、`NoteActions` の `公開設定` Link 既存・`trashed` 早期 return、`publishedAt` の現状表示、`Icon` size 制約、値マッチ variant の前例、葉リンクの schema 受理）をコードベースと照合し全整合を確認。

**取り込んだ軽微改善（任意）**:
- 公開状態ドット（装飾）は `aria-hidden` 扱いにして、リンクの状態ラベルと読み上げ重複を避ける（実装時）。

**フォローアップIssue候補（Phase 4 で検討）**: パンくず中間セグメントのリンク化（`getNoteDetail` DTO 拡張）、バックリンク snippet 表示（`BacklinkDTO` 拡張）。
