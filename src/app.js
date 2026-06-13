$(document).ready(() => {
  const MAX_SELECTION_COUNT = 3;
  const DATA_ROOT = 'data';
  const DATA_FILE_NAME = 'data.json';
  const EFFECT_POLARITY_FILE_NAME = 'positive_negative_data.json';
  const ROOT_DATA_PATH = `${DATA_ROOT}/${DATA_FILE_NAME}`;
  const ROOT_EFFECT_POLARITY_PATH = `${DATA_ROOT}/${EFFECT_POLARITY_FILE_NAME}`;
  const POLARITY = {
    positive: 'positive',
    negative: 'negative',
    mixed: 'mixed'
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

  const fetchOptionalAddonDataSets = async paths => {
    const responses = await Promise.all(paths.map(async path => ({
      path,
      data: await fetchOptionalJson(path)
    })));

    return responses.filter(response => response.data);
  };

  const uniqueSortedPaths = paths => Array.from(new Set(paths))
    .filter(path => path && path !== ROOT_DATA_PATH)
    .sort(compareRu);

  const getFolderNameFromDataPath = dataPath => {
    const parts = dataPath.split('/');
    return parts.length >= 2 ? parts[parts.length - 2] : '';
  };

  const getDirectoryPathFromDataPath = dataPath => dataPath.replace(/\/data\.json$/i, '');

  const createAddonDefinitions = dataPaths => uniqueSortedPaths(dataPaths)
    .map(dataPath => {
      const directoryPath = getDirectoryPathFromDataPath(dataPath);
      const folderName = getFolderNameFromDataPath(dataPath);
      const normalizedFolderName = normalizeAddonKey(folderName);
      const defaultEnabled = DEFAULT_ENABLED_ADDON_FOLDERS.has(normalizedFolderName);

      return {
        id: directoryPath,
        dataPath,
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

  const getIngredientClass = ingredient => {
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

  const createEffectCell = (effect, isClickable = false) => {
    const $cell = createCell({ text: effect, className: getEffectClass(effect), data: { effect } });

    if (isClickable) {
      $cell.addClass('effect-cell');
    }

    return $cell;
  };

  const createIngredientRow = (ingredient, options = {}) => {
    const { firstCellClass, effects = ingredient.effects, isEffectClickable = false } = options;
    const $row = $('<tr>');
    const ingredientClass = firstCellClass ?? selectedClasses.get(ingredient.name) ?? getIngredientClass(ingredient);

    $row.append(createCell({
      text: ingredient.name,
      className: ingredientClass,
      data: { name: ingredient.name }
    }));

    effects.forEach(effect => {
      $row.append(createEffectCell(effect, isEffectClickable));
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

  const createBrewResultRow = selectedIngredients => {
    const resultEffects = getBrewResultEffects(selectedIngredients);
    const $row = $('<tr>').addClass('brew-result-row');

    $('<td>')
      .addClass('brew-result-label')
      .text('У вас получится:')
      .appendTo($row);

    if (selectedIngredients.length < 2) {
      createCell({ text: 'Выберите еще ингредиент', className: 'brew-result-effects' }).appendTo($row);
    } else if (!resultEffects.length) {
      createCell({ text: 'Нет совпадающих эффектов', className: 'brew-result-effects' }).appendTo($row);
    } else {
      resultEffects.slice(0, 4).forEach(effect => {
        createCell({ text: effect, className: `brew-result-effects ${getEffectClass(effect)}` }).appendTo($row);
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
    $effectTitle.text(selectedEffect || '').toggle(Boolean(selectedEffect));
    $mainHintRow.toggle(!selectedEffect);
  };

  const renderEffectsMenu = () => {
    const effects = Array.from(namesByEffect.keys()).sort(compareRu);
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
        .text(effect)
        .appendTo(fragment);
    });

    $effectsMenu.empty().append(fragment);
  };

  const renderTable = () => {
    const fragment = document.createDocumentFragment();
    const visibleIngredients = getVisibleIngredients();

    visibleIngredients.forEach(ingredient => {
      const effects = selectedEffect
        ? [selectedEffect, ...ingredient.effects.filter(effect => effect !== selectedEffect)]
        : ingredient.effects;

      createIngredientRow(ingredient, { effects, isEffectClickable: true }).appendTo(fragment);
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

    if (selectedIngredients.length) {
      createBrewResultRow(selectedIngredients).appendTo(fragment);
    }

    selectedIngredients.forEach(ingredient => {
      const $row = createIngredientRow(ingredient, {
        firstCellClass: selectedClasses.get(ingredient.name) || getIngredientClass(ingredient)
      });
      const $nameCell = $row.find('td:first-child');

      $nameCell.empty().append(
        $('<span>').text(ingredient.name),
        $('<button>')
          .attr('type', 'button')
          .addClass('remove-btn')
          .data('name', ingredient.name)
          .text('Удалить')
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

    selectedIngredients.forEach(ingredient => {
      ingredient.effects.forEach(effect => {
        if (selectedPolarity === POLARITY.positive && positiveEffects.has(effect)) {
          effectsToShow.add(effect);
          return;
        }

        if (selectedPolarity === POLARITY.negative && negativeEffects.has(effect)) {
          effectsToShow.add(effect);
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
      .sort(compareRu);

    const fragment = document.createDocumentFragment();

    finalCombinationNames.forEach(name => {
      const ingredient = ingredientByName.get(name);
      createIngredientRow(ingredient).appendTo(fragment);
    });

    const excludedMatchMessage = selectedPolarity === POLARITY.positive
      ? 'Исключены отрицательные совпадения.'
      : 'Исключены положительные совпадения.';

    $combinationTableBody.empty().append(fragment);
    $combinationTitle
      .text(`Сочетается с ${selectedIngredients.map(ingredient => ingredient.name).join(' / ')}. ${excludedMatchMessage}`)
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

  const mergeIngredients = dataSets => {
    const mergedByName = new Map();

    dataSets.forEach(dataSet => {
      if (!Array.isArray(dataSet)) return;

      dataSet.forEach(ingredient => {
        if (!ingredient || !ingredient.name || !Array.isArray(ingredient.effects)) return;
        mergedByName.set(ingredient.name, ingredient);
      });
    });

    return Array.from(mergedByName.values())
      .sort((a, b) => compareRu(a.name, b.name));
  };

  const mergeEffectPolarity = dataSets => {
    const polarityByEffect = new Map();

    dataSets.forEach(dataSet => {
      if (!dataSet) return;

      (dataSet.positive_effects || []).forEach(effect => {
        polarityByEffect.set(effect, POLARITY.positive);
      });

      (dataSet.negative_effects || []).forEach(effect => {
        polarityByEffect.set(effect, POLARITY.negative);
      });
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

  const getActiveAddonDataPaths = () => availableAddons
    .filter(addon => (rootDataEnabled && addon.defaultEnabled) || selectedAddonIds.has(addon.id))
    .map(addon => addon.dataPath);

  const getEffectPolarityPath = dataPath => dataPath.replace(/data\.json$/i, EFFECT_POLARITY_FILE_NAME);

  const setAddonControlsDisabled = disabled => {
    $addonsList.find('input[type="checkbox"]').prop('disabled', disabled);
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
    const activeAddonDataPaths = getActiveAddonDataPaths();
    const effectPolarityPaths = [ROOT_EFFECT_POLARITY_PATH, ...activeAddonDataPaths.map(getEffectPolarityPath)];

    showMessageRow('Загрузка данных...');
    setAddonControlsDisabled(true);

    try {
      const [rootDataSet, addonDataSets, effectPolaritySets] = await Promise.all([
        rootDataEnabled ? fetchJson(ROOT_DATA_PATH) : Promise.resolve([]),
        fetchOptionalAddonDataSets(activeAddonDataPaths),
        Promise.all(effectPolarityPaths.map((path, index) => (
          index === 0 ? fetchJson(path) : fetchOptionalJson(path)
        )))
      ]);

      if (currentLoadToken !== dataLoadToken) return;

      if (rootDataEnabled && Array.isArray(rootDataSet)) {
        rootIngredientCount = rootDataSet.length;
      }

      addonDataSets.forEach(({ path, data }) => {
        addonIngredientCounts.set(getDirectoryPathFromDataPath(path), Array.isArray(data) ? data.length : 0);
      });

      renderAddons();
      ingredients = mergeIngredients([rootDataSet, ...addonDataSets.map(({ data }) => data)]);
      mergeEffectPolarity(effectPolaritySets);
      rebuildIndexes();
      reconcileSelectionWithLoadedData();
      renderEffectsMenu();
      renderAllTables();
    } catch (error) {
      if (currentLoadToken !== dataLoadToken) return;
      console.error('Ошибка загрузки данных:', error);
      showLoadError();
    } finally {
      if (currentLoadToken === dataLoadToken) {
        setAddonControlsDisabled(false);
      }
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

  $backBtn.on('click', clearSelectedEffect);

  $dataTableBody.on('click', 'td:first-child', function (event) {
    addIngredient($(this).data('name'), event);
  });

  $combinationTableBody.on('click', 'td:first-child', function (event) {
    addIngredient($(this).data('name'), event);
  });

  $selectionTableBody.on('click', '.remove-btn', function () {
    removeIngredient($(this).data('name'));
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
