# TC-9: caret スナップショットの保持を before/after で実測（S-001 観測ゲート）

- 対応AC: AC-2 / AC-3 / AC-4（復元成否のゲート判定根拠）
- セッション: TC-2〜TC-5 の観測を流用

## 目的

「復元は走ったが caret は退避できておらず末尾に飛んだ」を成功と誤判定しないよう、
(a) 発火前に当該要素が focus を持ち caret 位置が記録されていたこと、
(b) 発火後の selectionStart/End が (a) と一致すること、を数値で記録する。

## フォールバック発火条件のチェック（testing.md S-003）

各 TC で以下のいずれも発生していないことを確認:

- (a) 復元後に focus が当該要素へ戻らない → 全 TC で after `isBody:false` かつ id が before と同一。該当なし。
- (b) focus は戻るが setSelectionRange 後の selectionStart が退避値と一致しない → 全 TC で after start == before start。該当なし。

## 実測ゲート結果

| TC | before(focus有・caret) | after(focus・caret) | 退避値一致 |
|----|----------------------|--------------------|----------|
| TC-2 | input id=_R_36bdb6_ start=39 | id=_R_36bdb6_ start=39 | 一致 |
| TC-3 | textarea id=_R_bnb6_ start=11 | id=_R_bnb6_ start=11 | 一致 |
| TC-4 | input id=_R_bnb6H1_ start=8 | id=_R_bnb6H1_ start=8 | 一致 |
| TC-5 | textarea id=_R_ubdb6_ start=18 | id=_R_ubdb6_ start=18 | 一致 |

## 判定: PASS

退避値が存在し、復元後 selection が退避値と数値一致。フォールバック条件（focus戻らない / caret不一致）に該当せず。
