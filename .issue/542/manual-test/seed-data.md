# Manual-test シードデータ — Issue #542（領域3: ゴミ箱 / タグ管理 / 公開設定）

`.issue/542/testing.md` のブラウザ検証（P17 / P18 / P14）に必要なローカル D1 のシードデータを整備した記録。

## 実行した準備作業（コマンド）

```
pnpm db:apply:local          # ローカル D1 にマイグレーション適用（既適用済みで "No migrations to apply"）
pnpm seed:dev-admin          # ログイン可能な admin ユーザー + セッションを投入
pnpm db:execute:local .issue/542/manual-test/seed.sql   # P17/P18/P14 用の追加データを投入
```

検証時の起動: `pnpm dev`（Cloudflare ランタイム / vite dev）。表示された `http://localhost:<port>` を開く。

すべてのテストデータは **dev-admin ユーザー**（`pnpm seed:dev-admin` が作る user id `01950000-0000-7000-8000-000000000001`）が所有する。ログインすればそのまま `/trash` `/tags` 各ノートの公開設定モーダルに表示される。新規行の id は `01950542-...` プレフィックスで、クリーンアップは id 直指定なので本番/他テストのデータには触れない。seed.sql は冪等（再実行可）。

## テストで使うアカウント

- **メール:** `dev-admin@example.com`
- **ユーザー名:** `dev-admin`
- **ロール:** admin（active）
- **セッショントークン（raw）:** `dev-admin-session-token`

### ログイン手順

このプロジェクトのセッションは raw トークンをそのまま突合する（`D1SessionService.resolve`）。Cookie 名は `__Host-session`（Secure 限定のため `document.cookie` では設定不可。CDP 経由で注入する）。

agent-browser を使う場合:

```
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

その後の確認 URL:
- ゴミ箱（P17）: `http://localhost:<port>/trash`
- タグ管理（P18）: `http://localhost:<port>/tags`
- 公開設定（P14）: 各ノート詳細から公開設定モーダルを開く（下記ノート参照）

## 投入したシードデータの概要

| テーブル | 件数（dev-admin 所有） | 主な内容 |
|---|---|---|
| directories | 3（root + Notes + Archive） | dev-admin にはディレクトリが無かったので作成。root は name=''/slug=''/depth=0 |
| notes (active) | 5 | 公開設定・タグ付け用 |
| notes (trashed) | 4 | ゴミ箱（P17）用。`status='trashed'` + `trashed_at` |
| tags | 6 | 件数 4/2/2/1/1/0 のばらつき |
| note_tags | 10 | 上記の件数を構成 |
| publication_states | 5 | public 2 / unlisted 1 / private 2 |
| share_links | 2 | いずれも note 31 に紐付く。last_accessed あり/なし各 1 |

## ゴミ箱（P17）— 4 件のゴミ箱ノート

`status='trashed'`、`trashed_at`（削除日）がそれぞれ異なる。抜粋は `content_html` から生成される。

| タイトル | 削除日 | 備考 |
|---|---|---|
| [MT542] 古いメモ | 2026-06-05 | 短いタイトル。完全削除ダイアログの「対象名」確認用 |
| [MT542] とても長いタイトルのノート — レイアウトが崩れないか…（以下略） | 2026-06-01 | **長いタイトル + 長い抜粋**。一覧の折り返し/省略検証用 |
| [MT542] アーカイブ済みノート | 2026-05-28 | `archived` タグ付き |
| [MT542] 廃止した仕様メモ | 2026-05-10 | **最古**の削除日。復元（回帰確認）の対象に適する |

テストで見るポイント:
- サブタイトル「{件数} 件のノートがゴミ箱にあります。」+ 保存期間案内カード（P17 確認項目1）
- 任意ノートの「完全に削除」→ 赤アラートに上記タイトルが対象名として出る（確認項目2）
- 「復元」で一覧から消える（確認項目3）

## タグ管理（P18）— 件数の異なる 6 タグ

| タグ名 | ノート数 | 用途 |
|---|---|---|
| frontend | 4 | 高件数。統合先候補として目立つ |
| llm | 2 | |
| design | 2 | |
| bug | 1 | |
| archived | 1 | ゴミ箱ノートに付与（trashed でも note_tags は件数に入る） |
| unused | 0 | **件数 0** のタグ。リネーム/統合/削除の挙動確認用 |

テストで見るポイント:
- hover/focus でアクション出現、狭幅でケバブ畳み + 件数（tag-count）非表示（確認項目4）
- ボタンのサイズ/バリアント（確認項目5）
- inline rename の見出し「#{name} をリネーム（{件数} 件のノートに反映）」+ accent-surface 背景（確認項目6）
- 統合ダイアログ（確認項目7）。統合先 select に他タグが並ぶ

### 「統合候補ゼロ」のタグについて（制約）

実装上、統合候補は `all.filter(t => t.id !== self)`（`TagList.tsx`）= **自分以外の全タグ**。よって複数タグがある間は、件数 0 の `unused` タグであっても統合候補は存在し「統合」項目は表示される。`candidates.length === 0`（統合項目が出ない）状態はアカウントにタグが 1 個だけのときに限り発生するため、件数ばらつきの本シードとは同時に成立しない。candidate ゼロ表示を確認したい場合は、一時的にタグを 1 個だけ残した別アカウント/状態で検証する必要がある。

## 公開設定（P14）

### 可視性の異なるノート

| タイトル | visibility | 備考 |
|---|---|---|
| [MT542] 公開ロードマップ | public | 「公開」選択 → 公開 URL プレビュー（`/u/dev-admin/<slug>`）確認用 |
| [MT542] タグ付きノート B | public | |
| [MT542] 限定公開リンク検証ノート | unlisted | **共有リンク 2 本発行済み**（下記） |
| [MT542] 非公開の下書き | private | 非公開ラジオ選択済みの確認用 |
| [MT542] タグ付きノート A | private | |

### 限定公開リンク（[MT542] 限定公開リンク検証ノート に 2 本）

| link id 末尾 | status | last_accessed_at | テストで見るもの |
|---|---|---|---|
| ...000060 | active | 2026-06-04T16:20 | 有効チップ + **最終アクセス表示あり**（`ml-auto` 右寄せ）+ URL 行 + コピー |
| ...000061 | active | NULL | **最終アクセス非表示**（未アクセス）の link-card |

リンク URL は所有者向け DTO が link id から組み立てるため（`listShareLinks` / `toShareLinkDTOFromId`）、`token_hash` は一意なダミー値で問題ない（実到達リンクは不要）。

テストで見るポイント:
- ラジオ各種に説明文、public 選択時に公開 URL プレビュー（確認項目8）
- link-card レイアウト・最終アクセス（非 null のみ表示）・コピー（確認項目9）

## 投入後の確認（実行済み）

`pnpm db:execute:local` の各ステートメント success=true。SELECT で件数確認済み:
- trashed notes: 4 / active notes: 5
- tags: frontend=4, llm=2, design=2, bug=1, archived=1, unused=0
- publication: public=2, unlisted=1, private=2
- share_links: 2（うち last_accessed あり=1, なし=1）

## 問題点 / 注意

- 「統合候補ゼロ」のタグは本シードと同時には成立しない（上記「制約」参照）。これは仕様（候補=他タグ全件）によるもので、データ不備ではない。
- ローカル D1 のみを操作。本番/ステージングには一切触れていない。
