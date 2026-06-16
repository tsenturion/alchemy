(function (global, $) {
  global.AlchemyRenderer = {
    create(config, state, logic) {
      const { POLARITY, EFFECT_MENU_MODE, MAX_EFFECT_FILTER_COUNT } = config;

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
      const $mainHintEffectBtn = $('#main-hint-effect-btn');
      const $effectHeaderButtons = $('#data-table thead tr:first-child .effect-header-button');
      const $removeAllBtn = $('#remove-all-btn');

      const createCell = ({ text, className = '', data = {} }) => $('<td>')
        .text(text)
        .addClass(className)
        .data(data);

      const createEffectButton = effect => $('<button>')
        .attr({
          type: 'button',
          'aria-label': `Показать эффект ${effect}`
        })
        .addClass('effect-action effect-cell')
        .data('effect', effect)
        .text(effect);

      const createEffectCell = (effect, isClickable = false, highlightedEffects = new Set()) => {
        const effectClass = logic.getEffectClass(effect);
        const hintClass = highlightedEffects.has(effect) && effectClass ? `hint-${effectClass}` : '';
        const $cell = createCell({
          text: isClickable ? '' : effect,
          className: `${effectClass} ${hintClass}`,
          data: { effect }
        });

        if (isClickable) {
          setActionCell($cell).append(createEffectButton(effect));
        }

        return $cell;
      };

      const createIngredientActionButton = (ingredient, options = {}) => {
        const {
          selectionPolarity = '',
          isMixedSelection = false
        } = options;

        return $('<button>')
          .attr({
            type: 'button',
            'aria-label': `Добавить ${ingredient.name}`
          })
          .addClass('ingredient-action ingredient-add-btn')
          .data({
            name: ingredient.name,
            selectionPolarity,
            mixedSelection: isMixedSelection
          })
          .text(ingredient.name);
      };

      const setActionCell = $cell => $cell.addClass('action-cell');

      const createIngredientNameCell = (ingredient, options = {}) => {
        const { firstCellClass, isIngredientClickable = false } = options;
        const ingredientClass = firstCellClass ?? state.selectedClasses.get(ingredient.name) ?? logic.getIngredientClass(ingredient);
        const $cell = createCell({
          text: isIngredientClickable ? '' : ingredient.name,
          className: ingredientClass,
          data: { name: ingredient.name }
        });

        if (!isIngredientClickable) return $cell;

        setActionCell($cell).append(createIngredientActionButton(ingredient, {
          isMixedSelection: ingredientClass === POLARITY.mixed && !state.selectedPolarity
        }));

        return $cell;
      };

      const createIngredientRow = (ingredient, options = {}) => {
        const {
          effects = ingredient.effects,
          highlightedEffects = new Set(),
          isEffectClickable = false
        } = options;
        const $row = $('<tr>');

        $row.append(createIngredientNameCell(ingredient, options));

        effects.forEach(effect => {
          $row.append(createEffectCell(effect, isEffectClickable, highlightedEffects));
        });

        return $row;
      };

      const appendResultEffectCell = ($row, effect) => {
        const effectClass = logic.getEffectClass(effect);

        setActionCell(createCell({
          text: '',
          className: `brew-result-effects ${effectClass} ${effectClass ? `hint-${effectClass}` : ''}`,
          data: { effect }
        }))
          .append(createEffectButton(effect))
          .appendTo($row);
      };

      const createBrewResultRow = (label, effects = [], message = '') => {
        const $row = $('<tr>').addClass('brew-result-row');

        $('<td>')
          .addClass(`brew-result-label ${state.selectedPolarity ? `hint-${state.selectedPolarity}` : ''}`)
          .text(label)
          .appendTo($row);

        if (message) {
          createCell({ text: message, className: 'brew-result-effects' }).appendTo($row);
        } else {
          effects.forEach(effect => {
            appendResultEffectCell($row, effect);
          });
        }

        while ($row.children('td').length < 5) {
          createCell({ text: '', className: 'brew-result-effects' }).appendTo($row);
        }

        return $row;
      };

      const createBrewResultRows = selectedIngredients => {
        const resultEffects = logic.orderBrewResultEffects(logic.getBrewResultEffects(selectedIngredients));

        if (selectedIngredients.length < 2) {
          return [createBrewResultRow('У вас получится:', [], 'Выберите еще ингредиент')];
        }

        if (!resultEffects.length) {
          return [createBrewResultRow('У вас получится:', [], 'Нет совпадающих эффектов')];
        }

        const rows = [
          createBrewResultRow('У вас получится:', resultEffects.slice(0, 4))
        ];

        for (let index = 4; index < resultEffects.length; index += 4) {
          rows.push(createBrewResultRow('Ещё больше:', resultEffects.slice(index, index + 4)));
        }

        return rows;
      };

      const updateEffectHeaderControls = () => {
        $effectHeaderButtons.each(function () {
          const $button = $(this);
          const slot = Number($button.data('effectSlot'));
          const isFirstSlot = slot === 0;
          const isNextSlot = state.selectedEffects.length > 0 && slot === state.selectedEffects.length;
          const canAddEffect = isNextSlot && state.selectedEffects.length < MAX_EFFECT_FILTER_COUNT;

          $button
            .prop('disabled', !isFirstSlot && !canAddEffect)
            .toggleClass('effect-header-button-add', canAddEffect)
            .text(canAddEffect ? `+ Эффект ${slot + 1}` : `Эффект ${slot + 1}`);
        });
      };

      const updateMainHintEffectControl = () => {
        const labels = [
          'Выберите эффект чтобы посмотреть все ингридиенты',
          'Выберите второй эффект, чтобы найти совпадения.',
          'Выберите третий эффект, чтобы найти совпадения.',
          'Выберите четвертый эффект, чтобы найти совпадения.'
        ];
        const hasMaxSelectedEffects = state.selectedEffects.length >= MAX_EFFECT_FILTER_COUNT;

        $mainHintEffectBtn
          .prop('disabled', hasMaxSelectedEffects)
          .text(hasMaxSelectedEffects
            ? 'Ингридиенты с выбранными эффектами:'
            : labels[state.selectedEffects.length]);
      };

      const updateFilterControls = () => {
        const hasSelectedEffects = state.selectedEffects.length > 0;

        $backBtn.toggle(hasSelectedEffects);
        $effectTitleText.text(state.selectedEffects.join(' / '));
        $effectTitle.css('display', hasSelectedEffects ? 'flex' : 'none');
        $mainHintRow.show();
        updateEffectHeaderControls();
        updateMainHintEffectControl();
      };

      const renderEffectsMenu = () => {
        const effects = Array.from(state.namesByEffect.keys())
          .sort((a, b) => logic.getEffectMenuPriority(a) - logic.getEffectMenuPriority(b) || logic.compareRu(a, b));
        const fragment = document.createDocumentFragment();

        $('<input>')
          .attr({
            type: 'text',
            placeholder: 'Поиск по названию...',
            autocomplete: 'off',
            'aria-label': 'Поиск эффекта'
          })
          .addClass('effect-search')
          .appendTo(fragment);

        effects.forEach(effect => {
          $('<button>')
            .attr('type', 'button')
            .addClass('effect-btn')
            .addClass(logic.getEffectClass(effect))
            .data('effect', effect)
            .text(effect)
            .appendTo(fragment);
        });

        $effectsMenu.empty().append(fragment);
        updateEffectsMenuButtons();
      };

      const renderTable = () => {
        const fragment = document.createDocumentFragment();
        const visibleIngredients = logic.getVisibleIngredients();
        const selectedIngredients = Array.from(state.selectedNames)
          .map(name => state.ingredientByName.get(name))
          .filter(Boolean);
        const oppositeMatchedEffects = logic.getOppositeMatchedEffects(selectedIngredients);
        const displayIngredients = visibleIngredients
          .map((ingredient, index) => ({
            ingredient,
            index,
            oppositeMatchCount: ingredient.effects.filter(effect => oppositeMatchedEffects.has(effect)).length,
            effects: state.selectedEffects.length
              ? logic.orderSelectedEffectTableEffects(ingredient.effects)
              : ingredient.effects
          }))
          .sort((left, right) => {
            if (!state.selectedEffects.length) return left.index - right.index;

            return (oppositeMatchedEffects.size
              ? Number(left.oppositeMatchCount > 0) - Number(right.oppositeMatchCount > 0)
              : 0)
              || logic.compareEffectListsByPolarity(left.effects, right.effects, logic.getEffectClass(state.selectedEffect))
              || logic.compareRu(left.ingredient.name, right.ingredient.name);
          });

        displayIngredients.forEach(({ ingredient, oppositeMatchCount, effects }) => {
          const highlightedEffects = state.selectedEffects.length && oppositeMatchCount > 0
            ? new Set(ingredient.effects.filter(effect => oppositeMatchedEffects.has(effect)))
            : new Set();

          createIngredientRow(ingredient, {
            effects,
            highlightedEffects,
            isEffectClickable: true,
            isIngredientClickable: true
          }).appendTo(fragment);
        });

        $dataTableBody.empty().append(fragment);
        $visibleCount.text(visibleIngredients.length);
        updateFilterControls();
      };

      const renderSelectionTable = () => {
        const fragment = document.createDocumentFragment();
        const selectedIngredients = Array.from(state.selectedNames)
          .map(name => state.ingredientByName.get(name))
          .filter(Boolean);
        const matchedEffects = new Set(logic.getBrewResultEffects(selectedIngredients));

        if (selectedIngredients.length) {
          createBrewResultRows(selectedIngredients).forEach($row => {
            $row.appendTo(fragment);
          });
        }

        selectedIngredients.forEach(ingredient => {
          const $row = createIngredientRow(ingredient, {
            firstCellClass: state.selectedClasses.get(ingredient.name) || logic.getIngredientClass(ingredient),
            effects: logic.orderSelectedEffects(ingredient.effects, matchedEffects),
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
        const selectedIngredients = Array.from(state.selectedNames)
          .map(name => state.ingredientByName.get(name))
          .filter(Boolean);

        if (!selectedIngredients.length || !state.selectedPolarity) {
          $combinationTableBody.empty();
          $combinationTable.hide();
          $combinationTitle.hide().text('');
          return;
        }

        const effectsToShow = new Set();
        const effectsToExclude = new Set();
        const effectPriority = new Map();
        const oppositePolarity = logic.getOppositePolarity(state.selectedPolarity);

        selectedIngredients.forEach(ingredient => {
          ingredient.effects.forEach(effect => {
            if (state.selectedPolarity === POLARITY.positive && state.positiveEffects.has(effect)) {
              effectsToShow.add(effect);
              if (!effectPriority.has(effect)) {
                effectPriority.set(effect, effectPriority.size);
              }
              return;
            }

            if (state.selectedPolarity === POLARITY.negative && state.negativeEffects.has(effect)) {
              effectsToShow.add(effect);
              if (!effectPriority.has(effect)) {
                effectPriority.set(effect, effectPriority.size);
              }
              return;
            }

            if (oppositePolarity && logic.getEffectMatchesPolarity(effect, oppositePolarity)) {
              effectsToExclude.add(effect);
            }
          });
        });

        const candidateNames = new Set();

        effectsToShow.forEach(effect => {
          (state.namesByEffect.get(effect) || []).forEach(name => {
            if (!state.selectedNames.has(name)) {
              candidateNames.add(name);
            }
          });
        });

        const finalCombinationNames = Array.from(candidateNames)
          .filter(name => {
            const ingredient = state.ingredientByName.get(name);
            return ingredient && !ingredient.effects.some(effect => effectsToExclude.has(effect));
          })
          .sort((leftName, rightName) => {
            const leftIngredient = state.ingredientByName.get(leftName);
            const rightIngredient = state.ingredientByName.get(rightName);
            const getMatchedEffects = ingredient => ingredient.effects.filter(effect => effectsToShow.has(effect));
            const getMatchPriority = matchedEffects => Math.min(
              ...matchedEffects.map(effect => effectPriority.get(effect) ?? Number.POSITIVE_INFINITY)
            );
            const leftMatchedEffects = getMatchedEffects(leftIngredient);
            const rightMatchedEffects = getMatchedEffects(rightIngredient);
            const leftPriority = getMatchPriority(leftMatchedEffects);
            const rightPriority = getMatchPriority(rightMatchedEffects);
            const leftEffects = logic.orderCombinationEffects(leftIngredient.effects, effectsToShow, effectPriority);
            const rightEffects = logic.orderCombinationEffects(rightIngredient.effects, effectsToShow, effectPriority);

            return rightMatchedEffects.length - leftMatchedEffects.length
              || leftPriority - rightPriority
              || logic.compareEffectListsByPolarity(leftEffects, rightEffects, state.selectedPolarity)
              || logic.compareRu(leftName, rightName);
          });

        const fragment = document.createDocumentFragment();

        finalCombinationNames.forEach(name => {
          const ingredient = state.ingredientByName.get(name);
          const matchedEffects = new Set(ingredient.effects.filter(effect => effectsToShow.has(effect)));

          createIngredientRow(ingredient, {
            effects: logic.orderCombinationEffects(ingredient.effects, effectsToShow, effectPriority),
            highlightedEffects: matchedEffects.size > 1 ? matchedEffects : new Set(),
            isEffectClickable: true,
            isIngredientClickable: true
          }).appendTo(fragment);
        });

        const excludedMatchMessage = state.selectedPolarity === POLARITY.positive
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

      const getRootAddonCountLabel = () => {
        if (!Number.isInteger(state.rootIngredientCount)) {
          return 'Стандартный data.json';
        }

        const hiddenAddonParts = state.availableAddons
          .filter(addon => addon.defaultEnabled)
          .map(addon => ({
            name: addon.name,
            count: state.addonIngredientCounts.get(addon.id)
          }))
          .filter(addon => Number.isInteger(addon.count));

        if (!hiddenAddonParts.length) {
          return `Стандартный data.json, ${state.rootIngredientCount}`;
        }

        const total = hiddenAddonParts.reduce((sum, addon) => sum + addon.count, state.rootIngredientCount);
        const formula = [
          state.rootIngredientCount,
          ...hiddenAddonParts.map(addon => `${addon.name} (${addon.count})`)
        ].join(' + ');

        return `Стандартный data.json, ${formula} = ${total}`;
      };

      const renderAddons = () => {
        const selectableAddons = state.availableAddons.filter(addon => addon.selectable);
        const fragment = document.createDocumentFragment();

        const $rootLabel = $('<label>')
          .addClass('addon-option')
          .attr('for', 'addon-root-data')
          .attr('title', config.ROOT_DATA_PATH);

        $('<input>')
          .attr({ type: 'checkbox', id: 'addon-root-data' })
          .data('baseData', true)
          .prop('checked', state.rootDataEnabled)
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
            .prop('checked', state.selectedAddonIds.has(addon.id))
            .appendTo($label);

          const count = state.addonIngredientCounts.get(addon.id);
          const labelText = Number.isInteger(count) ? `${addon.name}, ${count}` : addon.name;

          $('<span>').text(labelText).appendTo($label);
          $label.appendTo(fragment);
        });

        $addonsList.empty().append(fragment);
        $addonsBtn.show();
      };

      const positionMenu = ($button, $menu) => {
        const isMobile = window.matchMedia('(max-width: 700px)').matches;

        $menu
          .removeClass('table-menu')
          .css({
            position: '',
            top: '',
            left: isMobile ? 0 : $button.position().left,
            right: '',
            width: '',
            minWidth: '',
            maxWidth: ''
          });
      };

      const positionTableMenu = ($positionAnchor, $sizeAnchor, $menu) => {
        const positionRect = $positionAnchor[0].getBoundingClientRect();
        const sizeRect = $sizeAnchor[0].getBoundingClientRect();
        const viewportPadding = 4;
        const width = Math.min(
          Math.max(sizeRect.width, 1),
          Math.max(window.innerWidth - viewportPadding * 2, 1)
        );
        const left = Math.min(
          Math.max(sizeRect.left, viewportPadding),
          Math.max(window.innerWidth - width - viewportPadding, viewportPadding)
        );

        $menu
          .addClass('table-menu')
          .css({
            position: 'fixed',
            top: `${positionRect.bottom}px`,
            left: `${left}px`,
            right: 'auto',
            width: `${width}px`,
            minWidth: 0,
            maxWidth: `calc(100vw - ${viewportPadding * 2}px)`
          });
      };

      const updateEffectsMenuButtons = () => {
        const query = logic.normalizeSearch($effectsMenu.find('.effect-search').val() || '');
        const additionalEffectCandidates = state.effectMenuMode === EFFECT_MENU_MODE.add
          ? logic.getAdditionalEffectCandidates()
          : null;

        $effectsMenu.find('.effect-btn').each(function () {
          const effect = $(this).data('effect');
          const matchesSearch = logic.normalizeSearch(effect).includes(query);
          const canUseEffect = state.effectMenuMode !== EFFECT_MENU_MODE.add
            || additionalEffectCandidates.has(effect);

          $(this).toggle(matchesSearch && canUseEffect);
        });
      };

      const closeMenus = () => {
        $effectsMenu.hide();
        $addonsMenu.hide();
        $('#menu-btn').attr('aria-expanded', 'false');
        $addonsBtn.attr('aria-expanded', 'false');
      };

      const showEffectsMenu = (mode = EFFECT_MENU_MODE.replace, options = {}) => {
        const {
          canToggle = false,
          $positionAnchor = $('#menu-btn'),
          $sizeAnchor = $positionAnchor,
          alignToTable = false
        } = typeof options === 'boolean' ? { canToggle: options } : options;
        const shouldShow = canToggle ? !$effectsMenu.is(':visible') || state.effectMenuMode !== mode : true;

        closeMenus();

        if (!shouldShow) return;

        state.effectMenuMode = mode;
        if (alignToTable) {
          positionTableMenu($positionAnchor, $sizeAnchor, $effectsMenu);
        } else {
          positionMenu($positionAnchor, $effectsMenu);
        }

        updateEffectsMenuButtons();
        $effectsMenu.show();
        $('#menu-btn').attr('aria-expanded', 'true');
      };

      const getEffectSlotCell = slot => $effectHeaderButtons
        .eq(Math.min(Math.max(slot, 0), MAX_EFFECT_FILTER_COUNT - 1))
        .closest('th');

      const toggleMenu = ($button, $menu) => {
        const shouldShow = !$menu.is(':visible');

        closeMenus();

        if (shouldShow) {
          positionMenu($button, $menu);
          $menu.show();
          $button.attr('aria-expanded', 'true');
        }
      };

      const scrollToEffectTable = () => {
        const $target = $effectTitle.is(':visible') ? $effectTitle : $('#data-table');
        const top = $target.offset()?.top;

        if (typeof top === 'number') {
          $('html, body').animate({ scrollTop: Math.max(top - 8, 0) }, 'fast');
        }
      };

      $effectsMenu.hide();
      $addonsMenu.hide();

      return {
        dom: {
          $addonsBtn,
          $addonsList,
          $addonsMenu,
          $effectsMenu,
          $dataTableBody,
          $combinationTableBody,
          $selectionTableBody,
          $search,
          $backBtn,
          $effectBackBtn,
          $mainHintEffectBtn,
          $effectHeaderButtons,
          $removeAllBtn
        },
        createIngredientRow,
        renderEffectsMenu,
        renderTable,
        renderSelectionTable,
        renderCombinationTable,
        renderAllTables,
        showMessageRow,
        showLoadError,
        renderAddons,
        closeMenus,
        showEffectsMenu,
        toggleMenu,
        getEffectSlotCell,
        updateEffectsMenuButtons,
        scrollToEffectTable
      };
    }
  };
})(window, window.jQuery);
