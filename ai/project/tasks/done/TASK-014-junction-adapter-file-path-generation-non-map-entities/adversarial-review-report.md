# Adversarial / Red Team Review Report — TASK-014

**Reviewer:** adversarial / paranoid skeptic
**Date:** 2026-05-02
**Verdict:** **SHIP WITH WARNINGS**

Standard reviewer выкатил `APPROVE WITH NITS` за 1 typo в status.md. Я не вежлив. После полудня грепа, чтения diff, независимого re-run mocha (`119 passing`) и `verify --name t157` (`errors=0, warnings=1, infos=67` — identical к report.md JSON) — вынужден признать: **lib/ код хорош, тесты воспроизводимы, evidence не fabricated**. Это редкий случай.

Но это TASK-014 specifically. Verdict не `SHIP` (а `SHIP WITH WARNINGS`) потому что **acceptance scope в task.md и реальное E2E evidence не совпадают** — Test 2 явно требует `RolePermission`, Test 3 — `CustomerUser` (3-FK + nullable). Executor реально протестировал только `ProjectMember` (2-FK), а CustomerUser/RolePermission покрыты **только unit-тестами** на mock fixtures. Switch на ProjectMember legitimate (t115 namespace collision подтверждён независимо), но task.md acceptance не обновлён под фактическое evidence — это создаёт audit trail asymmetry.

Плюс несколько архитектурных bombs замедленного действия (см. ниже), которые **не блокируют merge**, но сорвут weight TASK-018, если их не задокументировать перед migration.

---

## Прогноз

Через месяц production миграция weight TASK-018 **не сорвётся в первый день** (lib/ код handles RolePermission корректно — это symmetric с ProjectMember pattern, проверено через unit tests). НО **сорвётся на CustomerUser** через 3-7 дней миграции — потому что _docstring и method-name substitution_ для CustomerUser даст `junction FK→customer+role` (FIRST 2 FK fields в declaration order: `customerId` + `roleId`, **userId — НЕ FK** в weight YAML, type=`int`), а реальная business key для `deleteCustomerUserBy*` должна быть `Customer+User`. Server endpoint generation (через MANY_TO_MANY словарь который читает `model.entity1`/`entity2` — те же первые 2 FK) даст `deleteCustomerUserByCustomerAndRole`. Это **semantic mismatch** с business intent. Пройдёт `serverpod generate` (синтаксически valid), пройдёт `flutter analyze`, пройдёт `verify`. Сломается на runtime когда orchestrator попытается `delete()` через soft-delete by-key path — server вернёт 404 или resurrect неправильную row.

Это не TASK-014 баг сам по себе — это **pre-existing limitation** парсера (`server_yaml_parser.ts:51-52` использует `relationFields[0]/[1]` для entity1/entity2). TASK-014 расширил поверхность атаки: теперь FK extraction делается **ещё в одном месте** (`orchestrator_patcher._buildRegisterSnippet` lines 260-262), используя identical `relationFields[0]/[1]` algorithm. Любая будущая правка одного из двух мест без второго — drift.

---

## Top production bombs (sorted by likelihood)

### Bomb #1: CustomerUser FK extraction берёт `customerId+roleId` вместо `customerId+userId`

- **Probability через месяц:** **high** (триггерится первой же weight TASK-018 миграцией CustomerUser)
- **Blast radius:**
  - Real `weight_server/lib/src/models/user/customer_user.spy.yaml`:
    ```yaml
    customerId: UuidValue, relation(parent=customer, ...)   # FK
    userId: int                                              # НЕ FK
    roleId: UuidValue, relation(parent=role, ...)            # FK
    defaultTerminalSetId: UuidValue?, relation(...)          # FK nullable
    ```
  - `relationFields = [customerId, roleId, defaultTerminalSetId]`
  - `model.entity1 = 'customer'`, `model.entity2 = 'role'` (server_yaml_parser.ts:51-52)
  - `_substituteJunctionFKs` (orchestrator_patcher.ts:260-262) делает то же самое → fk1='customer', fk2='role'
  - **Результат:**
    - Orchestrator docstring: `junction FK→customer+role` (НЕ `customer+user`)
    - Server endpoint method: `deleteCustomerUserByCustomerAndRole` (НЕ `ByCustomerAndUser`)
    - `replacement_util.MANY_TO_MANY`: substitution `task → customer`, `tag → role` → правильно подставит class names (`CustomerUser`), но method-name fragment окажется `ByCustomerAndRole`.
  - **Runtime:** orchestrator пробует `delete()` через `_client.deleteCustomerUserByCustomerAndRole(customerId, roleId)` — но business key для CustomerUser должен быть `(customerId, userId)` (это **юзер связь**, не role). Server returns 404 или удаляет другую row → silent data corruption.
