# 実装計画 — Issue #298: rounded グレー背景パネルと Button 背景色が同化している（bg-surface 重複）

**Issue:** #298
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

`rounded` + グレー背景のパネル（カード状領域）と、その上に配置される Button / チップ / 入力欄の背景色が同じトークン (`bg-surface` = #f5f5f7) を使っており、視覚的に同化して境界が消失している箇所を解消する。デフォルト状態（hover 前）でもパネルと内部要素が判別できるようにする。

## スコープ

### 含まれるもの

- 実際に衝突している **3 つのノートパネル**の背景を `bg-surface` → `bg-surface-elevated`（#fbfbfd、tokens.md で「浮上カード」と定義された surface より明るい色）へ昇格する:
  - `app/components/note/editor/FrontMatterEditor.tsx`（パネル内に `pillBtn` 複数・`fieldControl` 入力欄）
  - `app/components/note/detail/NoteMetaPanel.tsx`（パネル内に可視チップ）
  - `app/components/note/detail/FrontMatterPanel.tsx`（パネル内に `bg-surface-hover` 子要素）

### 含まれないもの

- **`pillBtn` 等の共有ボタン定数（`app/components/common/styles.ts`）の変更**: 約 28 ファイル・白ページ上の大多数のボタンが参照しており、デフォルト背景を変えると衝突していない画面に視覚回帰が波及する。本 Issue では触らない（設計判断 ADR-001 参照）。
- **`app/components/admin/DesignTokensForm/index.tsx`**: Issue 本文では影響箇所として挙がっているが、調査の結果 `CARD_CLASS`（L39）は `bg-bg`（白）であり `bg-surface` ではない。白カード上の `bg-surface` ボタンは既に明度差があり**衝突していない**。対応不要（ADR-001 / リスク欄に記録）。
- トークン定義の追加・変更（`tokens.css` / `index.css` / `tokens.md`）: 既存 `bg-surface-elevated` ユーティリティへの付け替えのみで新トークン不要。
- auth の `CALLOUT` / `NOTICE`（`bg-surface` の情報ボックス）: 内部のアクションは `CALLOUT_ACTION`（テキストリンク、`text-accent` + `hover:underline`）で surface 塗りボタンを含まないため衝突なし。スコープ外。

## 実装ステップ

### 1. FrontMatterEditor パネル背景を elevated へ昇格

- **対象ファイル:** `app/components/note/editor/FrontMatterEditor.tsx`
- **変更内容:** L283 のパネル `bg-surface` → `bg-surface-elevated`
- **理由:** パネル(#fbfbfd) と 内部 `pillBtn`/`fieldControl`(#f5f5f7) に明度差が生まれ境界が回復する。`fieldControl` の `focus:bg-bg`(白) とも階調が自然（白 > elevated > surface）。

### 2. NoteMetaPanel パネル背景を elevated へ昇格

- **対象ファイル:** `app/components/note/detail/NoteMetaPanel.tsx`
- **変更内容:** L74 のパネル `bg-surface` → `bg-surface-elevated`。内部の非公開チップ（L69）・タグチップ（L121）は `bg-surface` のまま（変更不要、視覚確認対象）。
- **理由:** パネル内の可視チップとの同化を解消。チップ自体は「タグ/ステータス背景＝surface」の用途に沿う。

### 3. FrontMatterPanel パネル背景を elevated へ昇格

- **対象ファイル:** `app/components/note/detail/FrontMatterPanel.tsx`
- **変更内容:** L83 のパネル `bg-surface` → `bg-surface-elevated`。内部 `ARRAY_ITEM`/`OBJ_DL`（`bg-surface-hover` #ececef）は変更不要（パネルより暗いので差が明確になる）。
- **理由:** 同上。

## 設計判断

詳細は `.issue/298/adr.md` を参照。要約:

- **ADR-001:** 修正方針候補1〜3のうち「候補1の変形 = パネル側を `bg-surface-elevated` へ昇格」を採用。`pillBtn` のデフォルト背景は変更しない（波及最小化＋tokens.md の用途定義整合）。candidate 3（hover をデフォルト化）はインタラクションの affordance を失うため不採用。candidate 2（ボーダー強調）は明度差で十分なため併用しない。

## リスクと注意点

- **波及範囲は 3 ファイルのパネル背景クラスのみ**。共有定数（`pillBtn` 等）は無改変なので全画面ボタンへの波及はない。
- elevated と surface の差は明度約 4%（#fbfbfd vs #f5f5f7）と控えめ。既存の `border-hairline` 併用で境界は担保されるが、低コントラスト環境での見え方はブラウザ確認する。
- 階調は「白(#fff) > elevated(#fbfbfd, パネル) > surface(#f5f5f7, チップ/コントロール) > surface-hover(#ececef, FrontMatterPanel の ARRAY_ITEM/OBJ_DL)」と単調に暗くなり破綻しない。パネルより明るくなる子要素は 3 パネルいずれにも存在しないことを確認済み。
- NoteMetaPanel / FrontMatterPanel 内の `bg-surface` / `bg-surface-hover` 子要素はそのまま。パネルが明るくなることで子要素が相対的に「沈む」見え方になるが意図通り。
- admin DesignTokensForm に手を入れない判断は ADR/本 plan に明記済み（レビュアーの「Issue 記載 4 ファイル中 1 つ未対応」誤判定を防ぐ）。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す（クラス文字列変更のみ）。
- ブラウザ確認（manual-test）:
  - ノート詳細: NoteMetaPanel・FrontMatterPanel とページ白背景・内部チップ/子要素の境界が視認できるか。
  - ノート編集: FrontMatterEditor パネル内の `pillBtn`（「生編集」「キーを追加」「削除」）とパネルの境界がデフォルト状態で判別できるか。`fieldControl` 入力欄もパネルから分離して見えるか、focus時(白)との階調が自然か。
  - 回帰: admin デザイントークン画面（白カード）が従来通りであること、他の白ページ上のボタンに変化が無いこと。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点**: なし（両レビュアーとも問題点ゼロ）

**取り込んだ改善提案**:
- [S-001（要件）/ S-001（アーキ）] 階調が「白 > elevated（パネル）> surface（チップ/コントロール）> surface-hover」と単調に暗くなり破綻しない旨をリスク欄に定量追記。チップ群の視覚的一貫性確認を testing.md のチェック項目に追加。

**見送った提案とその理由**: なし

**確認できた点（レビュアーが実コードで裏取り）**:
- 行番号一致（FrontMatterEditor L283 / NoteMetaPanel L74 / FrontMatterPanel L83）。
- `bg-surface-elevated` は `app/styles/index.css` の `@theme inline` でブリッジ済み・`tokens.css` に `#fbfbfd` 実在、Tailwind クラスとして使用可能。
- admin DesignTokensForm の `CARD_CLASS` は `bg-bg`（白）で衝突なし（ADR-002 妥当）。
- 全 `app/components`・`app/routes` を総当たりした結果、surface 塗りコントロールを内包する `bg-surface` カード状パネルは 3 パネル以外に存在しない（見落としなし）。
- auth CALLOUT/NOTICE は内部アクションがテキストリンク（surface 塗りなし）でスコープ外妥当。
