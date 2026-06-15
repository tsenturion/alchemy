(function (global) {
  global.AlchemyState = {
    create(config) {
      return {
        ingredients: [],
        ingredientByName: new Map(),
        namesByEffect: new Map(),
        positiveEffects: new Set(),
        negativeEffects: new Set(),
        selectedNames: new Set(),
        selectedClasses: new Map(),
        searchQuery: '',
        selectedEffect: null,
        selectedEffects: [],
        selectedPolarity: null,
        effectMenuMode: config.EFFECT_MENU_MODE.replace,
        availableAddons: [],
        selectedAddonIds: new Set(),
        addonIngredientCounts: new Map(),
        rootDataEnabled: true,
        rootIngredientCount: null,
        rootPolarityData: null,
        rootPolarityStatus: config.SOURCE_STATUS.idle,
        rootPolarityPromise: null,
        sourceCache: new Map(),
        dataLoadToken: 0
      };
    }
  };
})(window);