- **Trigger:** weight TASK-018 миграция CustomerUser entity через `generate-entity --yaml customer_user.spy.yaml`.
- **Why current code/tests don't catch it:** 
  - `orchestrator_patcher.test.ts:576-603` (TASK-013 CustomerUser test) использует **substring** `result.includes('Junction-specific')` + `register<CustomerUserEntity>` + `customer_user_remote_adapter.dart`. Все эти substrings проходят независимо от FK substitution. Specifically: docstring text `junction FK→customer+role` НЕ asserted в этом тесте.
  - `orchestrator_patcher.test.ts:629-693` (TASK-014 RolePermission docstring test) проверяет `junction FK→role+permission` для RolePermission — но **аналогичного теста для CustomerUser нет**.
  - `generation_service.test.ts:221-247` (TASK-014 CustomerUser path test) проверяет path generation `customer_user/` — этот layer **корректен** (path использует `targetJunctionClassName='CustomerUser'`, не FK). Path test не catches docstring/method-name issue.
  - **Test fixture в orchestrator_patcher.test.ts:582** имеет fake `userId: int, isRelation undefined` — accidentally matches real weight YAML. Этот fixture даже **доказывает** что TASK-014 даст `customer+role` extraction для CustomerUser (`fkFields.filter(isRelation === true)` returns `[customerId, roleId, defaultTerminalSetId]`, take first 2). Fixture явно показывает баг, но тест не делает assertion на docstring text.
- **Mitigation:** **Document как known limitation** + add explicit warning в `docs-code-generator/sync-core-integration.md`. Pre-existing limitation парсера, но TASK-014 расширил blast radius (теперь два места с identical algorithm — один drift и docstring/method-name desync). Не block, но MUST document перед weight TASK-018.

---

### Bomb #2: Acceptance scope drift — task.md требует RolePermission/CustomerUser E2E, executor предоставил ProjectMember

- **Probability через месяц:** **medium** (audit trail issue, не runtime)
- **Blast radius:** Future maintainer / agent читает `task.md:67-78` → видит **Test 2: RolePermission generate-entity → правильная directory + filenames + class refs** + **Test 3: CustomerUser (3-FK + nullable FK)**. Открывает report.md → видит ProjectMember evidence. Spends 30 min'ов figuring out почему mismatch. Trust в acceptance evidence системе erodes — каждый последующий PR требует независимой re-проверки.

  Конкретные несостыковки:
  - **task.md:69** "Test 2: RolePermission generate-entity → `role_permission/` directory + `role_permission_*.dart` files + `RolePermission` class references (NOT `RolePermissionMap`)" → executor сделал ProjectMember (verified) + RolePermission **только unit test** в replacement_util.test.ts:204-237.
  - **task.md:70** "Test 3: CustomerUser (3-FK + nullable FK) → правильная directory + filenames + class refs" → executor сделал unit test для path в generation_service.test.ts:221-247, но **НЕ** для orchestrator docstring / FK extraction.
  - **task.md:75-79** "DoD generate-entity E2E (TASK-013 incomplete DoD closure)" — task.md prescribes RolePermission specifically. Report.md заявляет ProjectMember satisfies criteria.
