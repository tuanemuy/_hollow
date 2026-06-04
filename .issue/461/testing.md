# 動作確認計画 — Issue #461: UIコントロール寸法のばらつき横断見直し

**Issue:** #461
**作成日:** 2026-06-04

---

## 確認環境

このIssueの変更（Tailwind utility / トークンの寸法調整）を確認するために必要な手順のみ記載。純粋な presentation 層の見た目変更で、ロジック・DB スキーマは不変。

### 検証環境の起動

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（初回または未適用時のみ）
pnpm seed:dev-admin   # dev 用 admin ユーザー＋セッション投入（admin 画面確認時）
pnpm dev          # Cloudflare runtime ローカル開発サーバー起動
```

admin 画面は認証必須。agent-browser での認証付き検証はメモリ `browser-verify-authed-routes` に従う（sessions テーブルへ生トークン直挿し＋`eval document.cookie` で `__Host-session` 注入）。`pnpm seed:dev-admin` の出力トークンを利用する。

### デプロイ方法

なし（検証環境のみで確認できる純粋な UI リファクタ）。

## 確認項目

本Issueの核心は「意図的差は維持・偶発差を統一」。**変わるべき箇所が変わり、変わってはいけない箇所（意図的差）が変わっていない**ことの両方を確認する。

### 1. `text-[13px]` → `text-sm` 統合（視覚値維持）

- **目的:** 56箇所/32ファイルの `text-[13px]` を `text-sm` に置換後、デスクトップ幅でフォントサイズが13px相当のまま維持されること
- **手順:**
  1. ノート一覧/詳細・フォームのラベル（fieldLabel）・エラー文言（formError）・各種メタ表示を開く
  2. DevTools で computed font-size を確認（デスクトップ幅で ~13px）
  3. ビューポートを sm 未満（〜639px）に縮め、12px へ fluid に縮むことを確認
- **期待結果:** デスクトップで13px相当を維持。小画面で12pxへ縮むが可読性・レイアウト崩れなし
- **確認ポイント:** `public/styles.ts` の `NOTE_DATE`（旧 `text-[13px] max-sm:text-xs`）が `text-sm` 一本になり、冗長な `max-sm:text-xs` が消えていること。小画面で文字が窮屈になって折り返し/はみ出しを起こす箇所がないか

### 2. `fieldControl` / admin 入力欄の高さ統一（40px）

- **目的:** 標準フォーム `fieldControl` と admin 入力（`FIELD_INPUT` / 3 Form / UsersTable検索）が h-10（40px）に揃うこと
- **手順:**
  1. ノート編集の FrontMatter 入力・ディレクトリ作成等の標準フォームを開く
  2. admin の Prompts/DesignTokens/LLMSettings フォーム、ユーザー検索入力、タグ作成（CreateTagForm）を開く
  3. 各 input の computed height を確認
- **期待結果:** input の高さが 40px に統一。プレースホルダー/入力テキストが縦中央付近に収まる
- **確認ポイント:** 現状 ~42px から約2px縮むため、テキストが上下に偏っていないか。崩れていれば `h-11` へ切替判断

### 3. textarea が壊れていないこと（P-001 検証）

- **目的:** `fieldControl` に `h-10` を足しても textarea 合成（`${fieldControl} ${fieldTextarea}` 等）で縦paddingが消えないこと
- **手順:**
  1. ノート本文エディタ（HtmlEditor）・FrontMatterEditor の textarea、取り込みプレビュー（IngestionPreviewForm）、アップロードダイアログ（UploadDialog）の textarea を開く
  2. テキストを入力し、上辺への貼り付きがないか確認
- **期待結果:** textarea は `min-h-[*]` の高さを保ち、上下に `py-2.5` 相当の padding が残る。テキストが上辺に貼り付かない
- **確認ポイント:** `min-h-[320px]` / `min-h-[140px]` / `min-h-[96px]` の各 textarea で高さが潰れていないか

### 4. アイコンボタンの角丸統一（rounded-pill）

- **目的:** 独立 icon-only ボタン（`ICON_BTN` / `dialogCloseButton` / `EDITOR_TOOLBAR_BTN`）が `rounded-pill` に統一されても正方形なので真円のまま視覚不変
- **手順:**
  1. ヘッダーのアイコンボタン、ダイアログの×閉じるボタン、エディタツールバーボタンを確認
  2. 各ボタンが真円（正方形 w-9/w-8 に円形）を保つか確認
- **期待結果:** 視覚は完全に不変（pill も full も正方形では同じ真円）
- **確認ポイント:** `MENU_BTN` / tree action の `rounded-md`（角付き）は**現状維持**で円形化していないこと。アバター容器・chip内の×削除ボタン（`w-4 h-4 rounded-full`）は `rounded-full` のまま

### 5. FilterBar チップ・小型入力の統一

- **目的:** FilterBar の CHIP `h-[30px]` → h-7、`gap-[5px]` → gap-1.5、小型入力/セレクト `h-[30px]` → h-7 の統一
- **手順:**
  1. ノート一覧の FilterBar（タグチップ・フィルタ入力・タグ操作セレクト）を開く
  2. チップの高さ・アイコン間隔、入力/セレクトの高さを確認
- **期待結果:** チップと小型入力が h-7（28px）で密度統一。gap が 6px に
- **確認ポイント:** 30px→28px の -2px・gap +1px でレイアウトが詰まりすぎないか。チップ内テキスト/×が窮屈になっていないか

### 6. BulkActionBar の寸法解消

- **目的:** 一括操作バーの独自 `h-8` / `text-[13px]` / `gap-[5px]` が原型/標準値に寄ったこと
- **手順:** ノート一覧で複数選択し一括操作バーを表示、ボタン高さ・文字サイズ・間隔を確認
- **期待結果:** 標準スケールの寸法でバーが表示され、操作ボタンが従来どおり機能
- **確認ポイント:** ボタンが極端に小さく/大きくなっていないか

## エッジケース・異常系

### 1. 意図的差の維持（最重要・回帰防止）

- **目的:** 「変えてはいけない」意図的差が維持されていること
- **手順:**
  1. auth（ログイン/登録）の入力欄（h-11）
  2. public のセキュリティゲート入力（h-11）・検索ヒーロー入力（h-12）
  3. admin の高密度ボタン（pillBtnSm h-7）・テーブル
- **期待結果:** これらの大型/高密度寸法が**変わっていない**こと
- **確認ポイント:** 機械的統一でこれらが標準サイズに潰れていないか（潰れていたらリグレッション）

### 2. モバイル幅でのタップ下限

- **目的:** icon ボタンのタップ床（`max-sm:min-h-[44px]` 等）が角丸変更後も残ること
- **手順:** ビューポートを sm 未満にして項目4のアイコンボタンを再確認
- **期待結果:** タップ領域 44px が維持

## 既存機能への影響確認

- すべて className / トークンの寸法変更のみで、onClick・遷移・フォーム送信ハンドラは不変。各コントロール（ボタン押下・フィルタ適用・フォーム送信・チップ削除）が従来どおり動作することを確認
- `app/styles/tokens.css` を触る場合、`pnpm test:unit`（特に `adminSettings/defaults.test.ts` の tokens.css 照合）がパスすること。なお typography scale は管理画面上書き対象外なので `defaults.ts` は触らない

## 確認チェックリスト

- [ ] `text-[13px]`→`text-sm` 置換後、デスクトップで13px相当を維持・小画面で崩れなし
- [ ] 冗長な `max-sm:text-xs`（public NOTE_DATE）が掃除されている
- [ ] `fieldControl` / admin 入力が 40px に統一・縦位置OK
- [ ] textarea（HtmlEditor/FrontMatter/IngestionPreview/UploadDialog）が潰れず padding 維持
- [ ] icon-only ボタンが `rounded-pill` で視覚不変・`MENU_BTN`/tree は rounded-md 維持
- [ ] FilterBar チップ・小型入力が h-7 / gap-1.5 に統一
- [ ] BulkActionBar の独自寸法が解消
- [ ] **意図的差（auth/public h-11/h-12、admin 高密度）が維持されている**
- [ ] モバイル幅で icon ボタンのタップ床 44px が残る
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` パス
- [ ] `pnpm test:unit` パス（tokens.css 照合含む）
- [ ] 各コントロールの機能（押下・フィルタ・送信・削除）が従来どおり
