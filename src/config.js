(function (global) {
  const DATA_ROOT = 'data';
  const DATA_FILE_NAME = 'data.json';
  const EFFECTS_FILE_NAME = 'effects.json';
  const EFFECT_POLARITY_FILE_NAME = 'positive_negative_data.json';
  const EFFECT_TRANSLATIONS_FILE_NAME = 'effect_translations.json';

  const POLARITY = Object.freeze({
    positive: 'positive',
    negative: 'negative',
    mixed: 'mixed'
  });

  const SOURCE_STATUS = Object.freeze({
    idle: 'idle',
    loading: 'loading',
    loaded: 'loaded',
    error: 'error'
  });

  const EFFECT_MENU_MODE = Object.freeze({
    replace: 'replace',
    add: 'add'
  });

  const ADDON_DISPLAY_NAMES = new Map(Object.entries({
    '_ResoursePack': 'Листья алоэ',
    'ccBGSSSE001-Fish': 'Рыбалка',
    'ccbgssse003-zombies': 'Чума мертвецов',
    'ccBGSSSE025-AdvDSGS': 'Святые и Соблазнители',
    'ccbgssse037-curios': 'Редкие диковинки',
    'ccbgssse040-advobgobs': 'Гоблины',
    'ccbgssse067-daedinv': 'Причина (The Cause)',
    'cckrtsee001_altar': 'Горькая чаша',
    'cctwbsee001-puzzledungeon': 'Забытые времена года',
    CACO: 'CACO',
    Dawnguard: 'Стража Рассвета (Dawnguard)',
    Dragonborn: 'Драконорожденный (Dragonborn)',
    Hearthfire: 'Домашний очаг (Hearthfire)'
  }).map(([folderName, displayName]) => [folderName.toLowerCase(), displayName]));

  const DEFAULT_ENABLED_ADDON_FOLDERS = new Set([
    '_ResoursePack',
    'ccbgssse003-zombies',
    'ccbgssse040-advobgobs',
    'cckrtsee001_altar',
    'cctwbsee001-puzzledungeon'
  ].map(folderName => folderName.toLowerCase()));

  global.AlchemyConfig = Object.freeze({
    MAX_SELECTION_COUNT: 3,
    MAX_EFFECT_FILTER_COUNT: 4,
    DATA_ROOT,
    DATA_FILE_NAME,
    EFFECTS_FILE_NAME,
    EFFECT_POLARITY_FILE_NAME,
    EFFECT_TRANSLATIONS_FILE_NAME,
    ROOT_DATA_PATH: `${DATA_ROOT}/${DATA_FILE_NAME}`,
    ROOT_EFFECTS_PATH: `${DATA_ROOT}/${EFFECTS_FILE_NAME}`,
    ROOT_EFFECT_POLARITY_PATH: `${DATA_ROOT}/${EFFECT_POLARITY_FILE_NAME}`,
    POLARITY,
    SOURCE_STATUS,
    EFFECT_MENU_MODE,
    ADDON_DISPLAY_NAMES,
    DEFAULT_ENABLED_ADDON_FOLDERS,
    FALLBACK_ADDON_DATA_PATHS: Object.freeze([
      'data/CACO/data.json',
      'data/Creation Club/_ResoursePack/data.json',
      'data/Creation Club/ccBGSSSE001-Fish/data.json',
      'data/Creation Club/ccbgssse003-zombies/data.json',
      'data/Creation Club/ccBGSSSE025-AdvDSGS/data.json',
      'data/Creation Club/ccbgssse037-curios/data.json',
      'data/Creation Club/ccbgssse040-advobgobs/data.json',
      'data/Creation Club/ccbgssse067-daedinv/data.json',
      'data/Creation Club/cckrtsee001_altar/data.json',
      'data/Creation Club/cctwbsee001-puzzledungeon/data.json',
      'data/DLC/Dawnguard/data.json',
      'data/DLC/Dragonborn/data.json',
      'data/DLC/Hearthfire/data.json',
      'data/Skyrim Extended Cut - Saints and Seducers/data.json'
    ])
  });
})(window);