- **Trigger:** Standard reviewer / future agent опирается на task.md как acceptance source. 
- **Why current code/tests don't catch it:** Это process/audit issue, не code. Standard review approve'нул — но он сам подсветил что switch legitimate (t115 namespace collision), не зафиксировав что **task.md остался stale**.
- **Mitigation:** **Update task.md** перед merge с явным notice "Test 2/3 entity name изменён с RolePermission/CustomerUser → ProjectMember из-за t115 template namespace conflict (verified). RolePermission/CustomerUser cases покрыты unit tests." Punt to optional cleanup — не blocks merge correctness, но fixes audit trail.

---

### Bomb #3: legacy fallback `<E1><E2>Map` shape — silent leak в production

- **Probability через месяц:** **low-medium** (зависит от того, забудет ли кто-то wire-up `targetJunctionClassName` в новом call-site)
- **Blast radius:** `replacement_util.ts:81-87` legacy fallback path — если `config.targetJunctionClassName` не set (или empty string), substitution производит `<E1><E2>Map` shape:
  - `task → role`, `tag → permission`, `task_tag_map → role_permission_map`, `TaskTagMap → RolePermissionMap`.
  - В generated content окажется `class RolePermissionMap extends Entity {}` — **identical к pre-TASK-014 broken state**.
  - Это **тот самый Bomb #2 из TASK-013 adversarial round 1**, который TASK-014 должна была закрыть. Закрыта только если caller правильно set'нет `targetJunctionClassName`.
- **Trigger:** Future code path который добавляет третий call-site для junction generation (помимо `generate_entity.ts:99` и `create_data_files_by_replacement.ts:51`) и **забывает** передать `model.className`. Например, гипотетический batch-mode CLI или script-driven generation.
- **Why current code/tests don't catch it:** Test `'TASK-014: legacy fallback (no targetJunctionClassName) → <E1><E2>Map shape'` (replacement_util.test.ts:262-285) **подтверждает** что fallback shape это `RolePermissionMap`. Это intentional backward compat для старого VS Code path. Но это **silent**: если новый caller забывает field — нет error, нет warning, просто wrong output.
- **Mitigation:** **Document как known landmine** + consider hardening:
  - Option A: emit `console.warn` в `replacement_util.ts` если `MANY_TO_MANY` rules generated с empty `targetJunctionClassName`.
  - Option B: deprecate legacy fallback в follow-up TASK после verification что VS Code wire-up комплексен.
  - Standard reviewer Finding #4 (informational) recommended deprecation. Я согласен — тех долг.

---

### Bomb #4: regex lookahead в `_getDestinationPath` — Windows path edge case

- **Probability через месяц:** **low** (Windows-specific, ловится тестами на Windows)
- **Blast radius:** `generation_service.ts:264-273` использует regex с lookahead `(?=_|/|\\.|$)`:
  ```ts
  destinationRelativePath = destinationRelativePath.replace(
      new RegExp(`${tplE1}(?=_|/|\\.|$)`, 'g'),
      targetE1,
  );
  ```
  Lookahead включает `/` (POSIX path separator), но **НЕ** `\\` (Windows backslash). На Windows `path.relative` может вернуть `\\`-separated path. Хотя line 98/137 явно вызывает `.replace(/\\/g, '/')` чтобы нормализовать в POSIX — это работает. **Но**: что если в будущем кто-то добавит call-path который не нормализует? lookahead не сработает на `task\folder/file.dart` → `task` НЕ заменён → путь broken.
- **Trigger:** Hypothetical: feature развивается, добавляется direct path manipulation который пропускает normalization. Latent bomb.
- **Why current code/tests don't catch it:** Все тесты используют forward-slash paths. Windows-specific regression не покрыт.
- **Mitigation:** **Document, punt to follow-up.** Add `\\\\` к lookahead alternation для defense-in-depth: `(?=_|/|\\\\|\\.|$)`. Не блокер.

---

### Bomb #5: `_extractEntityNameFromField` копипаст из server_yaml_parser — два source of truth

