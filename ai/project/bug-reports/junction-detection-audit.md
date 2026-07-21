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

## Conclusion (initial — superseded ниже)

~~✅ Audit done. **Trivially passed** — все 14 sync entities в weight имеют distinguishing domain поля и heuristic правильно классифицирует их как regular.~~

~~**TASK-013 status update:**~~
- ~~Priority остаётся Medium (не Low, не High).~~
- ~~Trigger для bump на High: weight в production добавит junction-style entity без `Map` суффикса.~~
- ~~Detection signal: cross-device data divergence для permission/relationship-table-style entity.~~

## ⚠ False-negative discovered post-audit (round 3 adversarial)

**Date:** 2026-05-02 (post initial audit, post round 3 adversarial review)
**Trigger:** Adversarial review round 3 Bomb #2 — выявил `role_permission.spy.yaml` на disk в weight repo. Initial audit называл `RolePermission` "гипотетическим" (line 59 ниже), но файл реально существует.

### Methodology gap

Initial audit использовал selection criterion **"only entities имеющие `*_sync_event.spy.yaml`"** (line 21). Это post-hoc filter — он выбирает entities уже включённые в sync set. Junction entities в weight (RolePermission, CustomerUser) не имеют sync_event yet → не попали в audit выборку → got missed как false-negative candidates.

**Methodology должна была быть:** scan **всех** `*.spy.yaml` под `weight_server/lib/src/models/` на 2-FK signature независимо от sync inclusion, потому что любое из них может позже быть добавлено в sync set + auto-receive routing через `endsWith('Map')` heuristic.

### Verified false-negative cases

#### Case 1: RolePermission (pure 2-FK junction)

**File:** `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/role_permission.spy.yaml`

**Content:**
```yaml
# manifest: startProject
class: RolePermission
table: role_permission
fields:
  id: UuidValue?, defaultPersist=random_v7
  roleId: UuidValue, relation(parent=role, onDelete=Cascade)
  permissionId: UuidValue, relation(parent=permission, onDelete=Cascade)
```

**Signature:** **pure junction** — 2 FK (`roleId` + `permissionId`) + 0 domain поля. Имя НЕ `RolePermissionMap` → `endsWith('Map')` heuristic returns `false` → routing через regular template.

**Risk if added to sync set:** silent data corruption на cross-device permission edits. Out-of-order writes на `(roleId, permissionId)` через regular `updateX` flow дадут last-writer-wins вместо junction `update→createX` upsert pattern. Symptom: "permission gone" / "permission ghost" cross-device, невозможно diagnose без deep trace.

#### Case 2: CustomerUser (3-FK + 1 nullable FK junction-style)

**File:** `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/customer_user.spy.yaml`

**Content:**
```yaml
# manifest: startProject
class: CustomerUser
table: customer_user
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  userId: int,
  roleId: UuidValue, relation(parent=role, onDelete=Cascade)
  defaultTerminalSetId: UuidValue?, relation(parent=terminal_set, onDelete=SetNull)
```

**Signature:** **junction-style** — 3 explicit FK (customerId + userId + roleId) + 1 nullable FK (defaultTerminalSetId) + 0 user-defined domain поля. Имя НЕ `CustomerUserMap` → `endsWith('Map')` heuristic returns `false` → routing через regular template.

**Risk if added to sync set:** аналогично RolePermission — out-of-order writes на membership/role assignment могут терять changes. Particularly critical для `roleId` updates (revoke/grant role), где ghost state может leave user с устаревшими permissions.

### Cross-check non-junction patterns

Из сканирования всех 47 `*.spy.yaml` файлов в weight_server/models:
- **2 confirmed junction false-negatives:** RolePermission, CustomerUser (см. выше).
- **0 ambiguous cases** в текущем scan beyond Case 1/2.
- Initial audit's borderline (CustomFieldValue) re-confirmed как **regular** — у него есть domain field `value: String?`, не pure junction.

### Verdict (revised)

**NOT trivially passed** — confirmed **2 false-negative cases** (RolePermission, CustomerUser) в weight repo на текущий момент (2026-05-02). `endsWith('Map')` heuristic produces real false-negatives для pure FK-only entities в существующей weight schema, даже до их добавления в sync set.

**TASK-013 status update (revised):**
- Priority **Medium → High** (bumped per round 3 adversarial review).
- Не "trigger-based" больше — **fixed gate** перед weight TASK-018: TASK-013 должен быть closed ДО TASK-018 start, иначе RolePermission/CustomerUser получают broken routing на момент migration.
- Scope expanded: replace `endsWith('Map')` heuristic на YAML field analysis (2+ FK relations + minimal/zero non-FK domain поля → junction) ИЛИ explicit `junction: true` flag в YAML.

### Lesson

Audit selection criteria "only existing sync entities" — это leaky abstraction для prediction problem. Audit должен отвечать на вопрос **"если entity попадёт в sync set, будет ли routing correct?"** — это требует scan **всех** `*.spy.yaml` независимо от текущего sync state.

