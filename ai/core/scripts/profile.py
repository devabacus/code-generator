#!/usr/bin/env python3
"""
profile.py — валидатор зонных профилей и verification-профилей (ADR-0002 п.3).

Профиль объявляется на ЗОНУ в ai/project/profile.yaml. Классы I–IV — человеческие
метки; решение о запуске драйвер принимает по capability policy. Verify — только
именованные проверки из verification-профиля (ai/project/profiles/<имя>.yaml).

Команда:
    profile.py lint [--profile PATH] [--profiles-dir DIR]

По умолчанию: --profile ai/project/profile.yaml, --profiles-dir ai/project/profiles/.

Проверки lint:
    - схема полей зоны (нет неизвестных полей, корректные enum-значения);
    - execution:apply ⇒ задан verification_profile И он существует в profiles-dir;
    - class IV ⇒ execution:never;
    - runner:office ⇒ непустой hardware;
    - network:allowlist ⇒ непустой список allowlist;
    - verification-профили: имя, checks (cmd+timeout), резолв.

Exit 0 — всё валидно; exit 1 — есть ошибки.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import yaml
    _HAS_YAML = True
except ImportError:  # pragma: no cover
    yaml = None
    _HAS_YAML = False

SCRIPT_DIR = Path(__file__).resolve().parent          # ai/core/scripts
CORE_DIR = SCRIPT_DIR.parent                          # ai/core
AI_ROOT = CORE_DIR.parent                             # ai/
PROJECT_DIR = AI_ROOT / "project"

DEFAULT_PROFILE = PROJECT_DIR / "profile.yaml"
DEFAULT_PROFILES_DIR = PROJECT_DIR / "profiles"

# Допустимые значения enum-полей
VALID_CLASS = {"I", "II", "III", "IV"}
VALID_EXECUTION = {"apply", "prepare_only", "never"}
VALID_RUNNER = {"cloud", "office"}
VALID_NETWORK = {"none", "allowlist"}
VALID_SIDE_EFFECTS = {"none", "read_only", "staging"}

# Разрешённые ключи зоны (защита от опечаток/неизвестных полей)
ZONE_KEYS = {
    "name", "class", "execution", "runner", "network", "allowlist",
    "side_effects", "secrets", "hardware", "protected_paths",
    "frozen_contracts", "verification_profile",
}
REQUIRED_ZONE_KEYS = {"name", "class", "execution", "runner", "network", "side_effects"}


def load_yaml(path: Path):
    if not _HAS_YAML:
        sys.exit("❌ PyYAML недоступен — profile.py требует PyYAML для парсинга профилей.")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def profile_file(profiles_dir: Path, name: str) -> Path | None:
    for ext in (".yaml", ".yml"):
        p = profiles_dir / f"{name}{ext}"
        if p.exists():
            return p
    return None


# ─── Валидаторы форм (allowlist-записи, пути) ────────────────────────────────

import re as _re

# hostname (RFC-1123 label.label...), опционально wildcard-поддомен *.domain
_HOSTNAME_RE = _re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$")
_WILDCARD_HOST_RE = _re.compile(
    r"^\*\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$")
_IPV4_RE = _re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")
_CIDR_RE = _re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}$")


def _valid_ipv4(s: str) -> bool:
    if not _IPV4_RE.match(s):
        return False
    return all(0 <= int(o) <= 255 for o in s.split("."))


def _valid_cidr(s: str) -> bool:
    if not _CIDR_RE.match(s):
        return False
    ip, _, mask = s.partition("/")
    # B2: маска /0 (0.0.0.0/0) покрывает весь IPv4-простор — эквивалент '*', не guardrail.
    # Отклоняем как и голый '*'. Валидный диапазон здесь — 1..32.
    return _valid_ipv4(ip) and 1 <= int(mask) <= 32


def validate_allowlist_entry(entry: str) -> str | None:
    """Вернуть текст ошибки или None если запись валидна.

    Допустимо: hostname (a.b.com), wildcard-поддомен (*.domain.com), IPv4, IPv4/CIDR.
    Запрещено: '*' целиком (открывает всё — не guardrail), пустая строка, схемы (http://),
    голый wildcard без домена.
    """
    e = str(entry).strip()
    if not e:
        return "пустая запись allowlist"
    if e == "*":
        return "'*' целиком запрещён (открывает весь трафик — не guardrail); "\
               "используй '*.domain' или конкретные хосты"
    # B2: маска /0 (0.0.0.0/0, ::/0 и любой addr/0) покрывает всё адресное пространство —
    # семантический эквивалент '*'. Отдельное сообщение, чтобы причина была очевидна.
    if e.endswith("/0"):
        return f"'{e}': маска /0 покрывает весь адресный простор (эквивалент '*') — запрещена; "\
               f"используй конкретную подсеть (a.b.c.d/nn, 1<=nn<=32) или хосты"
    if "://" in e or "/" in e and not _valid_cidr(e):
        # '/' допустим только в CIDR
        if _valid_cidr(e):
            return None
        return f"'{e}': недопустимая форма (схемы/пути не допускаются; CIDR — только a.b.c.d/nn)"
    if e.startswith("*"):
        return None if _WILDCARD_HOST_RE.match(e) else \
            f"'{e}': wildcard только в форме '*.domain.tld'"
    if _valid_ipv4(e) or _valid_cidr(e) or _HOSTNAME_RE.match(e):
        return None
    return f"'{e}': не hostname / IPv4 / CIDR / '*.domain'"


def validate_safe_path(value: str) -> str | None:
    """Вернуть текст ошибки или None. Запрещает абсолютные пути, '..', выход из project root.

    Используется для protected_paths и имён verification-профилей (последние — простые имена,
    без слэшей вообще).
    """
    v = str(value).strip()
    if not v:
        return "пустой путь"
    # нормализуем слэши
    norm = v.replace("\\", "/")
    if norm.startswith("/") or _re.match(r"^[A-Za-z]:", norm):
        return f"'{v}': абсолютный путь запрещён (только относительно project root)"
    parts = [p for p in norm.split("/") if p not in ("", ".")]
    if ".." in parts:
        return f"'{v}': '..' запрещён (выход за project root)"
    return None


def lint_verification_profile(path: Path, errors: list[str]) -> None:
    rel = path.name
    try:
        data = load_yaml(path)
    except Exception as e:  # noqa: BLE001
        errors.append(f"profiles/{rel}: не парсится: {e}")
        return
    if not isinstance(data, dict):
        errors.append(f"profiles/{rel}: не YAML-словарь")
        return
    if not str(data.get("name", "")).strip():
        errors.append(f"profiles/{rel}: пустое поле name")
    checks = data.get("checks")
    if not isinstance(checks, dict) or not checks:
        errors.append(f"profiles/{rel}: checks должен быть непустым словарём")
        return
    for cname, cval in checks.items():
        if not isinstance(cval, dict):
            errors.append(f"profiles/{rel}: check '{cname}' должен быть словарём с cmd/timeout")
            continue
        if not str(cval.get("cmd", "")).strip():
            errors.append(f"profiles/{rel}: check '{cname}' без cmd")
        to = cval.get("timeout")
        if to is not None and not isinstance(to, int):
            errors.append(f"profiles/{rel}: check '{cname}' timeout должен быть int (сек)")


def lint_zone(zone: dict, idx: int, profiles_dir: Path, errors: list[str]) -> None:
    name = zone.get("name", f"#{idx}")
    tag = f"zone '{name}'"

    unknown = set(zone) - ZONE_KEYS
    if unknown:
        errors.append(f"{tag}: неизвестные поля: {sorted(unknown)}")
    missing = REQUIRED_ZONE_KEYS - set(zone)
    if missing:
        errors.append(f"{tag}: отсутствуют обязательные поля: {sorted(missing)}")

    cls = zone.get("class")
    if cls not in VALID_CLASS:
        errors.append(f"{tag}: class '{cls}' не из {sorted(VALID_CLASS)}")
    execution = zone.get("execution")
    if execution not in VALID_EXECUTION:
        errors.append(f"{tag}: execution '{execution}' не из {sorted(VALID_EXECUTION)}")
    runner = zone.get("runner")
    if runner not in VALID_RUNNER:
        errors.append(f"{tag}: runner '{runner}' не из {sorted(VALID_RUNNER)}")
    network = zone.get("network")
    if network not in VALID_NETWORK:
        errors.append(f"{tag}: network '{network}' не из {sorted(VALID_NETWORK)}")
    side = zone.get("side_effects")
    if side not in VALID_SIDE_EFFECTS:
        errors.append(f"{tag}: side_effects '{side}' не из {sorted(VALID_SIDE_EFFECTS)}")

    # class IV ⇒ execution:never (прод-запрещённая зона)
    if cls == "IV" and execution != "never":
        errors.append(f"{tag}: class IV требует execution:never (сейчас '{execution}')")

    # class III ⇒ execution НЕ apply (ADR-0002: «класс III стартует в prepare_only»)
    if cls == "III" and execution == "apply":
        errors.append(f"{tag}: class III не может иметь execution:apply "
                      f"(ADR: класс III стартует в prepare_only)")

    # runner:office ⇒ непустой hardware
    if runner == "office":
        hw = zone.get("hardware") or []
        if not hw:
            errors.append(f"{tag}: runner:office требует непустой список hardware")

    # network:allowlist ⇒ непустой allowlist + валидация форм записей
    if network == "allowlist":
        al = zone.get("allowlist") or []
        if not al:
            errors.append(f"{tag}: network:allowlist требует непустой список allowlist")
        else:
            for entry in al:
                err = validate_allowlist_entry(entry)
                if err:
                    errors.append(f"{tag}: allowlist {err}")

    # protected_paths — запрет '..'/абсолютных/выхода из project root
    for pp in (zone.get("protected_paths") or []):
        err = validate_safe_path(pp)
        if err:
            errors.append(f"{tag}: protected_paths {err}")

    # execution:apply ⇒ verification_profile задан и существует
    vp = str(zone.get("verification_profile", "")).strip()
    # имя профиля — простое имя без слэшей/'..'/абсолютных (защита от path traversal)
    if vp:
        if "/" in vp or "\\" in vp:
            errors.append(f"{tag}: verification_profile '{vp}' — имя не должно содержать слэшей")
        else:
            perr = validate_safe_path(vp)
            if perr:
                errors.append(f"{tag}: verification_profile {perr}")
    if execution == "apply":
        if not vp:
            errors.append(f"{tag}: execution:apply требует verification_profile")
        elif profile_file(profiles_dir, vp) is None:
            errors.append(f"{tag}: verification_profile '{vp}' не найден в "
                          f"{profiles_dir.name}/")
    elif vp and profile_file(profiles_dir, vp) is None:
        # даже для prepare_only/never — если профиль указан, он должен существовать
        errors.append(f"{tag}: verification_profile '{vp}' указан, но не найден в "
                      f"{profiles_dir.name}/")


def cmd_lint(profile_path: Path, profiles_dir: Path) -> int:
    errors: list[str] = []

    if not profile_path.exists():
        sys.exit(f"❌ Профиль не найден: {profile_path}")
    try:
        data = load_yaml(profile_path)
    except Exception as e:  # noqa: BLE001
        sys.exit(f"❌ {profile_path} не парсится: {e}")

    if not isinstance(data, dict):
        sys.exit(f"❌ {profile_path}: корень должен быть YAML-словарём")
    if not str(data.get("project", "")).strip():
        errors.append("корень: пустое поле project")
    zones = data.get("zones")
    if not isinstance(zones, list) or not zones:
        errors.append("корень: zones должен быть непустым списком")
        zones = []

    seen_names: set[str] = set()
    for i, zone in enumerate(zones):
        if not isinstance(zone, dict):
            errors.append(f"zone #{i}: не словарь")
            continue
        nm = str(zone.get("name", ""))
        if nm in seen_names:
            errors.append(f"zone '{nm}': дубль имени зоны")
        seen_names.add(nm)
        lint_zone(zone, i, profiles_dir, errors)

    # Валидация всех verification-профилей в каталоге
    if profiles_dir.exists():
        for p in sorted(profiles_dir.glob("*.y*ml")):
            lint_verification_profile(p, errors)

    if errors:
        for e in errors:
            print(f"❌ {e}")
        print(f"\nprofile lint: {len(errors)} ошибок.")
        return 1
    print(f"✅ profile lint: ошибок нет ({len(zones)} зон).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Валидатор зонных профилей")
    sub = parser.add_subparsers(dest="command", required=True)
    p_lint = sub.add_parser("lint", help="Проверить profile.yaml и verification-профили")
    p_lint.add_argument("--profile", default=str(DEFAULT_PROFILE),
                        help="Путь к profile.yaml")
    p_lint.add_argument("--profiles-dir", default=str(DEFAULT_PROFILES_DIR),
                        help="Каталог verification-профилей")
    args = parser.parse_args()

    if args.command == "lint":
        return cmd_lint(Path(args.profile).resolve(), Path(args.profiles_dir).resolve())
    return 2


if __name__ == "__main__":
    sys.exit(main())
