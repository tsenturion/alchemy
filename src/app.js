$(document).ready(() => {
  const config = window.AlchemyConfig;
  const state = window.AlchemyState.create(config);
  const logic = window.AlchemyLogic.create(config, state);
  const renderer = window.AlchemyRenderer.create(config, state, logic);
  const dataLoader = window.AlchemyDataLoader.create(config, state, logic, renderer);
  const { dom } = renderer;

  const renderTable = () => {
    renderer.renderTable();
  };

  const renderAllTables = () => {
    renderer.renderAllTables();
  };

  const addIngredient = (name, selectionPolarity = '') => {
    const ingredient = state.ingredientByName.get(name);

    if (!logic.canAddIngredient(ingredient)) return;

    const selectionClass = logic.getSelectionClass(ingredient, selectionPolarity);
    if (!selectionClass) return;

    state.selectedNames.add(name);
    state.selectedClasses.set(name, selectionClass);

    if (!state.selectedPolarity) {
      state.selectedPolarity = selectionClass;
    }

    $('html, body').animate({ scrollTop: 0 }, 'fast');
    renderAllTables();
  };

  const getIngredientSelectionPolarity = ($button, event, $selectionArea = $button) => {
    const selectionPolarity = $button.data('selectionPolarity');

    if (selectionPolarity) return selectionPolarity;
    if (!$button.data('mixedSelection')) return '';

    const clickOffset = event.pageX - $selectionArea.offset().left;
    return clickOffset < $selectionArea.outerWidth() / 2
      ? config.POLARITY.negative
      : config.POLARITY.positive;
  };

  const handleIngredientActionCell = ($cell, event) => {
    const $button = $cell.find('.ingredient-add-btn');
    if (!$button.length) return false;

    addIngredient(
      $button.data('name'),
      getIngredientSelectionPolarity($button, event, $cell)
    );
    return true;
  };

  const handleEffectActionCell = ($cell, onEffect) => {
    const $button = $cell.find('.effect-cell');
    if (!$button.length) return false;

    onEffect($button.data('effect'));
    return true;
  };

  const removeIngredient = name => {
    state.selectedNames.delete(name);
    state.selectedClasses.delete(name);

    if (state.selectedNames.size === 0) {
      state.selectedPolarity = null;
    }

    renderAllTables();
  };

  const clearSelection = () => {
    state.selectedNames.clear();
    state.selectedClasses.clear();
    state.selectedPolarity = null;
    renderAllTables();
  };

  const setSelectedEffects = effects => {
    logic.setSelectedEffects(effects);
    renderTable();
  };

  const setSelectedEffect = effect => {
    setSelectedEffects([effect]);
  };

  const addSelectedEffect = effect => {
    logic.addSelectedEffect(effect);
    renderTable();
  };

  const stepBackSelectedEffect = () => {
    if (logic.stepBackSelectedEffect()) {
      renderTable();
    }
  };

  const setSelectedEffectAndScroll = effect => {
    setSelectedEffect(effect);
    renderer.scrollToEffectTable();
  };

  $('#menu-btn').on('click', event => {
    event.stopPropagation();
    renderer.showEffectsMenu(config.EFFECT_MENU_MODE.replace, true);
  });

  dom.$addonsBtn.on('click', event => {
    event.stopPropagation();
    renderer.toggleMenu(dom.$addonsBtn, dom.$addonsMenu);
  });

  $('.menu').on('click', event => {
    event.stopPropagation();
  });

  $(document).on('click', renderer.closeMenus);

  $(document).on('keydown', event => {
    if (event.key === 'Escape') {
      renderer.closeMenus();
    }
  });

  dom.$mainHintEffectBtn.on('click', event => {
    event.stopPropagation();

    if (state.selectedEffects.length >= config.MAX_EFFECT_FILTER_COUNT) return;

    const effectSlot = state.selectedEffects.length ? state.selectedEffects.length : 0;
    const $effectSlotCell = renderer.getEffectSlotCell(effectSlot);

    renderer.showEffectsMenu(state.selectedEffects.length ? config.EFFECT_MENU_MODE.add : config.EFFECT_MENU_MODE.replace, {
      $positionAnchor: $effectSlotCell,
      $sizeAnchor: $effectSlotCell,
      alignToTable: true
    });
  });

  dom.$effectHeaderButtons.on('click', function (event) {
    const $headerCell = $(this).closest('th');
    const slot = Number($(this).data('effectSlot'));
    const canAddEffect = state.selectedEffects.length > 0
      && slot === state.selectedEffects.length
      && state.selectedEffects.length < config.MAX_EFFECT_FILTER_COUNT;

    event.stopPropagation();

    if (slot === 0) {
      renderer.showEffectsMenu(config.EFFECT_MENU_MODE.replace, {
        $positionAnchor: $headerCell,
        $sizeAnchor: $headerCell,
        alignToTable: true
      });
      return;
    }

    if (canAddEffect) {
      renderer.showEffectsMenu(config.EFFECT_MENU_MODE.add, {
        $positionAnchor: $headerCell,
        $sizeAnchor: $headerCell,
        alignToTable: true
      });
    }
  });

  dom.$addonsList.on('change', 'input[type="checkbox"]', function () {
    if ($(this).data('baseData')) {
      state.rootDataEnabled = this.checked;
      dataLoader.loadActiveData();
      return;
    }

    const addonId = $(this).data('addonId');

    if (this.checked) {
      state.selectedAddonIds.add(addonId);
    } else {
      state.selectedAddonIds.delete(addonId);
    }

    dataLoader.loadActiveData();
  });

  dom.$search.on('input', function () {
    state.searchQuery = logic.normalizeSearch($(this).val());
    renderTable();
  });

  dom.$backBtn.add(dom.$effectBackBtn).on('click', stepBackSelectedEffect);

  dom.$dataTableBody.on('click', 'td.action-cell', function (event) {
    const $cell = $(this);
    if (handleIngredientActionCell($cell, event)) return;
    handleEffectActionCell($cell, setSelectedEffect);
  });

  dom.$combinationTableBody.on('click', 'td.action-cell', function (event) {
    const $cell = $(this);
    if (handleIngredientActionCell($cell, event)) return;
    handleEffectActionCell($cell, setSelectedEffectAndScroll);
  });

  dom.$selectionTableBody.on('click', '.remove-btn', function () {
    removeIngredient($(this).data('name'));
  });

  dom.$selectionTableBody.on('click', 'td.action-cell', function () {
    handleEffectActionCell($(this), setSelectedEffectAndScroll);
  });

  dom.$removeAllBtn.on('click', clearSelection);

  dom.$effectsMenu.on('click', '.effect-btn', function () {
    const effect = $(this).data('effect');

    if (state.effectMenuMode === config.EFFECT_MENU_MODE.add) {
      addSelectedEffect(effect);
    } else {
      setSelectedEffect(effect);
    }

    renderer.closeMenus();
  });

  dom.$effectsMenu.on('input', '.effect-search', function () {
    renderer.updateEffectsMenuButtons();
  });

  dataLoader.initializeData();
});
