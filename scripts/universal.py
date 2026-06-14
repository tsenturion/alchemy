#!/usr/bin/env python3
"""Универсальный скрипт обслуживания репозитория alchemy.

Задачи:
- Генерирует data/CACO/effects.json из data/CACO/data.json
- Проверяет наличие всех имен из data/datab.json в JSON-файлах под data/
- Назначает effect_state в data/data.json на основе data/positive_negative_data.json
- Сортирует data.json и effects.json
- Сортирует positive_negative_data.json в data/ и подпапках
- Показывает количество ингредиентов и список имён
- Интегрирует функции из корневых скриптов add.py, sort.py, name.py и verify_datab.py
"""

import argparse
import json
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POSITIVE_NEGATIVE_FILE_NAME = 'positive_negative_data.json'
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


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def generate_caco_effects(caco_root: Path):
    caco_data_path = caco_root / 'data.json'
    caco_effects_path = caco_root / 'effects.json'

    if not caco_data_path.exists():
        raise FileNotFoundError(f'Файл CACO data.json не найден: {caco_data_path}')

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


def build_effect_ingredient_map(data, shared_names):
    shared = set(shared_names)
    effect_map = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get('name')
        if name not in shared:
            continue
        for effect in item.get('effects', []):
            effect_map.setdefault(effect, set()).add(name)
    return effect_map


def intersection_count(left, right):
    return sum(1 for item in left if item in right)


def path_relative_to_root(path: Path):
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def make_effect_match_entry(candidate):
    return {
        'стандартный_эффект': candidate['standard_effect'],
        'эффект_caco': candidate['caco_effect'],
        'общих_ингредиентов': candidate['shared_count'],
        'ингредиентов_у_стандартного': candidate['standard_count'],
        'ингредиентов_у_caco': candidate['caco_count'],
        'сходство': round(candidate['similarity'], 4),
        'примеры': candidate['examples'],
    }


def find_caco_effect_matches(data_path: Path, caco_data_path: Path, min_shared=2, min_similarity=0.5):
    standard_data = load_json(data_path)
    caco_data = load_json(caco_data_path)

    standard_by_name = {
        item.get('name'): item
        for item in standard_data
        if isinstance(item, dict) and item.get('name')
    }
    caco_by_name = {
        item.get('name'): item
        for item in caco_data
        if isinstance(item, dict) and item.get('name')
    }
    shared_names = sorted(
        set(standard_by_name).intersection(caco_by_name),
        key=lambda value: value.lower(),
    )

    standard_effects = build_effect_ingredient_map(standard_data, shared_names)
    caco_effects = build_effect_ingredient_map(caco_data, shared_names)
    candidates = []

    for standard_effect, standard_names in standard_effects.items():
        for caco_effect, caco_names in caco_effects.items():
            if standard_effect == caco_effect:
                continue

            shared_count = intersection_count(standard_names, caco_names)
            if shared_count == 0:
                continue

            union_count = len(standard_names) + len(caco_names) - shared_count
            common_examples = sorted(
                (name for name in standard_names if name in caco_names),
                key=lambda value: value.lower(),
            )
            candidates.append({
                'standard_effect': standard_effect,
                'caco_effect': caco_effect,
                'shared_count': shared_count,
                'standard_count': len(standard_names),
                'caco_count': len(caco_names),
                'similarity': shared_count / union_count,
                'examples': common_examples[:10],
            })

    candidates.sort(
        key=lambda item: (
            -item['similarity'],
            -item['shared_count'],
            item['standard_effect'].lower(),
            item['caco_effect'].lower(),
        )
    )

    best_by_standard = {}
    best_by_caco = {}
    for candidate in candidates:
        best_by_standard.setdefault(candidate['standard_effect'], candidate)
        best_by_caco.setdefault(candidate['caco_effect'], candidate)

    exact_matches = []
    likely_matches = []
    review_matches = []

    for candidate in candidates:
        is_mutual_best = (
            best_by_standard[candidate['standard_effect']] is candidate and
            best_by_caco[candidate['caco_effect']] is candidate
        )
        if not is_mutual_best:
            continue

        entry = make_effect_match_entry(candidate)
        if candidate['similarity'] == 1:
            exact_matches.append(entry)
        elif (
            candidate['shared_count'] >= min_shared and
            candidate['similarity'] >= min_similarity
        ):
            likely_matches.append(entry)
        elif candidate['shared_count'] >= min_shared:
            review_matches.append(entry)

    return {
        'стандартный_файл': path_relative_to_root(data_path),
        'файл_caco': path_relative_to_root(caco_data_path),
        'общих_ингредиентов': len(shared_names),
        'точные_совпадения': exact_matches,
        'вероятные_совпадения': likely_matches,
        'нужно_проверить_вручную': review_matches,
    }


def save_caco_effect_matches(data_path: Path, caco_data_path: Path, report_path: Path):
    report = find_caco_effect_matches(data_path, caco_data_path)
    save_json(report_path, report)
    return report


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