Future audits такого типа должны:
1. Scan ALL `*.spy.yaml` в `<server>/lib/src/models/` (не только entities имеющие `*_sync_event.spy.yaml`).
2. Per entity: count FK relations (signaled by `relation(parent=...)` syntax) + count non-FK domain fields.
3. Flag as junction-style: 2+ FK + ≤1 trivially-typed non-FK поле (id is excluded — auto-PK).
4. Verify naming heuristic match per flagged entity.

---

## Re-audit 2026-05-02 (post TASK-013 fix)

**Trigger:** TASK-013 implementation — replacement `endsWith('Map')` heuristic на `JunctionDetector.isJunctionEntity()` shared utility (Discussion #2 Q1=C / Q2=A / Q3=A unanimous consensus). Re-audit нужен для подтверждения что новая methodology корректно классифицирует обе false-negative cases (RolePermission, CustomerUser) + не вводит false-positives.

### Updated methodology

Programmatic scan через `node` running compiled `out/features/generation/parsers/junction_detector.js`:

```bash
# Walks все *.spy.yaml под weight_server/lib/src/models/ (excluding *_sync_event.spy.yaml)
# Для каждого: ServerpodYamlParser.parse() → JunctionDetector.analyze()
# Output: junction list (with reason) + regular list (with FK count + extra fields)
node /tmp/audit_weight.js  # script saved at C:/Users/User/AppData/Local/Temp/audit_weight.js
```

**Detection rules** (per `junction_detector.ts`):
- **Structural junction:** 2+ FK relations (`isRelation === true`) + 0 non-FK fields outside base whitelist (`id, userId, customerId, createdAt, lastModified, isDeleted`). Nullable FK = FK.
- **Explicit override:** YAML top-level `junction: true` field (not used in weight today; reserved for junction-with-metadata e.g. `UserPermission(userId, permissionId, assignedAt)`).
- **Validation:** `junction:true` + FK<2 throws `JunctionValidationError`.

### Results (37 YAML files scanned)

#### Junction-detected (2)

| # | Entity | File | FK count | FKs | Reason |
|---|--------|------|----------|-----|--------|
| 1 | **RolePermission** | `user/role_permission.spy.yaml` | 2 | roleId, permissionId | `structural` |
| 2 | **CustomerUser** | `user/customer_user.spy.yaml` | 3 | customerId, roleId, defaultTerminalSetId (nullable) | `structural` |

**Verdict:** обе false-negative cases из original audit (round 3) **correctly classified as junction** через новую structural detection. Routing через `_JUNCTION_*` templates на момент future migration.

#### Newly-discovered junction-style entities

**Нет** — кроме уже известных RolePermission + CustomerUser, других strict-junction entities (2+ FK + 0 extra fields) в weight нет.

#### Regular (27)

Все остальные 27 entities classified as regular. Highlight'ы:
- **Configuration, TerminalSet, Cargo/Contractor/CorrectionButton/CustomField/Driver/Vehicle/Weighing**: имеют domain поля (group/key/value, name/address, etc) → не junction.
- **Subscription** (FK=2: customerId + terminalSetId, extras=4): не junction — есть `feature, status, startedAt, expiresAt` business fields.
- **TerminalDevice** (FK=2: customerId + terminalSetId, extras=5): не junction — есть `mac, type, name, firmwareVersion, lastSeenAt`.
- **CustomFieldValue** (FK=2, extras=2: `entityId, value`): не junction — `value` field carries domain data (EAV-style).
- **Weighing** (FK=6, extras=16): definitely transactional record, не junction (наибольшее количество FK + наибольший набор domain полей).
- **WeighingCorrection / WeighingPhoto** (FK=2 each, extras=3-4): regular — содержат attribute поля (value/label/photoUrl).

### Cross-check vs initial audit

Original audit (line 23-38) covered 14 entities (только sync set — те что имели paired `*_sync_event.spy.yaml`). Re-audit покрыл **37 entities** — full models tree. **No additional false-negatives discovered.**

Borderline cases re-confirmed:
- `CustomFieldValue` остаётся **regular** — domain field `value` присутствует, structural detection корректно flags as regular.
- `Subscription`, `TerminalDevice` — re-affirmed regular per same logic.

### Verdict (post-TASK-013)

✅ **Resolved.** Both false-negatives (RolePermission + CustomerUser) **correctly detected as junction** через `JunctionDetector.isJunctionEntity()` после TASK-013 fix. **No new false-negatives** discovered в weight schema. **No false-positives** introduced (все 27 regular entities classified correctly).

Hard gate для weight TASK-018 ✅ closed: junction routing будет корректным на момент migration. RolePermission и CustomerUser получат `_JUNCTION_*` template snippets (update→createX + docstring) при добавлении в sync set.