- **Probability через месяц:** **medium** (latent — драфт через будущие правки)
- **Blast radius:** TASK-014 ввёл `_extractEntityNameFromField` в `orchestrator_patcher.ts:300-306`, который **mirrors** logic из `server_yaml_parser.ts:61-66`:
  ```ts
  // server_yaml_parser.ts:61-66
  if (field.relatedModel) {
      return field.relatedModel.toLowerCase();
  }
  return field.name.replace(/Id$/, '').toLowerCase();

  // orchestrator_patcher.ts:300-306 — IDENTICAL logic
  ```
  Inline комментарий честно говорит "Mirrors logic из server_yaml_parser.ts". Но это два места которые могут разойтись. Если кто-то правит server_yaml_parser (например, добавляет handling для `relatedModel` без `Id` suffix или snake_case FK names) — orchestrator_patcher silently останется на старой logic → drift между entity1/entity2 (parser) и FK substitution в docstring (patcher).
- **Trigger:** Future schema enhancement — e.g. yaml field `relation(parent=foo_bar)` → snake_case parent name. Parser обновляется → patcher отстаёт.
- **Why current code/tests don't catch it:** No integration test which verifies parser output and patcher output stay aligned для same model. Unit tests изолируют эти системы.
- **Mitigation:** **Refactor — extract shared utility** в follow-up. Move `extractEntityNameFromField` в `JunctionDetector` или новый utility module → both parser + patcher use single function. Не блокер для TASK-014, но architectural smell.

---

### Bomb #6: Test fixture для CustomerUser в orchestrator_patcher accidentally matches buggy production behavior

- **Probability через месяц:** **medium** (false confidence — test passes even when extraction wrong)
- **Blast radius:** `orchestrator_patcher.test.ts:582` имеет fixture:
  ```ts
  { name: 'userId', type: 'int', nullable: false },  // NOT FK (no isRelation flag)
  ```
  Это **верно** matches real weight YAML. **Но**: тест line 591-602 не делает assert на docstring text. Так что:
  - Если patch broken и produced `junction FK→customer+role` — test passes (substring match только).
  - Если patch broken и produced `junction FK→customer+user` — test passes (substring match только).
  - Если patch broken и produced `junction FK→cookie+monster` — test passes (substring match только)!
  
  Test проверяет только что docstring **существует** (`Junction-specific`), не что contents semantically correct.
- **Trigger:** Любая регрессия в `_substituteJunctionFKs` или `_extractEntityNameFromField` — тест продолжит passing.
- **Why current code/tests don't catch it:** Test was written для TASK-013 (detection-side) когда `_substituteJunctionFKs` ещё не существовал. После TASK-014 fixture стала доступна для catch'инга bomb #1 — но тест НЕ обновлён добавить semantic assertion.
- **Mitigation:** **Add positive assertion** в TASK-013 CustomerUser test:
  ```ts
  assert.ok(result.includes('junction FK→customer+role'),  // или 'customer+user' если fix
      'CustomerUser docstring должен явно отражать FK extraction результат');
  ```
  Это caught бы bomb #1 при unit-level + zafiks'ит current behavior. Document the limitation в comment. Не блокер.

---

### Bomb #7: `process(replaceAll)` order — длинный токен first depends on string ordering

- **Probability через месяц:** **low**
- **Blast radius:** `replacement_util.ts:96-100`:
  ```ts
  rules.push(
      { from: tplJunctionSnake, to: targetJunctionSnake },  // 'task_tag_map' → '...'
      { from: tplJunctionPascal, to: targetJunctionPascal }, // 'TaskTagMap' → '...'
      { from: tplJunctionCamel, to: targetJunctionCamel },  // 'taskTagMap' → '...'
  );
  ```
  Inline comment: "Snake_case длиннее camelCase/PascalCase, поэтому идёт первым". Это **верно для `task_tag_map` vs `TaskTagMap`** (10 chars vs 10 — actually IDENTICAL length, but snake first because hardcoded order). 
  
  Однако length comparison fragile: если кто-то добавит junction с **single-word entity1+entity2**, snake = `<E1>_<E2>_map` (e.g. `a_b_map` = 7), camel = `aBMap` = 5, Pascal = `ABMap` = 5 — snake_case longer. OK для current schema.
  
  **Edge case:** entity1 = single letter, entity2 = single letter. snake = `a_b_map` (7), camelCase `aBMap` (5) — snake first → корректно. Не bomb сейчас, но depends on assumption.
