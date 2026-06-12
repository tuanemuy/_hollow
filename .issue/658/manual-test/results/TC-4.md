# TC-4 マルチセレクト絞り込み（AC-5）

結果: FAIL（「パネルは開いたまま」のみ不一致。絞り込み・URL・aria-selected・チップ同期は期待どおり）

セッション: verify-tc-003 / URL: http://localhost:3001/ / dev-admin

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | ピッカーで `#test-tag-01` の option をクリック | test-note-01 のみ表示、URL に tagNames、パネル開いたまま、`aria-selected="true"` | 一覧 1 件（Test Note 01）、URL `?tagNames=["test-tag-01"]`。クリック直後は listbox 存在＆選択反映するが、ナビゲーション完了後（networkidle）に listbox 消失・トグル `aria-expanded="false"`。ネイティブクリック（snapshot ref 経由）でも同様に閉じる | FAIL（パネル持続のみ） |
| 2 | 続けて `#test-tag-02` をクリック（再オープン後） | さらに絞り込み、tagNames 2 つ、パネル開いたまま | URL `?tagNames=["test-tag-01","test-tag-02"]`、一覧 1 件。再オープンすると tag-01/02 の option が `[selected]` で表示される。だが選択操作のたびにパネルは閉じる | FAIL（パネル持続のみ） |
| 3 | `#test-tag-01` を再クリック（再オープン後、ref e41） | 解除され `aria-selected="false"`、URL から外れる | URL `?tagNames=["test-tag-02"]`、一覧 2 件（tag-02 は 2 ノート）。再オープン時 tag-01 は非選択 | PASS |
| 4 | バーのチップ aria-pressed とピッカー aria-selected の一致 | test-tag-02 チップが `aria-pressed="true"` | `aria-pressed="true"` は `#test-tag-02 2` チップのみ。ピッカー側も tag-02 のみ selected で一致 | PASS |

## 失敗詳細

- 現象: option クリック → URL 更新・一覧絞り込みは即時成功するが、ルーターのナビゲーション完了後にタグピッカーパネルが自動的に閉じる（`role="listbox"` が DOM から消え、トグルボタンが `aria-expanded="false"` に戻る）。
- 再現性: eval click / agent-browser ネイティブ click の双方で 3 回再現（クリック直後 `immediatelyOpen: true` → networkidle 後 `pickerOpen: false`、sleep 2s 後の snapshot でも listbox なし）。
- 期待仕様: 選択のたびにパネルは開いたままで連続選択できること（AC-5）。
- 推定原因: フィルタ変更による URL ナビゲーションでフィルタバーコンポーネントが再マウント（または open 状態が URL 変化でリセット）され、ローカルの open state が失われている。

## 修正後の再検証（2026-06-13）

`usePopover.onFocusOut` の relatedTarget=null ガード追加（ADR-005）後、verify-fix-tc4 セッションで再実行:
- option クリック → ナビゲーション後もパネル開いたまま・aria-selected 正しく反映 ✓
- 解除クリックも同様 ✓ / 外側クリック・Escape のクローズ回帰なし ✓

**最終結果: PASS（修正後）**
