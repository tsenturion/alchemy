import json
from pathlib import Path

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def fix_effect_state():
    base_path = Path(r"C:\Users\user\repos\alchemy")
    
    # Загрузка данных
    data = load_json(base_path / "data.json")
    pn_data = load_json(base_path / "positive_negative_data.json")
    
    positive_set = set(pn_data["positive_effects"])
    negative_set = set(pn_data["negative_effects"])
    
    changes = []
    
    for item in data:
        name = item["name"]
        effects = item["effects"]
        
        # Определяем правильное состояние
        has_positive = any(e in positive_set for e in effects)
        has_negative = any(e in negative_set for e in effects)
        
        if has_positive and not has_negative:
            correct_state = 1
        elif has_negative and not has_positive:
            correct_state = -1
        else:
            correct_state = 0
        
        # Проверяем и исправляем
        if item.get("effect_state") != correct_state:
            changes.append({
                "name": name,
                "old": item.get("effect_state"),
                "new": correct_state
            })
            item["effect_state"] = correct_state
    
    # Сохраняем изменения
    if changes:
        save_json(base_path / "data.json", data)
        print(f"✅ Исправлено {len(changes)} ингредиентов:")
        for change in changes:
            print(f"  {change['name']}: {change['old']} → {change['new']}")
    else:
        print("✅ Все effect_state корректны")

if __name__ == "__main__":
    fix_effect_state()