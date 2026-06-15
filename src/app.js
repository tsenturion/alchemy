$(document).ready(() => {
  const MAX_SELECTION_COUNT = 3;
  const DATA_ROOT = 'data';
  const DATA_FILE_NAME = 'data.json';
  const EFFECTS_FILE_NAME = 'effects.json';
  const EFFECT_POLARITY_FILE_NAME = 'positive_negative_data.json';
  const EFFECT_TRANSLATIONS_FILE_NAME = 'effect_translations.json';
  const ROOT_DATA_PATH = `${DATA_ROOT}/${DATA_FILE_NAME}`;
  const ROOT_EFFECTS_PATH = `${DATA_ROOT}/${EFFECTS_FILE_NAME}`;
  const ROOT_EFFECT_POLARITY_PATH = `${DATA_ROOT}/${EFFECT_POLARITY_FILE_NAME}`;
  const POLARITY = {
    positive: 'positive',
    negative: 'negative',
    mixed: 'mixed'
  };
  const SOURCE_STATUS = {
    idle: 'idle',
    loading: 'loading',
    loaded: 'loaded',
    error: 'error'
  };
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
  const FALLBACK_ADDON_DATA_PATHS = [
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
  ];

  let ingredients = [];
  let ingredientByName = new Map();
  let namesByEffect = new Map();
  let positiveEffects = new Set();
  let negativeEffects = new Set();
  let selectedNames = new Set();
  let selectedClasses = new Map();
  let searchQuery = '';
  let selectedEffect = null;
  let selectedPolarity = null;
  let availableAddons = [];
  let selectedAddonIds = new Set();
  let addonIngredientCounts = new Map();
  let rootDataEnabled = true;
  let rootIngredientCount = null;
  let rootPolarityData = null;
  let rootPolarityStatus = SOURCE_STATUS.idle;
  let rootPolarityPromise = null;
  let sourceCache = new Map();
  let dataLoadToken = 0;

  const $addonsBtn = $('#addons-btn');
  const $addonsMenu = $('#addons-menu');
  const $addonsList = $('#addons-list');
  const $effectsMenu = $('#effects-menu');
  const $dataTableBody = $('#data-table tbody');
  const $selectionTableBody = $('#selection-table tbody');
  const $combinationTableBody = $('#combination-table tbody');
  const $search = $('#search');
  const $visibleCount = $('#visible-count');
  const $backBtn = $('#back-btn');
  const $selectionTable = $('#selection-table');
  const $combinationTable = $('#combination-table');
  const $selectionTitle = $('#selection-title');
  const $combinationTitle = $('#combination-title');
  const $effectTitle = $('#effect-title');
  const $effectTitleText = $('#effect-title-text');
  const $effectBackBtn = $('#effect-back-btn');
  const $mainHintRow = $('#main-hint-row');
  const $removeAllBtn = $('#remove-all-btn');

  const normalizeSearch = value => value.trim().toLowerCase();
  const normalizeAddonKey = value => value.toLowerCase();
  const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
  const compareRu = (a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' });

  const fetchJson = async path => {
    const response = await fetch(encodePath(path));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${path}`);
    }

    return response.json();
  };

  const fetchOptionalJson = async path => {
    try {
      const response = await fetch(encodePath(path));

      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      console.warn(`Не удалось загрузить необязательный файл ${path}`, error);
      return null;
    }
  };

  const uniqueSortedPaths = paths => Array.from(new Set(paths))
    .filter(path => path && path !== ROOT_DATA_PATH)
    .sort(compareRu);

  const getFolderNameFromDataPath = dataPath => {
    const parts = dataPath.split('/');
    return parts.length >= 2 ? parts[parts.length - 2] : '';
  };

  const getDirectoryPathFromDataPath = dataPath => dataPath.replace(/\/data\.json$/i, '');
  const getEffectsPath = dataPath => dataPath.replace(/data\.json$/i, EFFECTS_FILE_NAME);
  const getEffectPolarityPath = dataPath => dataPath.replace(/data\.json$/i, EFFECT_POLARITY_FILE_NAME);
  const getEffectTranslationsPath = dataPath => dataPath.replace(/data\.json$/i, EFFECT_TRANSLATIONS_FILE_NAME);

  const createAddonDefinitions = dataPaths => uniqueSortedPaths(dataPaths)
    .map(dataPath => {
      const directoryPath = getDirectoryPathFromDataPath(dataPath);
      const folderName = getFolderNameFromDataPath(dataPath);
      const normalizedFolderName = normalizeAddonKey(folderName);
      const defaultEnabled = DEFAULT_ENABLED_ADDON_FOLDERS.has(normalizedFolderName);

      return {
        id: directoryPath,
        dataPath,
        effectsPath: getEffectsPath(dataPath),
        polarityPath: getEffectPolarityPath(dataPath),
        translationsPath: getEffectTranslationsPath(dataPath),
        folderName,
        name: ADDON_DISPLAY_NAMES.get(normalizedFolderName) || folderName,
        defaultEnabled,
        selectable: !defaultEnabled
      };
    })
    .sort((a, b) => compareRu(a.name, b.name) || compareRu(a.id, b.id));

  const getGitHubPagesRepo = () => {
    const match = window.location.hostname.match(/^([^.]+)\.github\.io$/i);
    const configuredRepository = $('meta[name="github-repository"]').attr('content') || '';

    if (match) {
      const owner = match[1];
      const pathSegments = window.location.pathname.split('/').filter(Boolean);
      const firstSegment = pathSegments[0] || '';
      const repo = firstSegment && !firstSegment.endsWith('.html')
        ? firstSegment
        : `${owner}.github.io`;

      return { owner, repo };
    }

    const [owner, repo] = configuredRepository.split('/');
    return owner && repo ? { owner, repo } : null;
  };

  const listGitHubDirectory = async (repoInfo, directoryPath) => {
    const response = await fetch(
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${encodePath(directoryPath)}`
    );

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${directoryPath}`);
    }

    const entries = await response.json();
    return Array.isArray(entries) ? entries : [];
  };

  const walkGitHubDataDirectory = async (repoInfo, directoryPath = DATA_ROOT) => {
    const entries = await listGitHubDirectory(repoInfo, directoryPath);
    const dataPaths = [];

    if (
      directoryPath !== DATA_ROOT &&
      entries.some(entry => entry.type === 'file' && entry.name === DATA_FILE_NAME)
    ) {
      dataPaths.push(`${directoryPath}/${DATA_FILE_NAME}`);
    }

    const childPaths = await Promise.all(
      entries
        .filter(entry => entry.type === 'dir')
        .map(entry => walkGitHubDataDirectory(repoInfo, entry.path))
    );

    return dataPaths.concat(...childPaths);
  };

  const discoverGitHubPagesDataPaths = async () => {
    const repoInfo = getGitHubPagesRepo();
    if (!repoInfo) return [];
    return walkGitHubDataDirectory(repoInfo);
  };

  const isLocalHost = () => ['', 'localhost', '127.0.0.1'].includes(window.location.hostname);

  const getDirectoryListingEntries = (html, directoryPath) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const directoryUrl = new URL(`${directoryPath}/`, window.location.href);
    const dataRootUrl = new URL(`${DATA_ROOT}/`, window.location.href);
    const entries = [];

    doc.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('?')) return;

      const url = new URL(href, directoryUrl);
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.startsWith(dataRootUrl.pathname)) return;
      if (url.pathname === directoryUrl.pathname) return;

      const relativePath = decodeURIComponent(url.pathname.slice(dataRootUrl.pathname.length))
        .replace(/\/$/, '');

      if (!relativePath || relativePath.startsWith('..')) return;

      entries.push({
        path: `${DATA_ROOT}/${relativePath}`,
        isDirectory: href.endsWith('/') || url.pathname.endsWith('/')
      });
    });

    return entries;
  };

  const walkDirectoryListing = async (directoryPath = DATA_ROOT, visited = new Set()) => {
    const normalizedDirectoryPath = directoryPath.replace(/\/$/, '');
    if (visited.has(normalizedDirectoryPath)) return [];
    visited.add(normalizedDirectoryPath);

    let response;

    try {
      response = await fetch(`${encodePath(normalizedDirectoryPath)}/`);
    } catch (error) {
      return [];
    }

    if (!response.ok) return [];

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return [];

    const entries = getDirectoryListingEntries(await response.text(), normalizedDirectoryPath);
    const dataPaths = entries.some(entry => !entry.isDirectory && entry.path === `${normalizedDirectoryPath}/${DATA_FILE_NAME}`)
      && normalizedDirectoryPath !== DATA_ROOT
      ? [`${normalizedDirectoryPath}/${DATA_FILE_NAME}`]
      : [];

    const childPaths = await Promise.all(
      entries
        .filter(entry => entry.isDirectory)
        .map(entry => walkDirectoryListing(entry.path, visited))
    );

    return dataPaths.concat(...childPaths);
  };

  const discoverAddonDataPaths = async () => {
    const discoveryStrategies = isLocalHost()
      ? [walkDirectoryListing, discoverGitHubPagesDataPaths]
      : [discoverGitHubPagesDataPaths, walkDirectoryListing];

    for (const discover of discoveryStrategies) {
      try {
        const dataPaths = uniqueSortedPaths(await discover());
        if (dataPaths.length) return dataPaths;
      } catch (error) {
        console.warn('Не удалось автоматически найти дополнения:', error);
      }
    }

    return FALLBACK_ADDON_DATA_PATHS;
  };

  const getEffectClass = effect => {
    if (positiveEffects.has(effect)) return POLARITY.positive;
    if (negativeEffects.has(effect)) return POLARITY.negative;
    return '';
  };

  const getEffectMenuPriority = effect => {
    if (positiveEffects.has(effect)) return 0;
    if (negativeEffects.has(effect)) return 1;
    return 2;
  };

  const getIngredientClassFromState = ingredient => {
    if (!Object.prototype.hasOwnProperty.call(ingredient, 'effect_state')) return null;

    const state = Number(ingredient.effect_state);
    if (state === 1) return POLARITY.positive;
    if (state === -1) return POLARITY.negative;
    if (state === 0) return POLARITY.mixed;
    return null;
  };

  const getIngredientClass = ingredient => {
    const stateClass = getIngredientClassFromState(ingredient);
    if (stateClass) return stateClass;

    const hasPositive = ingredient.effects.some(effect => positiveEffects.has(effect));
    const hasNegative = ingredient.effects.some(effect => negativeEffects.has(effect));

    if (hasPositive && hasNegative) return POLARITY.mixed;
    if (hasPositive) return POLARITY.positive;
    if (hasNegative) return POLARITY.negative;
    return '';
  };

  const getSelectionClass = (ingredient, event) => {
    const ingredientClass = getIngredientClass(ingredient);

    if (selectedPolarity) {
      return ingredientClass === selectedPolarity || ingredientClass === POLARITY.mixed ? selectedPolarity : '';
    }

    if (ingredientClass !== POLARITY.mixed) {
      return ingredientClass;
    }

    const clickOffset = event.pageX - $(event.currentTarget).offset().left;
    return clickOffset < $(event.currentTarget).width() / 2 ? POLARITY.negative : POLARITY.positive;
  };

  const createCell = ({ text, className = '', data = {} }) => $('<td>')
    .text(text)
    .addClass(className)
    .data(data);

  const createEffectCell = (effect, isClickable = false, highlightedEffects = new Set()) => {
    const effectClass = getEffectClass(effect);
    const hintClass = highlightedEffects.has(effect) && effectClass ? `hint-${effectClass}` : '';
    const $cell = createCell({
      text: effect,
      className: `${effectClass} ${hintClass}`,
      data: { effect }
    });

    if (isClickable) {
      $cell.addClass('effect-cell');
    }

    return $cell;
  };

  const createIngredientRow = (ingredient, options = {}) => {
    const {
      firstCellClass,
      effects = ingredient.effects,
      highlightedEffects = new Set(),
      isEffectClickable = false
    } = options;
    const $row = $('<tr>');
    const ingredientClass = firstCellClass ?? selectedClasses.get(ingredient.name) ?? getIngredientClass(ingredient);

    $row.append(createCell({
      text: ingredient.name,
      className: ingredientClass,
      data: { name: ingredient.name }
    }));

    effects.forEach(effect => {
      $row.append(createEffectCell(effect, isEffectClickable, highlightedEffects));
    });

    return $row;
  };

  const getBrewResultEffects = selectedIngredients => {
    const effectCounts = new Map();

    selectedIngredients.forEach(ingredient => {
      new Set(ingredient.effects).forEach(effect => {
        effectCounts.set(effect, (effectCounts.get(effect) || 0) + 1);
      });
    });

    return Array.from(effectCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([effect]) => effect)
      .sort(compareRu);
  };

  const getEffectMatchesPolarity = (effect, polarity) => {
    if (polarity === POLARITY.positive) return positiveEffects.has(effect);
    if (polarity === POLARITY.negative) return negativeEffects.has(effect);
    return false;
  };

  const getEffectMatchesSelectedPolarity = effect => getEffectMatchesPolarity(effect, selectedPolarity);

  const getOppositePolarity = polarity => {
    if (polarity === POLARITY.positive) return POLARITY.negative;
    if (polarity === POLARITY.negative) return POLARITY.positive;
    return '';
  };

  const getOppositeMatchedEffects = selectedIngredients => {
    const oppositePolarity = getOppositePolarity(selectedPolarity);

    if (!selectedEffect || !oppositePolarity || !selectedIngredients.length) {
      return new Set();
    }

    const matchedEffects = new Set();

    selectedIngredients.forEach(ingredient => {
      ingredient.effects.forEach(effect => {
        if (getEffectMatchesPolarity(effect, oppositePolarity)) {
          matchedEffects.add(effect);
        }
      });
    });

    return matchedEffects;
  };

  const orderEffectsByPriority = (effects, getPriority) => effects
    .map((effect, index) => ({ effect, index, priority: getPriority(effect) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(item => item.effect);

  const orderSelectedEffects = (effects, matchedEffects) => {
    if (!selectedPolarity) {
      return orderEffectsByPriority(effects, effect => (matchedEffects.has(effect) ? 0 : 1));
    }

    return orderEffectsByPriority(effects, effect => {
      if (!getEffectMatchesSelectedPolarity(effect)) return 2;
      return matchedEffects.has(effect) ? 0 : 1;
    });
  };

  const orderCombinationEffects = (effects, matchedEffects) => orderEffectsByPriority(effects, effect => {
    if (matchedEffects.has(effect)) return 0;
    if (getEffectMatchesSelectedPolarity(effect)) return 1;
    return 2;
  });

  const orderBrewResultEffects = effects => {
    if (!selectedPolarity) return effects;

    return orderEffectsByPriority(effects, effect => (getEffectMatchesSelectedPolarity(effect) ? 0 : 1));
  };

  const createBrewResultRow = selectedIngredients => {
    const resultEffects = orderBrewResultEffects(getBrewResultEffects(selectedIngredients));
    const $row = $('<tr>').addClass('brew-result-row');

    $('<td>')
      .addClass(`brew-result-label ${selectedPolarity ? `hint-${selectedPolarity}` : ''}`)
      .text('У вас получится:')
      .appendTo($row);

    if (selectedIngredients.length < 2) {
      createCell({ text: 'Выберите еще ингредиент', className: 'brew-result-effects' }).appendTo($row);
    } else if (!resultEffects.length) {
      createCell({ text: 'Нет совпадающих эффектов', className: 'brew-result-effects' }).appendTo($row);
    } else {
      resultEffects.slice(0, 4).forEach(effect => {
        const effectClass = getEffectClass(effect);
        createCell({
          text: effect,
          className: `brew-result-effects effect-cell ${effectClass} ${effectClass ? `hint-${effectClass}` : ''}`,
          data: { effect }
        }).appendTo($row);
      });
    }

    while ($row.children('td').length < 5) {
      createCell({ text: '', className: 'brew-result-effects' }).appendTo($row);
    }

    return $row;
  };

  const rebuildIndexes = () => {
    ingredientByName = new Map();
    namesByEffect = new Map();

    ingredients.forEach(ingredient => {
      ingredientByName.set(ingredient.name, ingredient);

      ingredient.effects.forEach(effect => {
        if (!namesByEffect.has(effect)) {
          namesByEffect.set(effect, new Set());
        }

        namesByEffect.get(effect).add(ingredient.name);
      });
    });
  };

  const getVisibleIngredients = () => ingredients.filter(ingredient => {
    if (selectedNames.has(ingredient.name)) return false;
    if (selectedEffect && !ingredient.effects.includes(selectedEffect)) return false;
    if (searchQuery && !ingredient.name.toLowerCase().includes(searchQuery)) return false;
    return true;
  });

  const updateFilterControls = () => {
    $backBtn.toggle(Boolean(selectedEffect));
    $effectTitleText.text(selectedEffect || '');
    $effectTitle.css('display', selectedEffect ? 'flex' : 'none');
    $mainHintRow.toggle(!selectedEffect || selectedNames.size === 0);
  };

  const renderEffectsMenu = () => {
    const effects = Array.from(namesByEffect.keys())
      .sort((a, b) => getEffectMenuPriority(a) - getEffectMenuPriority(b) || compareRu(a, b));
    const fragment = document.createDocumentFragment();

    $('<input>')
      .attr({
        type: 'text',
        placeholder: 'Поиск по названию...',
        autocomplete: 'off'
      })
      .addClass('effect-search')
      .appendTo(fragment);

    effects.forEach(effect => {
      $('<button>')
        .attr('type', 'button')
        .addClass('effect-btn')
        .addClass(getEffectClass(effect))
        .text(effect)
        .appendTo(fragment);
    });

    $effectsMenu.empty().append(fragment);
  };

  const renderTable = () => {
    const fragment = document.createDocumentFragment();
    const visibleIngredients = getVisibleIngredients();
    const selectedIngredients = Array.from(selectedNames)
      .map(name => ingredientByName.get(name))
      .filter(Boolean);
    const oppositeMatchedEffects = getOppositeMatchedEffects(selectedIngredients);

    visibleIngredients.forEach(ingredient => {
      const effects = selectedEffect
        ? [selectedEffect, ...ingredient.effects.filter(effect => effect !== selectedEffect)]
        : ingredient.effects;
      const highlightedEffects = selectedEffect
        ? new Set(ingredient.effects.filter(effect => oppositeMatchedEffects.has(effect)))
        : new Set();

      createIngredientRow(ingredient, {
        effects,
        highlightedEffects,
        isEffectClickable: true
      }).appendTo(fragment);
    });

    $dataTableBody.empty().append(fragment);
    $visibleCount.text(visibleIngredients.length);
    updateFilterControls();
  };

  const renderSelectionTable = () => {
    const fragment = document.createDocumentFragment();
    const selectedIngredients = Array.from(selectedNames)
      .map(name => ingredientByName.get(name))
      .filter(Boolean);
    const matchedEffects = new Set(getBrewResultEffects(selectedIngredients));

    if (selectedIngredients.length) {
      createBrewResultRow(selectedIngredients).appendTo(fragment);
    }

    selectedIngredients.forEach(ingredient => {
      const $row = createIngredientRow(ingredient, {
        firstCellClass: selectedClasses.get(ingredient.name) || getIngredientClass(ingredient),
        effects: orderSelectedEffects(ingredient.effects, matchedEffects),
        isEffectClickable: true
      });
      const $nameCell = $row.find('td:first-child');

      $nameCell.empty().append(
        $('<div>').addClass('selected-name-content').append(
          $('<span>').text(ingredient.name),
          $('<button>')
            .attr('type', 'button')
            .addClass('remove-btn')
            .data('name', ingredient.name)
            .text('Удалить')
        )
      );

      $row.appendTo(fragment);
    });

    $selectionTableBody.empty().append(fragment);
    $selectionTable.toggle(selectedIngredients.length > 0);
    $selectionTitle.toggle(selectedIngredients.length > 0);
  };

  const renderCombinationTable = () => {
    const selectedIngredients = Array.from(selectedNames)
      .map(name => ingredientByName.get(name))
      .filter(Boolean);

    if (!selectedIngredients.length || !selectedPolarity) {
      $combinationTableBody.empty();
      $combinationTable.hide();
      $combinationTitle.hide().text('');
      return;
    }

    const effectsToShow = new Set();
    const effectsToExclude = new Set();
    const effectPriority = new Map();

    selectedIngredients.forEach(ingredient => {
      ingredient.effects.forEach(effect => {
        if (selectedPolarity === POLARITY.positive && positiveEffects.has(effect)) {
          effectsToShow.add(effect);
          if (!effectPriority.has(effect)) {
            effectPriority.set(effect, effectPriority.size);
          }
          return;
        }

        if (selectedPolarity === POLARITY.negative && negativeEffects.has(effect)) {
          effectsToShow.add(effect);
          if (!effectPriority.has(effect)) {
            effectPriority.set(effect, effectPriority.size);
          }
          return;
        }

        effectsToExclude.add(effect);
      });
    });

    const candidateNames = new Set();

    effectsToShow.forEach(effect => {
      (namesByEffect.get(effect) || []).forEach(name => {
        if (!selectedNames.has(name)) {
          candidateNames.add(name);
        }
      });
    });

    const finalCombinationNames = Array.from(candidateNames)
      .filter(name => {
        const ingredient = ingredientByName.get(name);
        return ingredient && !ingredient.effects.some(effect => effectsToExclude.has(effect));
      })
      .sort((leftName, rightName) => {
        const leftIngredient = ingredientByName.get(leftName);
        const rightIngredient = ingredientByName.get(rightName);
        const getMatchedEffects = ingredient => ingredient.effects.filter(effect => effectsToShow.has(effect));
        const getMultiMatchPriority = matchedEffects => (matchedEffects.length > 1 ? 0 : 1);
        const getMatchPriority = matchedEffects => Math.min(
          ...matchedEffects.map(effect => effectPriority.get(effect) ?? Number.POSITIVE_INFINITY)
        );
        const leftMatchedEffects = getMatchedEffects(leftIngredient);
        const rightMatchedEffects = getMatchedEffects(rightIngredient);
        const leftPriority = getMatchPriority(leftMatchedEffects);
        const rightPriority = getMatchPriority(rightMatchedEffects);

        return getMultiMatchPriority(leftMatchedEffects) - getMultiMatchPriority(rightMatchedEffects)
          || leftPriority - rightPriority
          || compareRu(leftName, rightName);
      });

    const fragment = document.createDocumentFragment();

    finalCombinationNames.forEach(name => {
      const ingredient = ingredientByName.get(name);
      const matchedEffects = new Set(ingredient.effects.filter(effect => effectsToShow.has(effect)));

      createIngredientRow(ingredient, {
        effects: orderCombinationEffects(ingredient.effects, effectsToShow),
        highlightedEffects: matchedEffects.size > 1 ? matchedEffects : new Set()
      }).appendTo(fragment);
    });

    const excludedMatchMessage = selectedPolarity === POLARITY.positive
      ? 'Исключены отрицательные совпадения'
      : 'Исключены положительные совпадения';

    $combinationTableBody.empty().append(fragment);
    $combinationTitle
      .text(`Сочетается с ${selectedIngredients.map(ingredient => ingredient.name).join(' / ')}, ${finalCombinationNames.length}. ${excludedMatchMessage}`)
      .toggle(finalCombinationNames.length > 0);
    $combinationTable.toggle(finalCombinationNames.length > 0);
  };

  const renderAllTables = () => {
    renderSelectionTable();
    renderCombinationTable();
    renderTable();
  };

  const canAddIngredient = ingredient => {
    if (!ingredient || selectedNames.has(ingredient.name)) return false;
    if (selectedNames.size >= MAX_SELECTION_COUNT) return false;
    if (!selectedPolarity) return true;

    const ingredientClass = getIngredientClass(ingredient);

    if (selectedPolarity === POLARITY.positive) {
      return ingredientClass === POLARITY.positive || ingredientClass === POLARITY.mixed;
    }

    return ingredientClass === POLARITY.negative || ingredientClass === POLARITY.mixed;
  };

  const addIngredient = (name, event) => {
    const ingredient = ingredientByName.get(name);

    if (!canAddIngredient(ingredient)) return;

    const selectionClass = getSelectionClass(ingredient, event);
    if (!selectionClass) return;

    selectedNames.add(name);
    selectedClasses.set(name, selectionClass);

    if (!selectedPolarity) {
      selectedPolarity = selectionClass;
    }

    $('html, body').animate({ scrollTop: 0 }, 'fast');
    renderAllTables();
  };

  const removeIngredient = name => {
    selectedNames.delete(name);
    selectedClasses.delete(name);

    if (selectedNames.size === 0) {
      selectedPolarity = null;
    }

    renderAllTables();
  };

  const clearSelection = () => {
    selectedNames.clear();
    selectedClasses.clear();
    selectedPolarity = null;
    renderAllTables();
  };

  const setSelectedEffect = effect => {
    selectedEffect = effect;
    renderTable();
  };

  const scrollToEffectTable = () => {
    const $target = $effectTitle.is(':visible') ? $effectTitle : $('#data-table');
    const top = $target.offset()?.top;

    if (typeof top === 'number') {
      $('html, body').animate({ scrollTop: Math.max(top - 8, 0) }, 'fast');
    }
  };

  const setSelectedEffectAndScroll = effect => {
    setSelectedEffect(effect);
    scrollToEffectTable();
  };

  const clearSelectedEffect = () => {
    selectedEffect = null;
    searchQuery = '';
    $search.val('');
    renderTable();
  };

  const showMessageRow = message => {
    $dataTableBody.empty().append(
      $('<tr>').append(
        $('<td>')
          .attr('colspan', 5)
          .text(message)
      )
    );
  };

  const showLoadError = () => {
    showMessageRow('Не удалось загрузить данные. Проверьте файлы в папке data.');
  };

  const createRootSourceDefinition = () => ({
    id: ROOT_DATA_PATH,
    dataPath: ROOT_DATA_PATH,
    effectsPath: ROOT_EFFECTS_PATH,
    translationsPath: getEffectTranslationsPath(ROOT_DATA_PATH),
    name: 'Стандартный data.json',
    root: true,
    required: true
  });

  const getAddonIsActive = addon => (rootDataEnabled && addon.defaultEnabled) || selectedAddonIds.has(addon.id);

  const getActiveSourceDefinitions = () => {
    const sources = [];

    if (rootDataEnabled) {
      sources.push(createRootSourceDefinition());
    }

    availableAddons.forEach(addon => {
      if (getAddonIsActive(addon)) {
        sources.push(addon);
      }
    });

    return sources;
  };

  const getSourceEntry = source => sourceCache.get(source.id);
  const isSourceLoaded = source => getSourceEntry(source)?.status === SOURCE_STATUS.loaded;

  const getLoadedActiveSourceDefinitions = () => getActiveSourceDefinitions()
    .filter(isSourceLoaded);

  const getOrCreateSourceEntry = source => {
    if (!sourceCache.has(source.id)) {
      sourceCache.set(source.id, {
        id: source.id,
        data: [],
        effects: null,
        polarity: null,
        translations: new Map(),
        status: SOURCE_STATUS.idle,
        error: null,
        promise: null
      });
    }

    return sourceCache.get(source.id);
  };

  const rememberSourceCount = (source, data) => {
    const count = Array.isArray(data) ? data.length : 0;

    if (source.root) {
      rootIngredientCount = count;
      return;
    }

    addonIngredientCounts.set(source.id, count);
  };

  const getUniqueEffects = effects => Array.from(new Set(
    effects.filter(effect => typeof effect === 'string' && effect)
  ));

  const buildEffectsByIngredientName = effectsData => {
    const effectsByName = new Map();

    if (!Array.isArray(effectsData)) {
      return effectsByName;
    }

    effectsData.forEach(entry => {
      if (!entry || typeof entry.effect !== 'string' || !Array.isArray(entry.names)) return;

      entry.names.forEach(name => {
        if (typeof name !== 'string' || !name) return;

        if (!effectsByName.has(name)) {
          effectsByName.set(name, []);
        }

        effectsByName.get(name).push(entry.effect);
      });
    });

    effectsByName.forEach((effects, name) => {
      effectsByName.set(name, getUniqueEffects(effects));
    });

    return effectsByName;
  };

  const normalizeSourceData = (data, effectsData) => {
    const effectsByName = buildEffectsByIngredientName(effectsData);

    return data
      .filter(ingredient => ingredient && typeof ingredient.name === 'string' && ingredient.name)
      .map(ingredient => {
        const ingredientEffects = Array.isArray(ingredient.effects)
          ? getUniqueEffects(ingredient.effects)
          : [];
        const effects = ingredientEffects.length
          ? ingredientEffects
          : effectsByName.get(ingredient.name) || [];

        return { ...ingredient, effects };
      });
  };

  const normalizeEffectTranslations = translationsData => {
    const translations = new Map();

    if (!translationsData || typeof translationsData !== 'object' || Array.isArray(translationsData)) {
      return translations;
    }

    Object.entries(translationsData).forEach(([sourceEffect, targetEffect]) => {
      if (typeof sourceEffect === 'string' && typeof targetEffect === 'string') {
        translations.set(sourceEffect, targetEffect);
      }
    });

    return translations;
  };

  const translateEffects = (effects, translations) => {
    if (!translations.size) return effects;

    return getUniqueEffects(effects.map(effect => translations.get(effect) || effect));
  };

  const ensureRootPolarityLoaded = async () => {
    if (rootPolarityStatus === SOURCE_STATUS.loaded) {
      return rootPolarityData;
    }

    if (rootPolarityStatus === SOURCE_STATUS.loading) {
      return rootPolarityPromise;
    }

    rootPolarityStatus = SOURCE_STATUS.loading;
    rootPolarityPromise = fetchJson(ROOT_EFFECT_POLARITY_PATH)
      .then(data => {
        rootPolarityData = data;
        rootPolarityStatus = SOURCE_STATUS.loaded;
        return data;
      })
      .catch(error => {
        rootPolarityStatus = SOURCE_STATUS.error;
        rootPolarityPromise = null;
        throw error;
      });

    return rootPolarityPromise;
  };

  const ensureSourceLoaded = async source => {
    const entry = getOrCreateSourceEntry(source);

    if (entry.status === SOURCE_STATUS.loaded) {
      return entry;
    }

    if (entry.status === SOURCE_STATUS.loading) {
      return entry.promise;
    }

    entry.status = SOURCE_STATUS.loading;
    entry.error = null;
    renderAddons();

    entry.promise = (async () => {
      try {
        const [data, effects, polarity, translations] = await Promise.all([
          source.root ? fetchJson(source.dataPath) : fetchOptionalJson(source.dataPath),
          fetchOptionalJson(source.effectsPath),
          source.root ? Promise.resolve(null) : fetchOptionalJson(source.polarityPath),
          fetchOptionalJson(source.translationsPath)
        ]);

        if (!Array.isArray(data)) {
          throw new Error(`Не удалось загрузить ${source.dataPath}`);
        }

        entry.data = normalizeSourceData(data, effects);
        entry.effects = Array.isArray(effects) ? effects : null;
        entry.polarity = polarity;
        entry.translations = normalizeEffectTranslations(translations);
        entry.status = SOURCE_STATUS.loaded;
        entry.error = null;
        rememberSourceCount(source, entry.data);
      } catch (error) {
        entry.data = [];
        entry.effects = null;
        entry.polarity = null;
        entry.translations = new Map();
        entry.status = SOURCE_STATUS.error;
        entry.error = error;

        if (source.required) {
          throw error;
        }

        console.warn(`Не удалось загрузить дополнение ${source.dataPath}`, error);
      } finally {
        entry.promise = null;
        renderAddons();
      }

      return entry;
    })();

    return entry.promise;
  };

  const addEffectPolarityData = (dataSet, polarityByEffect) => {
    if (!dataSet) return;

    (dataSet.positive_effects || []).forEach(effect => {
      polarityByEffect.set(effect, POLARITY.positive);
    });

    (dataSet.negative_effects || []).forEach(effect => {
      polarityByEffect.set(effect, POLARITY.negative);
    });
  };

  const rebuildCurrentData = () => {
    const mergedByName = new Map();
    const polarityByEffect = new Map();
    const activeSources = getLoadedActiveSourceDefinitions();
    const effectTranslations = new Map();

    addEffectPolarityData(rootPolarityData, polarityByEffect);

    activeSources.forEach(source => {
      const entry = getSourceEntry(source);

      entry.translations.forEach((targetEffect, sourceEffect) => {
        effectTranslations.set(sourceEffect, targetEffect);
      });
    });

    activeSources.forEach(source => {
      const entry = getSourceEntry(source);

      entry.data.forEach(ingredient => {
        if (!ingredient || !ingredient.name || !Array.isArray(ingredient.effects)) return;

        mergedByName.set(ingredient.name, {
          ...ingredient,
          effects: translateEffects(ingredient.effects, effectTranslations)
        });
      });

      addEffectPolarityData(entry.polarity, polarityByEffect);
    });

    positiveEffects = new Set();
    negativeEffects = new Set();

    polarityByEffect.forEach((polarity, effect) => {
      if (polarity === POLARITY.positive) {
        positiveEffects.add(effect);
      }

      if (polarity === POLARITY.negative) {
        negativeEffects.add(effect);
      }
    });

    ingredients = Array.from(mergedByName.values())
      .sort((a, b) => compareRu(a.name, b.name));

    rebuildIndexes();
    reconcileSelectionWithLoadedData();
    renderEffectsMenu();
    renderAddons();
    renderAllTables();
  };

  const reconcileSelectionWithLoadedData = () => {
    selectedNames.forEach(name => {
      if (!ingredientByName.has(name)) {
        selectedNames.delete(name);
        selectedClasses.delete(name);
      }
    });

    if (selectedNames.size === 0) {
      selectedPolarity = null;
    }

    if (selectedEffect && !namesByEffect.has(selectedEffect)) {
      selectedEffect = null;
    }
  };

  const getRootAddonCountLabel = () => {
    if (!Number.isInteger(rootIngredientCount)) {
      return 'Стандартный data.json';
    }

    const hiddenAddonParts = availableAddons
      .filter(addon => addon.defaultEnabled)
      .map(addon => ({
        name: addon.name,
        count: addonIngredientCounts.get(addon.id)
      }))
      .filter(addon => Number.isInteger(addon.count));

    if (!hiddenAddonParts.length) {
      return `Стандартный data.json, ${rootIngredientCount}`;
    }

    const total = hiddenAddonParts.reduce((sum, addon) => sum + addon.count, rootIngredientCount);
    const formula = [
      rootIngredientCount,
      ...hiddenAddonParts.map(addon => `${addon.name} (${addon.count})`)
    ].join(' + ');

    return `Стандартный data.json, ${formula} = ${total}`;
  };

  const renderAddons = () => {
    const selectableAddons = availableAddons.filter(addon => addon.selectable);
    const fragment = document.createDocumentFragment();

    const $rootLabel = $('<label>')
      .addClass('addon-option')
      .attr('for', 'addon-root-data')
      .attr('title', ROOT_DATA_PATH);

    $('<input>')
      .attr({ type: 'checkbox', id: 'addon-root-data' })
      .data('baseData', true)
      .prop('checked', rootDataEnabled)
      .appendTo($rootLabel);

    $('<span>').text(getRootAddonCountLabel()).appendTo($rootLabel);
    $rootLabel.appendTo(fragment);

    selectableAddons.forEach((addon, index) => {
      const inputId = `addon-${index}`;
      const $label = $('<label>')
        .addClass('addon-option')
        .attr('for', inputId)
        .attr('title', addon.id);

      $('<input>')
        .attr({ type: 'checkbox', id: inputId })
        .data('addonId', addon.id)
        .prop('checked', selectedAddonIds.has(addon.id))
        .appendTo($label);

      const count = addonIngredientCounts.get(addon.id);
      const labelText = Number.isInteger(count) ? `${addon.name}, ${count}` : addon.name;

      $('<span>').text(labelText).appendTo($label);
      $label.appendTo(fragment);
    });

    $addonsList.empty().append(fragment);
    $addonsBtn.show();
  };

  const loadActiveData = async () => {
    const currentLoadToken = ++dataLoadToken;
    const activeSources = getActiveSourceDefinitions();
    const hasLoadedActiveSource = activeSources.some(isSourceLoaded);

    rebuildCurrentData();

    if (activeSources.length && !hasLoadedActiveSource) {
      showMessageRow('Загрузка данных...');
    }

    try {
      if (activeSources.length) {
        await ensureRootPolarityLoaded();
      }

      for (const source of activeSources) {
        if (currentLoadToken !== dataLoadToken) return;

        const wasLoaded = isSourceLoaded(source);
        const entry = await ensureSourceLoaded(source);

        if (currentLoadToken !== dataLoadToken) return;

        if (!wasLoaded && entry.status === SOURCE_STATUS.loaded) {
          rebuildCurrentData();
        }
      }

      if (currentLoadToken === dataLoadToken) {
        rebuildCurrentData();
      }
    } catch (error) {
      if (currentLoadToken !== dataLoadToken) return;
      console.error('Ошибка загрузки данных:', error);
      showLoadError();
    }
  };

  const initializeData = async () => {
    showMessageRow('Загрузка данных...');

    try {
      availableAddons = createAddonDefinitions(await discoverAddonDataPaths());
      selectedAddonIds = new Set(availableAddons.filter(addon => addon.selectable).map(addon => addon.id));
      renderAddons();
      await loadActiveData();
    } catch (error) {
      console.error('Ошибка инициализации данных:', error);
      showLoadError();
    }
  };

  const positionMenu = ($button, $menu) => {
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    $menu.css('left', isMobile ? 0 : $button.position().left);
  };

  const closeMenus = () => {
    $effectsMenu.hide();
    $addonsMenu.hide();
  };

  const toggleMenu = ($button, $menu) => {
    const shouldShow = !$menu.is(':visible');

    closeMenus();

    if (shouldShow) {
      positionMenu($button, $menu);
      $menu.show();
    }
  };

  $effectsMenu.hide();
  $addonsMenu.hide();

  $('#menu-btn').on('click', event => {
    event.stopPropagation();
    toggleMenu($('#menu-btn'), $effectsMenu);
  });

  $addonsBtn.on('click', event => {
    event.stopPropagation();
    toggleMenu($addonsBtn, $addonsMenu);
  });

  $('.menu').on('click', event => {
    event.stopPropagation();
  });

  $(document).on('click', closeMenus);

  $(document).on('keydown', event => {
    if (event.key === 'Escape') {
      closeMenus();
    }
  });

  $addonsList.on('change', 'input[type="checkbox"]', function () {
    if ($(this).data('baseData')) {
      rootDataEnabled = this.checked;
      loadActiveData();
      return;
    }

    const addonId = $(this).data('addonId');

    if (this.checked) {
      selectedAddonIds.add(addonId);
    } else {
      selectedAddonIds.delete(addonId);
    }

    loadActiveData();
  });

  $search.on('input', function () {
    searchQuery = normalizeSearch($(this).val());
    renderTable();
  });

  $backBtn.add($effectBackBtn).on('click', clearSelectedEffect);

  $dataTableBody.on('click', 'td:first-child', function (event) {
    addIngredient($(this).data('name'), event);
  });

  $combinationTableBody.on('click', 'td:first-child', function (event) {
    addIngredient($(this).data('name'), event);
  });

  $selectionTableBody.on('click', '.remove-btn', function () {
    removeIngredient($(this).data('name'));
  });

  $selectionTableBody.on('click', '.effect-cell', function () {
    setSelectedEffectAndScroll($(this).data('effect'));
  });

  $removeAllBtn.on('click', clearSelection);

  $effectsMenu.on('click', '.effect-btn', function () {
    setSelectedEffect($(this).text());
    closeMenus();
  });

  $effectsMenu.on('input', '.effect-search', function () {
    const query = normalizeSearch($(this).val());

    $effectsMenu.find('.effect-btn').each(function () {
      $(this).toggle(normalizeSearch($(this).text()).includes(query));
    });
  });

  $dataTableBody.on('click', '.effect-cell', function () {
    setSelectedEffect($(this).data('effect'));
  });

  initializeData();
});
