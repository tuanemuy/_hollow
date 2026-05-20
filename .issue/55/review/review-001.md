# PR Review #001 — feat(issue-55): add bulk progress UI for tag merge/delete

**PR:** #97
**Date:** 2026-05-20
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 12（重複統合後 9 件: F-W-001/W-005=同根, F-W-004=A-W-002 同一指摘）
- Notes: 14
- Verdict: **BLOCKED**（Warning 修正対応のため）

---

## Frontend

### Blockers
なし

### Warnings
- **[F-W-001]** `ConfirmDialog` 閉時に `renderDeleteDescription` が `isPending=true` で呼ばれる可能性（W-005 と同根）
  - 場所: `app/components/tag/TagActions.tsx:151,168`
  - 理由: 親側で常に `renderDeleteDescription({ isPending, noteCount })` が呼ばれる。`runDelete` の catch で `setConfirmDeleteOpen(false)` を呼ぶが `isPending` は React の transition スケジューラ依存で短時間 true のまま残りうる。エラー直後に再度「削除」を押した瞬間、in-flight description が一瞬残る恐れ。
  - 提案: `isPending` の判定を `isPending && confirmDeleteOpen` でガード。
- **[F-W-002]** 削除エラー時のフォーカス管理がない
  - 場所: `app/components/tag/TagActions.tsx:60-65, 133-137`
  - 理由: ダイアログクローズ → 行内 `FORM_ERROR` (`role="alert"`) で SR には伝わるが、視覚ユーザーはモーダル消失を「成功」と誤認しうる。
  - 提案: 本 PR スコープ外（ADR-003 で意図記録済み）。Warning として記録のみ、別 Issue 化検討。
- **[F-W-003]** `MergeTagDialog` のローカル `DIALOG` 定数 `shadow-[0_16px_32px_rgba(0,0,0,0.15)]` と `note/styles.ts` の `dialog` の `shadow-lg` が不一致
  - 場所: `app/components/tag/MergeTagDialog.tsx:31` vs `app/components/note/styles.ts:47`
  - 理由: 同一画面で開く 2 ダイアログの影差。本 PR で `MergeTagDialog` を触っているので軽微な整合修正は範囲内。
  - 提案: 本 PR のスコープ意図（plan.md でローカル定数集約は別 Issue と明示）に従い見送り、別 Issue 候補とする。
- **[F-W-004]** `aria-busy="true"` を文字列リテラル / `aria-busy={isPending}` を boolean で書きぶり混在（A-W-002 と同一指摘）
  - 場所: `app/components/tag/TagActions.tsx:177`, `app/components/tag/MergeTagDialog.tsx:80,125`
  - 提案: boolean に統一（`aria-busy={true}` or `aria-busy`）。

### Notes
- **[F-N-001]** `useTransition` 内 setState は既存 `onRename` パターンと整合。
- **[F-N-002]** `aria-valuenow={undefined}` + `biome-ignore` + ADR-006 のリンクは仕様準拠と局所抑止のバランスが取れている。
- **[F-N-003]** `noteCount === 0` の進捗 UI 抑制で誤解誘発文言を回避できている。
- **[F-N-004]** `tag/styles.ts` 新設は CLAUDE.md のドメイン styles パターンと整合。
- **[F-N-005]** `aria-live="polite"` + `aria-label` での補完設計は ADR-002 と一致。
- **[F-N-006]** `<form aria-busy={isPending}>` 付与は FilterBar パターン踏襲。
- **[F-N-007]** ADR-004 の `renameTag` スコープ外判断に将来余地が確保されている。

---

## Accessibility & Spec

### Blockers
なし

### Warnings
- **[A-W-001]** `aria-live="polite"` のマウント時アナウンス挙動が支援技術依存
  - 場所: `app/components/tag/TagActions.tsx:172,190`, `app/components/tag/MergeTagDialog.tsx:120-122`
  - 理由: in-flight 分岐内に `<span aria-live="polite">` が新規マウントされるが、ARIA Live Regions の仕様上「マウント時点ではアナウンスされず、後続変更時にアナウンスされる」（W3C "ARIA in HTML" §5.4）。NVDA/VoiceOver で挙動差あり。
  - 提案: testing.md に NVDA/VoiceOver での実機確認項目を追加（コード変更不要）。
- **[A-W-002]** `aria-busy` boolean/string 揺れ（F-W-004 と同一）
- **[A-W-003]** `aria-valuemax={noteCount}` の冗長性
  - 場所: `app/components/tag/TagActions.tsx:179`, `app/components/tag/MergeTagDialog.tsx:127`
  - 理由: WAI-ARIA 1.2 §6.6.7 で indeterminate progressbar の `aria-valuemin/max` は省略可。`aria-label` で件数伝達済みのため二重情報、古い NVDA で「進捗 0/N」と誤読み上げの恐れ。
  - 提案: testing.md に AT 誤読み上げ確認項目を追加（コード変更しない理由: `aria-label` で件数伝達 + ADR-005 の鮮度ズレ許容で `aria-valuemax` のスケール伝達は補助、本 PR では維持）。
- **[A-W-004]** 日本語タイポグラフィ: `（対象ノート: N 件） を #beta` の閉じカッコ後にスペースが入る
  - 場所: `app/components/tag/MergeTagDialog.tsx:103-110`
  - 提案: 閉じカッコ直後のスペースを除去するか「。対象ノート: N 件。」のような句点分離に変更。
- **[A-W-005]** `renderDeleteDescription` を React component に昇格すべきか
  - 場所: `app/components/tag/TagActions.tsx:161-203`
  - 理由: 将来 Hook が必要になった場合に書き換えコスト発生。
  - 提案: 主観的指摘、本 PR では現状維持。plan.md に inline function で記載済み。
- **[A-W-006]** ADR-006 の `biome-ignore` に再評価メカニズムがない
  - 場所: `app/components/tag/TagActions.tsx:180`, `app/components/tag/MergeTagDialog.tsx:128`
  - 提案: ADR-006 の Consequences に「Biome ルール更新時に再評価」を追記。
- **[A-W-007]** ADR-001 で「件数事前提示は Issue 要件の核」と断言しているが、Issue 本文の対応方針案 1 には件数事前提示が明記されていない
  - 場所: `.issue/55/adr.md` ADR-001 Decision
  - 提案: 「Issue 本文の意図解釈に基づく ADR 独自の補強策」とトーンダウン。

### Notes
- **[A-N-001]** `aria-valuenow={undefined}` の React 動作は仕様準拠で正確。
- **[A-N-002]** `motion-safe:animate-pulse` は WCAG 2.3.3 に合致。
- **[A-N-003]** ADR-004 の `renameTag` スコープ外判断は妥当。
- **[A-N-004]** ADR-003 のエラー時ダイアログクローズは共通コンポーネント保護に貢献。
- **[A-N-005]** `aria-busy` 重複は ARIA 仕様上許容。
- **[A-N-006]** `tag/styles.ts` 新設は CLAUDE.md パターン整合。
- **[A-N-007]** testing.md で `aria-valuenow` 不在確認手順が明記され ADR-002/006 の意図検証可能。

---

## Design Decisions

このラウンドで新たに見つかった設計判断は特になし。既存 ADR-001〜006 の範囲内の指摘がほとんど。
