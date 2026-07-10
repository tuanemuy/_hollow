# 動作確認計画 — Issue #821: 日付整形の TZ 未指定による hydration mismatch を横断修正し共有ヘルパーに集約

**Issue:** #821
**作成日:** 2026-07-10

---

## 確認環境

このIssueの変更（フロントエンドの日付整形の TZ 固定・共有ヘルパー集約）を確認するために必要な手順のみ記載。

### 自動テスト

```bash
pnpm test:unit      # 共有ヘルパー dateFormat の単体テスト（TZ=UTC / Asia/Tokyo で同一出力）を含む
pnpm typecheck      # 型整合（ヘルパー API と各呼び出し側）
pnpm lint:fix && pnpm format
```

TZ 非依存を厳密に確認したい場合、ランナーの TZ を切り替えても `pnpm test:unit` が同一結果になることを確かめる:

```bash
TZ=UTC pnpm test:unit
TZ=Asia/Tokyo pnpm test:unit
```

### 検証環境の起動

初回のみローカル D1 の準備が必要。

```bash
pnpm db:apply:local     # ローカル D1 にマイグレーション適用
pnpm seed:dev-admin     # 管理画面確認用の admin ユーザーをシード
pnpm dev                # vite dev（Cloudflare ランタイム）で開発サーバー起動
```

起動後、表示された URL（通常 `http://localhost:5173`）にブラウザでアクセスする。
ブラウザは JST 以外のタイムゾーン（例: `America/New_York`）に設定した状態でも確認すると mismatch を検出しやすい（OS の TZ 設定を変更、またはブラウザ起動時に `TZ` を指定）。

### デプロイ方法

なし（検証環境のみで確認できる。フロントエンドの表示整形のみの変更で、スキーマ・API 変更なし）。

## 確認項目

### 1. 管理ダッシュボードの日時表示（RSC 経路の UTC 誤表示解消）

- **対応する受け入れ基準:** AC-1 / AC-3（Dashboard）
- **目的:** `formatActivityTime` が JST で描画され、UTC 誤表示にならないことを確認する
- **手順:**
  1. seed した admin でログインし `/admin` を開く
  2. 最近のアクティビティ等の日時表示を確認する
  3. 同じレコードの実時刻（DB の UTC 値 +9h）と表示が一致するか確認する
- **期待結果:** 日時が JST（Asia/Tokyo）で表示される。UTC のままの時刻が出ない
- **確認ポイント:** ブラウザ TZ を非 JST にしても表示が変わらない（サーバー描画値と一致）

### 2. hydration mismatch が発生しないこと（client 経路）

- **対応する受け入れ基準:** AC-1
- **目的:** `"use client"` かつ SSR される各コンポーネントで、SSR 出力とクライアント再描画の日付が一致し、React の hydration 警告が出ないことを確認する
- **手順:**
  1. ブラウザの TZ を JST 以外（例 `America/New_York`）に設定して開発サーバーへアクセス
  2. DevTools コンソールを開いた状態で以下の画面を順に開く:
     - プロフィール編集（ProfileForm: 登録日時・日付）
     - セキュリティ設定（SecurityForm: 日時）
     - 公開設定（PublishSettings: 日時）
     - タグ一覧（TagList: 日付）
     - ノート一覧（listSelectors 経由の日付/年月ラベル）
  3. 各画面で hydration mismatch 警告（"Text content did not match" / "Hydration failed" 等）が出ないか確認する
- **期待結果:** どの画面でもコンソールに hydration mismatch 警告が出ない。日付は JST で表示される
- **確認ポイント:** 特に日付境界（深夜帯のタイムスタンプ）を持つデータで前日/翌日ズレが起きないこと

### 3. ノート系の日時表示

- **対応する受け入れ基準:** AC-1 / AC-3（NoteMetaPanel / 履歴 / Trash）
- **目的:** ノート詳細・履歴・ゴミ箱の日時が JST で一貫表示されることを確認する
- **手順:**
  1. ノート詳細を開き NoteMetaPanel の作成/更新日時を確認
  2. ノート履歴一覧（NoteHistoryList）・履歴詳細（NoteRevisionDetail）の日時を確認
  3. ゴミ箱（TrashList）の削除日時を確認
- **期待結果:** すべて JST・`ja-JP` フォーマットで表示される。履歴の `toLocaleString()` 箇所もロケール・オプション付きの一貫した表示になる
- **確認ポイント:** 履歴2箇所（旧 `toLocaleString()`）は表示フォーマットが `ja-JP` JST 日時に変わる（意図的改善）— 破綻した表示でないこと

### 4. 相対時刻の絶対日付フォールバック

- **対応する受け入れ基準:** AC-1 / AC-3（relativeTime）
- **目的:** `relativeTime.ts` の絶対日付フォールバック（一定期間より古い日時）が JST で表示されることを確認する
- **手順:**
  1. 相対時刻表示を使う画面で、フォールバックが効く十分古い日時のデータを表示する
  2. 絶対日付が JST で表示されるか確認する
- **期待結果:** フォールバック日付が JST・`ja-JP` で表示される

## エッジケース・異常系

### 1. 不正・欠損日時のガード

- **目的:** Dashboard の `Intl.DateTimeFormat().format()` からヘルパー移行に伴う挙動（不正日時の扱い）が破綻しないことを確認する
- **手順:**
  1. 可能なら日時が欠損/不正なレコードを表示する経路を確認する（なければコード上のガードで担保されていることを確認）
- **期待結果:** 例外で画面が壊れず、NaN 等の異常表示にならない

## 既存機能への影響確認

- **CalendarView / PublicNoteViews:** 本Issueの対象外（クライアント解決 TZ を使用 or date-key のローカル整形）。日付グルーピング・カレンダー表示が従来どおり動くことを確認する
- **UsersTable / Jobs（#817 で TZ 固定済み）:** 共有ヘルパーへの集約後も表示が #817 時点と同一（挙動不変）であることを `/admin/users`・`/admin/jobs` で確認する
