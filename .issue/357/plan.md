# 実装計画 — Issue #357: サイドバー/左ナビ整理

**Issue:** #357
**作成日:** 2026-05-31
**複雑度:** 小規模（フロントエンド3点の局所変更）

---

## 目的

左サイドバー周りの UI 問題を整理する。具体的には (1) ディレクトリツリーのハイライト幅統一、(2) ライブラリ/管理ナビの spec 準拠化、(3) ディレクトリ空状態の文言短縮。

> **タグ件数バグ（旧やること4）は #365 に切り出し済み。** 調査の結果、件数列 `tags.note_count` を更新する配線が全 usecase で欠落しているのが根本原因と判明。修正方式を多観点（単一真実源・整合性・責務分離・並行性・進化耐性・インフラコスト）で比較し、read-time 集計方式（Option B）で別 Issue #365 にて対応する。経緯は adr.md ADR-001 参照。

## スコープ

### 含まれるもの
1. ディレクトリツリー treeitem のハイライトを行全体で統一（選択時・ホバー時で幅を揃える）
2. サイドバーのライブラリ/管理セクションを `spec/pages/index.md` L22-24 の導線（保存ビュー / タグ管理 / ゴミ箱 / エクスポートジョブ）に沿って再編
3. ディレクトリ空状態文言の簡潔化

### 含まれないもの
- **タグ件数バグの修正** → #365 で対応
- サイドバーのモバイル表示（縦積み問題）→ #354 で対応
- 保存ビュー/エクスポートジョブ画面そのものの機能改修（サイドバーへのリンク追加のみ）

---

## 調査結果

### あるべきアーキテクチャ（spec / CLAUDE.md）
- `spec/pages/index.md:22-24` 「サイドバー: 個人領域のみ常駐。ディレクトリツリー / **保存ビューへのショートカット** / **タグ管理・ゴミ箱・エクスポートジョブへのリンク**」。
- CLAUDE.md スタイル規約: Tailwind utility-first、`data-*` 属性＋variant、ハードコード CSS 不可、トークン経由、繰り返す utility 文字列は module-scope 定数へ集約（`styles.ts`）。

### 関連ファイル
- `app/components/directory/styles.ts` — `TREE_ITEM_ROW`(L11) はホバーを行ラッパー全体に、`TREE_ITEM_LINK`(L23) は選択ハイライト(`data-[active]:bg-surface` / `aria-[current=page]:bg-surface`)を `flex-1` の Link のみに適用 → **ハイライト幅不一致の直接原因**。
- `app/components/directory/DirectoryTree.tsx` — 空状態文言（L109-112 付近「まだディレクトリがありません。右上の + から作成できます。」）、treeitem 描画（L287-337 付近、row div が active Link を直接内包。rename 中は Link 非表示）。
- `app/components/layout/Sidebar.tsx` — ライブラリ(L27-42)=「すべてのノート」のみ / 管理(L46-78)=タグ・ゴミ箱・アップロード。
- `app/components/layout/styles.ts` — `NAV_ITEM` 等。
- `app/components/auth/links.ts` — `HOME_SEARCH` / `TRASH_SEARCH` 等の検索デフォルト。
- ルート実在確認済み: `/views`（保存ビュー, search は `kind` で `.catch("personal")`）, `/exports`（エクスポートジョブ, search は `offset` で `.catch(0)`）, `/tags`, `/trash`, `/upload`。**いずれも必須 search パラメータ無し → bare リンク（`to` のみ）で動作する**。

### #302 の確認結果
- #302 は空状態カード内 CTA ボタン削除＋見出し横 `+` への一次アクション統一が主眼。**CTA ボタンは既に削除済み**で機能リグレッションは無い。残る課題は「文言が長い」点のみ。本Issueで簡潔化して決着。

---

## 実装ステップ

### 1. ディレクトリツリーのハイライト統一

- **対象ファイル:** `app/components/directory/styles.ts`（必要なら `DirectoryTree.tsx`）
- **変更内容:** 選択ハイライトの塗り対象を `TREE_ITEM_LINK`（`flex-1` の Link のみ）から行ラッパー `TREE_ITEM_ROW` に移す。
  - `TREE_ITEM_ROW` に Tailwind `:has()` バリアント `has-[a[data-active]]:bg-surface` / `has-[a[aria-current=page]]:bg-surface` を付与し、ホバー(`hover:bg-surface`)と同じ行ボックスを選択時にも塗る。`a[...]` のタグ修飾で disclosure button の `data-open` 等を誤検知しないようにする。
  - `TREE_ITEM_LINK` 側からは背景の選択スタイル（`data-[active]:bg-surface` / `aria-[current=page]:bg-surface`）を外す。太字等の文字装飾（`data-[active]:font-medium` 等）は Link に残す。
