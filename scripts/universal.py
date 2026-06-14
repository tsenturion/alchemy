#!/usr/bin/env python3
"""Универсальный скрипт обслуживания репозитория alchemy.

Задачи:
- Выполняет обслуживание data.json/effects.json/positive_negative_data.json одним действием
- Проверяет наличие всех имен из data/datab.json в JSON-файлах под data/
- Сопоставляет похожие эффекты стандартного data.json и CACO
- Показывает список имён
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE_NAME = 'data.json'
EFFECTS_FILE_NAME = 'effects.json'
POSITIVE_NEGATIVE_FILE_NAME = 'positive_negative_data.json'


def load_json(path: Path):
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def sort_key(value):
    return str(value).lower()


def build_effects_entries(data):
    effect_map = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get('name')
        if not name:
            continue
        for effect in item.get('effects', []):
            effect_map.setdefault(effect, set()).add(name)

    return [
        {'effect': effect, 'names': sorted(names, key=sort_key)}
        for effect, names in sorted(effect_map.items(), key=lambda pair: sort_key(pair[0]))
    ]


def get_effect_state(effects, positive_effects, negative_effects):
    has_positive = any(effect in positive_effects for effect in effects)
    has_negative = any(effect in negative_effects for effect in effects)

    if has_positive and not has_negative:
        return 1
    if has_negative and not has_positive:
        return -1
    return 0


def sort_data_file(data_path: Path):
    data = load_json(data_path)
    if not isinstance(data, list):
        raise ValueError(f'Файл должен содержать список JSON: {data_path}')

    sorted_data = sorted(
        data,
        key=lambda item: sort_key(item.get('name', '')) if isinstance(item, dict) else ''
    )
    changed = data != sorted_data

    if changed:
        save_json(data_path, sorted_data)

    return {'changed': changed, 'items_count': len(sorted_data)}


def update_effects_json(data_path: Path, effects_path: Path):
    data = load_json(data_path)
    if not isinstance(data, list):
        raise ValueError(f'Файл должен содержать список JSON: {data_path}')

    effects = build_effects_entries(data)
    old_effects = load_json(effects_path) if effects_path.exists() else None
    changed = old_effects != effects

    if changed:
        save_json(effects_path, effects)

    return {'changed': changed, 'effects_count': len(effects)}


def update_missing_effect_state(data_path: Path, pn_path: Path):
    data = load_json(data_path)
    pn = load_json(pn_path)
    positive = set(pn.get('positive_effects', []))
    negative = set(pn.get('negative_effects', []))

    added = []
    mismatches = []

    for item in data:
        if not isinstance(item, dict):
            continue

        expected_state = get_effect_state(item.get('effects', []), positive, negative)
        if 'effect_state' not in item:
            item['effect_state'] = expected_state
            added.append((item.get('name'), expected_state))
        elif item.get('effect_state') != expected_state:
            mismatches.append((item.get('name'), item.get('effect_state'), expected_state))

    if added:
        save_json(data_path, data)

    return {
        'added': added,
        'mismatches': mismatches,
        'skipped': False,
    }


def verify_datab(datab_path: Path, root_folder: Path, report_path: Path):
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


def find_data_files(data_root: Path):
    return sorted(
        data_root.rglob(DATA_FILE_NAME),
        key=lambda path: str(path.relative_to(ROOT)).lower()
    )


def find_effect_state_source(data_path: Path, data_root: Path):
    local_pn = data_path.parent / POSITIVE_NEGATIVE_FILE_NAME
    if local_pn.exists():
        return local_pn

    root_pn = data_root / POSITIVE_NEGATIVE_FILE_NAME
    return root_pn if root_pn.exists() else None


def maintain_data(data_root: Path):
    data_files = find_data_files(data_root)
    positive_negative_result = sort_positive_negative_files(data_root)
    data_results = []

    for data_path in data_files:
        effects_path = data_path.parent / EFFECTS_FILE_NAME
        pn_path = find_effect_state_source(data_path, data_root)

        data_sort_result = sort_data_file(data_path)
        state_result = (
            update_missing_effect_state(data_path, pn_path)
            if pn_path is not None
            else {'added': [], 'mismatches': [], 'skipped': True}
        )
        effects_result = update_effects_json(data_path, effects_path)

        data_results.append({
            'data_path': data_path,
            'effects_path': effects_path,
            'positive_negative_path': pn_path,
            'data_sorted': data_sort_result['changed'],
            'effect_state_added': state_result['added'],
            'effect_state_mismatches': state_result['mismatches'],
            'effect_state_skipped': state_result['skipped'],
            'effects_changed': effects_result['changed'],
            'effects_count': effects_result['effects_count'],
        })

    return {
        'data_files': data_files,
        'positive_negative': positive_negative_result,
        'data_results': data_results,
    }


def print_maintenance_report(result):
    print(f'Найдено data.json: {len(result["data_files"])}')
    print(f'Отсортировано positive_negative_data.json: {len(result["positive_negative"]["changed"])}')

    sorted_data_count = sum(1 for item in result['data_results'] if item['data_sorted'])
    changed_effects_count = sum(1 for item in result['data_results'] if item['effects_changed'])
    added_state_count = sum(len(item['effect_state_added']) for item in result['data_results'])
    mismatch_count = sum(len(item['effect_state_mismatches']) for item in result['data_results'])

    print(f'Отсортировано data.json: {sorted_data_count}')
    print(f'Создано или обновлено effects.json: {changed_effects_count}')
    print(f'Добавлено отсутствующих effect_state: {added_state_count}')
    print(f'Найдено несовпадающих effect_state: {mismatch_count}')

    for item in result['data_results']:
        changed_parts = []
        if item['data_sorted']:
            changed_parts.append('data.json')
        if item['effects_changed']:
            changed_parts.append('effects.json')
        if item['effect_state_added']:
            changed_parts.append(f'effect_state +{len(item["effect_state_added"])}')
        if item['effect_state_mismatches']:
            changed_parts.append(f'проверить effect_state {len(item["effect_state_mismatches"])}')

        if changed_parts:
            print(f'  {item["data_path"].relative_to(ROOT)}: {", ".join(changed_parts)}')


def print_ingredient_names(data_path: Path):
    data = load_json(data_path)
    for index, item in enumerate(data, start=1):
        print(f'{index}. {item.get("name")}')
    return len(data)


def interactive_menu():
    data_root = ROOT / 'data'
    report_path = data_root / 'verification_report.json'
    data_json = data_root / 'data.json'
    datab_json = data_root / 'datab.json'
    caco_root = data_root / 'CACO'
    caco_effect_matches_report = caco_root / 'effect_matches_report.json'

    def action_maintain_data():
        result = maintain_data(data_root)
        print_maintenance_report(result)

    def action_verify_datab():
        if not datab_json.exists():
            print(f'Файл datab.json не найден: {datab_json}')
            return
        report = verify_datab(datab_json, data_root, report_path)
        print(f'Отчёт проверки записан в {report_path}')
        print(f'Найдено: {report["present_count"]}, отсутствует: {report["missing_count"]}')

    def action_find_caco_effect_matches():
        report = save_caco_effect_matches(data_json, caco_root / 'data.json', caco_effect_matches_report)
        print(f'Отчёт записан в {caco_effect_matches_report.relative_to(ROOT)}')
        print(f'Общих ингредиентов: {report["общих_ингредиентов"]}')
        print(f'Точных совпадений: {len(report["точные_совпадения"])}')
        print(f'Вероятных совпадений: {len(report["вероятные_совпадения"])}')
        print(f'Требуют ручной проверки: {len(report["нужно_проверить_вручную"])}')

    def action_list_names():
        print_ingredient_names(data_json)

    menu = [
        ('Выполнить универсальное обслуживание данных', action_maintain_data),
        ('Проверить покрытие data/datab.json', action_verify_datab),
        ('Сопоставить эффекты data.json и CACO', action_find_caco_effect_matches),
        ('Показать список ингредиентов', action_list_names),
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


if __name__ == '__main__':
    interactive_menu()
