import json
from pathlib import Path

def sort_data_json():
    """Сортировка только data.json"""
    filepath = Path(r"C:\Users\user\repos\alchemy\data.json")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Сортировка по имени
    data.sort(key=lambda x: x["name"])
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    
    print("✅ data.json отсортирован по алфавиту")

def sort_effects_json():
    """Сортировка только effects.json"""
    filepath = Path(r"C:\Users\user\repos\alchemy\effects.json")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Сортировка эффектов
    data.sort(key=lambda x: x["effect"])
    
    # Сортировка ингредиентов внутри каждого эффекта
    for effect in data:
        effect["names"].sort()
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    
    print("✅ effects.json отсортирован по алфавиту")

if __name__ == "__main__":
    sort_data_json()
    sort_effects_json()