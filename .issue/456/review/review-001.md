# PR Review #001 — perf(security)(#456): lazy upgrade を status OK 確定後に遅延させる

**PR:** #530
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5（重複統合後の actionable: 3）
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 修正のため。Blocker は 0）

---

## Security

### Blockers
- なし

### Warnings
- **[B-001→W]** rehash の `raw` 再ハッシュは UoW#3 の re-SELECT 結果に対し再 verify しない。`credentialStore.ts` rehashLegacyPassword。現コードでは legacy→legacy 上書き経路が存在しないため安全だが、「再 verify を省く根拠（legacy→legacy 上書き経路が存在しない不変条件）」が WHY コメントに明文化されていない。→ コメントに不変条件を追記。

### Notes
- enumeration defence 完全維持（失敗経路 null 単一・never throw 不変、needsRehash は prefix 判定のみ）
- DoS 増幅解消が pending/suspended/deleted/orphan 全分岐で構造的に保証
- verifyPasswordForUser の inline rehash 維持は security 上妥当
- session 発行前 await の設計が妥当
- TOCTOU 安全網が実際に機能
- **[N-006]** 軽微なドキュメント drift: 冒頭コメント（line 34）が削除済み `maybeRehashLegacy` を参照

## Application / Use Case

### Blockers
- なし

### Warnings
- **[W-001]** `rehashLegacyPassword` の例外正規化が他 verify 系メソッドと非対称。SELECT は `mapDbError` で包むが `hashScrypt` / batch commit 例外は未ラップ。adapter→application の error contract 一貫性の観点で確認推奨。
- **[W-002]** rehash UoW 失敗がログイン全体を 500 にする設計のトレードオフ（正しいパスワードでもログイン不能になりうる）。現状の厳格 await は方針整合上正しく、現状維持で問題ない。

### Notes
- orphan(status===null) でも rehash しないことを確認
- rehash の順序（verify→status→rehash→session）が plan/adr と完全一致
- needsRehash の伝播にドメインロジック漏出なし
- enumeration defence 維持
- verifyPasswordForUser スコープ外判断が整合
- deleted ケース invalid_credentials が実挙動と一致

## Adapter / Infrastructure

### Blockers
- なし

### Warnings
- **[W-001]** Stale comment: line 34 のモジュールコメントが削除済み `maybeRehashLegacy` を参照。line 371 のコメントも同様に dangling。plan.md ステップ3 で更新意図あり。→ 修正。
- **[W-002]** `rehashLegacyPassword` の `hashScrypt` が `mapDbError` 外で未ラップ。ただし registerPassword/changePassword/resetPassword も hashScrypt を bare で呼ぶ既存パターンであり、本メソッドだけ包むと逆に非対称。port 契約上 rehash は throw 可なので blocker ではない。

### Notes
- コア refactor は plan/ADR に忠実で正しい
- verifyPasswordForUser のインライン化は挙動等価
- TOCTOU re-SELECT が well-reasoned、bare update が ADR-003 通り
- pending.add が標準 batch 経路で正しく flush
- クラス JSDoc は実装と一致（line 34 を除く）

## Test

### Blockers
- なし

### Warnings
- **[W-001]** suspended テストの「再凍結」ステップのコメント（"assert the seed is still in place"）が実挙動（再 UPDATE）と食い違い。→ コメント修正。
- **[W-002]** 新規 describe 単独では「rehash 発火時に prefix が変わる」負側確証が閉じていない（active テストとの対比で実質カバー）。追加対応不要。

### Notes
- deleted の invalid_credentials 期待値・コメントが実装と一致
- suspended の seed 手順が正しく status を suspended に導く
- error.code 厳密 assert で偽陽性すり抜けを防止
- 既存 active lazy upgrade テストがタイミング変更後もカバレッジ維持し新経路の end-to-end 担保
- seed/helper の再利用が適切・過度な内部結合なし

---

## Design Decisions

- **hashScrypt の例外ラップ非対称（Application W-001 / Adapter W-002）**: `rehashLegacyPassword` の `hashScrypt` を `SystemError` に正規化しない方針を維持する。理由: registerPassword / changePassword / resetPassword など全 mutation メソッドが `hashScrypt` を bare で呼ぶ既存パターンであり、本メソッドだけラップすると逆方向の非対称を生む。scrypt 失敗は真の system fault でクラス全体で untyped に surface する設計。adr.md に記録。
- **rehash UoW 失敗時の厳格 await（Application W-002）**: 現状維持。best-effort 化は別途 ADR 判断とし本 Issue では扱わない。

## 仕分け結果

このラウンドで修正する（在スコープ・軽微）:
1. line 34 / line 371 の stale `maybeRehashLegacy` コメント修正（Adapter W-001 / Security N-006）
2. `rehashLegacyPassword` re-SELECT の不変条件 WHY コメント追記（Security B-001→W）
3. suspended テストの再凍結コメント修正（Test W-001）

対応しない（判断を記録）:
- hashScrypt 例外ラップ（既存パターン整合のため現状維持・adr 記録）
- rehash UoW 失敗の best-effort 化（別途 ADR 判断）
- Test W-002（active テストとの対比で実質カバー・追加不要）
