#!/usr/bin/env python3
"""Универсальный скрипт обслуживания репозитория alchemy.

Задачи:
- Генерирует data/CACO/effects.json из data/CACO/data.json
- Проверяет наличие всех имен из data/datab.json в JSON-файлах под data/
- Назначает effect_state в data/data.json на основе data/positive_negative_data.json
- Сортирует data.json и effects.json
- Показывает количество ингредиентов и список имён
- Интегрирует функции из корневых скриптов add.py, sort.py, name.py и verify_datab.py
"""

import argparse
import json
import runpy
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUP_DIR = ROOT / 'data' / 'backups'
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    import add as add_module
except ImportError:
    add_module = None

try:
    import sort as sort_module
except ImportError:
    sort_module = None

try:
    import name as name_module
except ImportError:
    name_module = None

try:
    import scripts.verify_datab as verify_datab_module
except ImportError:
    verify_datab_module = None


def load_json(path: Path):
    if add_module is not None:
        return add_module.load_json(path)
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def get_backup_path(path: Path):
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return BACKUP_DIR / f'backup_{path.stem}_{timestamp}{path.suffix}'


def backup_file(path: Path):
    if not path.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = get_backup_path(path)
    backup_path.write_bytes(path.read_bytes())
    return backup_path


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = backup_file(path)
        if backup is not None:
            print(f'Backed up {path.name} to {backup.relative_to(ROOT)}')
    if add_module is not None:
        return add_module.save_json(path, data)
    with path.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def generate_caco_effects(caco_root: Path):
    caco_data_path = caco_root / 'data.json'
    caco_effects_path = caco_root / 'effects.json'

    if not caco_data_path.exists():
        raise FileNotFoundError(f'CACO data.json not found: {caco_data_path}')

    caco_data = load_json(caco_data_path)
    effect_map = {}
    for item in caco_data:
        name = item.get('name')
        for effect in item.get('effects', []):
            effect_map.setdefault(effect, []).append(name)

    output = [
        {'effect': effect, 'names': sorted(names, key=lambda v: v.lower())}
        for effect, names in sorted(effect_map.items(), key=lambda pair: pair[0].lower())
    ]
    save_json(caco_effects_path, output)
    return len(output)


def verify_datab(datab_path: Path, root_folder: Path, report_path: Path):
    if verify_datab_module is not None and hasattr(verify_datab_module, 'load_names'):
        datab_names = verify_datab_module.load_names(datab_path)
    else:
        datab_names = []
        datab_json = load_json(datab_path)
        for item in datab_json:
            if isinstance(item, dict) and 'name' in item:
                datab_names.append(item['name'])

    found_map = {}
    for fp in root_folder.rglob('*.json'):
        try:
            if fp.resolve() == datab_path.resolve():
                continue
        except Exception:
            pass
        try:
            items = load_json(fp)
        except Exception:
            continue
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and 'name' in item:
                found_map.setdefault(item['name'], set()).add(str(fp.relative_to(ROOT)))

    present = {name: sorted(list(found_map[name])) for name in datab_names if name in found_map}
    missing = [name for name in datab_names if name not in found_map]

    report = {
        'datab_file': str(datab_path),
        'data_root': str(root_folder),
        'total_in_datab': len(datab_names),
        'present_count': len(present),
        'missing_count': len(missing),
        'present': present,
        'missing': missing,
    }
    save_json(report_path, report)
    return report


def fix_effect_state(data_path: Path, pn_path: Path):
    data = load_json(data_path)
    pn = load_json(pn_path)
    positive = set(pn.get('positive_effects', []))
    negative = set(pn.get('negative_effects', []))

    changes = []
    for item in data:
        if not isinstance(item, dict):
            continue
        effects = item.get('effects', [])
        has_positive = any(effect in positive for effect in effects)
        has_negative = any(effect in negative for effect in effects)

        if has_positive and not has_negative:
            new_state = 1
        elif has_negative and not has_positive:
            new_state = -1
        else:
            new_state = 0

        if item.get('effect_state') != new_state:
            changes.append((item.get('name'), item.get('effect_state'), new_state))
            item['effect_state'] = new_state

    if changes:
        save_json(data_path, data)
    return changes


