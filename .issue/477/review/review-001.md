# PR Review #001 — refactor(ui): ノート公開設定を独立ページからインコンテキストモーダルへ

**PR:** #479
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 残のため。完了条件は Blocker 0 かつ Warning 0）

---

## Frontend

### Blockers
- なし

### Warnings
- **[FE-W-001]** `issuedToken`（一度だけ表示の発行URL）が close→reopen で残存する
  - 場所: `app/components/publication/PublishSettings/index.tsx:86,234-241`
  - 理由: plan/ADR は「`Dialog` は `!open` で unmount されるため再オープンで再初期化される」と前提していたが誤り。`Dialog` が unmount するのは `DialogInner` と children のみで、state を持つ `PublishSettings` 本体は `NoteActions` 配下で常時マウント。結果、発行URLバナーが閉じて再度開いても残る（「一度だけ表示」ラベルと挙動が不整合）。
  - 提案: `open` が false になったら `setIssuedToken(null)` でリセット。plan/ADR の記述も実態に修正。
- **[FE-W-002]** `visibility` ステートが外部由来の prop 更新に追従しない
  - 場所: `app/components/publication/PublishSettings/index.tsx:85`
  - 理由: 同じ前提崩れにより `useState(data.visibility)` は初回固定。一覧の `BulkVisibilityDialog` 等で visibility が変わり NoteDetail が再フェッチされても、モーダルのラジオ選択に反映されない。
  - 提案: close 時に `data.visibility` へ再同期する effect を入れる（FE-W-001 と同じ effect に集約可）。

### Notes
- Dialog 利用（ariaLabelledBy/closable/showCloseButton/dialogActions）は既存作法に準拠。focus restore/trap/scroll lock 担保。
- pending 持ち上げ（ADR-004）の実装は堅牢（true 局面のみ +1/-1、unmount で残留せず、useCallback で ID 固定）。
- スタイリング規約準拠（新規ハードコードCSSなし、#464 スタイル流用、data-* variant 作法）。
- a11y: 見出し階層 h2→h3 適切、aria-busy/role=alert あり。発行URL出現・成功に aria-live が無いのは軽微ギャップ（UploadDialog は role=status を持つ。将来揃える余地）。

---

## Test

### Blockers
- なし

### Warnings
- **[TEST-W-001]** 新規導入した pending リフトアップ／closable 集約ロジック（ADR-004）にテストが一切ない
  - 場所: `app/components/publication/PublishSettings/index.tsx`（`pendingRows`/`onRowPendingChange`/`ShareLinkRow` の effect）
  - 理由: 本PRで最も非自明な部分。`NoteActions.test.tsx` は `PublishSettings` を丸ごとスタブするため到達しない。手動 TC-E01 も瞬間性で検証しきれず。
  - 提案: `PublishSettings`（または `ShareLinkRow` の pending 持ち上げ）の unit テストを追加。`anyPending` 時に `closable=false`（× disabled / 閉じる disabled）になること、in-flight unmount でカウンタ残留しないことを検証。
- **[TEST-W-002]** `NoteActions.test.tsx` の公開設定ピル特定が `textContent` の "非公開" 部分一致依存で脆い
  - 場所: `NoteActions.test.tsx:107-109`
  - 理由: ラベル文言変更や "非公開" を含む別ボタン追加で誤検出/取りこぼし。`visibilityLabel` の戻り値文字列という実装詳細に結合。
  - 提案: 安定したフック（`sr-only` "公開状態:" 起点、`aria-label`、`data-testid` 等）でセレクト。

### Notes
- 削除ファイル（PublishSettingsPage/loader/publish.tsx）に紐づくテスト取りこぼしなし（専用 unit テストは元々不在）。
- plan ステップ6 との整合良好。Link→button 化・vi.mock スタブ・appUrl 追加・既存検証維持を確認。
- route handler の appUrl 解決は unit 対象外（型必須化で tsgo 担保）で docs/test.md 方針に整合。

---

## Architecture / Routing

### Blockers
- なし

### Warnings
- **[ARCH-W-001]** `PUBLISH_BODY` が dead code 化
  - 場所: `app/components/publication/styles.ts:16`
  - 理由: 唯一の利用者 `PublishSettingsPage.tsx` 削除により参照ゼロ（grep 確認）。Biome は未使用 export を検出しないため CI もすり抜ける。CLAUDE.md の「dead code を残さない」方針に反する。
  - 提案: `PUBLISH_BODY` を `styles.ts` から削除。

### Notes
- ルート削除の波及はクリーン（dangling 参照ゼロ、routeTree 再生成済み、`grep -i publish app/routeTree.gen.ts` = 0件）。
- `action.ts` の RSC 登録は `_app/route.tsx` で維持され server-fn 有効。
- appUrl 4段引き回しはレイヤー規約・型安全とも妥当（ADR-003 準拠）。
- レイヤー越境なし（presentation 層に閉じる）。ADR-004 実装一致。見出し格下げが Dialog a11y 契約に適合。

---

## Design Decisions

- plan/ADR の「`Dialog` unmount で再オープン時に state 再初期化される」という前提が誤り（state を持つ `PublishSettings` は `NoteActions` 配下で常時マウント）。この事実を記録し、close 時の明示リセットで FE-W-001/W-002 を解消する方針を ADR-005 として追記する。
