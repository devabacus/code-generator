# Refactoring Implementation Plan

## Правила
1. Файлы < 100 строк
2. Тесты: Mock FileSystem
3. Старые команды: НЕ удалять сразу (deprecation period)
4. Ручное тестирование после каждой фазы

---

## Фаза 0: Baseline тестирование

**Перед любым рефакторингом проверяем текущий функционал:**

| # | Тест | Команда | Ожидаемый результат |
|---|------|---------|---------------------|
| 1 | Standalone Python | `Add Python Project from Template` → Standalone | Проект создан в `G:/Projects/Python/` |
| 2 | Microservice Python | `Add Python Project from Template` → Microservices | Проект в `microservices/`, workflow перемещён |
| 3 | Import | `Import Existing Microservice` | Проект импортирован, workflow модифицирован |
| 4 | Export | `Export Microservice` | Проект экспортирован, workflow адаптирован |
| 5 | Remove | `Remove Microservice` | Проект удалён, workflow удалён |

---

## Фаза 1: WorkflowModifier → 6 модулей

```
src/core/services/workflow/
├── index.ts                          (~20 строк)
├── types.ts                          (~20 строк)
├── workflow_file_finder.ts           (~30 строк)
├── workflow_monorepo_modifier.ts     (~90 строк)
├── workflow_standalone_modifier.ts   (~80 строк)
├── k8s_manifest_updater.ts           (~50 строк)
├── serverpod_deployment_updater.ts   (~80 строк)
├── flutter_integration.ts            (~90 строк)
└── serverpod_endpoint_copier.ts      (~90 строк)
```

**Старый `workflow_modifier.ts` остаётся как фасад.**

---

## Фаза 2: Unified addMicroservice

```
src/core/commands/add_microservice/
├── index.ts              (~50 строк)
├── template_picker.ts    (~40 строк)
├── destination_picker.ts (~50 строк)
├── project_name_input.ts (~40 строк)
└── project_creator.ts    (~60 строк)
```

**Старые `add_*_project.ts` остаются до окончания deprecation.**

---

## Фаза 3: Import/Export/Remove

Обновить команды в `core/commands/` для использования `LanguageRegistry`.

---

## Фаза 4: Очистка (deprecation period)

- [ ] Добавить новые команды в `package.json`
- [ ] Пометить старые как deprecated (не удалять)
- [ ] Обновить README
