#!/usr/bin/env python3
"""
sync.py — распространение шаблона AI Team Framework в проекты с контролем дрейфа.

Реализация ADR-0002 п.2: граница ai/core/ (upstream-owned) ↔ ai/project/ (project-owned).
core/ в проекте перезаписывается только из шаблон-репо; локальные правки core блокируют apply.

Работает ЛОКАЛЬНО (без сети): путь к шаблон-репо передаётся через --template.
--template указывает на каталог `ai/` шаблон-репо (содержит core/ и project/).
<target>     указывает на каталог `ai/` проекта (куда ставим/сверяем).

Команды:
    sync.py init  <target> --template <src>   Первичная установка: копирует core/,
                                              создаёт скелет project/, пишет template.lock.
    sync.py --check <target> --template <src> Сверка core проекта: lock vs шаблон vs проект.
    sync.py --apply <target> --template <src> Обновление core/ (только если нет локальных
                                              правок core и target на task-ветке).

Формат ai/template.lock (в проекте) — JSON (machine-файл, парсится stdlib):
    {
      "template_version": "2.0.1",
      "source_revision": "<git sha шаблон-репо>",
      "source_dirty": false,
      "schema_version": 2,
      "core_hashes": { "core/scripts/task.py": "<sha256>", ... }
    }
Старый YAML-lock (`template_version: ...`) читается один раз с сообщением о миграции и
переписывается в JSON при следующем init/apply.

Exit codes команды --check (B3 — контракт для CI/автоматизации):
    0  — синхронизировано (или доступен only-info: см. ниже нет — 0 строго «чисто»).
    2  — доступно обновление шаблона (upstream add/modify/delete); инвариант НЕ нарушен.
    3  — НАРУШЕН ИНВАРИАНТ: локальная правка/добавление/удаление core, schema mismatch,
         повреждённый/отсутствующий lock, недоступный source. apply заблокирован.
(--apply: 0 успех/нечего применять; 1 отказ — те же инвариант-нарушения, что и exit 3.)

Гарантии:
    - файлы в project/ НИКОГДА не удаляются и не перезаписываются.
    - apply отказывается ВНЕ task-ветки (allowlist feature/chore/fix/refactor/docs/hotfix,
      как в task.py; не-git и detached HEAD — тоже отказ, fail-closed) и при локальных правках core.
    - несовпадение/повреждение schema_version → отказ (exit 3), НЕ «нет mismatch».
    - apply атомарен: staged-копия рядом с target → верификация хэшей → transactional swap;
      прерывание посреди apply НЕ оставляет частично обновлённый core (повторный apply чинит).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

try:
    import yaml  # только для ЧТЕНИЯ старого YAML-lock при миграции
    _HAS_YAML = True
except ImportError:  # pragma: no cover
    yaml = None
    _HAS_YAML = False

SCRIPT_DIR = Path(__file__).resolve().parent          # <src>/core/scripts
DEFAULT_TEMPLATE = SCRIPT_DIR.parent.parent           # <src>/ai (каталог ai шаблон-репо)

SCHEMA_VERSION = 2
LOCK_NAME = "template.lock"

# fallback, если version.md шаблона не удалось прочитать
TEMPLATE_VERSION_FALLBACK = "2.0.0"

# ─── Exit codes (--check) ────────────────────────────────────────────────────
EXIT_CLEAN = 0            # синхронизировано
EXIT_UPDATE_AVAILABLE = 2  # доступно обновление шаблона, инвариант цел
EXIT_INVARIANT = 3        # нарушен инвариант (local drift / schema / lock / source)

# Скелет project/ создаётся при init (пустые каталоги + .gitkeep). Контент не копируется.
PROJECT_SKELETON = [
    "docs",
    "docs/decisions",
    "tasks/active",
    "tasks/blocked",
    "tasks/done",
    "discussions/active",
    "discussions/archive",
    "discussions/prompts",
    "profiles",
]


# ─── Хэширование (текстовость по детекции, не по whitelist расширений) ────────

def _looks_text(data: bytes) -> bool:
    """Эвристика текстовости: нет NUL-байта в первых 8 КБ. Заменяет whitelist расширений —
    extensionless core-файлы (напр. LICENSE, .gitkeep) больше не дают ложный CRLF-дрейф."""
    return b"\x00" not in data[:8192]


def sha256_file(path: Path) -> str:
    """SHA-256 файла. Для текстовых файлов — с нормализацией переносов строк на LF,
    чтобы core-хэши были стабильны между Windows (CRLF) и Unix (LF)."""
    data = path.read_bytes()
    if _looks_text(data):
        data = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(data).hexdigest()


def iter_core_files(core_dir: Path):
    """Все файлы внутри core/ (относительные пути с префиксом 'core/'), кроме мусора."""
    for p in sorted(core_dir.rglob("*")):
        if p.is_dir():
            continue
        if "__pycache__" in p.parts or p.suffix == ".pyc":
            continue
        rel = "core/" + p.relative_to(core_dir).as_posix()
        yield rel, p


def compute_core_hashes(ai_dir: Path) -> dict[str, str]:
    core_dir = ai_dir / "core"
    result: dict[str, str] = {}
    if not core_dir.is_dir():
        return result
    for rel, p in iter_core_files(core_dir):
        result[rel] = sha256_file(p)
    return result


# ─── Валидация источника (RB-1: fail-closed) ─────────────────────────────────

class SourceError(Exception):
    """Недоступный/пустой/невалидный source (шаблон-репо). Fail-closed: exit 3, target не трогаем."""


def validate_source(source_ai: Path) -> None:
    """RB-1: fail-closed проверка source ПЕРЕД любой классификацией (check и apply).

    Опечатка в --template или указание на не-шаблон приводила к пустому template_hashes
    (compute_core_hashes на несуществующем core/ → {}), из-за чего check рапортовал
    «upstream удалил всё» (exit 2), а apply стирал весь core проекта. Контракт: недоступный
    source → exit 3, target НЕ тронут.

    Проверяем: source/core существует и это каталог; в нём есть хотя бы один файл;
    присутствует манифест core/version.md. Любое нарушение → SourceError.
    """
    core_dir = source_ai / "core"
    if not core_dir.is_dir():
        raise SourceError(
            f"source не валиден: {core_dir} не существует или не каталог "
            f"(опечатка в --template? укажи путь к каталогу ai/ шаблон-репо, содержащему core/).")
    has_file = any(p.is_file() for p in core_dir.rglob("*"))
    if not has_file:
        raise SourceError(f"source не валиден: {core_dir} пуст (нет файлов).")
    if not (core_dir / "version.md").is_file():
        raise SourceError(
            f"source не валиден: нет манифеста {core_dir / 'version.md'} "
            f"(это не каталог шаблона core/ или он повреждён).")


# ─── Git / манифест источника ────────────────────────────────────────────────

def git_short_sha(repo_dir: Path) -> str:
    r = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                       cwd=str(repo_dir), text=True, capture_output=True)
    return r.stdout.strip() if r.returncode == 0 else "unknown"


def git_is_dirty(repo_dir: Path) -> bool:
    """True если рабочее дерево шаблон-репо грязное (есть незакоммиченные изменения)."""
    r = subprocess.run(["git", "status", "--porcelain"],
                       cwd=str(repo_dir), text=True, capture_output=True)
    if r.returncode != 0:
        return False  # не git — не можем судить, считаем чистым
    return bool(r.stdout.strip())


def git_current_branch(repo_dir: Path) -> str | None:
    r = subprocess.run(["git", "symbolic-ref", "--short", "HEAD"],
                       cwd=str(repo_dir), text=True, capture_output=True)
    return r.stdout.strip() if r.returncode == 0 else None


def read_template_version(source_ai: Path) -> str:
    """template_version из манифеста шаблона (core/version.md), а не из константы скрипта.

    Ищет строку вида '**Текущая:** X.Y.Z' в core/version.md. Fallback — константа.
    """
    vmd = source_ai / "core" / "version.md"
    if vmd.exists():
        import re
        text = vmd.read_text(encoding="utf-8")
        m = re.search(r"\*\*Текущая:\*\*\s*([0-9]+\.[0-9]+\.[0-9]+)", text)
        if m:
            return m.group(1)
    print(f"⚠️  Не удалось прочитать версию из {vmd} (файл отсутствует или формат "
          f"'**Текущая:** X.Y.Z' изменился) — записываю fallback {TEMPLATE_VERSION_FALLBACK}. "
          f"Проверь version.md шаблона.")
    return TEMPLATE_VERSION_FALLBACK


# ─── Lock: JSON (запись) + миграция со старого YAML (чтение) ──────────────────

class LockError(Exception):
    """Повреждённый/непарсящийся lock — трактуется как нарушение инварианта (exit 3)."""


def build_lock(source_ai: Path) -> dict:
    return {
        "template_version": read_template_version(source_ai),
        "source_revision": git_short_sha(source_ai),
        "source_dirty": git_is_dirty(source_ai),
        "schema_version": SCHEMA_VERSION,
        "core_hashes": compute_core_hashes(source_ai),
    }


def write_lock_atomic(target_ai: Path, lock: dict) -> Path:
    """Записать lock как JSON атомарно (temp + os.replace) — lock всегда либо старый целиком,
    либо новый целиком, даже при падении/убийстве процесса на записи."""
    lock_path = target_ai / LOCK_NAME
    tmp = lock_path.with_suffix(lock_path.suffix + ".tmp")
    tmp.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(tmp), str(lock_path))
    return lock_path


def load_lock(lock_path: Path) -> tuple[dict, bool]:
    """Прочитать lock. Возвращает (data, was_yaml).

    Пытается JSON; если не JSON — пробует старый YAML-формат (одноразовая миграция).
    Бросает LockError при полностью непарсящемся содержимом.
    """
    text = lock_path.read_text(encoding="utf-8")
    # 1) JSON (основной формат)
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise LockError(f"{lock_path.name}: корень lock не является объектом")
        return data, False
    except json.JSONDecodeError:
        pass
    # 2) старый YAML-lock → миграция
    data = _parse_legacy_yaml_lock(text, lock_path)
    return data, True


def _parse_legacy_yaml_lock(text: str, lock_path: Path) -> dict:
    """Парсер СТАРОГО YAML-lock только для одноразовой миграции в JSON."""
    if _HAS_YAML:
        try:
            data = yaml.safe_load(text)
        except yaml.YAMLError as e:
            raise LockError(f"{lock_path.name}: не парсится ни как JSON, ни как YAML: {e}")
        if not isinstance(data, dict):
            raise LockError(f"{lock_path.name}: YAML-lock не является словарём")
        return data
    # PyYAML нет — минимальный парсер плоского YAML c одним вложенным core_hashes
    data: dict = {}
    current_map: dict | None = None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("  ") and current_map is not None:
            k, _, v = line.strip().partition(":")
            current_map[k.strip()] = v.strip()
            continue
        k, _, v = line.partition(":")
        k = k.strip()
        v = v.strip()
        if v == "":
            current_map = {}
            data[k] = current_map
        else:
            current_map = None
            data[k] = v
    if not data:
        raise LockError(f"{lock_path.name}: пустой/непарсящийся lock")
    return data


# ─── Трёхсторонняя классификация (B4) ────────────────────────────────────────

class Classification:
    """Результат сверки (baseline=lock, template, project). Категории — списки rel-путей."""

    def __init__(self):
        self.ok: list[str] = []
        self.updated: list[str] = []           # upstream add/modify — apply копирует
        self.upstream_deleted: list[str] = []  # upstream убрал — apply удаляет из проекта
        self.local_edit: list[str] = []        # проект изменил core != baseline — БЛОК
        self.local_add: list[str] = []         # проект добавил core-файл вне шаблона — БЛОК
        self.local_delete: list[str] = []      # проект удалил baseline core-файл — БЛОК
        self.lock_stale: list[str] = []        # B5c: ph==th, но lh!=ph (kill после swap, до lock)
        self.schema_mismatch: bool = False
        self.schema_invalid: bool = False      # schema_version отсутствует/не int — БЛОК
        self.lock: dict = {}
        self.lock_was_yaml: bool = False

    @property
    def has_violation(self) -> bool:
        return bool(self.local_edit or self.local_add or self.local_delete
                    or self.schema_mismatch or self.schema_invalid)

    @property
    def has_update(self) -> bool:
        return bool(self.updated or self.upstream_deleted)

    @property
    def has_lock_stale(self) -> bool:
        """B5c: core уже равен template, но lock хранит старый baseline (kill после swap,
        до записи lock). Данные трогать не надо — только переписать lock. НЕ нарушение."""
        return bool(self.lock_stale)


def _recover_interrupted_swap(target_ai: Path) -> None:
    """Kill между двумя os.replace в _apply_atomic оставляет core.backup.tmp (старый core)
    при ОТСУТСТВУЮЩЕМ core/. Без восстановления classify видит 'весь core локально удалён'
    (exit 3), а зачистка хвостов в _apply_atomic уничтожила бы единственную копию core.
    Поэтому восстановление — ПЕРВЫЙ шаг любой классификации."""
    core_dir = target_ai / "core"
    backup = target_ai / "core.backup.tmp"
    staged = target_ai / "core.staged.tmp"
    if backup.exists() and not core_dir.exists():
        os.replace(str(backup), str(core_dir))
        print("⚠️  Обнаружен прерванный swap — core/ восстановлен из core.backup.tmp. "
              "Повтори apply для завершения обновления.")
    # Хвосты прерванного/завершённого apply: staged всегда пересоздаётся apply'ем с нуля,
    # backup при живом core/ — остаток успешно завершённого swap. Удалять безопасно.
    if core_dir.exists():
        for leftover in (staged, backup):
            if leftover.exists():
                shutil.rmtree(leftover, ignore_errors=True)


def classify(target_ai: Path, source_ai: Path) -> Classification:
    """Полная трёхсторонняя матрица по (lock, template, project). 'файл отсутствует' — как
    полноправное состояние (None). Никаких молчаливых 'ok' для не-разобранных случаев."""
    _recover_interrupted_swap(target_ai)
    c = Classification()
    lock_path = target_ai / LOCK_NAME
    if not lock_path.exists():
        raise LockError(f"нет {lock_path} — сначала 'sync.py init'.")

    lock, was_yaml = load_lock(lock_path)
    c.lock = lock
    c.lock_was_yaml = was_yaml

    locked_hashes = lock.get("core_hashes", {}) or {}
    raw_schema = lock.get("schema_version")
    # B8: отсутствие/невалидность schema_version = нарушение инварианта, НЕ 'нет mismatch'
    if raw_schema is None:
        c.schema_invalid = True
    else:
        try:
            locked_schema = int(raw_schema)
        except (TypeError, ValueError):
            c.schema_invalid = True
        else:
            if locked_schema != SCHEMA_VERSION:
                c.schema_mismatch = True

    template_hashes = compute_core_hashes(source_ai)
    project_hashes = compute_core_hashes(target_ai)

    all_rels = set(locked_hashes) | set(template_hashes) | set(project_hashes)
    for rel in sorted(all_rels):
        lh = locked_hashes.get(rel)
        th = template_hashes.get(rel)
        ph = project_hashes.get(rel)
        c_bucket = _classify_one(lh, th, ph)
        getattr(c, c_bucket).append(rel)
    return c


def _classify_one(lh: str | None, th: str | None, ph: str | None) -> str:
    """Решение по одному файлу. Возвращает имя списка-категории в Classification.

    Легенда: lh=lock(baseline), th=template, ph=project. None = файла нет.
    """
    # --- проект удалил файл, который был в baseline ---
    if ph is None and lh is not None:
        if th is None:
            # baseline был, template тоже убрал, проект убрал → уже согласовано
            return "ok"
        # проект удалил core-файл, который в шаблоне есть → локальное удаление (БЛОК)
        return "local_delete"

    # --- файл есть в проекте ---
    if ph is not None:
        if lh is None and th is None:
            # ни в baseline, ни в шаблоне — чисто локальное добавление core (БЛОК)
            return "local_add"
        if lh is None and th is not None:
            # новый upstream-файл; проект уже имеет копию
            return "ok" if ph == th else "local_edit"
        if lh is not None:
            # файл был в baseline
            if ph != lh:
                # проект изменил relative to baseline
                if th is not None and ph == th:
                    # project и template совпадают, но оба отличаются от baseline(lock).
                    # B5c: это НЕ «оба поехали одинаково» вслепую — это kill после swap,
                    # до записи lock: apply уже переписал core на template, но lock устарел.
                    # Отдельная категория lock_stale: данные не трогаем, только чиним lock.
                    # (Случай lh==None — новый upstream-файл, у проекта уже есть копия —
                    #  обработан выше как ok/local_edit; сюда попадает только lh!=None.)
                    return "lock_stale"
                return "local_edit"      # конфликт — БЛОК
            # ph == lh: проект на baseline
            if th is None:
                return "upstream_deleted"  # шаблон удалил, проект на baseline → apply удалит
            if th != lh:
                return "updated"           # шаблон обновил → apply применит
            return "ok"                    # всё совпадает

    # --- файла нет в проекте, но есть где-то ещё ---
    if th is not None and (lh is None or th != lh) and ph is None:
        # новый/обновлённый upstream-файл, которого нет в проекте → apply добавит
        return "updated"
    if th is not None and lh is not None and th == lh and ph is None:
        # файл в baseline+template совпадают, но в проекте отсутствует → локальное удаление
        return "local_delete"
    # прочее (напр. только в baseline, th=None, ph=None — уже покрыто выше)
    return "ok"


# ─── Команды ─────────────────────────────────────────────────────────────────

def cmd_init(target_ai: Path, source_ai: Path) -> int:
    if not (source_ai / "core").is_dir():
        sys.exit(f"❌ В шаблоне {source_ai} нет каталога core/.")
    if (target_ai / "core").exists():
        sys.exit(f"❌ {target_ai}/core уже существует. init — только для новой установки. "
                 f"Используй --apply для обновления.")

    target_ai.mkdir(parents=True, exist_ok=True)
    print(f"📥 init: копирую core/ из {source_ai} → {target_ai}")
    shutil.copytree(source_ai / "core", target_ai / "core",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    print("🏗  создаю скелет project/ (пустые каталоги + .gitkeep)")
    for rel in PROJECT_SKELETON:
        d = target_ai / "project" / rel
        d.mkdir(parents=True, exist_ok=True)
        gk = d / ".gitkeep"
        if not any(d.iterdir()):
            gk.write_text("", encoding="utf-8")

    lock = build_lock(source_ai)
    lock_path = write_lock_atomic(target_ai, lock)
    if lock.get("source_dirty"):
        print("⚠️  source_dirty=true: шаблон-репо имеет незакоммиченные изменения — "
              "source_revision не воспроизводим.")
    print(f"🔒 записан {lock_path.relative_to(target_ai)} "
          f"(template_version={lock['template_version']}, schema_version={SCHEMA_VERSION})")
    print(f"\n✅ init завершён. Наполни project/ проектным контентом.")
    return EXIT_CLEAN


def _print_classification(c: Classification, source_ai: Path) -> None:
    print(f"   lock: template_version={c.lock.get('template_version')} "
          f"schema_version={c.lock.get('schema_version')} "
          f"source_revision={c.lock.get('source_revision')}")
    print(f"   шаблон: template_version={read_template_version(source_ai)} "
          f"schema_version={SCHEMA_VERSION}\n")

    if c.lock_was_yaml:
        print("ℹ️  lock в старом YAML-формате — будет мигрирован в JSON при следующем "
              "init/apply (или запусти --apply).\n")
    if c.schema_invalid:
        print(f"⛔ schema_version в lock отсутствует/невалиден "
              f"({c.lock.get('schema_version')!r}) — нарушение инварианта. apply откажет.\n")
    elif c.schema_mismatch:
        print(f"⛔ schema_version в lock ({c.lock.get('schema_version')}) != шаблона "
              f"({SCHEMA_VERSION}). Требуется миграция схемы задач — apply откажет. "
              f"Сначала мигрируй задачи (см. migration-v1-to-v2.md), затем обнови lock.\n")

    def _block(title: str, items: list[str], mark: str):
        if items:
            print(title)
            for r in items:
                print(f"     {mark} {r}")
            print()

    _block("⚠️  ЛОКАЛЬНАЯ ПРАВКА CORE (перенеси в шаблон-репо!):", c.local_edit, "M")
    _block("⚠️  ЛОКАЛЬНО ДОБАВЛЕННЫЙ CORE-ФАЙЛ (перенеси в шаблон-репо или удали!):",
           c.local_add, "A")
    _block("⚠️  ЛОКАЛЬНО УДАЛЁННЫЙ CORE-ФАЙЛ (восстанови из шаблона!):", c.local_delete, "D")
    _block("⬆️  ШАБЛОН ОБНОВИЛСЯ (доступно через --apply):", c.updated, "U")
    _block("🗑  ШАБЛОН УДАЛИЛ ФАЙЛ (apply удалит из проекта):", c.upstream_deleted, "D")
    _block("🔁 CORE УЖЕ ОБНОВЛЁН, LOCK УСТАРЕЛ (apply перепишет lock без копирования):",
           c.lock_stale, "L")
    print(f"✅ ОК: {len(c.ok)} файлов совпадают.")


def cmd_check(target_ai: Path, source_ai: Path) -> int:
    print(f"🔎 sync --check: {target_ai}")
    # RB-1: fail-closed валидация source ДО classify — недоступный source не должен
    # выглядеть как «upstream удалил всё» (иначе exit 2 + apply стёр бы core).
    try:
        validate_source(source_ai)
    except SourceError as e:
        print(f"⛔ {e}")
        print("\nСтатус: НАРУШЕН ИНВАРИАНТ (source недоступен/невалиден). target не тронут. exit 3.")
        return EXIT_INVARIANT
    try:
        c = classify(target_ai, source_ai)
    except LockError as e:
        print(f"⛔ {e}")
        print("\nСтатус: НАРУШЕН ИНВАРИАНТ (lock повреждён/отсутствует). exit 3.")
        return EXIT_INVARIANT

    _print_classification(c, source_ai)

    if c.has_violation:
        reasons = []
        if c.local_edit:
            reasons.append("локальные правки core")
        if c.local_add:
            reasons.append("локально добавленные core-файлы")
        if c.local_delete:
            reasons.append("локально удалённые core-файлы")
        if c.schema_mismatch:
            reasons.append("несовпадение schema_version")
        if c.schema_invalid:
            reasons.append("невалидный schema_version")
        print(f"\nСтатус: НАРУШЕН ИНВАРИАНТ ({', '.join(reasons)}). apply заблокирован. exit 3.")
        return EXIT_INVARIANT
    if c.has_update:
        print("\nСтатус: доступно обновление шаблона. Запусти --apply на task-ветке. exit 2.")
        return EXIT_UPDATE_AVAILABLE
    if c.has_lock_stale:
        # B5c: core уже равен template (apply-swap прошёл), но lock не был записан
        # (kill между swap и write_lock). Это НЕ «синхронизировано» — иначе следующий
        # upstream-апдейт увидит ph!=lh как local_edit и заблокируется. exit 2 → запусти apply.
        print("\nСтатус: core обновлён, lock устарел (прерван apply до записи lock). "
              "Запусти --apply — он перепишет lock без копирования файлов. exit 2.")
        return EXIT_UPDATE_AVAILABLE
    print("\nСтатус: синхронизировано. exit 0.")
    return EXIT_CLEAN


def cmd_apply(target_ai: Path, source_ai: Path) -> int:
    # RB-1: fail-closed валидация source ДО classify — опечатка в --template НЕ должна
    # приводить к стиранию core проекта. Exit 3 (нарушение инварианта), target не тронут.
    try:
        validate_source(source_ai)
    except SourceError as e:
        print(f"❌ {e} apply отклонён (source недоступен/невалиден).")
        return EXIT_INVARIANT
    try:
        c = classify(target_ai, source_ai)
    except LockError as e:
        sys.exit(f"❌ {e} apply отклонён (нарушение инварианта).")

    # 1. Проверка ветки (fail-closed): apply ТОЛЬКО на task-ветке из allowlist.
    # Allowlist синхронизирован с task.py cmd_pr (allowed_prefixes) — менять вместе.
    allowed_prefixes = ("feature/", "chore/", "fix/", "refactor/", "docs/", "hotfix/")
    branch = git_current_branch(target_ai)
    if branch is None:
        branch = git_current_branch(target_ai.parent)
    if branch is None:
        sys.exit("❌ Не удалось определить git-ветку target (не git-репо или detached HEAD). "
                 "apply работает только на task-ветке — без git нет отката обновления. "
                 "Инициализируй git и создай task-ветку (например: git switch -c chore/sync-template). "
                 "apply отклонён (fail-closed).")
    if not branch.startswith(allowed_prefixes):
        sys.exit(f"❌ target на ветке '{branch}'. apply работает только на task-ветке "
                 f"{allowed_prefixes}. Переключись: git switch -c chore/sync-template.")

    # 2. schema_version (mismatch или невалидный) — отказ
    if c.schema_invalid:
        sys.exit(f"❌ schema_version в lock отсутствует/невалиден "
                 f"({c.lock.get('schema_version')!r}). apply отклонён — почини lock/мигрируй.")
    if c.schema_mismatch:
        sys.exit(f"❌ schema_version lock={c.lock.get('schema_version')} != шаблона "
                 f"{SCHEMA_VERSION}. apply отклонён. Мигрируй схему задач вручную "
                 f"(migration-v1-to-v2.md), затем повтори init/apply.")

    # 3. локальные правки/добавления/удаления core блокируют apply
    if c.local_edit or c.local_add or c.local_delete:
        print("❌ apply отклонён: обнаружены локальные расхождения core. Перенеси в шаблон-репо:")
        for r in c.local_edit:
            print(f"     M {r}")
        for r in c.local_add:
            print(f"     A {r} (локально добавлен)")
        for r in c.local_delete:
            print(f"     D {r} (локально удалён)")
        sys.exit(1)

    if not c.has_update:
        # B5c: core уже равен template, но lock устарел (kill после swap, до записи lock).
        # Данные не трогаем — только атомарно переписываем lock новым baseline. Это чинит
        # ложно-зелёный check и разблокирует следующий upstream-апдейт.
        if c.has_lock_stale:
            write_lock_atomic(target_ai, build_lock(source_ai))
            print(f"🔒 template.lock переписан (core уже был обновлён, lock устарел — "
                  f"{len(c.lock_stale)} файлов). Копирование не потребовалось.")
            print(f"\n✅ apply завершён (только lock). Проверь diff в git.")
            return EXIT_CLEAN
        # даже без апдейтов — если lock был YAML, мигрируем его в JSON (переписываем атомарно)
        if c.lock_was_yaml:
            write_lock_atomic(target_ai, build_lock(source_ai))
            print("🔒 template.lock мигрирован в JSON.")
        print("ℹ️  core уже синхронизирован — нечего применять.")
        return EXIT_CLEAN

    # 4. АТОМАРНЫЙ apply (B5): staged-каталог рядом с target → верификация → swap.
    print(f"⬆️  apply: {len(c.updated)} обновлений, {len(c.upstream_deleted)} удалений "
          f"на ветке '{branch or '?'}'")
    _apply_atomic(target_ai, source_ai, c)

    # 5. lock — ПОСЛЕДНИМ, атомарно
    write_lock_atomic(target_ai, build_lock(source_ai))
    print("🔒 template.lock обновлён (JSON, атомарно).")
    print(f"\n✅ apply завершён. Проверь diff в git и закоммить на task-ветке.")
    return EXIT_CLEAN


def _apply_atomic(target_ai: Path, source_ai: Path, c: Classification,
                  fault_after: int | None = None) -> None:
    """Собрать НОВЫЙ core целиком в staged-каталоге, проверить хэши, затем один transactional
    swap каталога core. Прерывание до/во время swap не оставляет частичного core (старый core
    остаётся целым; повторный apply доводит до конца).

    fault_after — для тестов: после копирования N файлов в staged бросить RuntimeError
    (симуляция kill посреди apply). НЕ используется в проде.
    """
    core_dir = target_ai / "core"
    staged = target_ai / "core.staged.tmp"
    backup = target_ai / "core.backup.tmp"

    # чистим возможные хвосты прошлого прерванного apply.
    # Страховка (не должна срабатывать после classify): если core/ отсутствует, backup —
    # его единственная копия, сначала восстановить, только потом чистить хвосты.
    if backup.exists() and not core_dir.exists():
        os.replace(str(backup), str(core_dir))
    for leftover in (staged, backup):
        if leftover.exists():
            shutil.rmtree(leftover)

    # 1) собрать staged = текущий core, затем наложить updated/deleted из шаблона
    shutil.copytree(core_dir, staged, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    copied = 0
    for rel in c.updated:
        src = source_ai / rel
        dst = staged / Path(rel).relative_to("core")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
        if fault_after is not None and copied >= fault_after:
            # симуляция прерывания: staged незавершён, но core/ и lock ЕЩЁ НЕ тронуты
            raise RuntimeError(f"FAULT injected after {copied} files (staged incomplete)")
    for rel in c.upstream_deleted:
        victim = staged / Path(rel).relative_to("core")
        if victim.exists():
            victim.unlink()

    # 2) верификация: хэши staged должны совпасть с шаблоном по всем rel
    expected = compute_core_hashes(source_ai)
    staged_hashes = {}
    for p in sorted(staged.rglob("*")):
        if p.is_dir() or "__pycache__" in p.parts or p.suffix == ".pyc":
            continue
        rel = "core/" + p.relative_to(staged).as_posix()
        staged_hashes[rel] = sha256_file(p)
    for rel in c.updated:
        if staged_hashes.get(rel) != expected.get(rel):
            shutil.rmtree(staged, ignore_errors=True)
            raise RuntimeError(f"верификация staged не прошла для {rel} — apply отменён, "
                               f"core не тронут.")
    for rel in c.upstream_deleted:
        if rel in staged_hashes:
            shutil.rmtree(staged, ignore_errors=True)
            raise RuntimeError(f"staged всё ещё содержит удалённый {rel} — apply отменён.")

    # 3) transactional swap: core→backup, staged→core, удалить backup; при сбое — откат.
    os.replace(str(core_dir), str(backup))
    try:
        os.replace(str(staged), str(core_dir))
    except OSError:
        os.replace(str(backup), str(core_dir))  # откат
        raise
    shutil.rmtree(backup, ignore_errors=True)

    for rel in c.updated:
        print(f"     U {rel}")
    for rel in c.upstream_deleted:
        print(f"     D {rel}")


# ─── Main ────────────────────────────────────────────────────────────────────

def resolve_ai_dir(path_str: str) -> Path:
    return Path(path_str).resolve()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="sync.py — распространение шаблона core/ с контролем дрейфа",
        usage="sync.py (init | --check | --apply) <target> [--template SRC]",
        epilog="Exit codes (--check): 0 синхронизировано; 2 доступно обновление; "
               "3 нарушен инвариант (local drift / schema / lock).")
    parser.add_argument("--template", metavar="SRC", default=str(DEFAULT_TEMPLATE),
                        help="Путь к каталогу ai/ шаблон-репо (по умолчанию — рядом со скриптом)")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--check", action="store_true",
                       help="Сверка дрейфа core. exit 0/2/3 (см. epilog).")
    group.add_argument("--apply", action="store_true", help="Обновить core/ в проекте (атомарно)")
    group.add_argument("--init", action="store_true",
                       help="Первичная установка (эквивалент подкоманды 'init')")
    parser.add_argument("args", nargs="*",
                        help="'init <target>' или '<target>' (с --check/--apply)")

    ns = parser.parse_args()
    source_ai = resolve_ai_dir(ns.template)

    pos = list(ns.args)
    action = None
    if ns.check:
        action = "check"
    elif ns.apply:
        action = "apply"
    elif ns.init:
        action = "init"

    if pos and pos[0] == "init":
        action = "init"
        pos = pos[1:]

    if action is None:
        parser.error("укажи действие: init <target> | --check <target> | --apply <target>")
    if not pos:
        parser.error("укажи <target> — путь к каталогу ai/ проекта")
    target_ai = resolve_ai_dir(pos[0])

    if action == "init":
        return cmd_init(target_ai, source_ai)
    if action == "check":
        return cmd_check(target_ai, source_ai)
    if action == "apply":
        return cmd_apply(target_ai, source_ai)
    return 2


if __name__ == "__main__":
    sys.exit(main())
