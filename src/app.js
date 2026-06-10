$(document).ready(() => {
  const MAX_SELECTION_COUNT = 3;
  const EFFECT_CLASSES = { positive: 'positive', negative: 'negative', mixed: 'mixed' };
  let data = [], effectsData = {}, positiveEffects = new Set(), negativeEffects = new Set();
  let selectedNames = new Set(), selectedColors = {}, searchQuery = '', selectedEffect = null, isFirstNamePositive = null;

  const $effectsMenu = $('#effects-menu'),
    $dataTableBody = $('#data-table tbody'),
    $selectionTableBody = $('#selection-table tbody'),
    $combinationTableBody = $('#combination-table tbody'),
    $search = $('#search'),
    $backBtn = $('#back-btn'),
    $selectionTable = $('#selection-table'),
    $combinationTable = $('#combination-table'),
    $removeAllBtn = $('#remove-all-btn');

  const loadData = async () => {
    try {
      const [dataResponse, effectsResponse, effectsList] = await Promise.all([
        $.getJSON('data/data.json'),
        $.getJSON('data/positive_negative_data.json'),
        $.getJSON('data/effects.json')
      ]);

      data = dataResponse;
      positiveEffects = new Set(effectsResponse.positive_effects || []);
      negativeEffects = new Set(effectsResponse.negative_effects || []);
      effectsData = effectsList.reduce((acc, { effect, names }) => {
        acc[effect] = names;
        return acc;
      }, {});
      renderTable(data);
      renderEffectsMenu();
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  };

  const getEffectClass = effect =>
    positiveEffects.has(effect) ? EFFECT_CLASSES.positive :
    negativeEffects.has(effect) ? EFFECT_CLASSES.negative : '';

  const getEffectState = item => {
    const hasPositive = item.effects.some(e => positiveEffects.has(e));
    const hasNegative = item.effects.some(e => negativeEffects.has(e));
    return hasPositive && hasNegative ? 0 : hasPositive ? 1 : -1;
  };

  const renderEffectsMenu = () => {
    $effectsMenu.empty();
    const effects = [...new Set(data.flatMap(i => i.effects))].sort();
    $effectsMenu.append(effects.map(effect => `<button class="effect-btn">${effect}</button>`).join(''));
  };

  const renderTable = items => {
    $dataTableBody.empty();
    const filteredItems = items.filter(({ name }) => !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase()));
    const rows = filteredItems.map(({ name, effects }) => {
      const effectState = getEffectState(data.find(i => i.name === name));
      const nameClass = selectedColors[name] || (effectState === 0 ? EFFECT_CLASSES.mixed : effectState === 1 ? EFFECT_CLASSES.positive : EFFECT_CLASSES.negative);
      const orderedEffects = selectedEffect ? [selectedEffect, ...effects.filter(e => e !== selectedEffect)] : effects;
      const effectCells = orderedEffects.map(effect => `<td class="${getEffectClass(effect)} effect-cell" data-effect="${effect}">${effect}</td>`).join('');
      return `<tr><td class="${nameClass}" data-name="${name}">${name}</td>${effectCells}</tr>`;
    }).join('');
    $dataTableBody.append(rows);
    $backBtn.toggle(!!selectedEffect);
  };

  const renderCombinationTable = () => {
    const selectedItems = Array.from(selectedNames).map(name => data.find(i => i.name === name));
    if (!selectedItems.length) {
      $combinationTableBody.empty();
      $combinationTable.hide();
      return;
    }

    const effectsToShow = new Set(), effectsToExclude = new Set();
    selectedItems.forEach(item => {
      item.effects.forEach(effect => {
        if (isFirstNamePositive && positiveEffects.has(effect) || !isFirstNamePositive && negativeEffects.has(effect)) {
          effectsToShow.add(effect);
        } else {
          effectsToExclude.add(effect);
        }
      });
    });

    const candidateNames = new Set();
    effectsToShow.forEach(effect => {
      if (effectsData[effect]) {
        effectsData[effect].forEach(name => {
          if (!selectedNames.has(name)) candidateNames.add(name);
        });
      }
    });

    const finalCombinationNames = Array.from(candidateNames).filter(name => {
      const item = data.find(i => i.name === name);
      return !item.effects.some(effect => effectsToExclude.has(effect));
    }).sort();

    $combinationTableBody.empty().append(finalCombinationNames.map(name => {
      const item = data.find(i => i.name === name);
      const effectState = getEffectState(item);
      const nameClass = effectState === 0 ? EFFECT_CLASSES.mixed : effectState === 1 ? EFFECT_CLASSES.positive : EFFECT_CLASSES.negative;
      return `<tr><td class="${nameClass}" data-name="${name}">${name}</td>${item.effects.map(effect => `<td class="${getEffectClass(effect)}">${effect}</td>`).join('')}</tr>`;
    }).join(''));

    $combinationTable.toggle(finalCombinationNames.length > 0);
  };

  const addToSelectionTable = (name, selectedClass) => {
    selectedColors[name] = selectedClass;
    const item = data.find(i => i.name === name);
    const finalClass = isFirstNamePositive ? EFFECT_CLASSES.positive : EFFECT_CLASSES.negative;
    $selectionTableBody.append(`
      <tr>
        <td class="${finalClass}"><span>${name}</span><button class="remove-btn" data-name="${name}">Удалить</button></td>
        ${item.effects.map(effect => `<td class="${getEffectClass(effect)}">${effect}</td>`).join('')}
      </tr>`).parent().show();
    renderCombinationTable();
  };

  const canAddEffect = name => {
    if (selectedNames.size >= MAX_SELECTION_COUNT) return false;
    const item = data.find(i => i.name === name);
    const effectState = getEffectState(item);
    if (isFirstNamePositive === null) return true;
    return (isFirstNamePositive && effectState !== -1) || (!isFirstNamePositive && effectState !== 1);
  };

  const handleRowClick = function (event) {
    const name = $(this).data('name');
    if (!canAddEffect(name)) return;
    $('html, body').animate({ scrollTop: 0 }, 'fast');
    if (selectedNames.has(name)) return;

    const effectState = getEffectState(data.find(i => i.name === name));
    const selectedClass = effectState === 0
      ? event.pageX - $(this).offset().left < $(this).width() / 2 ? EFFECT_CLASSES.negative : EFFECT_CLASSES.positive
      : effectState === 1 ? EFFECT_CLASSES.positive : EFFECT_CLASSES.negative;

    if (isFirstNamePositive === null) {
      isFirstNamePositive = selectedClass === EFFECT_CLASSES.positive;
    }

    selectedNames.add(name);
    addToSelectionTable(name, selectedClass);
    $(this).closest('tr').hide();
  };

  const handleRemoveClick = function () {
    const name = $(this).data('name');
    selectedNames.delete(name);
    delete selectedColors[name];
    $(this).closest('tr').remove();
    $dataTableBody.find(`tr:has(td[data-name="${name}"])`).show();

    if ($selectionTableBody.children().length === 0) {
      isFirstNamePositive = null;
      $selectionTable.hide();
    }

    renderCombinationTable();
  };

  const handleRemoveAllClick = () => {
    selectedNames.clear();
    selectedColors = {};
    selectedEffect = null;
    isFirstNamePositive = null;
    $selectionTableBody.empty().parent().hide();
    $combinationTable.hide();
    renderTable(data);
  };

  const handleEffectCellClick = function () {
    selectedEffect = $(this).data('effect');
    renderTable(data.filter(item => item.effects.includes(selectedEffect)));
  };

  $effectsMenu.hide();
  $('#menu-btn').click(() => $effectsMenu.toggle());
  $search.on('input', function () {
    searchQuery = $(this).val();
    renderTable(data);
  });
  $backBtn.click(() => {
    searchQuery = '';
    selectedEffect = null;
    renderTable(data);
  });

  $dataTableBody.on('click', 'td:first-child', handleRowClick);
  $combinationTableBody.on('click', 'td[data-name]', handleRowClick);
  $selectionTableBody.on('click', '.remove-btn', handleRemoveClick);
  $removeAllBtn.click(handleRemoveAllClick);
  $(document).on('click', '.effect-btn', function () {
    selectedEffect = $(this).text();
    renderTable(data.filter(item => item.effects.includes(selectedEffect)));
    $effectsMenu.hide();
  });
  $(document).on('click', '.effect-cell', handleEffectCellClick);

  loadData();
});
