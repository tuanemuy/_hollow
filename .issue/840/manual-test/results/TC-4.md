# TC-4（確認項目4 / P-001）— デバウンス窓経由のサイレント消失防止

- **対応 AC:** AC-3′
- **対象ノート:** ノートA（`<img>` 入り、ID `019f79a9-6794-743b-8d81-e21d75028b5c`、`/media/019f79a9-b13d-72d6-a8e2-b0ee1d7a8c03`）
- **実行日:** 2026-07-19
- **実行環境:** wrangler dev（`http://localhost:8787`）/ agent-browser 0.32.0 セッション `verify-tc-img`

## 結果: PASS（近似再現）

rollback 直後に追加入力せず自動保存させたところ、保存内容に `TAIL2` が含まれ、再読み込み後も永続した。pending デバウンスの早期 return による古い値での上書き（`TAIL2` 消失）は起きなかった。

ただし「最後の打鍵から 50ms 以内に rollback を踏む」正確なタイミングは、agent-browser の CLI 呼び出し間レイテンシ（1呼び出し >50ms）により保証できないため、**厳密なデバウンス窓の忠実再現は不可（近似）**。plan.md のとおり本経路の主保証は自動テスト 4-T3（`pnpm test:unit`）。手動では観測可能な受け入れ（rollback 後に追加入力なしで `TAIL2` が保存される）を確認した。

## 実行ログ

| # | 手順 | 操作 | 観測結果 | 判定 |
|---|------|------|----------|------|
| 1 | ノートAをビジュアルタブで開く（`before<img>after` にリセット済み） | HTMLタブで初期構造へ戻し→ビジュアル | `<p ...>before<img ...>after</p>` | PASS |
| 2 | img 直後に `TAIL2` 入力→素早く img 直後キャレット→Backspace | `keyboard type TAIL2` 直後に caret 設定＋`press Backspace` | rollback 後 DOM = `before<img>afterTAIL2`（img 復元・`TAIL2` 保持） | PASS |
| 3 | 追加入力せず自動保存完了を待つ | `wait --text 保存しました` | `保存しました` 表示、追加操作なし | PASS |
| 4 | 読み取りビュー → 再読み込みで保存内容確認 | `/notes/{id}` を reload | 永続 DOM = `<p>before<img src="/media/019f79a9-b13d-72d6-a8e2-b0ee1d7a8c03" alt="">afterTAIL2</p>` | PASS |

## 期待結果との対照

- img は復元され `TAIL2` は DOM に残る → **達成**
- 追加入力なしでも保存内容に `TAIL2` が含まれる（pending デバウンスの早期 return による消失なし） → **達成**

## 補足 / BLOCKED（近似）事項

- **厳密なデバウンス窓（<50ms）の忠実再現は BLOCKED**：agent-browser は 1 コマンドあたり数十〜百 ms のレイテンシがあり、`TAIL2` 打鍵から Backspace までに 50ms デバウンスがフラッシュ済みになっている可能性が高い。真に「pending デバウンス保留中に rollback を踏む」窓は本経路の主保証たる自動テスト 4-T3 に委ねる。
- 本手動検証は「速い Backspace の直後に追加操作なしで保存させる」近似再現であり、観測可能な受け入れ基準（`TAIL2` の永続）は満たした。
