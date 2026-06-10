import json
from pathlib import Path

def load_json(filepath):
    """Загружает JSON файл."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    """Сохраняет JSON файл."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def main():
    # Пути к файлам
    base_path = Path(r"C:\Users\user\repos\alchemy")
    data_path = base_path / "data.json"
    effects_path = base_path / "effects.json"
    
    # Загружаем данные
    print("Загрузка data.json...")
    data = load_json(data_path)
    
    print("Загрузка effects.json...")
    effects = load_json(effects_path)
    
    # Создаем словарь: эффект -> список ингредиентов из data.json
    effect_to_ingredients = {}
    for item in data:
        name = item["name"]
        for effect in item["effects"]:
            if effect not in effect_to_ingredients:
                effect_to_ingredients[effect] = []
            effect_to_ingredients[effect].append(name)
    
    # Обновляем effects.json
    updated_count = 0
    for effect_entry in effects:
        effect_name = effect_entry["effect"]
        existing_names = set(effect_entry["names"])
        
        # Получаем все ингредиенты для этого эффекта из data.json
        all_ingredients = set(effect_to_ingredients.get(effect_name, []))
        
        # Находим недостающие
        missing = all_ingredients - existing_names
        
        if missing:
            print(f"\nЭффект '{effect_name}': добавлено {len(missing)} ингредиентов")
            for ing in sorted(missing):
                print(f"  + {ing}")
            effect_entry["names"].extend(sorted(missing))
            updated_count += 1
    
    # Сохраняем обновленный effects.json
    if updated_count > 0:
        save_json(effects_path, effects)
        print(f"\n✅ Обновлено {updated_count} эффектов. Файл effects.json сохранен.")
    else:
        print("\n✅ Все эффекты уже синхронизированы. Изменений не требуется.")
    
    # Дополнительно: проверяем, есть ли эффекты в data.json, которых нет в effects.json
    effects_in_json = {e["effect"] for e in effects}
    effects_in_data = set(effect_to_ingredients.keys())
    
    missing_effects = effects_in_data - effects_in_json
    if missing_effects:
        print(f"\n⚠️ ВНИМАНИЕ: В data.json есть эффекты, отсутствующие в effects.json:")
        for effect in sorted(missing_effects):
            print(f"  - {effect}")
        print("\nЭти эффекты нужно добавить вручную в структуру effects.json")

if __name__ == "__main__":
    main()