- **Trigger:** Никогда практически — junction entity1/entity2 в production не будут single-letter.
- **Mitigation:** **Punt as theoretical**. Не блокер.

---

### Bomb #8: Wire-up в generate_entity.ts передаёт `targetJunctionClassName: model.isRelation ? model.className : undefined`

- **Probability через месяц:** **low**
- **Blast radius:** Если detection logic в `JunctionDetector.isJunctionEntity()` имеет регрессию (false-negative) → `model.isRelation = false` → `targetJunctionClassName = undefined` → MANY_TO_MANY словарь идёт через legacy fallback → `<E1><E2>Map` shape. Tight coupling.
  
  Но: detection regression уже отдельный baseline (TASK-013 baseline 110 tests), его покрытие отдельное.
- **Trigger:** Future detection logic regression.
- **Why current code/tests don't catch it:** Cross-component test coverage missing. Detection + path generation тестируются изолированно.
- **Mitigation:** **Document как architectural smell**. Не блокер. См. Architectural smell #1 ниже.

---

## Architectural smells

1. **Двойное место FK extraction** — `server_yaml_parser.ts:44-58` (entity1/entity2 для MANY_TO_MANY словаря) + `orchestrator_patcher.ts:260-262` (FK substitution в docstring). Identical algorithm, разные locations. Bomb #5 + #1 — оба коренятся здесь.

2. **`isRelation` field на `ServerpodModel`** — каноничное wrong abstraction (унаследовано). `JunctionDetector.isJunctionEntity()` — single source of truth, но parser кеширует результат в `model.isRelation`. Test fixtures в `generation_service.test.ts` устанавливают `isRelation: true` manually — это **lie** для test purposes. Дрейф между runtime detection и cached flag — будущая bomb. Pre-existing issue, exposed by TASK-014 wire-up.

3. **Legacy fallback (`<E1><E2>Map` shape)** в replacement_util.ts:81-87 — back-compat для VS Code path который "не set'ит targetJunctionClassName". Но VS Code wire-up на line 51 в `create_data_files_by_replacement.ts` **теперь** set'ит `targetJunctionClassName`. Так что legacy fallback — **dead code path** для известных callers. Но документирован и тестирован (replacement_util.test.ts:262-285) → если кто-то рефакторит wire-up и снова забывает — silent reversion на broken behaviour.

4. **`_substituteJunctionFKs` использует `__FK1__`/`__FK2__` placeholders** — это магические markers с zero-contract'ом. Если кто-то напишет YAML где FK имя literally содержит `__FK1__` (theoretical, not realistic) — collision. Better approach: использовать template engine (handlebars-style `{{fk1}}`) или AST-based substitution.

5. **`tplCamel = tplEntity` в `_buildRegisterSnippet:248`** — для junction `tplEntity = 'taskTagMap'` (camelCase). `tplSnake = toSnakeCase('taskTagMap') = 'task_tag_map'`. Standard substitution заменяет `taskTagMap → rolePermission`. **Проблема:** что если junction имеет 3-word className, e.g. `RoleUserPermission`? `tplCamel = 'taskTagMap'` (hardcoded template), `targetCamel = 'roleUserPermission'`. Заменит всё OK. Но если будущий template добавит больше literal forms (`taskTagMaps` plural)... — current substitution chain не handles plural. Standard reviewer не проверял.

6. **Test fixtures в orchestrator_patcher.test.ts включают `userId: int (NOT FK)` в makeJunctionModel**. Это **точная репродукция** weight CustomerUser baseline — fixture даже sets `isRelation: true` (line 27 of `makeJunctionModel`) artificially. Real parser flow устанавливает это через `JunctionDetector` который **проверяет structural FK count**. Fixture это обходит. Это значит unit tests **могут pass** даже если detection regression — testing happens на artificially-tagged models. Pre-existing pattern, но opaque.

