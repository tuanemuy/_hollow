# Seed Data — Issue #63 (FilterBar 内部リンク参照フィルタの note picker UI)

**作成日:** 2026-05-20
**対象:** `.issue/63/testing.md` のマニュアルテスト用シードデータ

---

## 方針

本 Issue のテストでは「自分のノートが 5 件以上存在し、タイトルにバリエーション（先頭文字違い）があること」が前提。
Issue #8 の seed が既に 10 件のノート（test-user-001 所有）を投入済みなので、それを**前提として再利用**し、本 Issue では追加で **タイトル先頭文字が多様な公開ノート 8 件 + 内部リンク 1 本**だけを **追記** する。

シードは `INSERT OR IGNORE` で書かれているため、何度実行しても既存データを壊さない。

---

## テストユーザー（既存）

| key | value |
|---|---|
| user id | `01938f00-0000-7000-8000-000000000001` |
| email | `test-user-001@example.com` |
| password | `TestPassword123!` |
| username | `test-user-001` |
| displayName | `テストユーザー001` |
| role | `member` |
| email_verified | `1`（true） |

ログイン手順:
1. `http://localhost:5173/login` にアクセス
2. 上記 email / password を入力してログイン
3. ホーム `/`（P10 ノート一覧）にリダイレクトされる

---

## 投入したノート（Issue #63 追加分）

すべて `Inbox`（`01938f00-0000-7000-8000-0000000000d1`）配下、`status='active'`、`visibility='public'`。
タイトル先頭文字が多様（平仮名 / 片仮名 / 漢字 / ASCII）になるように選定。

| note id (末尾) | title | 先頭文字 | 用途 |
|---|---|---|---|
| `...6301` | あしたのミーティング準備 | 「あ」 | 平仮名 picker 検索 |
| `...6302` | アーキテクチャ概観 | 「ア」 | 片仮名 picker 検索 |
| `...6303` | いいねと思ったアイデア集 | 「い」 | 平仮名 別文字 |
| `...6304` | 日誌 2026 年 5 月 | 「日」 | 漢字 picker 検索 |
| `...6305` | ノートテンプレート集 | 「ノ」 | 内部リンクの参照元（→ 公開デザインガイド） |
| `...6306` | Hello, world ノート | 「H」 | ASCII picker 検索 |
| `...6307` | Today summary 2026-05-19 | 「T」 | ASCII picker 検索 |
| `...6308` | Zzz_test_note 番外編 | 「Z」 | 0 件ヒットの近接ケース（`Zzzzz` で 0 件確認） |

### 既存の Issue #8 ノート（参考）

Issue #8 シードで既に投入されている test-user-001 所有のノート 10 件（タイトル抜粋）:

| note id (末尾) | title | 公開状態 |
|---|---|---|
| `...b071` | Weekly planning ノート | private |
| `...b072` | ブレインストーミング | private |
| `...b073` | Project A キックオフ | private |
| `...b074` | Project A デザインメモ | unlisted |
| `...b075` | Project B レビュー記録 | private |
| `...b076` | 5 月定例ミーティング | private |
| `...b077` | Reading list | private |
| `...b078` | Q1 ふりかえり | private |
| `...b079` | **公開デザインガイド** | **public** |
| `...b07a` | 今日のタスク | private |

このうち `...b079`（公開デザインガイド）は Issue #63 の `note-templates`（`...6305`）からも参照される。

---

## 投入した内部リンク（`note_internal_links`）

| id (末尾) | from_note_id | ref_target | resolved_note_id |
|---|---|---|---|
| `...63a1` | `...6305`（ノートテンプレート集） | `公開デザインガイド` | `...b079`（公開デザインガイド） |

加えて Issue #8 seed で投入済みの内部リンク 4 本がそのまま使える:
- `...l1`: N1 (Weekly planning) → N9 (公開デザインガイド)
- `...l2`: N1 (Weekly planning) → N3 (Project A キックオフ)
- `...l3`: N3 (Project A キックオフ) → N5 (Project B レビュー記録)
- `...l4`: N9 (公開デザインガイド) → N4 (Project A デザインメモ)

picker から「公開デザインガイド」を選んだ場合、`referencingNoteId=...b079` の絞り込み結果は **2 件**（Issue #8 N1 + Issue #63 N15）になる。

---

## テストケースとシードの対応表

