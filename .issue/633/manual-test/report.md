# ブラウザ検証レポート — Issue #633: モバイルボタンのサイズ整合性改善

**実行日:** 2026-06-11
**サーバー:** http://localhost:3000（`pnpm dev`）
**ツール:** agent-browser 0.27.1（`set viewport` で desktop/mobile 切替、`eval` で getBoundingClientRect 実測）
**シード:** `pnpm db:apply:local` + `pnpm seed:dev-admin`（admin: dev-admin@example.com、cookie `__Host-session` を CDP 注入）

> 注意: agent-browser の viewport は `agent-browser --session S set viewport <w> <h>` で設定する（単独 `viewport` コマンドは存在しない）。設定後 `window.innerWidth` と `matchMedia('(max-width:639px)')` で実効幅を確認してから測定すること。最初これを取り違え、1280px のまま「床が効かない」と誤検出した。

## 結果サマリー

| TC | 確認項目 | 結果 | 実測 |
|----|---------|------|------|
| TC-1 | desktop: input(fieldControl h-10) と pillBtn の下端整合（4pxずれ解消） | **PASS** | settings/profile で input=40px / 保存ボタン=40px（両方 h-10） |
| TC-2 | mobile(390): pillBtn が実高40+床44で描画 | **PASS** | home「選択」= 48×44（desktop 40 → mobile 44 床） |
| TC-3a | mobile: 非admin 小型ボタンが44床を持つ | **PASS** | home フィルタチップ #archived/#bug = 28px(desktop) → 44px(mobile) |
| TC-3b | mobile: admin dense(pillBtnSmDense) は密度維持（膨張しない） | **PASS** | admin/jobs「再構築を実行」= 26px（[DENSE][data-sm]、床解除が効く） |
| TC-4 | pillBtnIcon が正方形（desktop40 / mobile44） | **PASS** | note 詳細 data-icon = 40×40(desktop) / 44×44(mobile)、両方 square=true |
| TC-5 | モック↔実装一致・overflow なし | **PASS** | mobile admin モック `.btn.sm`=28(compact) / `.btn`=44、320〜430で overflow=0 |

**合計: 6/6 PASS（FAIL 0 / 起票 Issue なし）**

## 詳細

### TC-1: desktop input/button 整合（4pxずれ解消）
`/settings/profile`（desktop 1280px）で `fieldControl`(FIELD_INPUT) = **40px**、`pillBtn`「保存」= **40px**。両方 `h-10` で下端が揃い、旧 40 vs 36 の 4px ずれが解消。

### TC-2: モバイル pillBtn 床
home（390px、`matchMedia(max-width:639px)=true` を確認）で `pillBtn`「選択」= 48×**44**。desktop 40px が `max-sm:min-h-[44px]`(=TOUCH_TARGET) で 44 に持ち上がる。膨張幅は 40→44 の 4px（旧 36→44 の 8px から圧縮）。

### TC-3: 小型ボタンの密度差（案C / pillBtnSmDense）
- 非admin 小型（home フィルタチップ）: desktop 28px → mobile **44px**（床獲得＝タッチ主体で正しい挙動）。
- admin dense（admin/jobs 行アクション「再構築を実行」、`pillBtn + pillBtnSmDense` + `data-sm`）: mobile でも **26px** compact を維持（`data-[sm]:max-sm:min-h-0` が base 床 (0,1,0) に確定的に勝つ）。`!important` なしで密度維持を達成。

### TC-4: pillBtnIcon 正方形
note 詳細の `data-icon` ボタン（`pillBtnIcon`、`w-10`）= desktop **40×40** / mobile **44×44**、いずれも正方形。`w-9→w-10` 化により縦長化なし。

### TC-5: モック整合
- mobile admin モック（P42/P45/P46）の `.btn.sm` は当初 `.btn { min-height:44px }` のカスケードで44のままだったため、`min-height:0` を追加して compact（28/30px）に修正 → 実装の dense=26 と整合。
- desktop pill/admin `.btn`=40、standalone `.icon-btn`=36（実装 ICON_BTN と一致）、`pillBtnIcon` 相当=40。
- 全モック 320〜430px で overflow=0、CSS brace balance 99ファイル健全。

## 検証中に修正した実装/モックの問題
- mobile admin モック `.btn.sm` の床カスケード（`.btn` の min-height:44 が compact height を上書き）→ `min-height:0` を3ファイルに追加して解消。これは本検証で初めて顕在化したモック側の不整合で、Phase 2 内で即修正済み。
