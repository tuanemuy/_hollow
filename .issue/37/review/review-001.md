# PR Review #001 — feat(note): WYSIWYG unsupported-tag warning banner (Issue #37)

**PR:** #67
**Date:** 2026-05-19
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 13
- Notes: 21
- Verdict: **BLOCKED**（Warnings の修正後再レビュー）

---

### Frontend

#### Blockers
なし

#### Warnings

- **[F-W-001]** `role="alert"` と `aria-live="assertive"` を同時指定（冗長）
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:481-482`
  - 理由: `role="alert"` は ARIA 仕様で暗黙に `aria-live="assertive"` を内包。一部スクリーンリーダーで二重通知の報告あり
  - 提案: `aria-live="assertive"` を削除

- **[F-W-002]** ack 前後で banner / notice の DOM ノードが入れ替わる → focus 喪失と二重読み上げ
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:478-510`
  - 理由: ack ボタンが unmount → focus が body に飛び SR が「焦点喪失」を読み上げる
  - 提案: ack 前後で同一の `<div>` を残し、`role` と内容（ボタン有無）だけ切替。ack 押下時に `editor?.commands.focus()` でエディタへ明示的に focus を戻す

- **[F-W-003]** `unsupportedTags` / `unsupportedAck` / `onUnsupportedTagsDetected` / `onAcknowledge` がすべて optional → 一部抜けでサイレント不全
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:74-85`
  - 理由: `onAcknowledge` 抜けだと「了解した」ボタンが死にボタンになり autosave が永久に止まる
  - 提案: JSDoc に「4 props はセットで渡すこと（部分指定不可）」と明記。設計上強化したいなら discriminated optional object 形にまとめる

- **[F-W-004]** `wysiwyg-unsupported-banner` / `wysiwyg-unsupported-notice` の CSS が未定義
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:480,506`, `app/styles/`
  - 理由: 視覚ユーザーには素の `<p>` + 標準 button が出るだけで「警告」と認知しづらく ADR-003 の「ack 前後で見た目を切替」設計が成立しない
  - 提案: `.wysiwyg-unsupported-banner` に背景色 / border / padding、`.wysiwyg-unsupported-notice` に控えめな色 / 小さい font-size を追加（既存デザイントークン優先）

- **[F-W-005]** JSX 内の長文字列リテラルが分断され可読性が低い
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:484-495`
  - 提案: `<>` で素直な JSX 化、`<span>` の代わりに `Fragment` を使う

- **[F-W-006]** ack 後の notice ではタグ名が `<code>` で囲まれず未 ack 時と表現が不揃い
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:507-509`
  - 提案: notice 側でも `<code>{<${t}>}</code>` を使う。可能なら未 ack / ack 共通の小さなレンダリングヘルパを作る

- **[F-W-007]** banner が toolbar の後に置かれており、editor 本文編集中から「了解した」へ Tab で到達するまで toolbar を全部遡る必要がある
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:448-511`
  - 提案: banner を toolbar の **前** に配置。最低限の対応として DOM 順序を変える

- **[F-W-008]** 「同集合なら ack 保持」の `onCreate` → reducer 連携挙動が JSDoc で明示されていない
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:77-82`
  - 提案: `onUnsupportedTagsDetected` の JSDoc に「reducer 側で `setsEqual` 比較されるため、同じ集合の再 dispatch は ack 状態を保持する（ADR-003）」と一文追加

#### Notes
- **[F-N-001]** `detectUnsupportedTags` の pure 関数化と JSDoc は秀逸（保守性高い）
- **[F-N-002]** `latest-ref` パターンが既存と一貫している
- **[F-N-003]** reducer 側の latch + `onCreate` での `lost.length > 0` で二重防御
- **[F-N-004]** `onUpdate` 二重発火対策は触られていない（既存挙動を壊していない）
- **[F-N-005]** manual-test 4/4 PASS

### Test

#### Blockers
なし

#### Warnings

- **[T-W-001]** `WysiwygEditor.tsx` の `onCreate` 経路に対する統合テストが無い
  - 場所: `app/components/note/editor/__tests__/`
  - 理由: 中核実装（`onCreate` で `value` を読んで `detectUnsupportedTags` を呼ぶ）の自動回帰網がない。`wysiwygEditorOnChange.test.tsx` で `happy-dom + react-dom/client` の実マウント基盤が既にあるので追加コストは低い
  - 提案: `wysiwygEditorOnCreateDetect.test.tsx` を追加し、以下 3 ケースを pin:
    1. `value="<p>hi</p>"` でマウント → `onUnsupportedTagsDetected` は呼ばれない
    2. `value="<table>..."` でマウント → `["table","td","tr"]` で 1 回だけ呼ばれる
    3. マウント後の `insertContent` 編集で再度呼ばれない（ADR-005 構造的保証）

- **[T-W-002]** banner JSX の `role` 切替・ボタン有無に対する DOM テストが無い
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:480` 付近
  - 理由: ADR-003 a11y 仕様の自動回帰網が無い
  - 提案: 軽量 DOM テストで `unsupportedAck=false → role="alert"` + ボタン、`unsupportedAck=true → role="note"` + ボタン無し を pin

#### Notes
- **[T-N-001〜008]** 既存テストカバレッジは plan.md Step 7 を網羅、命名/構造一貫、reducer latch 動作も pin 済み（詳細は省略）

### Architecture

#### Blockers
なし

#### Warnings

- **[A-W-001]** `shouldFlushAutosave` の JSDoc に「`wysiwygUnsupportedAck` の保持挙動」と「ack 後の autosave 通過の semantics」が明示されていない
  - 場所: `app/components/note/editor/useAutosave.ts:67-95`
  - 提案: 「`wysiwygUnsupportedAck` は WYSIWYG editor unmount/remount を跨いで保持される設計（reducer の latch + `onCreate` 1 回検出で安全性は担保）」と JSDoc に 1 行追記

- **[A-W-002]** `onUnsupportedTagsDetectedRef` の latest-ref パターンが冗長
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:117-120`
  - 理由: `onCreate` は editor 生成時に 1 回だけ呼ばれる。`useEditor` の `onCreate` クロージャは初回 render のクロージャに固定されるため、毎フレーム最新を読みたい `onChange` と異なり ref 経由は不要
  - 提案: `onUnsupportedTagsDetectedRef` とその `useEffect` を削除し、`onCreate` 内で props を直接参照

- **[A-W-003]** banner JSX の `lostTags.map(...)` 内 `<span key={t}>` + `i>0?", ":""` 区切りロジックが複雑（Frontend W-005 と同根）
  - 提案: F-W-005 と統合して整理

#### Notes
- **[A-N-001〜009]** ADR 整合性、plan 整合性、CLAUDE.md 準拠（型安全/pure/コメント最小限/try-catch なし）、データロス防止の堅牢性すべて確認済み

---

## Design Decisions

このラウンドでの新規設計判断は無し。既存 ADR-001〜005 の運用上の補足を JSDoc に追加する方向で対応する。

---

## 統合修正方針

W-008（F）/ W-001（A）/ W-003（F）はすべて JSDoc 追記系。1 か所にまとめる。
F-W-002 + F-W-007: a11y 改善（DOM 順序 + role 切替 + focus 戻し）を 1 セットで対応。
F-W-005 + A-W-003: 文字列 / Fragment 整理を 1 セットで対応。
F-W-001 / F-W-006 / F-W-004 / A-W-002: 各々独立対応。
T-W-001 + T-W-002: 統合テスト 1 ファイルで両方カバー。