def sort_positive_negative_file(pn_path: Path):
    data = load_json(pn_path)
    if not isinstance(data, dict):
        raise ValueError(f'Файл должен содержать объект JSON: {pn_path}')

    changed = False
    for key in ('positive_effects', 'negative_effects'):
        values = data.get(key)
        if values is None:
            continue
        if not isinstance(values, list):
            raise ValueError(f'Поле {key} должно быть списком: {pn_path}')

        sorted_values = sorted(values, key=lambda value: str(value).lower())
        if values != sorted_values:
            data[key] = sorted_values
            changed = True

    if changed:
        save_json(pn_path, data)

    return changed


def find_positive_negative_files(data_root: Path):
    return sorted(
        data_root.rglob(POSITIVE_NEGATIVE_FILE_NAME),
        key=lambda path: str(path.relative_to(ROOT)).lower()
    )


def sort_positive_negative_files(data_root: Path):
    files = find_positive_negative_files(data_root)
    changed_files = []
    unchanged_files = []

    for pn_path in files:
        if sort_positive_negative_file(pn_path):
            changed_files.append(pn_path)
        else:
            unchanged_files.append(pn_path)

    return {
        'files': files,
        'changed': changed_files,
        'unchanged': unchanged_files,
    }


def print_data_count(data_path: Path):
    data = load_json(data_path)
    print(f'Всего ингредиентов в {data_path}: {len(data)}')
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
    caco_effect_matches_report = caco_root / 'effect_matches_report.json'

    def action_generate_caco_effects():
        if not caco_root.exists():
            print('Папка CACO не найдена.')
            return
        count = generate_caco_effects(caco_root)
        print(f'Сгенерировано эффектов в data/CACO/effects.json: {count}')

    def action_verify_datab():
        if not datab_json.exists():
            print(f'Файл datab.json не найден: {datab_json}')
            return
        report = verify_datab(datab_json, data_root, report_path)
        print(f'Отчёт проверки записан в {report_path}')
        print(f'Найдено: {report["present_count"]}, отсутствует: {report["missing_count"]}')

    def action_fix_effect_state():
        changes = fix_effect_state(data_json, pn_json)
        if changes:
            print(f'Обновлено значение effect_state у ингредиентов: {len(changes)}')
            for name, old, new in changes:
                print(f'  {name}: {old} -> {new}')
        else:
            print('Значения effect_state уже корректны.')

    def action_sync_effects():
        try:
            changes = sync_effects_json(data_json, effects_json)
            if changes:
                print(f'effects.json синхронизирован с data.json; обновлено эффектов: {len(changes)}')
            else:
                print('effects.json уже синхронизирован с data.json.')
        except Exception as exc:
            print(f'Не удалось синхронизировать effects.json: {exc}')

    def action_find_caco_effect_matches():
        report = save_caco_effect_matches(data_json, caco_root / 'data.json', caco_effect_matches_report)
        print(f'Отчёт записан в {caco_effect_matches_report.relative_to(ROOT)}')
        print(f'Общих ингредиентов: {report["общих_ингредиентов"]}')
        print(f'Точных совпадений: {len(report["точные_совпадения"])}')
        print(f'Вероятных совпадений: {len(report["вероятные_совпадения"])}')
        print(f'Требуют ручной проверки: {len(report["нужно_проверить_вручную"])}')

    def action_sort_files():
        sort_files(data_json, effects_json)
        print('data.json и effects.json отсортированы.')

    def action_sort_positive_negative_files():
        result = sort_positive_negative_files(data_root)
        print(f'Найдено файлов {POSITIVE_NEGATIVE_FILE_NAME}: {len(result["files"])}')
        print(f'Отсортировано файлов: {len(result["changed"])}')
        if result['changed']:
            for path in result['changed']:
                print(f'  {path.relative_to(ROOT)}')

    def action_print_count():
        print_data_count(data_json)

    def action_list_names():
        print_ingredient_names(data_json)

    def action_run_common():
        run_common_scripts()

    menu = [
        ('Сгенерировать data/CACO/effects.json', action_generate_caco_effects),
        ('Проверить покрытие data/datab.json', action_verify_datab),
        ('Исправить effect_state в data/data.json', action_fix_effect_state),
        ('Синхронизировать data/effects.json с data/data.json', action_sync_effects),
        ('Сопоставить эффекты data.json и CACO', action_find_caco_effect_matches),
        ('Отсортировать data.json и effects.json', action_sort_files),
        ('Отсортировать positive_negative_data.json', action_sort_positive_negative_files),
        ('Показать количество ингредиентов', action_print_count),
        ('Показать список ингредиентов', action_list_names),
        ('Запустить общие корневые скрипты', action_run_common),
        ('Выход', None),
    ]

    while True:
        print('\nМеню обслуживания alchemy:')
        for index, (title, _) in enumerate(menu, start=1):
            print(f'  {index}. {title}')
        choice = input('Выберите действие (номер): ').strip()
        if not choice.isdigit():
            print('Введите номер пункта меню.')
            continue
        choice_idx = int(choice) - 1
        if choice_idx < 0 or choice_idx >= len(menu):
            print('Некорректный выбор. Попробуйте ещё раз.')
            continue
        if menu[choice_idx][1] is None:
            print('Выход.')
            break
        try:
            menu[choice_idx][1]()
        except Exception as exc:
            print(f'Ошибка выполнения задачи: {exc}')


