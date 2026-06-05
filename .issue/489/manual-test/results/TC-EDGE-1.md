# TC-EDGE-1: 不正 id の異常系

**結果: PASS**

Issue #489 で presentation→domain の id 型を string に広げても、不正/存在しない id が握りつぶしや想定外の 500 にならず、従来どおり NotFound 相当の表示になることを確認。3 ステップとも 500 は発生せず、適切な NotFound 表示。

## 実行ログ

| # | ステップ | URL | 結果 | 表示 | スクリーンショット |
|---|---------|-----|------|------|------------------|
| 1 | 存在しないノート id | /notes/01950000-0000-7000-8000-999999999999 | PASS | role=alert「ノートが見つかりません」（document 200、500 なし） | edge-01-note-notfound.png |
| 2 | 存在しないエクスポートジョブ id | /exports/01950000-0000-7000-8000-999999999999 | PASS | role=alert「ジョブが見つかりません」（500 なし） | edge-02-export-notfound.png |
| 3 | 不正形式（非UUID）id | /notes/not-a-uuid | PASS | role=alert「ノートが見つかりません」（500 なし） | edge-03-note-malformed.png |

## 詳細
- **ステップ1**: UUID 形式だが存在しない noteId。usecase 側で対象が見つからず、ルートの errorComponent が NotFound を描画。`<h1 role-内 alert>ノートが見つかりません</h1>`。
- **ステップ2**: 存在しないエクスポートジョブ id。`getExportJob` が NotFound を返し、`ジョブが見つかりません` を描画。
- **ステップ3**: 完全に不正な形式（`not-a-uuid`）の noteId。型を string に広げた後も、value-object 構築の境界で弾かれて握りつぶされず、500 化もせず「ノートが見つかりません」（NotFound 相当）に正しく落ちる。

## ネットワーク確認
- ステップ1 の document GET は `200`（NotFound はページ内 errorComponent として描画される従来仕様。HTTP 500 や白画面ではない）。
- いずれのステップでも 500 レスポンス・未捕捉例外・スタックトレースの露出は観測されなかった。

## 判定理由
本 Issue の核心（id を string に広げても不正/存在しない id が NotFound / 適切なエラーで返り、握りつぶしや 500 化が起きない）を 3 ケースとも満たした。型変更による挙動変化なし。
