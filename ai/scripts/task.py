#!/usr/bin/env python3
"""
Task CLI — workflow feature branch → PR → merge для задач.

Subcommands:
    start <name>   Создать feature branch от свежего master
    pr             Запушить текущую ветку, создать PR с report.md как body
    merge          Дождаться CI и смержить PR, вернуться на master
    finish         pr + merge одной командой

Examples:
    python ai/scripts/task.py start TASK-002-shared-commands-cat-a
    python ai/scripts/task.py pr
    python ai/scripts/task.py merge
    python ai/scripts/task.py finish

Требования:
    - gh CLI авторизован (gh auth status)
    - Работа из корня репо
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
ACTIVE_DIR = REPO_ROOT / "ai" / "tasks" / "active"
DONE_DIR = REPO_ROOT / "ai" / "tasks" / "done"

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


def current_branch() -> str:
    r = run(["git", "symbolic-ref", "--short", "HEAD"], capture=True)
    return r.stdout.strip()


def has_uncommitted() -> bool:
    """True если есть modified/staged changes. Untracked игнорируются — они не мешают
    переключению ветки и не конфликтуют с merge."""
    r = run(["git", "diff-index", "--quiet", "HEAD", "--"], check=False)
    return r.returncode != 0


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
    """Создать feature branch от свежего master."""
    name = args.name.strip()
    if name.startswith("feature/"):
        name = name[len("feature/"):]
    branch = f"feature/{name}"

    stashed = False
    if has_uncommitted():
        if args.stash:
            print("📦 stash текущих изменений...")
            run(["git", "stash", "push", "-m", f"task.py auto-stash for {branch}"])
            stashed = True
        else:
            sys.exit("❌ Uncommitted changes. Закоммить или перезапусти с --stash.")

    print(f"📥 checkout master + pull...")
    run(["git", "checkout", "master"])
    run(["git", "pull", "--ff-only", "origin", "master"])

    print(f"🌿 checkout -b {branch}")
    run(["git", "checkout", "-b", branch])

    if stashed:
        print("📤 git stash pop...")
        run(["git", "stash", "pop"])

    print(f"\n✅ Ветка '{branch}' создана. Можно работать.")


def cmd_pr(args: argparse.Namespace) -> None:
    """Push текущей ветки + создать PR с report.md как body."""
    branch = current_branch()

    if branch == "master":
        sys.exit("❌ На master. Переключись на feature-ветку.")
    allowed_prefixes = ("feature/", "chore/", "fix/", "refactor/", "docs/", "hotfix/")
    if not branch.startswith(allowed_prefixes):
        sys.exit(f"❌ Ветка '{branch}' не соответствует допустимым паттернам "
                 f"{allowed_prefixes}.")

    task_id = extract_task_id(branch)
    task_dir: Path | None = None
    task_location = "none"

    if task_id:
        task_dir, task_location = find_task_anywhere(task_id)

    # Если задача всё ещё в active и есть report.md — переместить в done
    if task_location == "active" and task_dir and (task_dir / "report.md").exists():
        done_target = DONE_DIR / task_dir.name
        if done_target.exists():
            print(f"⚠️  {done_target.relative_to(REPO_ROOT)} уже существует, пропуск move")
        else:
            print(f"📦 Перемещение задачи в done/...")
            DONE_DIR.mkdir(parents=True, exist_ok=True)
            run(["git", "mv", str(task_dir), str(done_target)])
            run(["git", "commit", "-m", f"chore(tasks): {task_id} переведена в done"])
            task_dir = done_target
            task_location = "done"
    elif task_location == "done":
        print(f"ℹ️  Задача {task_id} уже в done/ — использую её report.md для PR body")

    if has_uncommitted():
        sys.exit("❌ Uncommitted changes. Закоммить перед pr.")

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
    r = run(["gh", "pr", "create", "--base", "master", "--title", title, *body_arg],
            capture=True)
    print(r.stdout)

    pr_num = pr_number_for_current_branch()
    if pr_num:
        print(f"\n✅ PR #{pr_num} создан.")
        print(f"   Для merge: python ai/scripts/task.py merge")


def cmd_merge(args: argparse.Namespace) -> None:
    """Дождаться CI, смержить PR, вернуться на master.

    Без --pr: работает с PR текущей ветки.
    С --pr N: мержит указанный PR из любой ветки.
    """
    branch = current_branch()

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
        if branch == "master":
            sys.exit("❌ На master без --pr. Либо переключись на feature-ветку, "
                     "либо используй --pr <N>.")
        pr_num = pr_number_for_current_branch()
        if pr_num is None:
            sys.exit("❌ Нет открытого PR для этой ветки. Сначала 'task.py pr'.")

    # Сначала проверить есть ли triggered checks. Если workflow-пути не затронуты —
    # checks просто нет, это НЕ ошибка (gh pr checks --watch в таком случае падает с exit 1).
    probe = run(["gh", "pr", "checks", str(pr_num), "--json", "name"],
                check=False, capture=True)
    has_checks = probe.returncode == 0 and probe.stdout.strip() not in ("", "[]")

    if has_checks:
        print(f"⏳ Жду CI для PR #{pr_num}...")
        r = run(["gh", "pr", "checks", str(pr_num), "--watch"], check=False)
        if r.returncode != 0:
            if args.force:
                print("⚠️  CI не зелёный, но --force — мержу.")
            else:
                sys.exit(f"❌ CI не зелёный для PR #{pr_num}. "
                         f"Исправь или запусти с --force.")
    else:
        print(f"ℹ️  CI не триггернулся для PR #{pr_num} (нет затронутых путей workflow).")

    # Confirmation — защита от случайного запуска (особенно агентами)
    if not args.yes:
        if not sys.stdin.isatty():
            sys.exit(
                f"❌ Merge PR #{pr_num} требует подтверждения. "
                f"stdin не-интерактивен — добавь --yes если запускаешь автоматически.\n"
                f"   Для агентов: передавай --yes ТОЛЬКО когда пользователь явно одобрил merge."
            )
        print(f"\n🔀 Смержить PR #{pr_num} в master (squash + delete branch)?")
        answer = input("   [y/N]: ").strip().lower()
        if answer != "y":
            print("Отменено. PR остаётся открытым.")
            return

    # Merge
    print(f"🔀 gh pr merge {pr_num} --squash --delete-branch")
    run(["gh", "pr", "merge", str(pr_num), "--squash", "--delete-branch"])

    # Back to master
    print("📥 checkout master + pull")
    run(["git", "checkout", "master"])
    run(["git", "pull", "--ff-only", "origin", "master"])

    task_id = extract_task_id(branch) or "<unknown>"
    print(f"\n✅ {task_id} в master.")


def cmd_finish(args: argparse.Namespace) -> None:
    """pr + merge одной командой."""
    cmd_pr(args)
    cmd_merge(args)


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
    p_pr.set_defaults(func=cmd_pr)

    p_merge = subparsers.add_parser("merge", help="Wait CI + merge PR")
    p_merge.add_argument("--force", action="store_true",
                         help="Смержить даже если CI не зелёный")
    p_merge.add_argument("-y", "--yes", action="store_true",
                         help="Пропустить confirmation prompt. Передавать ТОЛЬКО когда user явно одобрил merge.")
    p_merge.add_argument("--pr", type=int, metavar="N",
                         help="Номер PR для merge из любой ветки (включая master). Без флага — PR текущей ветки")
    p_merge.set_defaults(func=cmd_merge)

    p_finish = subparsers.add_parser("finish", help="pr + merge")
    p_finish.add_argument("--force", action="store_true",
                          help="Пропустить проверку CI при merge")
    p_finish.add_argument("-y", "--yes", action="store_true",
                          help="Пропустить confirmation prompt. Передавать ТОЛЬКО когда user явно одобрил merge.")
    p_finish.set_defaults(func=cmd_finish, pr=None)

    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
