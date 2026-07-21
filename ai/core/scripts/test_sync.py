#!/usr/bin/env python3
"""
Тест sync.py (ADR-0002 п.2 + hardening TASK-007: B3/B4/B5/B8).

Покрывает:
  1. init → check (чисто, exit 0)
  2. exit codes --check: 0 чисто / 2 доступно обновление / 3 нарушен инвариант
  3. трёхсторонняя матрица (B4): local edit / local add / local delete /
     upstream add / upstream modify / upstream delete / simultaneous same-edit
  4. атомарный apply (B5): kill-тест через fault injection — повторный apply чинит
  5. lock → JSON (B8): формат JSON; миграция YAML→JSON; malformed/missing schema_version = exit 3
  6. project/ никогда не трогается
Все assertions проверяют И текст, И exit code, где применимо.

Запуск:
    PYTHONIOENCODING=utf-8 python core/scripts/test_sync.py

Требует git в PATH. Временные папки удаляются в конце.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SYNC = SCRIPT_DIR / "sync.py"
SOURCE_AI = SCRIPT_DIR.parent.parent  # каталог ai/ шаблон-репо

# exit codes контракта --check
EXIT_CLEAN, EXIT_UPDATE, EXIT_INVARIANT = 0, 2, 3


def run_sync(*args: str) -> subprocess.CompletedProcess:
    cmd = [sys.executable, str(SYNC), *args]
    return subprocess.run(cmd, text=True, capture_output=True,
                          encoding="utf-8", errors="replace",
                          env={**os.environ, "PYTHONIOENCODING": "utf-8"})


def git(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=str(cwd), text=True, capture_output=True,
                          encoding="utf-8", errors="replace")


_OK = True


def check(name: str, cond: bool, detail: str = "") -> bool:
    global _OK
    mark = "✅" if cond else "❌"
    print(f"{mark} {name}" + (f" — {detail}" if detail and not cond else ""))
    _OK = _OK and cond
    return cond


def make_project(tmp: Path, name: str = "проект-весы") -> tuple[Path, Path]:
    proj = tmp / name
    target_ai = proj / "ai"
    proj.mkdir(parents=True)
    git(proj, "init", "-q", "-b", "master")
    git(proj, "config", "user.email", "t@t")
    git(proj, "config", "user.name", "t")
    r = run_sync("init", str(target_ai), "--template", str(SOURCE_AI))
    assert r.returncode == 0, r.stderr + r.stdout
    git(proj, "add", "-A")
    git(proj, "commit", "-q", "-m", "init template")
    return proj, target_ai


def copy_template(tmp: Path, name: str) -> Path:
    """Копия шаблона (каталог ai/ с core/) для симуляции 'шаблон обновился/удалил'."""
    dst = tmp / name
    shutil.copytree(SOURCE_AI / "core", dst / "core",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    # version.md копируется вместе с core/ (лежит в core/version.md)
    return dst


def basic_and_exit_codes():
    print("\n=== A. init + exit codes + JSON lock ===")
    with tempfile.TemporaryDirectory(prefix="sync_A_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        check("A init: core/scripts/task.py", (target_ai / "core/scripts/task.py").exists())
        lock_path = target_ai / "template.lock"
        check("A init: template.lock создан", lock_path.exists())
        # B8: lock — валидный JSON
        try:
            lock = json.loads(lock_path.read_text(encoding="utf-8"))
            check("A B8: lock — валидный JSON", isinstance(lock, dict))
            check("A B8: lock содержит schema_version=2", lock.get("schema_version") == 2)
            check("A B8: lock содержит source_dirty", "source_dirty" in lock)
        except json.JSONDecodeError as e:
            check("A B8: lock — валидный JSON", False, str(e))

        git(proj, "checkout", "-q", "-b", "feature/x")

        # чисто → exit 0
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("A check чисто: exit 0", r.returncode == EXIT_CLEAN, f"exit={r.returncode}")
        check("A check чисто: 'синхронизировано'", "синхронизировано" in r.stdout)


def matrix_local_edit():
    print("\n=== B4-1. local edit core → exit 3 (B3+B4) ===")
    with tempfile.TemporaryDirectory(prefix="sync_le_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        f = target_ai / "core/scripts/task.py"
        f.write_text(f.read_text(encoding="utf-8") + "\n# local edit\n", encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B4-1 check: exit 3 при local edit", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("B4-1 check: помечает M core/scripts/task.py",
              "ЛОКАЛЬНАЯ ПРАВКА" in r.stdout and "core/scripts/task.py" in r.stdout)
        ap = run_sync("--apply", str(target_ai), "--template", str(SOURCE_AI))
        check("B4-1 apply: отклонён (exit!=0)", ap.returncode != 0)
        check("B4-1 apply: сообщает про перенос", "локальные расхождения" in (ap.stdout + ap.stderr))


def matrix_local_add():
    print("\n=== B4-2. local ADD core-файла → exit 3 ===")
    with tempfile.TemporaryDirectory(prefix="sync_la_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        (target_ai / "core/scripts/sneaky_local.py").write_text("# local only\n", encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B4-2 check: exit 3 при local add", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("B4-2 check: помечает A sneaky_local.py",
              "ДОБАВЛЕННЫЙ" in r.stdout and "sneaky_local.py" in r.stdout)


def matrix_local_delete():
    print("\n=== B4-3. local DELETE baseline core-файла → exit 3 ===")
    with tempfile.TemporaryDirectory(prefix="sync_ld_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        (target_ai / "core/docs/INDEX.md").unlink()
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B4-3 check: exit 3 при local delete", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("B4-3 check: помечает D INDEX.md",
              "УДАЛЁННЫЙ" in r.stdout and "INDEX.md" in r.stdout)


def matrix_upstream_add():
    print("\n=== B4-4. upstream ADD → exit 2, apply добавляет ===")
    with tempfile.TemporaryDirectory(prefix="sync_ua_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        newtpl = copy_template(tmp, "tpl-add")
        (newtpl / "core/scripts/brand_new.py").write_text("# upstream new file\n", encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(newtpl))
        check("B4-4 check: exit 2 (доступно обновление)", r.returncode == EXIT_UPDATE, f"exit={r.returncode}")
        check("B4-4 check: U brand_new.py", "brand_new.py" in r.stdout)
        ap = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("B4-4 apply: exit 0", ap.returncode == 0, ap.stderr)
        check("B4-4 apply: файл появился в проекте",
              (target_ai / "core/scripts/brand_new.py").exists())


def matrix_upstream_modify():
    print("\n=== B4-5. upstream MODIFY → exit 2, apply обновляет ===")
    with tempfile.TemporaryDirectory(prefix="sync_um_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        newtpl = copy_template(tmp, "tpl-mod")
        tf = newtpl / "core/scripts/task.py"
        tf.write_text(tf.read_text(encoding="utf-8") + "\n# upstream v-next\n", encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(newtpl))
        check("B4-5 check: exit 2", r.returncode == EXIT_UPDATE, f"exit={r.returncode}")
        ap = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("B4-5 apply: exit 0", ap.returncode == 0)
        check("B4-5 apply: изменение применено",
              "upstream v-next" in (target_ai / "core/scripts/task.py").read_text(encoding="utf-8"))


def matrix_upstream_delete():
    print("\n=== B4-6. upstream DELETE → exit 2, apply удаляет из проекта ===")
    with tempfile.TemporaryDirectory(prefix="sync_ude_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        newtpl = copy_template(tmp, "tpl-del")
        (newtpl / "core/docs/INDEX.md").unlink()
        r = run_sync("--check", str(target_ai), "--template", str(newtpl))
        check("B4-6 check: exit 2 (upstream delete = обновление)", r.returncode == EXIT_UPDATE, f"exit={r.returncode}")
        check("B4-6 check: ШАБЛОН УДАЛИЛ INDEX.md", "УДАЛИЛ" in r.stdout and "INDEX.md" in r.stdout)
        ap = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("B4-6 apply: exit 0", ap.returncode == 0)
        check("B4-6 apply: файл удалён из проекта",
              not (target_ai / "core/docs/INDEX.md").exists())


def matrix_simultaneous_same():
    print("\n=== B4-7. simultaneous SAME edit (проект==шаблон, lock старый) → lock_stale, exit 2 ===")
    with tempfile.TemporaryDirectory(prefix="sync_sim_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        newtpl = copy_template(tmp, "tpl-same")
        marker = "\n# same change both sides\n"
        for base in (newtpl, target_ai):
            tf = base / "core/scripts/task.py"
            tf.write_text(tf.read_text(encoding="utf-8") + marker, encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(newtpl))
        # B5c: ph==th, но lh(lock)!=ph — на уровне хэшей НЕОТЛИЧИМО от kill-после-swap.
        # Раньше это молча трактовалось как ok(exit 0), из-за чего lock оставался устаревшим и
        # следующий upstream-апдейт блокировался как local_edit. Теперь — lock_stale (exit 2):
        # apply освежит lock без копирования, НЕ помечая как локальную правку.
        check("B4-7 check: exit 2 (lock_stale — lock старый, данные уже совпали)",
              r.returncode == EXIT_UPDATE, f"exit={r.returncode}\n{r.stdout}")
        check("B4-7 check: НЕ local_edit", "ЛОКАЛЬНАЯ ПРАВКА" not in r.stdout)
        # apply чинит lock без копирования, следующий check → exit 0
        ap = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("B4-7 apply: exit 0 (переписал lock)", ap.returncode == 0, ap.stderr)
        r2 = run_sync("--check", str(target_ai), "--template", str(newtpl))
        check("B4-7 после apply: exit 0 (синхронизировано)", r2.returncode == EXIT_CLEAN,
              f"exit={r2.returncode}\n{r2.stdout}")


def apply_kill_test():
    print("\n=== B5. kill-тест: прерывание apply посреди копирования → повторный apply чинит ===")
    with tempfile.TemporaryDirectory(prefix="sync_kill_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        # шаблон с ДВУМЯ изменёнными файлами
        newtpl = copy_template(tmp, "tpl-kill")
        f1 = newtpl / "core/scripts/task.py"
        f2 = newtpl / "core/scripts/profile.py"
        f1.write_text(f1.read_text(encoding="utf-8") + "\n# kill-test change 1\n", encoding="utf-8")
        f2.write_text(f2.read_text(encoding="utf-8") + "\n# kill-test change 2\n", encoding="utf-8")

        core_before = (target_ai / "core/scripts/task.py").read_text(encoding="utf-8")
        lock_before = (target_ai / "template.lock").read_text(encoding="utf-8")

        # прогон _apply_atomic напрямую с fault_after=1 (kill после 1-го файла) через дочерний python
        driver = f'''
import sys, importlib.util
spec = importlib.util.spec_from_file_location("syncmod", r"{SYNC}")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
from pathlib import Path
target = Path(r"{target_ai}"); source = Path(r"{newtpl}")
c = m.classify(target, source)
try:
    m._apply_atomic(target, source, c, fault_after=1)
    print("NO_FAULT")
except RuntimeError as e:
    print("FAULT:", e)
'''
        p = subprocess.run([sys.executable, "-c", driver], text=True, capture_output=True,
                           encoding="utf-8", errors="replace",
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        print("   [inject]", (p.stdout + p.stderr).strip().splitlines()[-1] if (p.stdout+p.stderr).strip() else "")
        check("B5: fault действительно инъектирован", "FAULT" in (p.stdout + p.stderr))
        # core/ и lock НЕ должны быть повреждены (swap ещё не произошёл)
        core_after_fault = (target_ai / "core/scripts/task.py").read_text(encoding="utf-8")
        check("B5: core/ не тронут после прерывания (нет частичного apply)",
              core_after_fault == core_before)
        check("B5: lock не тронут после прерывания",
              (target_ai / "template.lock").read_text(encoding="utf-8") == lock_before)
        # staged-хвост может остаться — повторный apply его чистит
        r = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("B5: повторный apply успешен без ручного вмешательства", r.returncode == 0, r.stderr)
        check("B5: change 1 применён", "kill-test change 1" in
              (target_ai / "core/scripts/task.py").read_text(encoding="utf-8"))
        check("B5: change 2 применён", "kill-test change 2" in
              (target_ai / "core/scripts/profile.py").read_text(encoding="utf-8"))
        # хвостов staged/backup не осталось
        check("B5: нет остаточного core.staged.tmp", not (target_ai / "core.staged.tmp").exists())
        check("B5: нет остаточного core.backup.tmp", not (target_ai / "core.backup.tmp").exists())


def _full_snapshot(target_ai: Path) -> dict[str, bytes]:
    """Побайтовый снимок ВСЕХ файлов core/ + template.lock (для проверки неизменности)."""
    snap: dict[str, bytes] = {}
    for p in sorted((target_ai / "core").rglob("*")):
        if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc":
            snap[p.relative_to(target_ai).as_posix()] = p.read_bytes()
    lock = target_ai / "template.lock"
    if lock.exists():
        snap["template.lock"] = lock.read_bytes()
    return snap


def branch_gate_fail_closed():
    print("\n=== D2. branch-gate fail-closed: не-git / develop / detached → отказ; feature/* → ок ===")
    with tempfile.TemporaryDirectory(prefix="sync_bg_") as tmp:
        tmp = Path(tmp)
        # upstream-обновление, чтобы apply было что применять
        newtpl = copy_template(tmp, "tpl-bg")
        f = newtpl / "core/scripts/task.py"
        f.write_text(f.read_text(encoding="utf-8") + "\n# bg change\n", encoding="utf-8")

        # 1) target ВНЕ git: init допустим, apply — отказ, файлы неизменны
        proj = tmp / "nogit"
        target_ai = proj / "ai"
        proj.mkdir(parents=True)
        r = run_sync("init", str(target_ai), "--template", str(SOURCE_AI))
        check("D2 init вне git: допустим (установка)", r.returncode == 0, r.stdout + r.stderr)
        before = _full_snapshot(target_ai)
        ap = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("D2 вне git: apply отказ (fail-closed)", ap.returncode != 0)
        check("D2 вне git: весь core + lock побайтово неизменны",
              _full_snapshot(target_ai) == before)

        # 2) ветка develop (не в allowlist) → отказ
        proj2, target2 = make_project(tmp, "проект-develop")
        git(proj2, "checkout", "-q", "-b", "develop")
        before2 = _full_snapshot(target2)
        ap2 = run_sync("--apply", str(target2), "--template", str(newtpl))
        check("D2 develop: apply отказ", ap2.returncode != 0)
        check("D2 develop: весь core + lock побайтово неизменны",
              _full_snapshot(target2) == before2)
        check("D2 develop: сообщение про allowlist", "task-ветке" in (ap2.stdout + ap2.stderr))

        # 3) detached HEAD → отказ
        git(proj2, "add", "-A")
        git(proj2, "commit", "-q", "-m", "wip")
        git(proj2, "checkout", "-q", "--detach")
        before3 = _full_snapshot(target2)
        ap3 = run_sync("--apply", str(target2), "--template", str(newtpl))
        check("D2 detached HEAD: apply отказ", ap3.returncode != 0)
        check("D2 detached HEAD: весь core + lock побайтово неизменны",
              _full_snapshot(target2) == before3)

        # 4) feature-ветка → разрешён
        git(proj2, "checkout", "-q", "-b", "feature/ok")
        ap4 = run_sync("--apply", str(target2), "--template", str(newtpl))
        check("D2 feature/*: apply разрешён (exit 0)", ap4.returncode == 0,
              ap4.stdout + ap4.stderr)
        check("D2 feature/*: изменение применено",
              b"bg change" in (target2 / "core/scripts/task.py").read_bytes())


def apply_swap_window_recovery():
    print("\n=== B5b. kill МЕЖДУ двумя os.replace: core/ отсутствует, backup остался → авто-восстановление ===")
    with tempfile.TemporaryDirectory(prefix="sync_swap_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        core = target_ai / "core"
        backup = target_ai / "core.backup.tmp"
        staged = target_ai / "core.staged.tmp"
        # точное состояние 'kill между os.replace(core→backup) и os.replace(staged→core)':
        # старый core уехал в backup, staged лежит рядом, core/ отсутствует
        shutil.copytree(core, staged, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        os.replace(str(core), str(backup))
        check("B5b: предусловие — core/ отсутствует", not core.exists())
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B5b: --check восстановил core/ из backup", core.exists())
        check("B5b: backup поглощён восстановлением", not backup.exists())
        check("B5b: сообщение о восстановлении в выводе", "восстановлен" in (r.stdout + r.stderr))
        check("B5b: после восстановления состояние чистое (exit 0)",
              r.returncode == EXIT_CLEAN, f"exit={r.returncode}\n{r.stdout}{r.stderr}")
        # повторный apply-цикл работает и убирает staged-хвост
        r2 = run_sync("--apply", str(target_ai), "--template", str(SOURCE_AI))
        check("B5b: последующий apply отрабатывает (exit 0)", r2.returncode == 0,
              r2.stdout + r2.stderr)
        check("B5b: staged-хвост убран", not staged.exists())


def source_validation_rb1():
    print("\n=== RB-1. невалидный --template → exit 3, core НЕ тронут (check и apply) ===")
    with tempfile.TemporaryDirectory(prefix="sync_rb1_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        core_files_before = sorted(p.name for p in (target_ai / "core").rglob("*") if p.is_file())
        n_before = len(core_files_before)

        # (1) НЕсуществующий --template
        bad = tmp / "does_not_exist"
        r = run_sync("--check", str(target_ai), "--template", str(bad))
        check("RB-1 nonexistent: check exit 3", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("RB-1 nonexistent: сообщает 'source не валиден'", "source не валиден" in r.stdout)
        ap = run_sync("--apply", str(target_ai), "--template", str(bad))
        check("RB-1 nonexistent: apply exit 3", ap.returncode == EXIT_INVARIANT, f"exit={ap.returncode}")
        check("RB-1 nonexistent: core не тронут",
              len(list((target_ai / "core").rglob("*"))) > 0 and
              sum(1 for p in (target_ai / "core").rglob("*") if p.is_file()) == n_before)

        # (2) пустой каталог (есть core/, но без файлов)
        empty = tmp / "empty_src"
        (empty / "core").mkdir(parents=True)
        r = run_sync("--check", str(target_ai), "--template", str(empty))
        check("RB-1 empty: check exit 3", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("RB-1 empty: сообщает 'пуст'", "пуст" in r.stdout)
        ap = run_sync("--apply", str(target_ai), "--template", str(empty))
        check("RB-1 empty: apply exit 3", ap.returncode == EXIT_INVARIANT, f"exit={ap.returncode}")
        check("RB-1 empty: core не тронут",
              sum(1 for p in (target_ai / "core").rglob("*") if p.is_file()) == n_before)

        # (3) каталог с файлами, но без core/version.md (не шаблон)
        nover = tmp / "nover_src"
        (nover / "core" / "scripts").mkdir(parents=True)
        (nover / "core" / "scripts" / "foo.py").write_text("x\n", encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(nover))
        check("RB-1 no-version.md: check exit 3", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("RB-1 no-version.md: сообщает 'манифест'", "манифест" in r.stdout)
        ap = run_sync("--apply", str(target_ai), "--template", str(nover))
        check("RB-1 no-version.md: apply exit 3", ap.returncode == EXIT_INVARIANT, f"exit={ap.returncode}")
        check("RB-1 no-version.md: core не тронут",
              sum(1 for p in (target_ai / "core").rglob("*") if p.is_file()) == n_before)

        # sanity: валидный --template по-прежнему exit 0
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("RB-1 sanity: валидный --template exit 0", r.returncode == EXIT_CLEAN, f"exit={r.returncode}")


def lock_stale_b5c():
    print("\n=== B5c. kill после swap, до записи lock → check exit 2 (lock_stale), apply чинит lock ===")
    with tempfile.TemporaryDirectory(prefix="sync_b5c_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")

        # Шаблон v-next с изменённым файлом. Симулируем состояние ПОСЛЕ успешного swap,
        # но ДО write_lock: приводим project core в равенство template РУКАМИ, lock не трогаем.
        newtpl = copy_template(tmp, "tpl-b5c")
        rel = "core/scripts/task.py"
        tf = newtpl / rel
        tf.write_text(tf.read_text(encoding="utf-8") + "\n# v-next after swap\n", encoding="utf-8")

        # руками приводим project к template (эмулируем завершённый swap) — lock остаётся старым
        proj_file = target_ai / rel
        proj_file.write_text(tf.read_text(encoding="utf-8"), encoding="utf-8")

        lock_before = (target_ai / "template.lock").read_text(encoding="utf-8")

        # check: ph==th (project уже равен template), lh(lock)!=ph → lock_stale, exit 2
        r = run_sync("--check", str(target_ai), "--template", str(newtpl))
        check("B5c check: exit 2 (lock устарел, НЕ ложно-зелёный 0)",
              r.returncode == EXIT_UPDATE, f"exit={r.returncode}\n{r.stdout}")
        check("B5c check: сообщение 'lock устарел'", "lock устарел" in r.stdout)
        check("B5c check: НЕ помечен как local_edit (нет ЛОКАЛЬНАЯ ПРАВКА)",
              "ЛОКАЛЬНАЯ ПРАВКА" not in r.stdout)

        # apply при lock_stale: переписывает lock БЕЗ копирования; файл не меняется
        file_before_apply = proj_file.read_text(encoding="utf-8")
        ap = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("B5c apply: exit 0", ap.returncode == 0, ap.stderr)
        check("B5c apply: сообщает 'lock' переписан (без копирования)",
              "lock" in ap.stdout.lower() and ("переписан" in ap.stdout or "копирование" in ap.stdout.lower()))
        check("B5c apply: файл НЕ тронут (данные уже были равны template)",
              proj_file.read_text(encoding="utf-8") == file_before_apply)
        check("B5c apply: lock обновлён (отличается от старого)",
              (target_ai / "template.lock").read_text(encoding="utf-8") != lock_before)

        # после починки lock: следующий upstream-апдейт НЕ блокируется (виден как update, exit 2)
        newtpl2 = copy_template(tmp, "tpl-b5c-next")
        rel2 = "core/scripts/profile.py"
        tf2 = newtpl2 / rel2
        # newtpl2 — свежая копия SOURCE; чтобы task.py тоже совпал с текущим lock, наложим тот же
        # v-next на task.py в newtpl2 (lock теперь baseline = v-next task.py)
        (newtpl2 / rel).write_text((newtpl / rel).read_text(encoding="utf-8"), encoding="utf-8")
        tf2.write_text(tf2.read_text(encoding="utf-8") + "\n# next upstream change\n", encoding="utf-8")
        r2 = run_sync("--check", str(target_ai), "--template", str(newtpl2))
        check("B5c follow-up: следующий upstream-апдейт виден как update (exit 2, НЕ blocked)",
              r2.returncode == EXIT_UPDATE, f"exit={r2.returncode}\n{r2.stdout}")
        check("B5c follow-up: НЕ помечен как local_edit",
              "ЛОКАЛЬНАЯ ПРАВКА" not in r2.stdout)
        ap2 = run_sync("--apply", str(target_ai), "--template", str(newtpl2))
        check("B5c follow-up: apply следующего апдейта успешен (exit 0)", ap2.returncode == 0, ap2.stderr)
        check("B5c follow-up: изменение применено",
              "next upstream change" in (target_ai / rel2).read_text(encoding="utf-8"))


def lock_json_and_migration():
    print("\n=== B8. lock JSON + миграция YAML→JSON + malformed schema ===")
    with tempfile.TemporaryDirectory(prefix="sync_lock_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        git(proj, "checkout", "-q", "-b", "feature/x")
        lock_path = target_ai / "template.lock"

        # (a) malformed schema_version (garbage) → check exit 3, apply отказ
        good = json.loads(lock_path.read_text(encoding="utf-8"))
        bad = dict(good); bad["schema_version"] = "garbage"
        lock_path.write_text(json.dumps(bad), encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B8 malformed schema: check exit 3", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("B8 malformed schema: сообщает 'невалиден'", "невалид" in r.stdout.lower())
        ap = run_sync("--apply", str(target_ai), "--template", str(SOURCE_AI))
        check("B8 malformed schema: apply отказ", ap.returncode != 0 and "schema_version" in (ap.stdout+ap.stderr))

        # (b) missing schema_version → exit 3
        nos = dict(good); nos.pop("schema_version", None)
        lock_path.write_text(json.dumps(nos), encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B8 missing schema: check exit 3", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")

        # (c) schema mismatch (1 != 2) → exit 3
        mm = dict(good); mm["schema_version"] = 1
        lock_path.write_text(json.dumps(mm), encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B8 schema mismatch: check exit 3", r.returncode == EXIT_INVARIANT, f"exit={r.returncode}")
        check("B8 schema mismatch: сообщает про миграцию", "миграц" in r.stdout.lower())

        # (d) миграция старого YAML-lock → JSON
        yaml_lock = ("template_version: 2.0.0\nsource_revision: abc1234\nschema_version: 2\n"
                     "core_hashes:\n")
        # заполнить core_hashes реальными значениями, иначе всё покажется как upstream add
        real = json.loads(json.dumps(good))["core_hashes"]
        for k, v in real.items():
            yaml_lock += f"  {k}: {v}\n"
        lock_path.write_text(yaml_lock, encoding="utf-8")
        r = run_sync("--check", str(target_ai), "--template", str(SOURCE_AI))
        check("B8 YAML-lock: check читает (exit 0, синхронизировано)",
              r.returncode == EXIT_CLEAN, f"exit={r.returncode}\n{r.stdout}")
        check("B8 YAML-lock: сообщает про миграцию в JSON", "мигрирован" in r.stdout.lower() or "миграц" in r.stdout.lower())
        ap = run_sync("--apply", str(target_ai), "--template", str(SOURCE_AI))
        check("B8 YAML-lock: apply мигрирует в JSON (exit 0)", ap.returncode == 0, ap.stderr)
        # теперь lock снова валидный JSON
        try:
            json.loads(lock_path.read_text(encoding="utf-8"))
            check("B8 YAML-lock: после apply lock снова JSON", True)
        except json.JSONDecodeError as e:
            check("B8 YAML-lock: после apply lock снова JSON", False, str(e))


def apply_on_master_and_project_untouched():
    print("\n=== C. apply на master → отказ; project/ никогда не трогается ===")
    with tempfile.TemporaryDirectory(prefix="sync_C_") as tmp:
        tmp = Path(tmp)
        proj, target_ai = make_project(tmp)
        # положить проектный контент, зафиксировать хэш
        pfile = target_ai / "project" / "docs" / "my_notes.md"
        pfile.write_text("важные проектные заметки\n", encoding="utf-8")
        before = pfile.read_text(encoding="utf-8")
        git(proj, "add", "-A"); git(proj, "commit", "-q", "-m", "project content")

        # apply на master → отказ
        r = run_sync("--apply", str(target_ai), "--template", str(SOURCE_AI))
        check("C apply на master: отказ", r.returncode != 0 and "master" in (r.stdout + r.stderr))

        # обновить core через новый шаблон на task-ветке и убедиться, что project/ цел
        git(proj, "checkout", "-q", "-b", "feature/x")
        newtpl = copy_template(tmp, "tpl-c")
        tf = newtpl / "core/scripts/task.py"
        tf.write_text(tf.read_text(encoding="utf-8") + "\n# c-change\n", encoding="utf-8")
        ap = run_sync("--apply", str(target_ai), "--template", str(newtpl))
        check("C apply на task-ветке: exit 0", ap.returncode == 0, ap.stderr)
        check("C project/ не тронут apply'ем", pfile.exists() and pfile.read_text(encoding="utf-8") == before)


def main() -> int:
    basic_and_exit_codes()
    matrix_local_edit()
    matrix_local_add()
    matrix_local_delete()
    matrix_upstream_add()
    matrix_upstream_modify()
    matrix_upstream_delete()
    matrix_simultaneous_same()
    apply_kill_test()
    branch_gate_fail_closed()
    apply_swap_window_recovery()
    source_validation_rb1()
    lock_stale_b5c()
    lock_json_and_migration()
    apply_on_master_and_project_untouched()

    print("\n" + "=" * 44)
    print("ИТОГ:", "ВСЕ ПРОВЕРКИ ПРОШЛИ ✅" if _OK else "ЕСТЬ ПРОВАЛЫ ❌")
    return 0 if _OK else 1


if __name__ == "__main__":
    sys.exit(main())