def sync_effects_json(data_path: Path, effects_path: Path):
    data = load_json(data_path)
    effects = load_json(effects_path)

    effect_to_ingredients = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get('name')
        for effect in item.get('effects', []):
            effect_to_ingredients.setdefault(effect, set()).add(name)

    updated = 0
    for effect_entry in effects:
        if not isinstance(effect_entry, dict):
            continue
        effect_name = effect_entry.get('effect')
        if effect_name is None:
            continue
        existing_names = set(effect_entry.get('names', []))
        all_names = effect_to_ingredients.get(effect_name, set())
        missing = sorted(all_names - existing_names, key=lambda x: x.lower())
        if missing:
            effect_entry['names'].extend(missing)
            effect_entry['names'] = sorted(set(effect_entry['names']), key=lambda x: x.lower())
            updated += 1

    save_json(effects_path, effects)
    return updated


def sort_files(data_path: Path, effects_path: Path):
    if sort_module is not None and hasattr(sort_module, 'sort_data_json') and hasattr(sort_module, 'sort_effects_json'):
        try:
            sort_module.sort_data_json()
            sort_module.sort_effects_json()
            return True
        except Exception:
            pass

    data = load_json(data_path)
    data.sort(key=lambda x: x.get('name', '').lower())
    save_json(data_path, data)

    effects = load_json(effects_path)
    effects.sort(key=lambda x: x.get('effect', '').lower())
    for effect_entry in effects:
        if isinstance(effect_entry, dict) and isinstance(effect_entry.get('names'), list):
            effect_entry['names'].sort(key=lambda x: x.lower())
    save_json(effects_path, effects)
    return True


def print_data_count(data_path: Path):
    data = load_json(data_path)
    print(f'Total ingredients in {data_path}: {len(data)}')
    return len(data)


def print_ingredient_names(data_path: Path):
    if name_module is not None and hasattr(name_module, 'print_ingredients_with_numbers'):
        return name_module.print_ingredients_with_numbers()

    data = load_json(data_path)
    for index, item in enumerate(data, start=1):
        print(f'{index}. {item.get("name")}')
    return len(data)


def run_root_script(path: Path):
    runpy.run_path(str(path), run_name='__main__')


def interactive_menu():
    data_root = ROOT / 'data'
    report_path = data_root / 'verification_report.json'
    data_json = data_root / 'data.json'
    effects_json = data_root / 'effects.json'
    datab_json = data_root / 'datab.json'
    pn_json = data_root / 'positive_negative_data.json'
    caco_root = data_root / 'CACO'

    def action_generate_caco_effects():
        if not caco_root.exists():
            print('CACO folder missing.')
            return
        count = generate_caco_effects(caco_root)
        print(f'Generated {count} effects in data/CACO/effects.json.')

    def action_verify_datab():
        if not datab_json.exists():
            print(f'Backup or master list missing: {datab_json}')
            return
        report = verify_datab(datab_json, data_root, report_path)
        print(f'Verification report written to {report_path}')
        print(f'Present: {report["present_count"]}, Missing: {report["missing_count"]}')

    def action_fix_effect_state():
        changes = fix_effect_state(data_json, pn_json)
        if changes:
            print(f'Updated effect_state for {len(changes)} ingredients.')
            for name, old, new in changes:
                print(f'  {name}: {old} -> {new}')
        else:
            print('effect_state values are already correct.')

    def action_sync_effects():
        try:
            changes = sync_effects_json(data_json, effects_json)
            if changes:
                print(f'Synchronized effects.json with data.json and added names for {len(changes)} effects.')
            else:
                print('effects.json is already synchronized with data.json.')
        except Exception as exc:
            print(f'Failed to synchronize effects.json: {exc}')

    def action_sort_files():
        sort_files(data_json, effects_json)
        print('Sorted data.json and effects.json.')

    def action_print_count():
        print_data_count(data_json)

    def action_list_names():
        print_ingredient_names(data_json)

    def action_run_common():
        run_common_scripts()

    menu = [
        ('Generate data/CACO/effects.json', action_generate_caco_effects),
        ('Verify data/datab.json coverage', action_verify_datab),
        ('Fix effect_state in data/data.json', action_fix_effect_state),
        ('Synchronize data/effects.json with data/data.json', action_sync_effects),
        ('Sort data.json and effects.json', action_sort_files),
        ('Print ingredient count', action_print_count),
        ('List ingredient names', action_list_names),
        ('Run common root scripts', action_run_common),
        ('Exit', None),
    ]

    print(f'Backup folder: {BACKUP_DIR.relative_to(ROOT)}')
    while True:
        print('\nAlchemy maintenance menu:')
        for index, (title, _) in enumerate(menu, start=1):
            print(f'  {index}. {title}')
        choice = input('Choose an action (number): ').strip()
        if not choice.isdigit():
            print('Please enter a number from the menu.')
            continue
        choice_idx = int(choice) - 1
        if choice_idx < 0 or choice_idx >= len(menu):
            print('Invalid choice. Try again.')
            continue
        if menu[choice_idx][1] is None:
            print('Exiting.')
            break
        try:
            menu[choice_idx][1]()
        except Exception as exc:
            print(f'Error executing task: {exc}')


