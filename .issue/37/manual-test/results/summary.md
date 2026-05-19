# Issue #37 ブラウザ検証サマリー

**実行日時**: 2026-05-19
**テストソース**: `.issue/37/testing.md`
**サーバー**: http://localhost:3000
**agent-browser**: 0.27.0
**結果**: 4 件 すべて **PASS** (FAIL: 0)

## 結果一覧

| TC | テスト内容 | 結果 | 失敗ステップ |
|----|----------|------|-------------|
| TC-001 | 未対応タグを含むノートで banner 表示 + WYSIWYG↔HTML タブ往復で再表示（確認項目 1+5+6 一部） | PASS | - |
| TC-002 | ack 前 autosave 抑止、ack 後再開、ack 済み control 表示（確認項目 2+3+4） | PASS | - |
| TC-003 | StarterKit 範囲内のみ / 空ノートで banner が出ない（確認項目 6, EC-2） | PASS | - |
| TC-004 | HTML タブで未確認警告状態のまま編集 → autosave が走る（EC-1） | PASS | - |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## testing.md 確認チェックリスト

- [x] 1. 未対応タグを含むノートを WYSIWYG タブで開くと banner が表示される
- [x] 2. ack 前は autosave が抑止される
- [x] 3. ack 後は autosave が再開する
- [x] 4. ack 後も控えめなインライン文言（`role="note"`）で残る
- [x] 5. WYSIWYG ↔ HTML タブ往復で警告が再表示される
- [x] 6. StarterKit 範囲内のみのノートでは banner が出ない（偽陽性なし）
- [x] EC-1. HTML タブで未確認警告状態のまま編集 → autosave が走る
- [x] EC-2. 空 HTML で WYSIWYG タブを開いても banner は出ない

## 主要な検証結果

- **banner 文言（未 ack）**: 「この本文には WYSIWYG モードで編集できない要素 (`<figcaption>`, `<figure>`, `<kbd>`, `<mark>`, `<table>`, `<td>`, `<tr>`) が含まれています。WYSIWYG モードで編集を加えると失われます。確認するまで自動保存は一時停止します。」+「了解した」ボタン。タグは alphabetical-sort + `<code>` ラップ。
- **role 属性遷移**: 未 ack 時は `role="alert"`、ack 後は `role="note"` に切り替わり、「了解した」ボタンが DOM から除去される。
- **ack 後の note 文言**: 「以下の要素は WYSIWYG モードでは保持されません: figcaption, figure, kbd, mark, table, td, tr」
- **autosave 抑止確認**: WYSIWYG タブで未 ack のまま 1 文字編集 → 6 秒待機 → AutosaveIndicator は `未保存の変更があります` のまま（`保存しました` に進まない）。ack ボタン押下後 6 秒以内に `保存しました` に遷移。
- **HTML モード**: 未 ack 状態でも HTML タブでの編集は autosave が通常通り発火（ADR-002 通り）。`<table>` / `<mark>` 等の未対応タグも textarea に保持される。

## 観察事項

- TC-001 で当初「作成」ボタンが agent-browser の `click` で React submit ハンドラに反応せず、JS の `btn.click()` 経由で submit させる必要があった。実装上の問題ではなく agent-browser の React 19 サポート上の挙動。
- TC-002 終了後、TC-001 のノートはサーバーに ack 後の（StarterKit ベースの）HTML が autosave 経由で保存されたため、TC-004 用には別途新しいノートを作成。これは Issue 仕様通りの動作（ack 後の autosave は走る）。
