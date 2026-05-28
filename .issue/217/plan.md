# 実装計画 — Issue #217: UIのちょこっと修正まとめ（検索アイコン・アップロードボタン重複・取り込みキュー見出し）

**Issue:** #217
**作成日:** 2026-05-29
**複雑度:** 小規模

---

## 目的

ヘッダー・アップロードページ・管理画面で気になっていた細かいUI調整をまとめて入れる。Issue本文の項目1・2は対応済みのため、本Issueでは項目3〜5を扱う。

## スコープ

### 含まれるもの
- アップロードページの `<h2>取り込みキュー</h2>` 見出しを削除する
- 管理画面のヘッダー〜タブ〜コンテンツの縦リズムを `--header-height` / `--space-*` トークンに揃える
- サイドバーの「アップロード」項目を `/upload` への通常リンクに変える（モーダル起動ボタンではなく）
- 上記に対応する `spec/design/pages/` のデザインモック・`spec/pages/index.md` の記述（あれば）を同期する

### 含まれないもの
- 検索アイコン・上部アップロードボタン重複（Issue 上で対応済みと明記済み）
- アップロードモーダル自体のリファクタや動線変更（モーダルはヘッダー／ノート一覧ツールバー側の `UploadButton` で維持）
- IngestionQueue コンポーネント自身の改修

## 実装ステップ

### 1. アップロードページの「取り込みキュー」見出しを削除

- **対象ファイル:** `app/components/ingestion/UploadPage.tsx`
- **変更内容:** `<section className="mt-12"><h2 ...>取り込みキュー</h2><IngestionQueue .../></section>` から `<h2>` を削除する。`<section>` 自体は IngestionQueue とフォームの間の縦リズム維持に必要なので残す（`mt-12` も維持）。
- **理由:** 見出しは実装寄りの語彙で、その下のキュー一覧UI（待機 / 処理中 / 完了 / 失敗の行）を見れば自明、というのが Issue の指摘。

### 2. サイドバーの「アップロード」を `/upload` リンクに変更

- **対象ファイル:** `app/components/layout/Sidebar.tsx`
- **変更内容:** `<UploadButton className={NAV_ITEM}><span>アップロード</span></UploadButton>` を `<Link to="/upload" className={NAV_ITEM} activeProps={ACTIVE_NAV_PROPS}><span>アップロード</span></Link>` に置き換える。`UploadButton` のインポートはサイドバーからは外す（Header / NoteListToolbar は引き続き使用するため UploadButton 本体は削除しない）。
- **理由:** Issue「サイドバーからは取り込みキュー画面（`/upload`）への単純なリンクで良い。モーダルを開く動線はヘッダー／ノート一覧ツールバー側の『アップロード』ボタンに任せる」。

### 3. 管理画面のヘッダー〜タブヘッダーの余白を整える

- **対象ファイル:** `app/routes/admin/route.tsx`
- **変更内容:** 管理画面ヘッダーの `py-[14px] ... max-sm:py-3` を `h-[var(--header-height)]` に置き換える。一般領域のヘッダー（`app/components/layout/styles.ts` の `APP_HEADER`）が `h-[var(--header-height)]` を使っているのと同じ形に揃える。`px-6 / max-sm:px-4` などの水平方向の padding は変更しない。
- **理由:** タブナビが `sticky top-[var(--header-height)]`（= 64px）で固定オフセットされているのに、ヘッダー自体は `py-[14px]` で内容に応じた高さ（実測 50px 程度）になっていたため、スクロール時にタブナビとヘッダーの間に隙間が生じていた。ヘッダー側を `--header-height` に固定すればトークン定義どおりに「ヘッダー → タブ → コンテンツ」の縦リズムが揃う。
- **副次:** errorComponent / notFoundComponent も同じヘッダー定義を使っているので、3 箇所すべて自動的に整う。

### 4. spec/design / spec/pages の同期

- **対象ファイル:**
  - `spec/design/pages/P13-upload.html`（h2 削除に追随する箇所があれば — 確認した限りインライン要約のみなので変更不要の可能性が高い）
  - `spec/design/pages/P40-admin-dashboard.html`〜`P46-admin-jobs.html`（`.header { padding: 14px 24px; ... }` を `height: var(--header-height)` ベースに改める）
  - `spec/pages/index.md`（サイドバーの「アップロード」項目の挙動について記述があれば反映）
- **変更内容:** 実装と同じ意味合いに揃える。`spec-sync` 相当の差分修正。
- **理由:** Issue 末尾「spec/design 配下のデザインファイルと同期させること」。ドキュメントと実装の乖離を残さない。

## 設計判断

技術的トレードオフのある選択肢は特になし（既存のトークン・既存のパターンに寄せるだけ）。ADR には残さない。

## リスクと注意点

- `Sidebar.tsx` での `<UploadButton>` 削除に伴い、`UploadButton` の動的な `data-active`（`#upload` ハッシュ起動時に色がつく）はサイドバーから失われる。これは仕様通り（`/upload` 画面遷移リンクなので、TanStack Router の `activeProps` が「現在 `/upload` を表示中か」をハイライトする）。
- 管理画面ヘッダーを `h-[var(--header-height)]` にすると、内側コンテンツ（ロゴ・「管理者モード」ピル・アバター）が垂直中央寄せのままで高さだけ 64px に固定される。`items-center` は既に付いているので追加対応は不要。
- アップロードページ `<section>` から `<h2>` を抜く際、`mb-4`（見出し下マージン）が消えるため、本文（UploadForm）→ キューの間の余白を `<section className="mt-12">` の `mt-12` だけで賄う。実機で違和感がなければそのまま、強い違和感があれば `mt-12` を `mt-10` 等に微調整。

## テスト方針

- `pnpm dev` で起動し、Issue が指摘した3つの動線を実機で確認する（詳細は `testing.md`）。
- 既存テスト（特に `app/components/ingestion/__tests__/`）は「取り込みキュー」の文字列を期待していないか grep で確認、依存していなければ修正不要。
- `pnpm typecheck && pnpm lint:fix && pnpm format` を最後に通す。
