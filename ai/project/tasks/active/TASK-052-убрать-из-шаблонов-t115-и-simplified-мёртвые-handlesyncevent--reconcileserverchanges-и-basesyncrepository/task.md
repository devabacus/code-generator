---
# Читается и УПРАВЛЯЕТ поведением: status двигают `task.py move` / `pr --done`
# (руками папки между active/blocked/done не таскать), id сверяется с именем папки.
id: TASK-052
schema_version: 2
status: active            # active | blocked | done
mode: interactive
zone: ""
verification_profile: ""
checks: []
max_attempts: 3
depends_on: []
---

# TASK-052: Убрать из шаблонов t115 и simplified мёртвый sync-слой

## Ветка

feature/TASK-052-templates-dead-sync

## Почему это срочнее, чем выглядит

В проекте **weight** только что удалили этот код: `handleSyncEvent`,
`reconcileServerChanges` (14 датасорсов + 2 интерфейса) и класс
`BaseSyncRepository` целиком — 2790 строк, weight PR #163. Он не исполнялся ни
разу с перехода на `sync_core`, но полгода читался как рабочая защита правок
оператора и стоил целой задачи впустую (weight TASK-098: диагноз поставили по
мёртвому пути и правили шаблоны генератора, чтобы починить то, чего в проде нет).

**Шаблоны у нас всё ещё содержат этот код**, а регион `// === generated_start:base ===`
генератор перезаписывает **целиком**. Значит первый же `codegen generate-entity`
в weight вернёт мёртвые методы обратно — вместе с ложной уверенностью, что защита
на месте. `t115` — шаблон по умолчанию (`DEFAULT_TEMPLATE = 't115'`,
`src/adapters/cli/utils/template_profile.ts`).

## Где лежит (шаблоны вне этого репозитория, под своим git)

- `G:\Templates\flutter\t115\t115_flutter\lib\features\**\*_local_data_source.dart`
  и `*_local_datasource_service.dart`
- то же в `G:\Templates\flutter\simplified\`
- `G:\Templates\flutter\Packages\app_core\lib\src\sync\base_sync_repository.dart`

## Цель

Шаблон перестаёт порождать код, который не исполняется: новая сущность в проекте
на `sync_core` получает только живой путь (`LocalApply` + адаптеры оркестратора).

## Не-цели

- **Не трогать `LocalApply` и адаптеры** — это живой путь.
- Не переносить C1-гард в `handleSyncEvent`: ветка `feature/weight-c1-local-edit-guard`
  (коммит сохранён тегом `archive/task-098-c1-guard-test`) делала ровно это и была
  удалена — она чинила путь, которого нет.
- Не менять поведение уже сгенерированных проектов; чистка в них — их задачи
  (weight TASK-101 сделана, TASK-103 в очереди).

## План работы

- [ ] Проверить на текущих шаблонах, что метод действительно мёртв и в них:
      кто вызывает `handleSyncEvent` / `reconcileServerChanges` внутри самого
      шаблонного проекта; если в шаблоне есть живой вызов — **остановиться**
      и вынести наверх, а не удалять
- [ ] Убрать оба метода из entity-шаблонов и из шаблонов интерфейсов
- [ ] Убрать `base_sync_repository.dart` из `app_core`, если на него не осталось
      ссылок в шаблоне
- [ ] Прогнать E2E генерации: сгенерировать сущность в тестовый проект, убедиться,
      что файлы собираются и `analyze` чист
- [ ] **Проверить PENDING_BASELINE в CI**: удаление шаблонных тестов меняет число
      закономерно пропускаемых. Поднимать/опускать значение — с обоснованием в PR
      (правило уже записано в `.github/workflows/test.yml`)
- [ ] Сказать в weight, что шаблоны почищены — там ждёт TASK-103

## Критерии приёмки

- [ ] Ни один шаблон не содержит `handleSyncEvent` / `reconcileServerChanges` /
      `BaseSyncRepository`
- [ ] E2E-генерация сущности проходит, сгенерированный проект собирается
- [ ] `PENDING_BASELINE` соответствует фактическому числу пропусков, изменение
      объяснено в PR
- [ ] Тесты генератора зелёные

## Связано

- weight TASK-098 — как мёртвый код стоил задачи; weight TASK-101 — удаление в
  проекте; weight TASK-103 — остаток осиротевшего слоя
- тег `archive/task-098-c1-guard-test` — гард, который писали в мёртвый путь
