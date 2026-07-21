#!/usr/bin/env python3
"""
AI Team CLI - Task Creation Script
Usage:
    python new_task.py "Task Title"
    python new_task.py "Task Title" --lite
    python new_task.py "Task Title" --no-status
"""

import os
import re
import sys
import datetime
import argparse

# Path setup (reliable, works from any directory)
# Структура v2: ai/core/scripts/new_task.py, задачи и статусы — в ai/project/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))          # ai/core/scripts
CORE_DIR = os.path.dirname(SCRIPT_DIR)                           # ai/core
AI_ROOT = os.path.dirname(CORE_DIR)                              # ai/
PROJECT_DIR = os.path.join(AI_ROOT, "project")                  # ai/project
# Runtime-контент задач (project-owned)
TASKS_BASE = os.path.join(PROJECT_DIR, "tasks")
TASKS_DIR = os.path.join(PROJECT_DIR, "tasks", "active")
DOCS_DIR = os.path.join(PROJECT_DIR, "docs")
# B6: каталог-мьютексов резервации ID. mkdir атомарен на всех ФС — единственный
# кросс-процессный примитив без внешних зависимостей.
IDLOCK_DIR = os.path.join(PROJECT_DIR, "tasks", ".idlock")
# Шаблон задачи — upstream-owned (core)
TEMPLATE_DIR = os.path.join(CORE_DIR, "tasks", "_template")
QUICK_TASKS_FILE = os.path.join(TASKS_DIR, "QUICK_TASKS.md")
STATUS_FILE = os.path.join(DOCS_DIR, "STATUS.md")


def get_next_task_id():
    """Find the next available TASK-XXX ID across ALL task states.

    B6: сканирует active/blocked/done/archive (включая вложенные, напр.
    archive/superseded/). Пропуск blocked приводил к переиспользованию номера
    заблокированной задачи → коллизия ID при параллельной работе агентов. Берём
    глобальный max(TASK-NNN)+1.
    """
    pattern = re.compile(r"^TASK-(\d+)")
    max_id = 0
    for sub in ("active", "blocked", "done", "archive"):
        base = os.path.join(TASKS_BASE, sub)
        if not os.path.isdir(base):
            continue
        for _root, dirs, _files in os.walk(base):
            for d in dirs:
                m = pattern.match(d)
                if m:
                    max_id = max(max_id, int(m.group(1)))

    # B6: учитываем и уже зарезервированные (но, возможно, ещё не материализованные) ID
    # из .idlock/ — иначе окно между mkdir-резервацией и созданием папки задачи позволило
    # бы параллельному процессу переиспользовать номер.
    if os.path.isdir(IDLOCK_DIR):
        for d in os.listdir(IDLOCK_DIR):
            m = pattern.match(d)
            if m:
                max_id = max(max_id, int(m.group(1)))

    return max_id + 1


