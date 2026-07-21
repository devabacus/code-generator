#!/usr/bin/env python3
"""
Task CLI — workflow feature branch → PR → merge для задач.

Subcommands:
    start <name>   Создать feature branch от свежей базовой ветки (main/master)
    pr             Запушить текущую ветку, создать PR с report.md как body
    merge          Дождаться CI и смержить PR, вернуться на базовую ветку
    finish         pr + merge одной командой

Базовая ветка определяется автоматически по origin/HEAD (main или master).

Examples:
    python ai/core/scripts/task.py start TASK-002-shared-commands-cat-a
    python ai/core/scripts/task.py pr
    python ai/core/scripts/task.py merge
    python ai/core/scripts/task.py finish

Требования:
    - gh CLI авторизован (gh auth status)
    - Работа из корня репо
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml  # PyYAML
    _HAS_YAML = True
except ImportError:  # pragma: no cover
    yaml = None
    _HAS_YAML = False

SCRIPT_DIR = Path(__file__).resolve().parent          # ai/core/scripts
CORE_DIR = SCRIPT_DIR.parent                          # ai/core
AI_ROOT = CORE_DIR.parent                             # ai/
PROJECT_DIR = AI_ROOT / "project"                     # ai/project
# Директория для git-команд: любой каталог внутри рабочего дерева подходит.
REPO_ROOT = AI_ROOT
TASKS_DIR = PROJECT_DIR / "tasks"
ACTIVE_DIR = TASKS_DIR / "active"
BLOCKED_DIR = TASKS_DIR / "blocked"
DONE_DIR = TASKS_DIR / "done"
PROFILES_DIR = PROJECT_DIR / "profiles"
PROFILE_YAML = PROJECT_DIR / "profile.yaml"

STATUS_DIRS = {"active": ACTIVE_DIR, "blocked": BLOCKED_DIR, "done": DONE_DIR}
VALID_STATUS = tuple(STATUS_DIRS.keys())

# ─── Anti-traversal валидатор пути (B2) ──────────────────────────────────────
# ВНИМАНИЕ: держать в синхроне с profile.py::validate_safe_path (та же семантика).
# Дублируется намеренно: task.py и profile.py — независимые standalone-CLI из core/,
# без общего импорт-модуля. Изменения правил traversal вносить в ОБА места.


def validate_safe_path(value: str) -> str | None:
    """Вернуть текст ошибки или None. Запрещает абсолютные пути, '..', выход из project root.

    Используется для verification_profile на уровне задачи (защита от path traversal вида
    '../evil'). Канон — profile.py::validate_safe_path.
    """
    v = str(value).strip()
    if not v:
        return "пустой путь"
    norm = v.replace("\\", "/")
    if norm.startswith("/") or re.match(r"^[A-Za-z]:", norm):
        return f"'{v}': абсолютный путь запрещён (только относительно project root)"
    parts = [p for p in norm.split("/") if p not in ("", ".")]
    if ".." in parts:
        return f"'{v}': '..' запрещён (выход за project root)"
    return None


# ─── Утилиты ─────────────────────────────────────────────────────────────────


def run(cmd: list[str], check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Запустить команду с cwd=REPO_ROOT."""
    kwargs = {"cwd": str(REPO_ROOT), "text": True}
    if capture:
        kwargs["capture_output"] = True
    result = subprocess.run(cmd, **kwargs)
    if check and result.returncode != 0:
        if capture:
            sys.stderr.write(result.stdout or "")
            sys.stderr.write(result.stderr or "")
        sys.exit(result.returncode)
    return result


def _env_int(name: str, default: int) -> int:
    """int из env-переменной с fallback. Мусор/пусто → default (не падаем)."""
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        print(f"⚠️  {name}={raw!r} не число — использую default {default}.", file=sys.stderr)
        return default


def current_branch() -> str:
    r = run(["git", "symbolic-ref", "--short", "HEAD"], capture=True)
    return r.stdout.strip()