7. **`_buildRegisterSnippet` для junction делает 2 sequential substitutions** (`_substituteJunctionFKs` then `_substitutePlaceholders`). Order matters. Если кто-то рефакторит `_substitutePlaceholders` чтобы добавить feature path substitution **до** entity substitution — `__FK1__` markers могут случайно match'нуть. Защита: markers `__FK1__` уникальны (uppercase + underscores) и не появляются в normal Dart code. OK для now, но **fragile coupling** documentation-only.

8. **No integration test create-project + generate-entity на fresh project**. Standard reviewer Finding отметил что fresh `t158 create-project` не возвращает TaskTagMap evidence (autoGenerateTasksFeature удалён). Backward compat covered только unit tests. **Adversarial:** unit tests могут пропускать interaction между (fileSystem state) × (manifest scanning) × (replacement). Полное E2E testing требует runtime project + verify, но это slow + flaky.

9. **status.md typo `TASK-011 → TASK-014` (Standard reviewer Finding #1)** — это **второй** typo в trail (TASK-013 standard review также flagged status.md typo). **Pattern:** низкая внимательность executor'а к admin work. Code quality высокий, но meta-level discipline эродирует. Не блокер для merge, но **тренд**.

10. **`Test 4: M2M словарь parametrization unit test`** (task.md line 71) был расширен executor'ом до 3 тестов (legacy fallback + RolePermission + TaskTagMap backward compat), что **превышает** acceptance criteria. Standard reviewer счёл positive. **Adversarial:** spec'и acceptance просили 6+ tests, executor написал 9, но **3 из 9** дублируют tested behavior across layers (replacement_util + generation_service + orchestrator_patcher все имеют RolePermission case + все имеют TaskTagMap backward compat). Не bomb, но **redundancy без cross-layer integration test** — Bomb #5 root cause.

---

## Что spec'и врут / умалчивают

1. **task.md:67-78 Test 2/3 acceptance** — явно требует `RolePermission` (Test 2) + `CustomerUser` (Test 3) как E2E test entities. Report.md заявляет evidence через ProjectMember. **Mismatch не задокументирован в task.md** — task.md остался stale. Standard reviewer noted switch как legitimate (t115 collision verified) но не флагнул что task.md acceptance text не обновлён.

2. **report.md:142 "side note: t156 verify FAIL'ed"** — executor честно описал namespace conflict. **Но**: report не указывает что **acceptance scope в task.md** должен быть updated, не просто side-noted. Это асимметрия между evidence и spec.

3. **roadmap.md:44** "DoD verify PASS errors=0 на t157 (E2E ProjectMember junction generate-entity flow)" — **technically true** для t157, но скрывает что RolePermission (real target из task.md) не получил E2E verification. Это **weasel words** — acceptance scope сужен post-hoc.

4. **roadmap.md:77** "non-Map junctions (RolePermission, CustomerUser) генерируются в правильную directory с правильными class refs" — **misleading**. Generation для **path** verified только через unit tests (mock fixtures). E2E generation для RolePermission/CustomerUser в weight на disk **не проверялся**. Если roadmap.md читается как "weight TASK-018 ready for migration" — это premature confidence.

5. **report.md "Backward compat: TaskTagMap regression OK через unit tests"** — **technically true** на 3 layers, но **runtime evidence отсутствует** потому что `autoGenerateTasksFeature` удалён из bootstrap (commit `0a96e9f`). Backward compat не проверен на real project create. Standard reviewer accepted unit-test coverage как достаточный — **adversarial:** unit tests могут пропустить FS state / scan / manifest interactions.

6. **report.md "9 new tests (3 + 4 + 2)"** — number correct. Но **distribution skewed**: 4/9 на path generation (generation_service), 3/9 на dictionary (replacement_util), только 2/9 на orchestrator (где FK extraction live). Bomb #1 (CustomerUser FK extraction) уязвим именно потому что orchestrator coverage thin.

7. **task.md:88 "CLI `--junction-feature-path` override"** — Should-have NOT done. Это OK (Should-have), но если Bomb #5/#1 проявится — `--junction-feature-path` могло бы быть escape hatch. Punt'нуто без документирования rationale.

8. **report.md упоминает "VS Code test runner blocked Inno Setup mutex"** — workaround для mocha direct. Я воспроизвёл `npm run compile` + mocha direct — работает. Не bomb, но `npm test` regression: если кто-то новый прийдёт и запустит `npm test`, увидит ошибку mutex и подумает что тесты broken. Documentation в `agent_memory.md` есть, но in-repo нет (`README.md` не обновлён).

---

## Recommendation per bomb

| Bomb | Decision | Rationale |
|---|---|---|
| #1 CustomerUser FK extraction `customer+role` vs `customer+user` | **Document как known limitation** | Pre-existing parser behavior, TASK-014 расширил blast radius. Add to `docs-code-generator/sync-core-integration.md` warning section. Recommend follow-up TASK для shared `extractEntity1Entity2` utility + integration test. Не block merge. |
| #2 acceptance scope drift (RolePermission vs ProjectMember) | **Update task.md before merge** | Trivial fix: add note "Test 2/3 entity changed from RolePermission/CustomerUser to ProjectMember due to t115 namespace collision (verified). Original cases covered via unit tests." Audit trail integrity. Не блокер для функциональности. |
| #3 legacy fallback `<E1><E2>Map` shape silent reversion | **Document как architectural smell** | Add deprecation note. Standard reviewer Finding #4 уже recommended deprecation в follow-up. Punt. |
| #4 regex lookahead Windows path | **Punt to follow-up** | Theoretical, current normalization protects. Defense-in-depth fix trivial (`\\\\` к alternation). Не block. |
| #5 двойной FK extraction algorithm | **Document architectural smell, recommend extract shared utility в follow-up** | Bomb #1 root cause. Не block, но MUST plan refactor. |
| #6 CustomerUser test fixture passes без semantic assertion | **Block — quick fix перед merge** | 5-line fix: add `assert.ok(result.includes('junction FK→customer+role') OR 'customer+user'))` к `orchestrator_patcher.test.ts:603` чтобы зафиксировать current behavior. Это caught бы bomb #1 на unit level. |
| #7 substitution length ordering | **Punt — theoretical** | Не trigger в production schema. |
| #8 wire-up tight coupling к detection | **Document architectural smell** | Cross-component test coverage missing. Punt to follow-up. |

---

## Final verdict

**SHIP WITH WARNINGS** — rationale:

**SHIP rationale:**
1. lib/ код корректен. Я воспроизвёл `npm run compile` + mocha direct (`119 passing, 0 failing`) + `verify --name t157` (`errors=0, warnings=1, infos=67`) — identical к report.md.
2. RolePermission switch на ProjectMember legitimate — t115 namespace collision verified независимо (`role.spy.yaml`, `permission.spy.yaml`, `role_permission.spy.yaml` exist в `t115_server/lib/src/models/user/`).
3. Path generation logic правильно handles backward compat (TaskTagMap → identity) + non-Map junctions (RolePermission/CustomerUser/ProjectMember → правильная directory + filenames).
4. 9 new tests + 110 baseline preserved.

**WARNINGS rationale:**
1. **Bomb #1 (CustomerUser FK docstring)** — high probability через месяц, но это pre-existing parser limitation. MUST document перед weight TASK-018 migration.
2. **Bomb #2 (acceptance scope drift)** — task.md осталась stale против реального evidence. Trivial fix, audit trail issue.
3. **Bomb #6 (test fixture semantic assertion missing)** — 5-line fix укрепил бы coverage против Bomb #1.
4. **Architectural smell #1** (двойное FK extraction) — следующий refactor должен унифицировать.

**Минимум перед merge:**

1. **Update task.md** добавить note про RolePermission → ProjectMember switch (audit trail).
2. **Add semantic assertion** к `orchestrator_patcher.test.ts:603` (CustomerUser docstring text — current behavior).
3. **Document Bomb #1** в `docs-code-generator/sync-core-integration.md` warning section (pre-migration disclaimer для weight TASK-018).
4. **Status.md typo** (Standard reviewer Finding #1 — TASK-011 → TASK-014).

**Spawn follow-up TASK:**

- Extract shared `extractEntity1Entity2` utility (Bomb #5) — устранить drift между server_yaml_parser + orchestrator_patcher.
- Cross-component integration test create-project + generate-entity для junction entities (Bomb #8 + Architectural smell #1).
- Deprecate legacy fallback (`<E1><E2>Map` shape) после verification VS Code wire-up coverage (Bomb #3).

**Predicted outcome если ship as-is без minimum fixes:**

Через 7-14 дней weight TASK-018 миграции, executor добавит CustomerUser → orchestrator docstring `junction FK→customer+role` mismatches business intent (`customer+user`). `serverpod generate` PASS, `flutter analyze` PASS, `verify` PASS. Runtime delete-by-key path returns 404. Reverse-engineering bug займёт 1-2 часа (junction registry + adapter chain + endpoint method-name lookup). Не катастрофа, но frustrating и destroys "TASK-014 closes hard gate" narrative.

**Better path:** spend 30 min на 4 minimum fixes выше → ship с honest known-limitation disclaimer → weight TASK-018 starts с правильным mental model.

---

## Files reviewed (independent verification)

Production code:
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/replacement/replacement_util.ts:51-100`
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/generation_service.ts:96-289`
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/orchestrator_patcher.ts:240-323,439-460`
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/config/generation_config.ts:25-78`
- `G:/Projects/vs_code_extensions/code-generator/src/adapters/cli/commands/generate_entity.ts:96-100`
- `G:/Projects/vs_code_extensions/code-generator/src/adapters/vscode/commands/create_data_files_by_replacement.ts:47-51`
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/parsers/server_yaml_parser.ts:32-66` (cross-reference)
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/parsers/formatters/types.ts:1-30`

Tests (read full):
- `G:/Projects/vs_code_extensions/code-generator/src/test/replacement/replacement_util.test.ts`
- `G:/Projects/vs_code_extensions/code-generator/src/test/generators/generation_service.test.ts`
- `G:/Projects/vs_code_extensions/code-generator/src/test/generators/orchestrator_patcher.test.ts:570-694`

Independent re-runs:
- `npm run compile` → clean.
- `node node_modules/mocha/bin/mocha.js --ui tdd --reporter spec --timeout 20000 --recursive out/test/parsers out/test/generators out/test/replacement out/test/services out/test/verify out/test/mocks` → `119 passing (45ms), 0 failing`.
- `node out/adapters/cli/index.js verify --name t157 --json` → `success: true, errors=0, warnings=1, infos=67` — identical к report.md JSON.

E2E evidence:
- `G:/Projects/Flutter/serverpod/t157/t157_flutter/lib/features/projects/data/adapters/project_member/` — все 5 файлов на disk. Class refs `ProjectMemberEntity` / `ProjectMemberRemoteAdapter` (NOT `ProjectMemberMap`). Negative grep `ProjectMemberMap|task_tag_map|TaskTagMap|taskTagMap` returns empty.
- `G:/Projects/Flutter/serverpod/t157/t157_flutter/lib/core/sync/sync_orchestrator_provider.dart:140` — docstring `junction FK→project+member` + method `deleteProjectMemberByProjectAndMember` (NOT `task+tag` / `ByTaskAndTag`).

Side-finding verification:
- `G:/Templates/flutter/t115/t115_server/lib/src/models/user/{role,permission,role_permission}.spy.yaml` — все три existуют (read `role_permission.spy.yaml` confirmed `class: RolePermission`, `manifest: startProject`). Switch на ProjectMember legitimate.

Cross-reference:
- `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/customer_user.spy.yaml` — confirmed `userId: int` (NOT FK). `relationFields = [customerId, roleId, defaultTerminalSetId]`. Bomb #1 root cause verified в реальной weight schema.
