# PR Review #001 — feat: #680 編集中フォームの routerInvalidate フォーカス喪失を復元フックで解消

**PR:** #684
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 1
- Warnings: 4
- Notes: 11
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 1 / W: 3）

## 指摘一覧と仕分け

### このPRで直す

- [Test B-001] スナップショット未取得フォールバック分岐がテストで素通り（偽陽性、E-1 回帰防御不成立） — `app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx:124-159`（Test）→ **修正済み**（`ProbeNoHandlers` で snapshot=null を作り setSelectionRange 未呼出を spy で pin）
- [Test W-001] `isConnected===false` ガードが未到達（null ガードのみ通過） — 同テスト:109-122 → **修正済み**（コンテナ切り離しで isConnected=false を作り独立 pin）
- [Test W-002] IME「compositionend 後の復元再開」が未検証 — 同テスト:161-179 → **修正済み**（compositionend 後の復元を検証するケースに拡張）
- [Test W-003] テストコメントが happy-dom 実挙動と食い違い誤誘導 — 同テスト:117-158 → **修正済み**（programmatic focus の onFocus 発火・null vs isConnected の区別を実態に合わせ是正）

### 見送り（記録済み）

- [Frontend W-001] `hadFocusRef` 解除されず、body へ意図的 blur 後の無関係 invalidate で focus を奪い返しうる — `useRestoreFieldFocusOnCommit.ts:90,110-132` → **受容リスクとして見送り**。`activeElement===body` だけでは「RSC detach の focus 落ち」と「ユーザーの意図的 body blur」を区別できない本質的制約。別要素移動は body ガードで既に防止（実機 E-2 PASS）、残るのは body 直接 blur ＋ 偶然の無関係 invalidate の稀ケースのみで実害小（value 保持・再クリック可）。完全解決は描画構造見直し（ADR-001 選択肢1）が必要だが見合わない。**ADR-004 に記録**。

### 解決済み（誤指摘 / 既修正）

- [Frontend W-002] autoFocus 直後・無操作の invalidate で focus が復元されない — `useRestoreFieldFocusOnCommit.ts:125-131` → **実装済みで解決**。ブラウザ検証 E-1 で検出後、コミット後 effect の `activeElement===el` 経路で held-focus を arm する修正を入れ、再検証 E-1 PASS（ADR-004）。レビュアーは初回 TC-E1.md（修正前記録）を参照したと思われる。ユニットの回帰防御は Test B-001 修正で成立。

## Notes（主な良い点）

- invalidate 経路（UploadDialog / routerInvalidate）に一切触れず、変更は4ソースのみで発生源非依存が構造的に担保（Frontend N-001）
- 3フォーム配線が計画どおり（admin text+variables 両方、identity text のみで PreviewPanel.sample 除外、views inline rename）（Frontend N-005）
- 復元ハッピーパス・window-blur 相当が非トートロジーで良質に pin（Test N-001/N-002）
- AC-1〜AC-8 すべて充足（Frontend）
