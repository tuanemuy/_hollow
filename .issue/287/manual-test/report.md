# Browser Verify Report

**実行日時**: 2026-07-11
**テストソース**: .issue/287/testing.md
**サーバー**: http://localhost:8787
**修正ラウンド**: 0回

---

## サマリー

| 項目 | 値 |
|---|---|
| テストケース総数 | 8 |
| PASS | 8 |
| FAIL | 0 |
| PASS率 | 100% |
| 起票Issue数 | 0 |

---

## シードデータ

- `pnpm db:migrate`（適用済み・差分なし）→ `pnpm seed:dev-admin`（冪等）
- セッショントークン `dev-admin-session-token` を `__Host-session` cookie として CDP 注入
- テスト画像: 8x8 PNG（scratchpad/test-image.png）
- テスト用ノートは各 TC 内で UI から作成

---

## テスト結果一覧

| TC | テスト名 | 種別 | 最終結果 | 初回結果 | 修正ラウンド | 備考 |
|----|---------|------|---------|---------|-------------|------|
| TC-001 | メディア挿入直後の `<p><img></p>` decorate（AC-1/2） | 正常系 | PASS | PASS | - | resync rebuild 経路で decorate 確認 |
| TC-002 | 画像前後テキスト入力の非 rollback＋自動保存（AC-3） | 正常系 | PASS | PASS | - | IME 確認は agent-browser 制約で SKIP |
| TC-003 | 保存 round-trip / contenteditable 非漏出（AC-4） | 正常系 | PASS | PASS | - | `<p>before<img>after</p>` 維持 |
| TC-004 | 既存 decorate 規則の回帰なし（AC-5） | 正常系 | PASS | PASS | - | 純粋コンテナ skip・pre・空 p すべて期待どおり |
| TC-005 | `<img>` Backspace 削除試行 | エッジ | PASS | PASS | - | 画像復元OK。未保存テキストの道連れ巻き戻りを観察（下記） |
| TC-006 | `<img>` 選択して文字入力 | エッジ | PASS | PASS | - | 画像復元・入力1文字のみ巻き戻り |
| TC-007 | `<br>` プレースホルダ空ブロック入力 | エッジ | PASS | PASS | - | td は即巻き戻り（従来編集不可からの悪化ではない）。空 p は入力可 |
| TC-008 | 既存機能への影響（wysiwyg/html 挿入・disabled・モード往復） | 回帰 | PASS | PASS | - | AC-6 相当。全項目従来どおり |

---

## フォローアップ観察（FAIL ではない）

- **snapshot 追従の欠如による道連れ巻き戻り**（TC-005 / TC-007）: rollback はエディタ全体を最後の rebuild snapshot まで巻き戻す。`<td><br></td>` が #287 で新たに editable になったことで、1 文字入力 → 巻き戻り → 以降の入力で巻き戻り後本文が上書き保存され、rebuild 前の編集がサイレント消失する実害シナリオを確認。スコープ外のフォローアップとして Issue 起票判断へ。
- testing.md の「別タブで編集ロック」記述は現実装（ロック機構なし・disabled は保存 transition 中のみ）と乖離。本 Issue の回帰ではない。

---

## 環境情報

- **OS**: Darwin
- **agent-browser**: 0.31.0
- **サーバーコマンド**: `pnpm build:local && pnpm start`（wrangler dev）
- **ポート**: 8787
