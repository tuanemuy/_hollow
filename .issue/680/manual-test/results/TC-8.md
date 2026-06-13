# TC-8: IME 変換中の invalidate で未確定文字が壊れない（S-003）

- セッション: verify-tc-8
- 対象: /admin/prompts text `<textarea>`（id `_R_bnb6_`）
- 手法: 実 IME 駆動は agent-browser で困難なため、`CompositionEvent('compositionstart'|'compositionend')` を
  dispatch して composition フラグを立て/降ろして代替確認（testing.md 項目8 の代替手順）。

## 目的

composition 中に invalidate が重なっても `setSelectionRange` で変換セッションが破壊されない
（composition 中は復元が抑制される）。

## 操作と実際

### 変換中（compositionstart 後）に invalidate

1. textarea に "abcdefghij" を入力、ArrowLeft x3 で caret=7
2. `dispatchEvent(compositionstart)` で composingRef=true
3. before: `{tag:TEXTAREA, id:_R_bnb6_, start:7, end:7, val:"abcdefghij"}`
4. `invalidate({ filter: m => m.routeId !== '/_app' })`
5. after: `{activeTag:BODY, isBody:true, taStart:7, taEnd:7, taVal:"abcdefghij"}`

→ 復元が抑制され focus は body へ落ちたまま。**重要: textarea の caret は 7 のまま動かず、
`setSelectionRange` は呼ばれていない**（caret 強制移動なし）。value 保持。

### 変換確定後（compositionend 後）に invalidate

6. `dispatchEvent(compositionend)`（composingRef=false）、focus + caret=7 に戻す
7. `invalidate(...)`
8. after: `{tag:TEXTAREA, isBody:false, id:_R_bnb6_, start:7, end:7}`

→ 復元が再開し focus 復帰・caret 7 保持。

## 判定: PASS（代替確認）

composition 中は `setSelectionRange`/refocus が抑制され（caret 不動 = 変換セッション非破壊）、
compositionend 後は復元が再開することを確認。

## 検証の限界

実 IME（日本語変換候補表示中）の駆動は agent-browser では行えず、`compositionstart`/`compositionend`
イベントの dispatch によるフラグ再現で代替した。未確定文字列そのものの保持（変換候補ウィンドウの
維持）はブラウザ/IME 側の挙動であり本フックの対象外。フックの責務である「composition 中は
setSelectionRange を呼ばない」点は確認済み。