| testing.md 項目 | picker 入力例 | 期待結果 |
|---|---|---|
| 2. picker を開いて入力 → 候補表示 | `あ` | `あしたのミーティング準備` が 1 件ヒット |
| 2. picker を開いて入力 → 候補表示 | `ア` | `アーキテクチャ概観` が 1 件ヒット |
| 2. picker を開いて入力 → 候補表示 | `い` | `いいねと思ったアイデア集` が 1 件ヒット |
| 2. picker を開いて入力 → 候補表示 | `日` | `日誌 2026 年 5 月` が 1 件ヒット |
| 2. picker を開いて入力 → 候補表示 | `H` | `Hello, world ノート` が 1 件ヒット |
| 2. picker を開いて入力 → 候補表示 | `T` | `Today summary 2026-05-19` が 1 件ヒット |
| 2. picker を開いて入力 → 候補表示 | `Z` | `Zzz_test_note 番外編` が 1 件ヒット |
| 2. picker を開いて入力 → 候補表示 | `P` | `Project A キックオフ` / `Project A デザインメモ` / `Project B レビュー記録` の 3 件ヒット（Issue #8 既存） |
| 2. 連続入力で single-flight | `あし`（1文字ずつ） | リクエストは debounce 後 1 回に集約 |
| 5. 候補選択 → chip 化 | 「公開デザインガイド」を選択 | `?referencingNoteId=...b079&page=1` に遷移、絞り込み結果は **2 件**（N1, N15） |
| 6. ブラウザ戻る・進む | A→B 選択して戻る | A の chip / 一覧に戻る |
| エッジ 1. 空クエリ | 何も入力しない | fetch されず listbox 描画なし |
| エッジ 2. 0 件ヒット | `Zzzzz` | `該当するノートが見つかりません` の文言 |

---

## DB 状態サマリ

| 項目 | 件数 |
|---|---|
| 該当ユーザの **全** notes 件数 | 28 件（Issue #8 の 10 件 + Issue #55 の 10 件 + 本 Issue の 8 件） |
| 該当ユーザの **公開** notes 件数 | 9 件（Issue #8 N9 + Issue #63 8 件） |
| Issue #63 追加 publication_states | 8 件（すべて public） |
| Issue #63 追加 search_documents | 8 件 |
| Issue #63 追加 note_internal_links | 1 本 |

「自分のノートが少なくとも 5 件以上」「タイトル先頭文字のバリエーション」「`referencingNoteId` フィルタの動作確認に使える内部リンク」という testing.md の前提条件をすべて満たす。

---

## 投入コマンド

```bash
# 1. （未適用なら）D1 ローカルマイグレーション適用
pnpm db:apply:local

# 2. Issue #8 ベースシード（test-user-001 と 10 件のノート）。
#    既にユーザが存在する状態なら **このステップは飛ばしてよい**。
#    （Issue #8 シードは DELETE FROM users から始まるため、search_documents 等の
#     副作用を意識する必要があるので、初回適用直後の素のローカル DB に対して
#     使うのが安全。本 Issue では既存セッションを尊重し、追加シードのみ流す。）
pnpm db:execute:local .issue/8/manual-test/seed.sql

# 3. Issue #63 追加シード（本ファイル）
pnpm db:execute:local .issue/63/.manual-test/seed.sql
```

> 本 Issue のシードは `INSERT OR IGNORE` のみで構成されているため、何度実行しても安全。
> 既存ユーザ・既存ノートを書き換えない。

### 投入結果の確認（参考）

```bash
D1=$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -name '*.sqlite' -not -name 'metadata*')

# Issue #63 追加ノート 8 件
sqlite3 -header -column "$D1" \
  "SELECT id, title FROM notes
     WHERE owner_id='01938f00-0000-7000-8000-000000000001'
       AND id LIKE '01938f00-0000-7000-8000-0000000063%'
     ORDER BY id;"

# 公開ノート件数
sqlite3 "$D1" \
  "SELECT COUNT(*) FROM publication_states
     WHERE owner_id='01938f00-0000-7000-8000-000000000001'
       AND visibility='public';"

# 追加した内部リンク
sqlite3 -header -column "$D1" \
  "SELECT from_note_id, ref_target, resolved_note_id FROM note_internal_links
     WHERE id LIKE '01938f00-0000-7000-8000-0000000063%';"
```

---

## クリーンアップ（任意）

Issue #63 投入分を完全に巻き戻したい場合のみ実行:

```bash
D1=$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -name '*.sqlite' -not -name 'metadata*')
sqlite3 "$D1" <<'SQL'
DELETE FROM note_internal_links
  WHERE id LIKE '01938f00-0000-7000-8000-0000000063%';
DELETE FROM search_documents
  WHERE note_id LIKE '01938f00-0000-7000-8000-0000000063%';
DELETE FROM publication_states
  WHERE note_id LIKE '01938f00-0000-7000-8000-0000000063%';
DELETE FROM notes
  WHERE id LIKE '01938f00-0000-7000-8000-0000000063%';
SQL
```

`notes` 行を削除すれば FK CASCADE で `note_internal_links` / `publication_states` / `search_documents` は自動的に消えるが、
明示的に DELETE しておくことで、削除順 / FTS トリガーの相互作用に依存しない安全な巻き戻しになる。

---

## 既知の制約・補足

- **picker の検索ロジック**: 「タイトル先頭一致」前提で投入してある。中間一致や曖昧一致が必要なケースが追加された場合はノートを増やす。
- **タグの紐付けは省略**: 本 Issue は picker（内部リンク参照フィルタ）の UI 検証なので、追加ノートにはタグを付けていない（既存 Issue #8 ノートのタグは温存）。
- **Issue #55 の追加データ**との競合は無し（タグ系の `01938f00-...-0055xx` と本 Issue の `01938f00-...-0063xx` は重ならない）。
- **認証手段**: better-auth の credential プロバイダによる email + password ベース。Cookie ベースのセッション。Issue #8 / Issue #55 と同じ。
