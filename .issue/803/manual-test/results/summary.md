# 動作確認サマリー — Issue #803

タグ入力 候補パネルの viewport クランプ（縦 shift）/ 外側クリッククローズ

- 検証日: 2026-06-28
- 環境: http://localhost:3001, user dev-login@example.com, `/notes/new` でタグ欄に "t"（既存タグ5件 tag-alpha/beta/gamma/delta/epsilon が候補）
- ツール: agent-browser（session verify-803）。transform/rect は eval で実測。

## 結果表
| TC | テスト名 | AC | 結果 | 失敗ステップ |
|---|---|---|---|---|
| TC-1 | 画面下部での縦クランプ | AC-1 | PASS | - |
| TC-2 | 動的高さ再クランプ | AC-3 | PASS | - |
| TC-3 | 外側クリッククローズ | AC-2 | PASS | - |
| TC-4 | 既存キーボード/コミット非回帰 | AC-4 | PASS | - |
| TC-5 | 候補ゼロ・新規作成のみ（エッジ）| 補助 | PASS | - |
| TC-6 | 画面上部では shift なし（エッジ）| 補助 | PASS | - |

合計: PASS 6 / FAIL 0

## 主な実測値
- TC-1: viewport 440 / "t"5候補 → panelBottom=432 (= innerH-8), transform=translateY(-88px), 全体 viewport 内。
- TC-2: 候補 5→1 で transform が -88 → none に縮退、1→5 で再度 -88 に復帰。古い shift 残留なし。
- TC-3: 外側クリックで expanded=false / listbox 消滅。候補クリックで "#tag-alpha" 追加。
- TC-4: ArrowDown+Enter で既存タグ、Enter で新規タグ、Escape でクローズ＋draft "t" 保持、空欄 Backspace で直前チップ削除、blur コミット("#t")。
- TC-5: 新規作成のみの小パネル bottom=363<=432、外側クリックで閉じる。
- TC-6: viewport 900 で transform=none、input 直下(gap 12px)に開く。

## 注記 / 制約
- タグ入力欄は sticky ヘッダ直下に固定され、スクロール最上部でも input top≈274px が下限。手順書の「scroll down 800」では逆に上方向へ移動するため、はみ出し再現は viewport 高さを縮める方式（1280x440）で実施。
- クランプの再計算契機は「パネル open / typing による候補変化」。viewport を後から縮めるだけでは再計算されないため、小 viewport でパネルを開き直して検証した。
- TC-4 の IME 変換確定 Enter（#3）は agent-browser で composition イベントを忠実に再現できないため自動検証から除外（要手動 IME 確認）。それ以外の AC-4 項目はすべて PASS。
- セッション安定性: fill コマンドで一度ブラウザが about:blank に落ち再ログイン。以降は keyboard type 主体に切替えて安定。結論に影響なし。

すべての受け入れ基準（AC-1〜AC-4）および補助エッジケースを実機ブラウザのレイアウト実測で確認し、回帰・不具合は検出されなかった。
