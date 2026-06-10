$(document).ready(() => {
  const MAX_SELECTION_COUNT = 3;
  const POLARITY = {
    positive: 'positive',
    negative: 'negative',
    mixed: 'mixed'
  };

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

  const $effectsMenu = $('#effects-menu');
  const $dataTableBody = $('#data-table tbody');
  const $selectionTableBody = $('#selection-table tbody');
  const $combinationTableBody = $('#combination-table tbody');
  const $search = $('#search');
  const $backBtn = $('#back-btn');
  const $selectionTable = $('#selection-table');
  const $combinationTable = $('#combination-table');
  const $removeAllBtn = $('#remove-all-btn');

  const normalizeSearch = value => value.trim().toLowerCase();

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
  };

  const renderEffectsMenu = () => {
    const effects = Array.from(namesByEffect.keys()).sort((a, b) => a.localeCompare(b, 'ru'));
    const fragment = document.createDocumentFragment();

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

    getVisibleIngredients().forEach(ingredient => {
      const effects = selectedEffect
        ? [selectedEffect, ...ingredient.effects.filter(effect => effect !== selectedEffect)]
        : ingredient.effects;

      createIngredientRow(ingredient, { effects, isEffectClickable: true }).appendTo(fragment);
    });

    $dataTableBody.empty().append(fragment);
    updateFilterControls();
  };

  const renderSelectionTable = () => {
    const fragment = document.createDocumentFragment();

    selectedNames.forEach(name => {
      const ingredient = ingredientByName.get(name);
      if (!ingredient) return;

      const $row = createIngredientRow(ingredient, {
        firstCellClass: selectedClasses.get(name) || getIngredientClass(ingredient)
      });
      const $nameCell = $row.find('td:first-child');

      $nameCell.empty().append(
        $('<span>').text(name),
        $('<button>')
          .attr('type', 'button')
          .addClass('remove-btn')
          .data('name', name)
          .text('Удалить')
      );

      $row.appendTo(fragment);
    });

    $selectionTableBody.empty().append(fragment);
    $selectionTable.toggle(selectedNames.size > 0);
  };

  const renderCombinationTable = () => {
    const selectedIngredients = Array.from(selectedNames)
      .map(name => ingredientByName.get(name))
      .filter(Boolean);

    if (!selectedIngredients.length || !selectedPolarity) {
      $combinationTableBody.empty();
      $combinationTable.hide();
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
      .sort((a, b) => a.localeCompare(b, 'ru'));

    const fragment = document.createDocumentFragment();

    finalCombinationNames.forEach(name => {
      const ingredient = ingredientByName.get(name);
      createIngredientRow(ingredient).appendTo(fragment);
    });

    $combinationTableBody.empty().append(fragment);
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

  const showLoadError = () => {
    $dataTableBody.empty().append(
      $('<tr>').append(
        $('<td>')
          .attr('colspan', 5)
          .text('Не удалось загрузить данные. Проверьте файлы в папке data.')
      )
    );
  };

  const loadData = async () => {
    try {
      const [dataResponse, effectsResponse] = await Promise.all([
        $.getJSON('data/data.json'),
        $.getJSON('data/positive_negative_data.json')
      ]);

      ingredients = dataResponse;
      positiveEffects = new Set(effectsResponse.positive_effects || []);
      negativeEffects = new Set(effectsResponse.negative_effects || []);

      rebuildIndexes();
      renderEffectsMenu();
      renderAllTables();
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      showLoadError();
    }
  };

  $effectsMenu.hide();

  $('#menu-btn').on('click', () => $effectsMenu.toggle());

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

  $(document).on('click', '.effect-btn', function () {
    setSelectedEffect($(this).text());
    $effectsMenu.hide();
  });

  $dataTableBody.on('click', '.effect-cell', function () {
    setSelectedEffect($(this).data('effect'));
  });

  loadData();
});
