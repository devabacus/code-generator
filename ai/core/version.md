# Версия AI Team Framework

**Текущая:** 2.0.0
**Минимально совместимая:** 2.0.0
**schema_version задач:** 2

---

## Changelog

### 2.0.0 — 2026-07-20

Единый workflow и pipeline-шаблон для всех проектов (ADR-0002, дискуссия #1).
Финальный changelog сводит TASK-005; ниже — черновик по мере выполнения batch:

- **Граница core/project** (TASK-001): `ai/core/` (upstream-owned, перезаписывается sync)
  ↔ `ai/project/` (project-owned, sync не трогает). Скрипты, промпты, шаблоны, протоколы —
  в core; зоны, профили, задачи, документация проекта — в project.
- **Схема задач v2** (TASK-002): YAML-frontmatter-контракт в `task.md` (id, schema_version,
  status, mode, zone, verification_profile, checks, max_attempts, depends_on); runtime-state
  вынесен в `state.json`/`runs.jsonl` (владелец — драйвер). Команды `task.py lint|move|state`.
- **Sync-механизм** (TASK-003): `sync.py init|--check|--apply` + машинный lock
  `ai/template.lock` (template_version, source_revision, schema_version, core_hashes с
  нормализацией переносов строк). Локальные правки core блокируют apply; apply отказывает на
  master/main и при несовпадении schema_version.
- **Зонные профили** (TASK-004): `ai/project/profile.yaml` (capability policy на зону) +
  `ai/project/profiles/*.yaml` (verification-профили) + `profile.py lint`.
- **Документация v2 и миграционный гайд** (TASK-005): обновлённые доки, гайд v1→v2.

### 1.0.0 — 2025-12-26

Первый релиз с улучшениями из Дискуссии #1:

- **Lite Mode** — структура `_ai_lite/` для малых проектов + скрипт миграции
- **Правила делегирования** — TeamLead может одобрять HOTFIX и неархитектурные задачи
- **Чеклист архитектуры** — 6 критериев, определяющих что требует одобрения User
- **Цепочка эскалации** — Executor → TeamLead → Strategy → User
- **ADR Workflow** — автогенерация ADR из закрытых дискуссий

---

## Формат версий

```
MAJOR.MINOR.PATCH

MAJOR: Ломающие изменения структуры или промптов
MINOR: Новые фичи, обратно совместимые
PATCH: Исправления и мелкие улучшения
```

## Заметки по миграции

При обновлении до новой версии проверь, что `Минимально совместимая` версия удовлетворена
текущей версией проекта. Миграция v1 → v2 — см. `core/guides/migration-v1-to-v2.md`.