- **理由:** ホバー（行全体）と選択（Link のみ＝caret 列・action 列を欠く）でハイライト幅が異なる Issue の直接原因を、塗り対象を行ラッパーに一本化して解消する。`activeProps` は Link にしか付かないため、`:has()` で行ラッパーが子 Link の選択状態を検知する方式を採る（adr.md ADR-002）。
- **注意:** ハイライト統一の対象は **DirectoryTree のみ**。`Sidebar.tsx` の `NAV_ITEM`（ライブラリ/管理リンク）は行ラッパー構造が異なり、本変更は波及しない。

### 2. ライブラリ/管理ナビの spec 準拠化

- **対象ファイル:** `app/components/layout/Sidebar.tsx`（必要に応じ `app/components/layout/styles.ts`）
- **変更内容:** spec L22-24 の導線に沿って再編する。
  - **ライブラリ（閲覧系）:** 「すべてのノート」(`/`) ＋「保存ビュー」(`/views`)
  - **（ディレクトリツリー section はそのまま）**
  - **管理:** 「タグ」(`/tags`) ＋「ゴミ箱」(`/trash`) ＋「エクスポートジョブ」(`/exports`) ＋「アップロード」(`/upload`)
  - 各リンクは既存 `NAV_ITEM` / `ACTIVE_NAV_PROPS` パターンを踏襲。`/views`・`/exports` は必須 search パラメータが無いため `to` のみの bare リンクでよい（存在しない `search` キーは渡さない）。
- **理由:** 「すべてのノート」1件しかなく意図不明だった「ライブラリ」に保存ビューを足して閲覧導線として意味を持たせ、管理にエクスポートジョブを足して spec のサイドバー定義を満たす。

### 3. ディレクトリ空状態の文言短縮

- **対象ファイル:** `app/components/directory/DirectoryTree.tsx`（L109-112 付近）
- **変更内容:** 「まだディレクトリがありません。右上の + から作成できます。」を「ディレクトリがありません」程度へ短縮。作成導線は #302 の決定どおり見出し横 `+` ボタン（`aria-label`）に委ねる。
- **理由:** Issue「文言が長い」＋ #302 が残した「補強は実装時判断」の宿題を簡潔化で決着。

---

## 設計判断

- **ADR-001（参考・別Issue）:** タグ件数の修正方式比較と read-time 集計（Option B）採用の経緯。実装は #365。
- **ADR-002:** ディレクトリツリーのハイライト統一を Tailwind `:has()` バリアントで行ラッパーに塗る方式。
- 詳細は `.issue/357/adr.md` 参照。

## リスクと注意点

- **`:has()`:** Tailwind v4 でネイティブ対応。選択かつホバー時に色が衝突しないよう同一 `bg-surface` を使う。`has-[a[...]]` のタグ修飾で disclosure button 等の誤検知を避ける。
- **rename 中の状態:** treeitem の rename 中は Link が非表示になるため `:has-[a[data-active]]` がマッチせず行ハイライトも消える（編集中は選択ハイライト不要なので許容）。
- **デッドリンク回避:** `/views`・`/exports` のルート実在・必須パラメータ無しは確認済み。
- CLAUDE.md 作法（`data-*`＋variant、ハードコード CSS 不可、トークン経由、変更後 `pnpm typecheck && pnpm lint:fix && pnpm format`）を順守。

## テスト方針

- **手動（ブラウザ）:** `pnpm dev` でサイドバーを確認 — (1) ディレクトリを選択した行とホバー行のハイライト幅が一致、(2) ライブラリ/管理ナビが spec 準拠の意味ある構成・各リンクが正しく遷移、(3) 空状態（ディレクトリ0件）の文言が簡潔。
- 本Issueはフロント表示のみの変更で自動テスト追加は不要（タグ件数の integration test は #365 で対応）。

---

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスクの2視点）
- **方式の根本見直し（最重要）:** 両レビュアーがタグ件数修正の維持列方式（旧 ADR-001）に多数の漏れ・矛盾を指摘 — (a)「trashNote」usecase は存在せず実体は `deleteNote`、(b) duplicateNote / restoreNoteRevision / deleteDirectory 一括trash など件数に影響する経路の漏れ、(c) 既存 mergeTags は status フィルタなしで集計しており「active基準」前提が事実に反する、(d) 新規タグの pending 読み取り問題、(e) OCC のタグ単位1回save。これらを受けてユーザーと修正方式を多観点比較し、**タグ件数バグは read-time 集計方式で #365 に切り出し**、本Issueはフロント3点に scope を絞ることを決定。
- **反映した改善提案:** `/views` は `kind`・`/exports` は `offset` で `.catch()` 付き＝必須パラメータ無しのため bare リンクでよい（S-002）。ハイライト統一は DirectoryTree のみで Sidebar ナビには波及しない（S-003）。これらを実装ステップ・注意点に反映。
- **据え置き:** なし（タグ件数関連の指摘は #365 へ移管）。