def get_next_hotfix_id():
    """Find the next available HOTFIX-XXX ID from QUICK_TASKS.md."""
    max_id = 0
    if os.path.exists(QUICK_TASKS_FILE):
        with open(QUICK_TASKS_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                if "[HOTFIX-" in line:
                    try:
                        start = line.index("[HOTFIX-") + 8
                        end = line.index("]", start)
                        max_id = max(max_id, int(line[start:end]))
                    except:
                        pass
    return max_id + 1


def sanitize_title(title):
    """Convert title to folder-safe name."""
    return "".join([c if c.isalnum() else "-" for c in title]).lower().strip("-")


def update_status(task_id, title, is_lite=False):
    """Append task to STATUS.md."""
    if not os.path.exists(STATUS_FILE):
        print(f"Warning: {STATUS_FILE} not found, skipping status update.")
        return
    
    task_type = "HOTFIX" if is_lite else "TASK"
    today = datetime.date.today().isoformat()
    
    # Ensure file ends with newline
    with open(STATUS_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    entry = f"| {task_type}-{task_id:03d} | {title} | 🟡 In Progress | {today} |"
    
    if not content.endswith('\n'):
        entry = '\n' + entry
    
    with open(STATUS_FILE, 'a', encoding='utf-8') as f:
        f.write(entry + '\n')
    
    print(f"✓ Updated STATUS.md")


def id_exists_anywhere(task_id):
    """True если папка TASK-NNN-* уже есть в любом состоянии (active/blocked/done/archive)."""
    prefix = f"{task_id}-"
    for sub in ("active", "blocked", "done", "archive"):
        base = os.path.join(TASKS_BASE, sub)
        if not os.path.isdir(base):
            continue
        for _root, dirs, _files in os.walk(base):
            for d in dirs:
                if d == task_id or d.startswith(prefix):
                    return True
    return False


def reserve_task_id(max_tries=1000):
    """B6: атомарно зарезервировать следующий свободный TASK-NNN через mkdir-мьютекс.

    mkdir(.idlock/TASK-NNN) атомарен: при гонке ровно ОДИН процесс создаёт каталог, остальные
    получают FileExistsError и пробуют следующий ID. Каталог-lock ОСТАЁТСЯ как durable-след
    занятости номера (его же учитывает get_next_task_id) — это закрывает окно между резервацией
    и созданием папки задачи. При успехе финального создания папки lock можно удалить (папка
    задачи сама становится следом), но при ошибке он остаётся, чтобы номер не переиспользовали.

    Возвращает (task_id:int, task_id_str, lock_path). Бросает SystemExit при исчерпании попыток.
    """
    os.makedirs(IDLOCK_DIR, exist_ok=True)
    for _ in range(max_tries):
        task_id = get_next_task_id()
        task_id_str = f"TASK-{task_id:03d}"
        lock_path = os.path.join(IDLOCK_DIR, task_id_str)
        try:
            os.mkdir(lock_path)  # атомарный мьютекс: победитель ровно один
        except FileExistsError:
            continue  # номер уже кем-то зарезервирован — следующий
        # доп. страховка: если ID уже материализован папкой в любом состоянии — освобождаем
        # lock и идём дальше (напр. ручное создание папки без резервации).
        if id_exists_anywhere(task_id_str):
            try:
                os.rmdir(lock_path)
            except OSError:
                pass
            continue
        return task_id, task_id_str, lock_path
    print("Error: не удалось зарезервировать свободный TASK ID", file=sys.stderr)
    sys.exit(1)


def create_full_task(title, update_status_flag=True):
    """Create full task folder from template."""
    # B6: атомарная резервация ID через mkdir-мьютекс (.idlock/TASK-NNN). Устраняет гонку
    # «два разных title → один TASK-NNN»: exist_ok=False на папке задачи её НЕ ловил, т.к.
    # имена папок различались суффиксом. Резервация — по номеру, а не по имени папки.
    task_id, task_id_str, lock_path = reserve_task_id()
    folder_name = f"{task_id_str}-{sanitize_title(title)}"
    full_path = os.path.join(TASKS_DIR, folder_name)
    try:
        os.makedirs(full_path, exist_ok=False)
    except FileExistsError:
        # крайне маловероятно (номер зарезервирован нами), но fail-closed: не затираем чужое
        print(f"Error: папка {folder_name} уже существует несмотря на резервацию {task_id_str}",
              file=sys.stderr)
        sys.exit(1)
    # Папка задачи создана — она сама теперь durable-след занятости номера, lock больше не нужен.
    # Убираем его, чтобы .idlock/ не рос бесконечно. Если удалить не удалось — не критично
    # (get_next_task_id всё равно учтёт и папку, и оставшийся lock).
    try:
        os.rmdir(lock_path)
    except OSError:
        pass
    print(f"✓ Created: ai/project/tasks/active/{folder_name}/")
    
    # Copy template files
    if os.path.exists(TEMPLATE_DIR):
        for item in os.listdir(TEMPLATE_DIR):
            src = os.path.join(TEMPLATE_DIR, item)
            dst = os.path.join(full_path, item)
            if os.path.isfile(src):
                with open(src, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Replace placeholder in task.md
                if item == "task.md":
                    content = content.replace("TASK-XXX: Название", f"{task_id_str}: {title}")
                    content = content.replace("TASK-XXX", task_id_str)
                
                with open(dst, 'w', encoding='utf-8') as f:
                    f.write(content)
        
        print(f"✓ Template copied")
    else:
        print("⚠ Template directory not found")
    
    # Update STATUS.md
    if update_status_flag:
        update_status(task_id, title, is_lite=False)
    
    print(f"\n📋 Next steps:")
    print(f"   1. Edit ai/project/tasks/active/{folder_name}/task.md")
    print(f"   2. Start TeamLead agent")
    
    return task_id_str


def create_lite_task(title, update_status_flag=True):
    """Add quick task entry to QUICK_TASKS.md."""
    hotfix_id = get_next_hotfix_id()
    today = datetime.date.today().isoformat()
    
    # Create file if doesn't exist
    if not os.path.exists(QUICK_TASKS_FILE):
        with open(QUICK_TASKS_FILE, 'w', encoding='utf-8') as f:
            f.write("# Quick Tasks (HOTFIX)\n\n")
            f.write("Fast-track tasks. See `docs/CONVENTIONS.md` for criteria.\n\n")
    
    entry = f"- [ ] [HOTFIX-{hotfix_id:03d}] {title} — {today}"
    
    with open(QUICK_TASKS_FILE, 'a', encoding='utf-8') as f:
        f.write(entry + '\n')
    
    print(f"✓ Added to QUICK_TASKS.md: HOTFIX-{hotfix_id:03d}")
    
    # Update STATUS.md
    if update_status_flag:
        update_status(hotfix_id, title, is_lite=True)
    
    return f"HOTFIX-{hotfix_id:03d}"


def main():
    parser = argparse.ArgumentParser(description="Create a new task")
    parser.add_argument("title", nargs="?", help="Task title")
    parser.add_argument("--lite", action="store_true", help="Quick entry in QUICK_TASKS.md")
    parser.add_argument("--no-status", action="store_true", help="Skip STATUS.md update")
    
    args = parser.parse_args()
    
    # Get title
    title = args.title
    if not title:
        title = input("Enter task title: ").strip()
        if not title:
            print("Error: Title required")
            sys.exit(1)
    
    # Create task
    update_status_flag = not args.no_status
    
    if args.lite:
        create_lite_task(title, update_status_flag)
    else:
        create_full_task(title, update_status_flag)


if __name__ == "__main__":
    main()
