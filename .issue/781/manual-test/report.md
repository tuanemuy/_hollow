# ブラウザ検証レポート — Issue #781

**実行日時**: 2026-06-27 04:23
**Issue**: #781 — データ駆動 RSC ルートの roving radiogroup で連続矢印キー時にフォーカスが脱落する（#776 follow-up）
**ブランチ**: issue/781/roving-radiogroup-focus-restore
**サーバー**: http://localhost:5176/（`pnpm dev --port 5176` / ローカル D1）
**ツール**: agent-browser 0.28.0
**認証**: dev-admin（cookie `__Host-session`=`dev-admin-session-token` を CDP 注入）

## 結果概要

全 4 ケース **PASS**（FAIL / INCONCLUSIVE なし）。#776 で追跡事項として残された「連続矢印キーでのフォーカス脱落」が本修正で解消したことを実ブラウザ操作で確認した。

| TC | テスト名 | AC | 結果 |
|----|---------|------|------|
| TC-001 | 連続矢印キーでフォーカス保持 | AC-1 | PASS |
| TC-002 | 単発選択後のフォーカス復元 | AC-2 | PASS |
| TC-003 | ホーム表示モード segmented の後方互換 | AC-3 | PASS |
| TC-EDGE-1 | 非操作時に焦点を奪わない | AC-4 | PASS |

## 検証で確認したこと

- **AC-1 連続操作の成立**: `/tags` の並び替え軸 radiogroup で、再フォーカスせず ArrowRight を2連打すると sort が `noteCount → createdAt` と2段進行。2回目が無視されない。各押下後 `document.activeElement` は選択中 radio（`aria-checked=true`）に保持。ArrowLeft（逆方向）も同様。
- **AC-2 復元**: 単発 ArrowRight 後、loader 再実行・RSC 再レンダー完了後もフォーカスが選択中 radio に復元され `<body>` 脱落なし。
- **AC-3 後方互換**: ホームの表示モード segmented（client-only）は従来どおり矢印切替＆focus 保持（`?display=tile`）。挙動差分なし。
- **AC-4 焦点を奪わない**: `/tags` 再読込後、矢印未操作で `document.body.focus()` して body に落とした状態を 1.5s 待っても radiogroup が焦点を奪い返さない（非オプトイン・キーボード意図フラグ未立ちのため復元 effect が発火しない）。

## AC-6（実ブラウザ）について

Issue は「まず実ブラウザで再現を確認」を指示し、agent-browser の偽陽性リスクを警告していた。本検証は agent-browser 経由だが、フォーカス判定を snapshot に頼らず `eval` で `document.activeElement` の role / aria-checked を直接読み、URL の sort 変化と併せて二重確認した。復元 effect の post-commit タイミングは忠実に再現でき、偽陽性（タイミングずれによる復元未観測）は発生しなかった。Chrome for Testing 150 上での確認であり、Safari での追加確認はユーザー手元での実施を推奨する。

## 成果物

- テスト結果: `.issue/781/manual-test/results/TC-001.md` 〜 `TC-EDGE-1.md`
- サマリー: `.issue/781/manual-test/results/summary.md`
