# TC-5（AC-6）キーボード操作 — 結果

判定: **FAIL**（6 ステップ中 4 PASS / 1 FAIL / 1 条件付き PASS）

- 実行日: 2026-06-13
- 環境: http://localhost:3001 / agent-browser 0.27.1 / セッション verify-tc-005 / dev-admin
- 前提: URL クエリ空を確認済み。シードタグ test-tag-01〜14 表示確認済み。

## 実行ログ

| # | 操作 | 期待結果 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | トリガー（aria-label="タグで絞り込み"）に focus() → Enter | ピッカーが開く | `aria-expanded=true`、listbox "タグで絞り込み" と option 14 件が出現 | PASS |
| 2 | ArrowDown ×2 | option 間を 1 件ずつロービングフォーカス移動 | 1回目 → `#test-tag-02`、2回目 → `#test-tag-03`（activeElement で確認） | PASS |
| 3 | Enter でトグル | フォーカス中 option が aria-selected=true、パネルは開いたまま | `option "#test-tag-03" [selected]`、panel open=true、URL に `tagNames=["test-tag-03"]`。**ただしトグル直後に activeElement が BODY へ落ちる**（フォーカス喪失） | PASS（条件付き: 文言上の期待は充足だが、フォーカス保持されず） |
| 4 | option をマウスクリック直後に ArrowDown | クリックした option の**次**へフォーカス移動（activeIndex 同期） | tag-05 クリック → 選択は反映（URL 反映）されるが activeElement は BODY。直後の ArrowDown は **無反応（フォーカス移動せず BODY のまま）**。次の option（tag-06）には移動しない | **FAIL** |
| 5 | （option に focus した状態で）Escape | パネルが閉じ、フォーカスがトリガーへ復帰 | listbox 消失、activeElement の aria-label = "タグで絞り込み" | PASS |
| 6 | 再度開いてパネル外をクリック | 閉じる | パネル外（ノートリンク領域）クリックで listbox 消失、`aria-expanded=false`、ページ遷移なし | PASS |

## 失敗詳細（#4 / #3 のフォーカス喪失）

- 根本事象: option のトグル（Enter / マウスクリックいずれも）で URL ナビゲーション → 再レンダーが走り、フォーカスが `document.body` へ落ちる。
- その状態で ArrowDown を押してもリストへフォーカスが戻らず、キーボード操作の連続フローが途切れる。「クリックした option の次へ移動（activeIndex 同期）」は観測できなかった。
- 1 回目の試行ではタイミングにより ArrowDown でクリックした option 自身（tag-05、次ではない）にフォーカスが当たるケースもあり、挙動はレンダータイミング依存で不安定。
- 再現手順: ピッカーを開く → 任意 option をクリック → `document.activeElement` を確認（BODY）→ ArrowDown 押下 → activeElement 変化なし。

## 備考

- テスト中、ページリロードを跨ぐと `__Host-session` Cookie（Secure 属性、http://localhost）が落ちてランディングページへ戻る事象が 2 回発生。Cookie 再設定で復帰（テスト対象外事象として記録のみ）。

## 修正後の再検証（2026-06-13）

`useRovingMenu` にコミット後フォーカス復元 + closed→open 遷移ガードを追加（ADR-006）後、再実行:
- クリックトグル後もフォーカスがトグルした option に維持され、ArrowDown で次 option へ移動 ✓
- Enter トグルでもフォーカス維持・パネル開いたまま ✓

**最終結果: PASS（修正後）**
