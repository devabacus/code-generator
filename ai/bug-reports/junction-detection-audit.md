# TASK-013 Junction Detection Audit — Weight 13 Entities

**Date:** 2026-05-02
**Auditor:** TASK-011 final segment executor (Phase G4)
**Trigger:** Adversarial round 2 finding — TASK-013 priority bumped Medium на бумаге, но actual audit "30-60 минут offline" не сделан. Это vapor mitigation — без list per-entity verdict нельзя trust process.

## Контекст

`OrchestratorPatcher` использует heuristic `model.className.endsWith('Map')` для детекции junction (many-to-many) entities. Junction routing использует `update → createX` pattern для commutativity (write через createX вместо updateX, чтобы избежать data divergence на out-of-order writes).

**False-negative risk:** entity которая semantically junction (2 FK + базовые системные поля) НО имя НЕ заканчивается на `Map` → routing через regular template → silent data corruption под некоторыми race conditions.

## Методология

Для каждой entity в weight (server YAML) проверяем:
1. Имя класса заканчивается на `Map`? (heuristic match)
2. Состав полей: только FK relations + 6 базовых системных (id/userId/customerId/createdAt/lastModified/isDeleted), без других data полей? (junction signature)

`junction` verdict если **обе** signal совпадают (2+ FK + почти нет non-FK domain полей).

## Список синхронизируемых entities в weight (имеют `*_sync_event.spy.yaml`)

| # | Entity (className) | YAML file | `Map` suffix? | Domain (non-FK) поля | FK relations | Verdict |
|---|---|---|---|---|---|---|
| 1 | Configuration | configuration/configuration.spy.yaml | no | group, key, value | customerId | **regular** |
| 2 | Subscription | subscription/subscription.spy.yaml | no | feature, status, startedAt, expiresAt | customerId, terminalSetId | **regular** |
| 3 | TerminalDevice | terminal/terminal_device.spy.yaml | no | mac, type, name, firmwareVersion, lastSeenAt | customerId, terminalSetId? | **regular** |
| 4 | TerminalSet | terminal/terminal_set.spy.yaml | no | name, address, info | customerId | **regular** |
| 5 | CargoType | weighing/cargo_type.spy.yaml | no | name, code, externalId, isActive, notes | customerId | **regular** |
| 6 | Contractor | weighing/contractor.spy.yaml | no | name, inn, kpp, phone, address, externalId, isActive, notes | customerId | **regular** |
| 7 | CorrectionButton | weighing/correction_button.spy.yaml | no | position, label, value, isPercent | customerId | **regular** |
| 8 | CustomField | weighing/custom_field.spy.yaml | no | entityType, fieldName, fieldLabel, fieldType, isRequired, sortOrder | customerId | **regular** |
| 9 | CustomFieldValue | weighing/custom_field_value.spy.yaml | no | value (single value поле + entityId без relation declaration) | customerId, customFieldId | **borderline (см. ниже)** |
| 10 | Driver | weighing/driver.spy.yaml | no | name, phone, licenseNumber, externalId, isActive, notes | customerId, contractorId? | **regular** |
| 11 | Vehicle | weighing/vehicle.spy.yaml | no | plateNumber, trailerPlate, vehicleType, defaultTara, externalId, isActive, notes | customerId, contractorId? | **regular** |
| 12 | Weighing | weighing/weighing.spy.yaml | no | ticketNumber, deviceId, plateRecognized, direction, brutto/bruttoAt/bruttoSessionId, tara/taraAt/taraSessionId, taraSource, netto, operatorId, status, externalId, notes | customerId, terminalSetId, contractorId?, vehicleId?, driverId?, cargoTypeId? | **regular** (много FK, но и много domain полей — это transactional record, не junction) |
| 13 | WeighingCorrection | weighing/weighing_correction.spy.yaml | no | value, label, auto | customerId, weighingId | **regular** |
| 14 | WeighingPhoto | weighing/weighing_photo.spy.yaml | no | photoUrl, photoType, capturedAt, plateRecognized | customerId, weighingId | **regular** |

## Findings

### Strict junction (2 FK + 0 domain поля)

**Нет** в weight. Heuristic `endsWith('Map')` triggered бы 0 entities — что **корректно**, т.к. ни одной junction-style без `Map` суффикса нет.

### Borderline (требует attention)

**CustomFieldValue** — 2 FK (customerId + customFieldId) + единственное domain поле `value: String?`. Похоже на EAV row (Entity-Attribute-Value), не на pure junction. Семантически — `(customField, entityId) → value`, где обновление `value` имеет смысл (regular update flow OK).

**Risk assessment:**
- Если 2 девайса одновременно меняют `value` для (`customField`, `entityId`) → regular update сохраняет last-writer-wins, что может терять одно из значений.
- Junction routing (`update → createX`) дал бы **ровно тот же эффект** — `createX` upsert с last-writer-wins.
- → No actionable risk. Текущий regular routing для CustomFieldValue производит тот же поведение что junction routing бы.

**Verdict:** CustomFieldValue не требует junction routing. Heuristic правильно классифицирует это как regular. Никакая false-negative не угрожает данным.

### Pure junction (2 FK only) — не нашёл

Если бы weight имел entity типа `UserPermission(userId, permissionId)` или `RolePermission(roleId, permissionId)` без `Map` суффикса — это был бы false-negative и требовал бы fix heuristic'а. **В audit таких entity не найдено.**

(Adversarial review упоминал гипотетический `UserPermission` / `RolePermission` / `ContractorTariff` — на disk эти entities в weight НЕ существуют. Не sync entities, не имеют `*_sync_event.spy.yaml`.)

## Hard gate для weight TASK-018

Audit показал что `endsWith('Map')` heuristic корректно классифицирует все 14 sync entities в weight. **Trivially passed**, junction false-negatives отсутствуют.

**Условие unblock'а weight TASK-018:** этот audit document + roadmap hard gate (`weight TASK-018 НЕ стартует пока junction audit не done`).

**Если weight в будущем добавит junction-style entity без `Map` суффикса** (e.g. `UserPermission`):
1. Новый entity автоматически routed через regular template → false-negative.
2. **Mitigation prereq:** TASK-013 priority **High** + fix heuristic ДО next migration.
3. Symptom для detection: divergence of permission state cross-device на out-of-order writes.

## Conclusion

✅ Audit done. **Trivially passed** — все 14 sync entities в weight имеют distinguishing domain поля и heuristic правильно классифицирует их как regular.

**TASK-013 status update:**
- Priority остаётся Medium (не Low, не High).
- Trigger для bump на High: weight в production добавит junction-style entity без `Map` суффикса.
- Detection signal: cross-device data divergence для permission/relationship-table-style entity.