def base_branch() -> str:
    """Базовая ветка репо (main/master) — по origin/HEAD, иначе по локальным веткам."""
    r = run(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
            check=False, capture=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip().split("/", 1)[1]
    for name in ("main", "master"):
        probe = run(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{name}"],
                    check=False)
        if probe.returncode == 0:
            return name
    return "master"


def has_uncommitted() -> bool:
    """True если есть modified/staged changes. Untracked игнорируются — они не мешают
    переключению ветки/стешу и не конфликтуют с merge (используется только в cmd_start)."""
    r = run(["git", "diff-index", "--quiet", "HEAD", "--"], check=False)
    return r.returncode != 0


def dirty_porcelain(include_untracked: bool = True) -> list[str]:
    """Список записей `git status --porcelain` (по одной на файл).

    B7: PR/merge-путь обязан видеть untracked файлы — иначе новый непроиндексированный
    код тихо теряется при squash-merge + delete-branch. `--porcelain` детерминирован и
    machine-readable; untracked показываются как '?? path'.
    """
    args = ["git", "status", "--porcelain"]
    if not include_untracked:
        args.append("--untracked-files=no")
    r = run(args, check=False, capture=True)
    return [ln for ln in r.stdout.splitlines() if ln.strip()]


def extract_task_id(branch: str) -> str | None:
    """'feature/TASK-002-shared-commands' → 'TASK-002'."""
    m = re.match(r"^feature/(TASK-\d+)", branch)
    return m.group(1) if m else None


def find_task_dir(task_id: str, where: Path = ACTIVE_DIR) -> Path | None:
    """Найти папку task в указанной директории."""
    if not where.exists():
        return None
    for p in where.iterdir():
        if p.is_dir() and p.name.startswith(f"{task_id}-"):
            return p
    return None


def find_task_anywhere(task_id: str) -> tuple[Path | None, str]:
    """Найти папку task в active/ или done/. Возвращает (path, location)
    где location = 'active', 'done' или 'none'."""
    p = find_task_dir(task_id, ACTIVE_DIR)
    if p is not None:
        return p, "active"
    p = find_task_dir(task_id, DONE_DIR)
    if p is not None:
        return p, "done"
    return None, "none"


def pr_number_for_current_branch() -> int | None:
    r = run(["gh", "pr", "view", "--json", "number", "-q", ".number"],
            check=False, capture=True)
    if r.returncode != 0:
        return None
    s = r.stdout.strip()
    return int(s) if s.isdigit() else None


# ─── Команды ─────────────────────────────────────────────────────────────────


def cmd_start(args: argparse.Namespace) -> None:
    """Создать feature branch от свежей базовой ветки."""
    name = args.name.strip()
    if name.startswith("feature/"):
        name = name[len("feature/"):]
    branch = f"feature/{name}"
    base = base_branch()

    stashed = False
    if has_uncommitted():
        if args.stash:
            print("📦 stash текущих изменений...")
            run(["git", "stash", "push", "-m", f"task.py auto-stash for {branch}"])
            stashed = True
        else:
            sys.exit("❌ Uncommitted changes. Закоммить или перезапусти с --stash.")

    print(f"📥 checkout {base} + pull...")
    run(["git", "checkout", base])
    run(["git", "pull", "--ff-only", "origin", base])

    print(f"🌿 checkout -b {branch}")
    run(["git", "checkout", "-b", branch])

    if stashed:
        print("📤 git stash pop...")
        run(["git", "stash", "pop"])

    print(f"\n✅ Ветка '{branch}' создана. Можно работать.")


def cmd_pr(args: argparse.Namespace) -> None:
    """Push текущей ветки + создать PR с report.md как body."""
    branch = current_branch()
    base = base_branch()

    if branch == base:
        sys.exit(f"❌ На {base}. Переключись на feature-ветку.")
    allowed_prefixes = ("feature/", "chore/", "fix/", "refactor/", "docs/", "hotfix/")
    if not branch.startswith(allowed_prefixes):
        sys.exit(f"❌ Ветка '{branch}' не соответствует допустимым паттернам "
                 f"{allowed_prefixes}.")

    # B7: чистый рабочий каталог ОБЯЗАТЕЛЕН до любых операций, включая untracked.
    # Иначе новый непроиндексированный код теряется при последующем squash+delete-branch.
    dirty = dirty_porcelain(include_untracked=True)
    if dirty:
        print("❌ Рабочий каталог не чист (включая untracked). Закоммить или удали перед pr:")
        for ln in dirty:
            print(f"     {ln}")
        sys.exit(1)

    task_id = extract_task_id(branch)
    task_dir: Path | None = None
    task_location = "none"

    if task_id:
        task_dir, task_location = find_task_anywhere(task_id)

    # B1: перевод active → done — ТОЛЬКО транзакционно (frontmatter + папка вместе) и
    # ТОЛЬКО по явному подтверждению. Наличие report.md само по себе done НЕ означает.
    if task_location == "active" and task_dir:
        has_report = (task_dir / "report.md").exists()
        if not args.done:
            reason = ("report.md есть, но флаг --done не передан" if has_report
                      else "нет report.md")
            sys.exit(
                f"❌ Задача {task_id} ещё в active/ ({reason}). "
                f"pr НЕ двигает её в done/ автоматически.\n"
                f"   Когда задача действительно завершена и в report.md зафиксирован итог — "
                f"перезапусти: task.py pr --done\n"
                f"   (или заранее: task.py move {task_id} done). "
                f"Причину перевода обоснуй в report.md.")
        # --done передан: транзакционная смена статуса + scoped-коммит + lint-гейт
        print(f"📦 Перевод {task_id} active → done (транзакционно: frontmatter + папка)...")
        try:
            _cur, task_dir = move_task_status(task_id, "done")
        except ValueError as e:
            sys.exit(f"❌ {e}")
        task_location = "done"
        # B1: lint ПЕРЕД коммитом перемещения — красный lint = отказ (и откат move).
        errors, _warnings = collect_lint_issues()
        if errors:
            print("❌ lint не прошёл после перемещения — откатываю и отказываю:")
            for e in errors:
                print(f"     {e}")
            # откат: вернуть задачу в active (транзакционно)
            try:
                move_task_status(task_id, "active")
            except ValueError as rollback_err:
                print(f"⚠️  автоматический откат не удался: {rollback_err}. Восстанови вручную "
                      f"(task.py move {task_id} active).")
            sys.exit(1)
        # scoped-коммит: только файлы задачи (git mv уже проиндексировал rename),
        # без -a и без захвата чужих staged изменений.
        run(["git", "commit", "-m", f"chore(tasks): {task_id} переведена в done"])
    elif task_location == "done":
        print(f"ℹ️  Задача {task_id} уже в done/ — использую её report.md для PR body")

    # После перемещения рабочий каталог снова должен быть чист.
    if dirty_porcelain(include_untracked=True):
        sys.exit("❌ После перемещения задачи остались незакоммиченные изменения. Проверь git status.")

    # Push branch
    print(f"⬆️  push {branch}...")
    run(["git", "push", "-u", "origin", branch])

    # Если PR уже открыт для этой ветки — пропустить create (важно для finish:
    # когда первый запуск создал PR но merge упал, второй finish должен продолжить
    # к merge, не падать на "already exists")
    existing_pr = pr_number_for_current_branch()
    if existing_pr:
        print(f"ℹ️  PR #{existing_pr} уже открыт для {branch}, пропускаю gh pr create.")
        return

    # Собрать title + body
    if task_dir:
        title = task_dir.name.replace("---", " ").replace("-", " ")
        title = re.sub(r"\s+", " ", title).strip()
        if len(title) > 72:
            title = title[:69] + "..."
    else:
        title = branch.replace("feature/", "").replace("-", " ")

    report_path = task_dir / "report.md" if task_dir else None
    body_arg = []
    if report_path and report_path.exists():
        body_arg = ["--body-file", str(report_path)]
    else:
        body_arg = ["--body", "См. коммиты и task.md"]

    # gh pr create
    print(f"📝 gh pr create — title: {title}")
    r = run(["gh", "pr", "create", "--base", base, "--title", title, *body_arg],
            capture=True)
    print(r.stdout)

    pr_num = pr_number_for_current_branch()
    if pr_num:
        print(f"\n✅ PR #{pr_num} создан.")
        print(f"   Для merge: python ai/core/scripts/task.py merge")


def cmd_merge(args: argparse.Namespace) -> None:
    """Дождаться CI, смержить PR, вернуться на базовую ветку.

    Без --pr: работает с PR текущей ветки.
    С --pr N: мержит указанный PR из любой ветки.
    """
    branch = current_branch()
    base = base_branch()

    if args.pr:
        pr_num = args.pr
        # Проверка что PR существует и открыт
        probe = run(["gh", "pr", "view", str(pr_num), "--json", "state"],
                    check=False, capture=True)
        if probe.returncode != 0:
            sys.exit(f"❌ PR #{pr_num} не найден.")
        if '"state":"OPEN"' not in probe.stdout:
            sys.exit(f"❌ PR #{pr_num} не открыт (уже смержен или закрыт?).")
    else:
        if branch == base:
            sys.exit(f"❌ На {base} без --pr. Либо переключись на feature-ветку, "
                     "либо используй --pr <N>.")
        pr_num = pr_number_for_current_branch()
        if pr_num is None:
            sys.exit("❌ Нет открытого PR для этой ветки. Сначала 'task.py pr'.")

    # B7: различаем ТРИ исхода пробы CI, а не два:
    #   (a) exit 0 + непустой JSON  → checks есть, ждём --watch;
    #   (b) exit 0 + пустой []      → checks реально нет (пути workflow не затронуты) — ОК;
    #   (c) gh упал / вернул не-JSON → НЕ считаем «нет checks», это BLOCK (fail-closed).
    # Плюс: сразу после создания PR checks могут ещё не зарегистрироваться — короткий retry,
    # чтобы пустой список не был принят за окончательное «checks нет».
    import time as _time

    def probe_checks() -> tuple[str, list | None]:
        """('has', list) | ('none', []) | ('error', None)."""
        p = run(["gh", "pr", "checks", str(pr_num), "--json", "name"],
                check=False, capture=True)
        if p.returncode != 0:
            # exit != 0 у `gh pr checks` бывает и когда «нет checks», и когда gh реально упал.
            # Отличаем по stderr: пустой список checks vs ошибка авторизации/сети.
            err = (p.stderr or "") + (p.stdout or "")
            if "no checks reported" in err.lower() or "no check runs" in err.lower():
                return "none", []
            return "error", None
        s = p.stdout.strip()
        if s in ("", "[]"):
            return "none", []
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            return "error", None
        return ("has", data) if data else ("none", [])

    # B7: окно ожидания регистрации checks после создания PR — настраиваемое.
    # Приоритет: --ci-wait > env TASK_CI_WAIT_SECONDS > default 30с. Пауза экспоненциальная
    # (1,2,4,8,...), суммарно не превышает окно. Пустой список НЕ принимается за «checks нет»,
    # пока не истекло окно — GitHub Actions регистрирует checks с задержкой.
    ci_wait = args.ci_wait if getattr(args, "ci_wait", None) is not None else \
        _env_int("TASK_CI_WAIT_SECONDS", 30)
    ci_wait = max(0, ci_wait)

    state, _payload = probe_checks()
    if state == "none" and ci_wait > 0:
        print(f"⏳ checks пока не зарегистрированы — жду до {ci_wait}с их появления "
              f"(экспоненциальная пауза)...")
        elapsed, delay = 0.0, 1.0
        while state == "none" and elapsed < ci_wait:
            nap = min(delay, ci_wait - elapsed)
            _time.sleep(nap)
            elapsed += nap
            delay *= 2
            state, _payload = probe_checks()

    if state == "error":
        if args.force:
            print("⚠️  gh pr checks упал (не удалось узнать статус CI), но --force — продолжаю.")
        else:
            sys.exit(
                f"❌ Не удалось получить статус CI для PR #{pr_num} (gh pr checks завершился ошибкой). "
                f"Это НЕ значит «checks нет» — блокирую merge (fail-closed). "
                f"Проверь `gh auth status` / сеть, либо запусти с --force при осознанном решении.")
    elif state == "has":
        print(f"⏳ Жду CI для PR #{pr_num}...")
        r = run(["gh", "pr", "checks", str(pr_num), "--watch"], check=False)
        if r.returncode != 0:
            if args.force:
                print("⚠️  CI не зелёный, но --force — мержу.")
            else:
                sys.exit(f"❌ CI не зелёный для PR #{pr_num}. "
                         f"Исправь или запусти с --force.")
    else:  # none — по истечении окна checks так и не появились
        # B7: пустой список checks — НЕ доказательство отсутствия CI. Возможные причины:
        # workflow ещё не зарегистрировался, required checks не настроены на GitHub,
        # у PR нет затронутых путей. Merge без checks — доверенное решение человека:
        # требуем явный --no-ci (или --force). Иначе BLOCK.
        if not (args.no_ci or args.force):
            sys.exit(
                f"❌ Для PR #{pr_num} за {ci_wait}с не зарегистрировано ни одного check.\n"
                f"   Пустой список checks НЕ доказывает, что CI нет (workflow мог не успеть "
                f"зарегистрироваться, или required checks не настроены на GitHub).\n"
                f"   Если для этого PR checks действительно не предусмотрены — подтверди явно: "
                f"добавь --no-ci.\n"
                f"   Рекомендация: включи branch protection / required checks на GitHub "
                f"(см. ai/core/guides/workflow.md), чтобы merge без CI был невозможен в принципе.\n"
                f"   Увеличить окно ожидания: --ci-wait <сек> или env TASK_CI_WAIT_SECONDS.")
        why = "--no-ci" if args.no_ci else "--force"
        print(f"ℹ️  CI не триггернулся для PR #{pr_num} за {ci_wait}с — мержу по флагу {why} "
              f"(осознанное решение человека, что checks не предусмотрены).")

    # Confirmation — защита от случайного запуска (особенно агентами)
    if not args.yes:
        if not sys.stdin.isatty():
            sys.exit(
                f"❌ Merge PR #{pr_num} требует подтверждения. "
                f"stdin не-интерактивен — добавь --yes если запускаешь автоматически.\n"
                f"   Для агентов: передавай --yes ТОЛЬКО когда пользователь явно одобрил merge."
            )
        print(f"\n🔀 Смержить PR #{pr_num} в {base} (squash + delete branch)?")
        answer = input("   [y/N]: ").strip().lower()
        if answer != "y":
            print("Отменено. PR остаётся открытым.")
            return

    # Merge
    print(f"🔀 gh pr merge {pr_num} --squash --delete-branch")
    run(["gh", "pr", "merge", str(pr_num), "--squash", "--delete-branch"])

    # Back to base
    print(f"📥 checkout {base} + pull")
    run(["git", "checkout", base])
    run(["git", "pull", "--ff-only", "origin", base])

    task_id = extract_task_id(branch) or "<unknown>"
    print(f"\n✅ {task_id} в master.")


def cmd_finish(args: argparse.Namespace) -> None:
    """pr + merge одной командой."""
    cmd_pr(args)
    cmd_merge(args)


# ─── Схема задач v2: frontmatter / lint / move / state ───────────────────────

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def parse_frontmatter(task_md: Path) -> tuple[dict | None, str]:
    """Прочитать YAML-frontmatter из task.md.

    Возвращает (frontmatter_dict | None, error_or_empty).
    None => v1-задача без frontmatter (не ошибка, обрабатывается вызывающим как warning).
    """
    try:
        text = task_md.read_text(encoding="utf-8")
    except OSError as e:
        return None, f"не читается: {e}"
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, ""  # v1 — нет frontmatter
    raw = m.group(1)
    if not _HAS_YAML:
        return None, "PyYAML недоступен — не могу распарсить frontmatter"
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        return None, f"frontmatter не парсится: {e}"
    if not isinstance(data, dict):
        return None, "frontmatter не является YAML-словарём"
    return data, ""


def write_frontmatter_status(task_md: Path, new_status: str) -> None:
    """Заменить поле status во frontmatter, сохранив остальной файл дословно."""
    text = task_md.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        raise ValueError("нет frontmatter — v1-задача, move не применим")
    block = m.group(1)
    if re.search(r"^status\s*:", block, re.MULTILINE):
        new_block = re.sub(r"^(status\s*:).*$", rf"\1 {new_status}", block, count=1,
                           flags=re.MULTILINE)
    else:
        new_block = block + f"\nstatus: {new_status}"
    new_text = text[:m.start(1)] + new_block + text[m.end(1):]
    task_md.write_text(new_text, encoding="utf-8")


def iter_task_dirs():
    """Итерировать (status_name, task_dir) по active/blocked/done."""
    for status_name, base in STATUS_DIRS.items():
        if not base.exists():
            continue
        for p in sorted(base.iterdir()):
            if p.is_dir() and re.match(r"^(TASK|HOTFIX)-\d+", p.name):
                yield status_name, p


def profile_exists(name: str) -> bool:
    if not name:
        return False
    return (PROFILES_DIR / f"{name}.yaml").exists() or (PROFILES_DIR / f"{name}.yml").exists()


# ─── Резолв зон / checks против profile.yaml (TASK-008, Bomb #2) ──────────────

# Допустимые поля frontmatter задачи — для предупреждения о неизвестных.
KNOWN_FRONTMATTER_KEYS = {
    "id", "schema_version", "status", "mode", "zone",
    "verification_profile", "checks", "max_attempts", "depends_on",
}


def load_zone_map() -> tuple[dict[str, dict] | None, str]:
    """Прочитать зоны из profile.yaml → {zone_name: zone_dict}. Возвращает (map|None, note).

    None => profile.yaml нет или PyYAML недоступен (zone-резолв пропускается с warning,
    не error — profile.yaml может отсутствовать в раннем проекте).
    """
    if not PROFILE_YAML.exists():
        return None, "нет ai/project/profile.yaml — резолв zone пропущен"
    if not _HAS_YAML:
        return None, "PyYAML недоступен — резолв zone пропущен"
    try:
        data = yaml.safe_load(PROFILE_YAML.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        return None, f"profile.yaml не парсится: {e}"
    if not isinstance(data, dict):
        return None, "profile.yaml не является словарём"
    zones = data.get("zones")
    if not isinstance(zones, list):
        return {}, ""
    result: dict[str, dict] = {}
    for z in zones:
        if isinstance(z, dict) and z.get("name"):
            result[str(z["name"])] = z
    return result, ""


def load_profile_check_names(vp_name: str) -> set[str] | None:
    """Множество имён checks внутри verification-профиля vp_name, или None если не резолвится."""
    if not vp_name or not _HAS_YAML:
        return None
    for ext in (".yaml", ".yml"):
        p = PROFILES_DIR / f"{vp_name}{ext}"
        if p.exists():
            try:
                data = yaml.safe_load(p.read_text(encoding="utf-8"))
            except yaml.YAMLError:
                return None
            if isinstance(data, dict) and isinstance(data.get("checks"), dict):
                return set(data["checks"].keys())
            return set()
    return None


def detect_depends_cycles(graph: dict[str, list[str]]) -> list[list[str]]:
    """Простой DFS-детектор циклов в depends_on. Возвращает список найденных циклов (пути)."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n: WHITE for n in graph}
    cycles: list[list[str]] = []

    def dfs(node: str, stack: list[str]) -> None:
        color[node] = GRAY
        stack.append(node)
        for dep in graph.get(node, []):
            if dep not in color:
                continue  # неизвестный id — отдельная ошибка, не цикл
            if color[dep] == GRAY:
                # найден цикл: срез стека от dep
                idx = stack.index(dep)
                cycles.append(stack[idx:] + [dep])
            elif color[dep] == WHITE:
                dfs(dep, stack)
        stack.pop()
        color[node] = BLACK

    for n in list(graph):
        if color[n] == WHITE:
            dfs(n, [])
    # дедуп по каноническому множеству узлов цикла
    seen: set[frozenset] = set()
    unique: list[list[str]] = []
    for cyc in cycles:
        key = frozenset(cyc)
        if key not in seen:
            seen.add(key)
            unique.append(cyc)
    return unique


def collect_lint_issues() -> tuple[list[str], list[str]]:
    """Собрать (errors, warnings) по всем задачам. Без печати/exit — чтобы cmd_pr мог
    прогнать lint перед коммитом перемещения (B1) и отказать на красном."""
    errors: list[str] = []
    warnings: list[str] = []
    seen_ids: dict[str, str] = {}

    # Резолв зон против profile.yaml (TASK-008, Bomb #2). None => profile.yaml нет/не читается.
    zone_map, zone_note = load_zone_map()
    if zone_note:
        warnings.append(zone_note)

    depends_graph: dict[str, list[str]] = {}   # id → [depends_on ids]
    task_rel: dict[str, str] = {}              # id → относительный путь (для сообщений)

    for folder_status, task_dir in iter_task_dirs():
        rel = task_dir.relative_to(REPO_ROOT)
        task_md = task_dir / "task.md"
        if not task_md.exists():
            errors.append(f"{rel}: нет task.md")
            continue

        fm, err = parse_frontmatter(task_md)
        if err:
            errors.append(f"{rel}: {err}")
            continue
        if fm is None:
            warnings.append(f"{rel}: schema v1 (нет frontmatter) — пропущены v2-проверки")
            continue

        tid = str(fm.get("id", "")).strip()
        if not tid:
            errors.append(f"{rel}: пустой id во frontmatter")
        else:
            if tid in seen_ids:
                errors.append(f"{rel}: дубль id {tid} (также в {seen_ids[tid]})")
            else:
                seen_ids[tid] = str(rel)
            # id должен совпадать с префиксом папки
            if not task_dir.name.startswith(tid + "-") and task_dir.name != tid:
                errors.append(f"{rel}: id {tid} не совпадает с именем папки")
            task_rel[tid] = str(rel)

        # неизвестные поля frontmatter → warning со списком допустимых
        unknown = set(fm) - KNOWN_FRONTMATTER_KEYS
        if unknown:
            warnings.append(f"{rel}: неизвестные поля frontmatter {sorted(unknown)} "
                            f"(допустимо: {sorted(KNOWN_FRONTMATTER_KEYS)})")

        fm_status = str(fm.get("status", "")).strip()
        if fm_status not in VALID_STATUS:
            errors.append(f"{rel}: status '{fm_status}' не из {VALID_STATUS}")
        elif fm_status != folder_status:
            errors.append(
                f"{rel}: расхождение папка/status — лежит в '{folder_status}/', "
                f"а status='{fm_status}'. Используй 'task.py move {tid} <status>'.")

        sv = fm.get("schema_version")
        if sv != 2:
            warnings.append(f"{rel}: schema_version={sv} (ожидается 2)")

        # max_attempts — int > 0
        ma = fm.get("max_attempts", 3)
        if not isinstance(ma, int) or isinstance(ma, bool) or ma <= 0:
            errors.append(f"{rel}: max_attempts должен быть целым > 0 (сейчас {ma!r})")

        # depends_on — список; собрать граф (существование id проверим после цикла)
        dep_raw = fm.get("depends_on") or []
        if not isinstance(dep_raw, list):
            errors.append(f"{rel}: depends_on должен быть списком id (сейчас {type(dep_raw).__name__})")
            dep_raw = []
        if tid:
            depends_graph[tid] = [str(d).strip() for d in dep_raw]

        mode = str(fm.get("mode", "interactive")).strip()
        if mode not in ("interactive", "auto"):
            errors.append(f"{rel}: mode '{mode}' не из (interactive, auto)")

        # --- Резолв zone против profile.yaml (Bomb #2) ---
        zone = str(fm.get("zone", "")).strip()
        zone_dict = None
        if zone and zone_map is not None:
            if zone not in zone_map:
                sev = errors if mode == "auto" else warnings
                sev.append(
                    f"{rel}: zone '{zone}' не найдена в profile.yaml "
                    f"({'error для mode:auto' if mode == 'auto' else 'warning для interactive'})")
            else:
                zone_dict = zone_map[zone]

        vp = str(fm.get("verification_profile", "")).strip()
        # B2: anti-traversal на verification_profile ЗАДАЧИ. Имя профиля — простое имя без
        # слэшей/'..'/абсолютных путей (иначе '../evil' указал бы на файл вне profiles/).
        # Та же семантика, что в profile.py для зонного verification_profile.
        vp_safe = True
        if vp:
            if "/" in vp or "\\" in vp:
                errors.append(f"{rel}: verification_profile '{vp}' — имя не должно содержать слэшей "
                              f"(path traversal)")
                vp_safe = False
            else:
                perr = validate_safe_path(vp)
                if perr:
                    errors.append(f"{rel}: verification_profile {perr}")
                    vp_safe = False
        if not vp_safe:
            vp = ""  # не резолвим небезопасное имя дальше (profile_exists/load_checks)

        checks = fm.get("checks") or []
        if not isinstance(checks, list):
            errors.append(f"{rel}: checks должен быть списком имён (сейчас {type(checks).__name__})")
            checks = []

        # verification_profile задачи должен совпадать с профилем зоны или существовать в profiles-dir
        if vp and zone_dict is not None:
            zone_vp = str(zone_dict.get("verification_profile", "")).strip()
            if zone_vp and vp != zone_vp:
                warnings.append(
                    f"{rel}: verification_profile '{vp}' != профиля зоны '{zone}' ('{zone_vp}') "
                    f"— допустимо, если это осознанный профиль из profiles/")

        # Каждое имя check обязано существовать в указанном verification-профиле (Bomb #2)
        if vp and checks:
            names = load_profile_check_names(vp)
            if names is not None:
                for cn in checks:
                    if str(cn).strip() not in names:
                        errors.append(
                            f"{rel}: check '{cn}' отсутствует в профиле '{vp}' "
                            f"(доступны: {sorted(names)})")

        if mode == "auto":
            # B2: mode:auto — драйвер исполняет задачу без интерактивного подтверждения,
            # поэтому зона (её capability policy: execution/network/side_effects) ОБЯЗАТЕЛЬНА.
            # Пустая/отсутствующая zone у auto — error (без зоны нет guardrail для исполнения).
            if not zone:
                errors.append(f"{rel}: mode:auto требует непустую zone "
                              f"(зона определяет capability policy для автономного исполнения)")
            if not vp:
                errors.append(f"{rel}: mode:auto требует непустой verification_profile")
            if not checks:
                errors.append(f"{rel}: mode:auto требует непустой список checks")
            if vp and PROFILES_DIR.exists() and not profile_exists(vp):
                errors.append(
                    f"{rel}: verification_profile '{vp}' не найден в "
                    f"{PROFILES_DIR.relative_to(REPO_ROOT)}")
            # mode:auto в зоне с execution:never — запрет (проверка на стыке task×profile)
            if zone_dict is not None and str(zone_dict.get("execution", "")).strip() == "never":
                errors.append(
                    f"{rel}: mode:auto в зоне '{zone}' с execution:never — драйверу запрещено "
                    f"исполнять эту зону; сделай mode:interactive или смени зону.")

    # --- depends_on: существование id + детекция циклов (после сбора всех задач) ---
    for tid, deps in depends_graph.items():
        for d in deps:
            if d not in depends_graph:
                errors.append(f"{task_rel.get(tid, tid)}: depends_on ссылается на несуществующий "
                              f"id '{d}'")
    cycles = detect_depends_cycles(depends_graph)
    for cyc in cycles:
        errors.append(f"depends_on: обнаружен цикл {' → '.join(cyc)}")

    return errors, warnings


def cmd_lint(args: argparse.Namespace) -> None:
    """Валидация задач: папка↔status, уникальность id, mode:auto ⇒ verify, парсинг."""
    errors, warnings = collect_lint_issues()
    for w in warnings:
        print(f"⚠️  {w}")
    if errors:
        for e in errors:
            print(f"❌ {e}")
        print(f"\nlint: {len(errors)} ошибок, {len(warnings)} предупреждений.")
        sys.exit(1)
    print(f"✅ lint: ошибок нет ({len(warnings)} предупреждений).")


def move_task_status(task_id: str, new_status: str) -> tuple[str, Path]:
    """Транзакционно сменить status задачи: frontmatter + канбан-папка вместе.

    Единственная точка смены статуса (используется cmd_move и cmd_pr). Гарантирует,
    что состояние «папка X + status Y» не возникает: сначала пишется frontmatter, затем
    move; при сбое move — frontmatter откатывается (B1-smell), поэтому lint остаётся
    зелёным. Возвращает (cur_status, new_task_dir).

    Бросает ValueError с человекочитаемым сообщением при любой невозможности.
    """
    if new_status not in VALID_STATUS:
        raise ValueError(f"Неизвестный статус '{new_status}'. Допустимо: {VALID_STATUS}")

    found: tuple[str, Path] | None = None
    for folder_status, task_dir in iter_task_dirs():
        fm, _ = parse_frontmatter(task_dir / "task.md")
        fm_id = str(fm.get("id", "")).strip() if fm else None
        if fm_id == task_id or task_dir.name.startswith(task_id + "-"):
            found = (folder_status, task_dir)
            break
    if not found:
        raise ValueError(f"Задача {task_id} не найдена в active/blocked/done.")

    cur_status, task_dir = found
    task_md = task_dir / "task.md"
    fm, err = parse_frontmatter(task_md)
    if err or fm is None:
        raise ValueError(f"{task_dir.name}: {err or 'v1-задача без frontmatter — move не применим'}")

    if cur_status == new_status:
        if str(fm.get("status", "")).strip() != new_status:
            write_frontmatter_status(task_md, new_status)
        return cur_status, task_dir

    dst = STATUS_DIRS[new_status] / task_dir.name
    if dst.exists():
        raise ValueError(f"{dst.relative_to(REPO_ROOT)} уже существует.")

    old_status_field = str(fm.get("status", "")).strip()
    STATUS_DIRS[new_status].mkdir(parents=True, exist_ok=True)
    tracked = run(["git", "ls-files", "--error-unmatch", str(task_md)],
                  check=False, capture=True).returncode == 0
    if tracked:
        # Порядок для git: СНАЧАЛА git mv (иначе правка frontmatter до mv остаётся
        # unstaged и теряется — коммит зафиксировал бы rename со старым status).
        # Затем правим frontmatter на перемещённом файле и git add — так rename и
        # изменение status попадают в индекс вместе, рабочий каталог остаётся чист.
        mv = run(["git", "mv", str(task_dir), str(dst)], check=False, capture=True)
        if mv.returncode != 0:
            raise ValueError(
                f"перемещение {task_id} {cur_status}→{new_status}: git mv упал "
                f"({(mv.stdout or '') + (mv.stderr or '')}); frontmatter не тронут — "
                f"состояние согласовано.")
        moved_md = dst / "task.md"
        write_frontmatter_status(moved_md, new_status)
        run(["git", "add", str(moved_md)])
    else:
        # не под git: сначала frontmatter, затем os.replace; при сбое replace — откат.
        write_frontmatter_status(task_md, new_status)
        try:
            os.replace(str(task_dir), str(dst))
        except OSError as e:
            write_frontmatter_status(task_md, old_status_field or cur_status)
            raise ValueError(
                f"перемещение {task_id} {cur_status}→{new_status} не удалось ({e}); "
                f"frontmatter откачен на '{old_status_field or cur_status}' — "
                f"папка↔status совпадают.") from e
    return cur_status, dst


def cmd_move(args: argparse.Namespace) -> None:
    """Атомарно: сменить status во frontmatter + git mv папки в нужный канбан-каталог."""
    task_id = args.id.strip()
    new_status = args.status.strip()
    try:
        cur_status, dst = move_task_status(task_id, new_status)
    except ValueError as e:
        sys.exit(f"❌ {e}")
    if cur_status == new_status:
        print(f"ℹ️  Задача {task_id} уже в '{new_status}' (frontmatter выровнен при необходимости).")
    else:
        print(f"✅ {task_id}: {cur_status} → {new_status} (папка перемещена, status обновлён).")


def cmd_state(args: argparse.Namespace) -> None:
    """Показать runtime-state задачи: state.json + runs.jsonl (если есть)."""
    task_id = args.id.strip()
    target: Path | None = None
    for _folder_status, task_dir in iter_task_dirs():
        fm, _ = parse_frontmatter(task_dir / "task.md")
        fm_id = str(fm.get("id", "")).strip() if fm else None
        if fm_id == task_id or task_dir.name.startswith(task_id + "-"):
            target = task_dir
            break
    if target is None:
        sys.exit(f"❌ Задача {task_id} не найдена.")

    state_file = target / "state.json"
    runs_file = target / "runs.jsonl"
    print(f"📁 {target.relative_to(REPO_ROOT)}")

    if state_file.exists():
        print("\n=== state.json ===")
        try:
            data = json.loads(state_file.read_text(encoding="utf-8"))
            print(json.dumps(data, ensure_ascii=False, indent=2))
        except (OSError, json.JSONDecodeError) as e:
            print(f"⚠️  не читается: {e}")
    else:
        print("\nstate.json: отсутствует (задача ещё не запускалась драйвером).")

    if runs_file.exists():
        print("\n=== runs.jsonl ===")
        for i, line in enumerate(runs_file.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                print(f"[{i}] {json.dumps(rec, ensure_ascii=False)}")
            except json.JSONDecodeError:
                print(f"[{i}] (не JSON) {line}")
    else:
        print("\nruns.jsonl: отсутствует.")


# ─── Main ────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Task workflow CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_start = subparsers.add_parser("start", help="Создать feature branch")
    p_start.add_argument("name", help="Branch suffix, например TASK-002-shared-commands-cat-a")
    p_start.add_argument("--stash", action="store_true",
                         help="Автоматически stash uncommitted changes и pop после создания ветки")
    p_start.set_defaults(func=cmd_start)

    p_pr = subparsers.add_parser("pr", help="Push + create PR")
    p_pr.add_argument("--done", action="store_true",
                      help="Явно перевести active-задачу в done/ (транзакционно) перед PR. "
                           "Без флага pr НЕ двигает задачу в done — наличие report.md не значит done.")
    p_pr.set_defaults(func=cmd_pr)

    p_merge = subparsers.add_parser("merge", help="Wait CI + merge PR")
    p_merge.add_argument("--force", action="store_true",
                         help="Смержить даже если CI не зелёный / не удалось узнать статус")
    p_merge.add_argument("--no-ci", action="store_true",
                         help="Подтвердить, что для этого PR checks не предусмотрены (merge без CI). "
                              "Пустой список checks сам по себе НЕ разрешает merge — нужен этот флаг.")
    p_merge.add_argument("--ci-wait", type=int, metavar="SEC",
                         help="Окно ожидания регистрации checks после создания PR, сек "
                              "(default 30 или env TASK_CI_WAIT_SECONDS).")
    p_merge.add_argument("-y", "--yes", action="store_true",
                         help="Пропустить confirmation prompt. Передавать ТОЛЬКО когда user явно одобрил merge.")
    p_merge.add_argument("--pr", type=int, metavar="N",
                         help="Номер PR для merge из любой ветки (включая базовую). Без флага — PR текущей ветки")
    p_merge.set_defaults(func=cmd_merge)

    p_finish = subparsers.add_parser("finish", help="pr + merge")
    p_finish.add_argument("--force", action="store_true",
                          help="Пропустить проверку CI при merge")
    p_finish.add_argument("--no-ci", action="store_true",
                          help="Подтвердить, что для этого PR checks не предусмотрены (merge без CI).")
    p_finish.add_argument("--ci-wait", type=int, metavar="SEC",
                          help="Окно ожидания регистрации checks, сек (default 30 / env TASK_CI_WAIT_SECONDS).")
    p_finish.add_argument("-y", "--yes", action="store_true",
                          help="Пропустить confirmation prompt. Передавать ТОЛЬКО когда user явно одобрил merge.")
    p_finish.add_argument("--done", action="store_true",
                          help="Явно перевести active-задачу в done/ перед PR (см. pr --done).")
    p_finish.set_defaults(func=cmd_finish, pr=None)

    p_lint = subparsers.add_parser("lint", help="Валидация задач (frontmatter, папка↔status, id)")
    p_lint.set_defaults(func=cmd_lint)

    p_move = subparsers.add_parser("move", help="Атомарно сменить status + переместить папку")
    p_move.add_argument("id", help="ID задачи, напр. TASK-007")
    p_move.add_argument("status", help=f"Новый статус: {'|'.join(VALID_STATUS)}")
    p_move.set_defaults(func=cmd_move)

    p_state = subparsers.add_parser("state", help="Показать state.json/runs.jsonl задачи")
    p_state.add_argument("id", help="ID задачи, напр. TASK-007")
    p_state.set_defaults(func=cmd_state)

    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