def run_common_scripts():
    for common_name in ['add.py', 'calc.py', 'effect.py', 'name.py', 'sort.py']:
        script_path = ROOT / common_name
        if script_path.exists():
            print(f'-- Running {common_name} --')
            try:
                run_root_script(script_path)
            except Exception as exc:
                print(f'Failed to run {common_name}: {exc}')
        else:
            print(f'{common_name} not found.')


def main():
    parser = argparse.ArgumentParser(description='Universal repository maintenance script for alchemy.')
    parser.add_argument('--no-interactive', action='store_true', help='Disable interactive menu and use flags instead.')
    parser.add_argument('--generate-caco-effects', action='store_true', help='Generate data/CACO/effects.json from data/CACO/data.json.')
    parser.add_argument('--verify-datab', action='store_true', help='Verify data/datab.json coverage under data/.')
    parser.add_argument('--fix-effect-state', action='store_true', help='Update effect_state in data/data.json using data/positive_negative_data.json.')
    parser.add_argument('--sync-effects', action='store_true', help='Synchronize data/effects.json with data/data.json.')
    parser.add_argument('--sort', action='store_true', help='Sort data.json and effects.json.')
    parser.add_argument('--count', action='store_true', help='Print ingredient count from data/data.json.')
    parser.add_argument('--list-names', action='store_true', help='Print ingredient names from data/data.json.')
    parser.add_argument('--run-common', action='store_true', help='Execute all common root scripts from alchemy/*.py where safe.')
    args = parser.parse_args()

    if len(sys.argv) == 1 or not args.no_interactive:
        interactive_menu()
        return

    data_root = ROOT / 'data'
    report_path = data_root / 'verification_report.json'
    data_json = data_root / 'data.json'
    effects_json = data_root / 'effects.json'
    datab_json = data_root / 'datab.json'
    pn_json = data_root / 'positive_negative_data.json'
    caco_root = data_root / 'CACO'

    if args.generate_caco_effects:
        count = generate_caco_effects(caco_root)
        print(f'Generated data/CACO/effects.json with {count} effects.')

    if args.verify_datab:
        if not datab_json.exists():
            print(f'Warning: datab file not found: {datab_json}. Skipping verification.')
        else:
            report = verify_datab(datab_json, data_root, report_path)
            print(f'Verification report written to {report_path}')
            print(f"Present: {report['present_count']}, Missing: {report['missing_count']}")

    if args.fix_effect_state:
        changes = fix_effect_state(data_json, pn_json)
        if changes:
            print(f'Updated effect_state for {len(changes)} ingredients.')
            for name, old, new in changes:
                print(f'  {name}: {old} -> {new}')
        else:
            print('effect_state values are already correct.')

    if args.sync_effects:
        try:
            changes = sync_effects_json(data_json, effects_json)
            if changes:
                print(f'Synchronized effects.json with data.json and added names for {len(changes)} effects.')
            else:
                print('effects.json is already synchronized with data.json.')
        except Exception as exc:
            print(f'Failed to synchronize effects.json: {exc}')

    if args.sort:
        sort_files(data_json, effects_json)
        print('Sorted data.json and effects.json.')

    if args.count:
        print_data_count(data_json)

    if args.list_names:
        print_ingredient_names(data_json)

    if args.run_common:
        run_common_scripts()


if __name__ == '__main__':
    main()