def run_common_scripts():
    for common_name in ['add.py', 'calc.py', 'effect.py', 'name.py', 'sort.py']:
        script_path = ROOT / common_name
        if script_path.exists():
            print(f'-- Запуск {common_name} --')
            try:
                run_root_script(script_path)
            except Exception as exc:
                print(f'Не удалось запустить {common_name}: {exc}')
        else:
            print(f'{common_name} не найден.')


def main():
    parser = argparse.ArgumentParser(description='Универсальный скрипт обслуживания репозитория alchemy.')
    parser.add_argument('--no-interactive', action='store_true', help='Отключить интерактивное меню и использовать флаги.')
    parser.add_argument('--generate-caco-effects', action='store_true', help='Сгенерировать data/CACO/effects.json из data/CACO/data.json.')
    parser.add_argument('--verify-datab', action='store_true', help='Проверить покрытие data/datab.json внутри папки data/.')
    parser.add_argument('--fix-effect-state', action='store_true', help='Обновить effect_state в data/data.json по data/positive_negative_data.json.')
    parser.add_argument('--sync-effects', action='store_true', help='Синхронизировать data/effects.json с data/data.json.')
    parser.add_argument('--caco-effect-matches', action='store_true', help='Сопоставить эффекты стандартного data.json и CACO по общим ингредиентам.')
    parser.add_argument('--sort', action='store_true', help='Отсортировать data.json и effects.json.')
    parser.add_argument('--sort-positive-negative', action='store_true', help='Отсортировать все positive_negative_data.json в папке data/.')
    parser.add_argument('--count', action='store_true', help='Показать количество ингредиентов из data/data.json.')
    parser.add_argument('--list-names', action='store_true', help='Показать имена ингредиентов из data/data.json.')
    parser.add_argument('--run-common', action='store_true', help='Запустить общие корневые скрипты alchemy/*.py.')
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
    caco_effect_matches_report = caco_root / 'effect_matches_report.json'

    if args.generate_caco_effects:
        count = generate_caco_effects(caco_root)
        print(f'Сгенерирован data/CACO/effects.json. Эффектов: {count}')

    if args.verify_datab:
        if not datab_json.exists():
            print(f'Предупреждение: файл datab.json не найден: {datab_json}. Проверка пропущена.')
        else:
            report = verify_datab(datab_json, data_root, report_path)
            print(f'Отчёт проверки записан в {report_path}')
            print(f"Найдено: {report['present_count']}, отсутствует: {report['missing_count']}")

    if args.fix_effect_state:
        changes = fix_effect_state(data_json, pn_json)
        if changes:
            print(f'Обновлено значение effect_state у ингредиентов: {len(changes)}')
            for name, old, new in changes:
                print(f'  {name}: {old} -> {new}')
        else:
            print('Значения effect_state уже корректны.')

    if args.sync_effects:
        try:
            changes = sync_effects_json(data_json, effects_json)
            if changes:
                print(f'effects.json синхронизирован с data.json; обновлено эффектов: {len(changes)}')
            else:
                print('effects.json уже синхронизирован с data.json.')
        except Exception as exc:
            print(f'Не удалось синхронизировать effects.json: {exc}')

    if args.caco_effect_matches:
        report = save_caco_effect_matches(data_json, caco_root / 'data.json', caco_effect_matches_report)
        print(f'Отчёт записан в {caco_effect_matches_report.relative_to(ROOT)}')
        print(f'Общих ингредиентов: {report["общих_ингредиентов"]}')
        print(f'Точных совпадений: {len(report["точные_совпадения"])}')
        print(f'Вероятных совпадений: {len(report["вероятные_совпадения"])}')
        print(f'Требуют ручной проверки: {len(report["нужно_проверить_вручную"])}')

    if args.sort:
        sort_files(data_json, effects_json)
        print('data.json и effects.json отсортированы.')

    if args.sort_positive_negative:
        result = sort_positive_negative_files(data_root)
        print(f'Найдено файлов {POSITIVE_NEGATIVE_FILE_NAME}: {len(result["files"])}')
        print(f'Отсортировано файлов: {len(result["changed"])}')
        if result['changed']:
            for path in result['changed']:
                print(f'  {path.relative_to(ROOT)}')

    if args.count:
        print_data_count(data_json)

    if args.list_names:
        print_ingredient_names(data_json)

    if args.run_common:
        run_common_scripts()


if __name__ == '__main__':
    main()
