import json
from pathlib import Path

def print_ingredients_with_numbers():
    """Выводит названия ингредиентов с нумерацией"""
    filepath = Path(r"C:\Users\user\repos\alchemy\data.json")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Всего ингредиентов: {len(data)}\n")
    
    for i, item in enumerate(data, 1):
        print(f"{i}. {item['name']}")

if __name__ == "__main__":
    print_ingredients_with_numbers()