# BUG-014: relation_patcher.ts regex без word boundary anchoring — substring leak risk

**Статус:** Open (Low, backlog — pre-existing landmine, не TASK-017 regression)
**Обнаружено:** 2026-05-03 (TASK-017 PR Adversarial review)
**Источник:** Multi-agent code review TASK-017 Approach A
**Критичность:** Low (silent corruption на theoretical entities; weight TASK-018 текущие entities не triggering)

## Симптом

`src/features/generation/generators/relation_patcher.ts:106-111` substitution использует `new RegExp(\`${templateRelatedEntity}Id\`, 'g')` БЕЗ word boundary anchoring (`\b`).

Если template body когда-нибудь содержит substring `${templateRelatedEntity}Id` **внутри другого identifier** — regex matches **mid-identifier** → broken substitution.

## Verified runtime example (Adversarial review TASK-017)

```javascript
'subcategoryId'.replace(/categoryId/g, 'X') === 'subX'  // BROKEN
'parentCategoryId'.replace(/categoryId/g, 'X') === 'parentX'  // BROKEN
```

Если future entity имеет field name `subcategoryId, parent=category` — Approach A (TASK-017) substitution заменит partial substring → broken Dart identifier.

## Корневая причина

Regex `/categoryId/g` matches **anywhere в string**, не только whole-word. Использование `/\bcategoryId\b/g` would prevent partial-identifier matches.

Pre-existing risk:
- Был в old line 90-91 (TASK-016 era) — там тот же `body.replace(new RegExp(\`${templateRelatedEntity}Id\`, 'g'), targetIdName)`
- Persisted в Approach A (TASK-017) — order swap не addresses anchoring

## Production impact

**Currently low** — weight TASK-018 entities не имеют field names с partial-identifier collision pattern:
- `customer_user.spy.yaml`: `roleId, defaultTerminalSetId, customerId` — все standalone identifiers
- `weight*.spy.yaml`: similar pattern

**Future risk** — если weight evolves или другой consumer adds entity типа:
- `subcategoryId, parent=subcategory` (composite FK)
- `parentCategoryId, parent=category` (self-referential)
- `subTypeId, parent=type` где template literal `typeId` exists в body

→ substring match fires → broken substitution → silent compile error.

## Fix proposal

Add `\b` word boundary anchoring:

```typescript
// Current (TASK-017 Approach A):
body = body.replace(new RegExp(`${templateRelatedEntity}Id`, 'g'), targetIdName);
body = body.replace(new RegExp(`${cap(templateRelatedEntity)}Id`, 'g'), targetIdNamePascal);

// Hardened:
body = body.replace(new RegExp(`\\b${templateRelatedEntity}Id\\b`, 'g'), targetIdName);
body = body.replace(new RegExp(`\\b${cap(templateRelatedEntity)}Id\\b`, 'g'), targetIdNamePascal);
```

Trade-off: `\b` matches между word/non-word characters. Safe для identifiers (camelCase identifiers separated by punctuation/whitespace в template body).

## Acceptance criteria для fix

- [ ] Add `\b` word boundary anchoring в `relation_patcher.ts` field-Id substitution regex'ах
- [ ] Add unit test для substring landmine: template body containing `subcategoryId` → fixture с `categoryId`-style FK NOT replaces partial
- [ ] Verify 163 baseline tests preserved (no regression на existing identity case fixtures)
- [ ] Local verify run на свежем `t<N+1>` с substring-collision entity (e.g., entity имеющая `categoryId, parent=category` + comment/docstring containing `subcategoryId`)

## Estimate

~30-45 минут (small change, тесты scope ограничен).

## Связанные

- **TASK-017** (Approach A) — pre-existing risk persisted, не regression
- **TASK-016** (parser fix) — separate concern, parser uses different regex pattern
- **Discussion #6** — 4 agents missed это в design review (focus был на substitution order); Adversarial PR review TASK-017 caught

## Priority

**Low** — defensive hardening, не blocking weight TASK-018 production migration. Schedule после re-acceptance TASK closure если capacity allows.
