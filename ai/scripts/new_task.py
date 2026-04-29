#!/usr/bin/env python3
"""
AI Team CLI - Task Creation Script
Usage:
    python new_task.py "Task Title"
    python new_task.py "Task Title" --lite
    python new_task.py "Task Title" --no-status
"""

import os
import sys
import datetime
import argparse

# Path setup (reliable, works from any directory)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
TASKS_DIR = os.path.join(PROJECT_ROOT, "tasks", "active")
TEMPLATE_DIR = os.path.join(PROJECT_ROOT, "tasks", "_template")
DOCS_DIR = os.path.join(PROJECT_ROOT, "docs")
QUICK_TASKS_FILE = os.path.join(TASKS_DIR, "QUICK_TASKS.md")
STATUS_FILE = os.path.join(DOCS_DIR, "STATUS.md")


def get_next_task_id():
    """Find the next available TASK-XXX ID."""
    existing = [d for d in os.listdir(TASKS_DIR) 
                if os.path.isdir(os.path.join(TASKS_DIR, d)) and d.startswith("TASK-")]
    
    max_id = 0
    for folder in existing:
        try:
            parts = folder.split("-")
            if len(parts) >= 2 and parts[1].isdigit():
                max_id = max(max_id, int(parts[1]))
        except:
            pass
    
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


def create_full_task(title, update_status_flag=True):
    """Create full task folder from template."""
    task_id = get_next_task_id()
    task_id_str = f"TASK-{task_id:03d}"
    folder_name = f"{task_id_str}-{sanitize_title(title)}"
    full_path = os.path.join(TASKS_DIR, folder_name)
    
    # Create folder
    os.makedirs(full_path, exist_ok=True)
    print(f"✓ Created: tasks/active/{folder_name}/")
    
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
    print(f"   1. Edit tasks/active/{folder_name}/task.md")
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
