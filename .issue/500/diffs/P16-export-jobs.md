# P16-export-jobs 突き合わせ
対応: route=`app/routes/_app/exports/index.tsx`,`exports/$jobId.tsx`, components=[`export/ExportJobsList`,`ExportJobDetail`,`ExportJobsList/Page`,`ExportJobDetail/Page`], styles=[—]

共通シェル付き。SHELL.md A 反映済み。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー shell（アップロード pill 追加 / 新規作成 / placeholder） / 観点:component。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- **ジョブ一覧・詳細のデザイン全体が未実装**。実装 `ExportJobsListView` / `ExportJobDetailView` は className を一切持たない**素の HTML**（`<ul>/<li>/<span>/<button>`、shell も `<main>` 直下のみ）。モックは状態チップ・進捗バー・ダウンロード/キャンセル/詳細アクションを Apple Calm トークンで整えている。
  - 方針2（明らかに未実装）: モックを正に残す。実装側のスタイル適用を別 Issue 化。別Issue化候補:Yes。
  - 実装にある機能（モックと意味整合は取れる）: STATUS_LABEL（待機中/処理中/完了/失敗/キャンセル/期限切れ）、format/scope、進捗 processed/total、作成日、有効期限、ダウンロード/キャンセル/詳細リンク。詳細(ExportJobDetail)は 3 秒ポーリング・失敗ノート ID 一覧・バイト数表示等。
  - 実装が正になった場合に将来モック修正が要る点（現時点未実装ゆえ保留）: 状態ラベル語彙（モックの細分 vs 実装の 6 値）、進捗バー（実装はテキスト processed/total）。

## C. 要判断（曖昧）
- ジョブ詳細を一覧と同一ページ内（モックの展開）にするか別ルート（実装 `/exports/$jobId`）にするか。実装は別ルート。スタイル未実装ゆえ、実装時にどちらへ寄せるか要判断。
