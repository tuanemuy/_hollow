# PR Review #001 — refactor: normalize ErrorCode naming convention across domains

**PR:** #129
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 22
- Verdict: **BLOCKED**（Warning 2件あり、即時修正対象）

---

## Domain

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** 全 11 ドメインの `errorCode.ts` を `.issue/82/error-code-mapping.md` と突き合わせ、property × value で完全一致
- **[N-002]** ADR-004 の `media_not_owned` 3 ドメイン共有が正しく成立
- **[N-003]** ADR-007 副次バグ修正対象 `share_link_revoked` が `ShareLinkGate` の比較と一致
- **[N-004]** ADR-006 既知不整合 `note_already_trashed` は仕様通り維持
- **[N-005]** spec ↔ 実装の差分 20 件は ADR-006 列挙のリテラル直書きまたは非エラー enum
- **[N-006]** prefix 揺らぎは ADR-002 通り spec 文言優先で踏襲
- **[N-007]** `IngestionErrorCode.InvalidStateFor*` の value/key 非対称は ADR-002 フローチャートで一貫
- **[N-008]** 既存 lower 値は全て破壊されず維持
- **[N-009]** `errorCodeNaming.test.ts` の `import.meta.glob` 動的列挙設計が堅牢
- **[N-010]** 旧 UPPER 直書き 2 件のテスト追従修正完了、他に取り残しなし

---

## Test

#### Blockers
- なし

#### Warnings

- **[W-001]** `errorCodeNaming.test.ts` の domain 数ガードが弱い
  - 場所: `app/core/domain/__tests__/errorCodeNaming.test.ts:48-50`
  - 理由: `expect(errorCodeMaps.length).toBeGreaterThan(0)` は 1 件でも通る。glob が将来ビルド設定変更等で一部ドメインを取りこぼした場合に検出できない。
  - 提案: 期待される名前 Set を列挙し `expect(new Set(...).toEqual(new Set(EXPECTED)))` で固定する、または `expect(...).toBe(11)` 等の厳格化

- **[W-002]** `pickErrorCodeMap` が空マップを誤検出する余地
  - 場所: `app/core/domain/__tests__/errorCodeNaming.test.ts:29`
  - 理由: 空 object に対し `every(...)` は true を返すため、`*ErrorCode = {} as const` が将来追加されたとき検証対象に含めつつ `it()` が 0 件生成されサイレントに成功扱いになる
  - 提案: `Object.values(map).length > 0` ガードを追加するか、`describe` 内で `expect(Object.keys(map).length).toBeGreaterThan(0)` を入れる

#### Notes
- **[N-001]** value/key regex は要件網羅、自己検証もポジ/ネガ両方を含み可読性良好
- **[N-002]** `import.meta.glob('../*/errorCode.ts')` は `SystemErrorCode` を意図的に含まない設計
- **[N-003]** 既存テスト修正 2 件は妥当
- **[N-004]** UPPER 残置は `NotFoundError`/`ForbiddenError`/`SystemErrorCode` 系のみ（ADR-003 スコープ外）
- **[N-005]** `IngestionFailureCode` の `llm_failure` 等は別系統で本 Issue スコープ外
- **[N-006]** `pnpm test` 全 PASS（unit 1981 / integration 352 / errorCodeNaming 397）

---

## Consistency

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** plan / mapping / 実装が完全一致
- **[N-002]** ADR-001〜007 全項目が実装に反映
- **[N-003]** Frontend / Presentation 影響を網羅確認、全て一致
- **[N-004]** CLAUDE.md 命名規約追記は ADR-001/003/005 と整合
- **[N-005]** UPPER 直書きアサーション追従漏れなし
- **[N-006]** PR 説明と plan / testing が整合

---

## Design Decisions

特になし（Warning 2 件は実装ガードの強化であり、設計判断ではなく品質改善のため ADR 追記不要）。
