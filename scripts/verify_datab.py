#!/usr/bin/env python3
"""Verify that all ingredient names from data/datab.json are present in other JSON files under data/.
Usage: python scripts/verify_datab.py [--datab DATA/BATAB.JSON] [--root data] [--report reports/output.json]
"""
import argparse
import json
from pathlib import Path

def load_names(path: Path):
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception as e:
        raise SystemExit(f"Failed to read JSON from {path}: {e}")
    if not isinstance(data, list):
        raise SystemExit(f"Expected list in {path}")
    names = [item.get('name') for item in data if isinstance(item, dict) and 'name' in item]
    return names


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--datab', default='data/datab.json', help='Path to datab.json with master ingredient list')
    p.add_argument('--root', default='data', help='Root folder to search for JSON files')
    p.add_argument('--report', default='data/verification_report.json', help='Output JSON report path')
    args = p.parse_args()

    datab_path = Path(args.datab)
    root = Path(args.root)
    report_path = Path(args.report)

    if not datab_path.exists():
        raise SystemExit(f'datab file not found: {datab_path}')
    if not root.exists():
        raise SystemExit(f'data root not found: {root}')

    datab_names = load_names(datab_path)
    datab_set = set(datab_names)

    # gather names from all json files under root except the datab file itself
    found_map = {}  # name -> set(files)
    for fp in root.rglob('*.json'):
        try:
            if fp.resolve() == datab_path.resolve():
                continue
        except Exception:
            pass
        try:
            items = json.loads(fp.read_text(encoding='utf-8'))
        except Exception:
            # skip unreadable JSON files
            continue
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and 'name' in item:
                name = item['name']
                if name not in found_map:
                    found_map[name] = set()
                found_map[name].add(str(fp.relative_to(Path.cwd())))

    present = {}
    missing = []
    for name in datab_names:
        if name in found_map:
            present[name] = sorted(found_map[name])
        else:
            missing.append(name)

    report = {
        'datab_file': str(datab_path),
        'data_root': str(root),
        'total_in_datab': len(datab_names),
        'present_count': len(present),
        'missing_count': len(missing),
        'present': present,
        'missing': missing,
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f"Total in datab: {report['total_in_datab']}")
    print(f"Present: {report['present_count']}")
    print(f"Missing: {report['missing_count']}")
    if missing:
        print('\nMissing names:')
        for n in missing:
            print('-', n)
    print(f"Wrote report to {report_path}")

if __name__ == '__main__':
    main()
