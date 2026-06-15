(function (global) {
  global.AlchemyLogic = {
    create(config, state) {
      const {
        MAX_EFFECT_FILTER_COUNT,
        POLARITY
      } = config;

      const normalizeSearch = value => value.trim().toLowerCase();
      const normalizeAddonKey = value => value.toLowerCase();
      const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
      const compareRu = (a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' });

      const compareEffectLists = (leftEffects, rightEffects) => {
        const maxLength = Math.max(leftEffects.length, rightEffects.length);

        for (let index = 0; index < maxLength; index += 1) {
          const result = compareRu(leftEffects[index] || '', rightEffects[index] || '');

          if (result) return result;
        }

        return 0;
      };

      const getSortableEffectsByPolarity = (effects, polarity) => {
        if (polarity === POLARITY.positive) {
          return effects.filter(effect => !state.negativeEffects.has(effect));
        }

        if (polarity === POLARITY.negative) {
          return effects.filter(effect => !state.positiveEffects.has(effect));
        }

        return effects;
      };

      const compareEffectListsByPolarity = (leftEffects, rightEffects, polarity) => compareEffectLists(
        getSortableEffectsByPolarity(leftEffects, polarity),
        getSortableEffectsByPolarity(rightEffects, polarity)
      );

      const getEffectClass = effect => {
        if (state.positiveEffects.has(effect)) return POLARITY.positive;
        if (state.negativeEffects.has(effect)) return POLARITY.negative;
        return '';
      };

      const getEffectMenuPriority = effect => {
        if (state.positiveEffects.has(effect)) return 0;
        if (state.negativeEffects.has(effect)) return 1;
        return 2;
      };

      const getIngredientClassFromState = ingredient => {
        if (!Object.prototype.hasOwnProperty.call(ingredient, 'effect_state')) return null;

        const effectState = Number(ingredient.effect_state);
        if (effectState === 1) return POLARITY.positive;
        if (effectState === -1) return POLARITY.negative;
        if (effectState === 0) return POLARITY.mixed;
        return null;
      };

      const getIngredientClass = ingredient => {
        const stateClass = getIngredientClassFromState(ingredient);
        if (stateClass) return stateClass;

        const hasPositive = ingredient.effects.some(effect => state.positiveEffects.has(effect));
        const hasNegative = ingredient.effects.some(effect => state.negativeEffects.has(effect));

        if (hasPositive && hasNegative) return POLARITY.mixed;
        if (hasPositive) return POLARITY.positive;
        if (hasNegative) return POLARITY.negative;
        return '';
      };

      const getSelectionClass = (ingredient, requestedPolarity = '') => {
        const ingredientClass = getIngredientClass(ingredient);

        if (state.selectedPolarity) {
          return ingredientClass === state.selectedPolarity || ingredientClass === POLARITY.mixed
            ? state.selectedPolarity
            : '';
        }

        if (ingredientClass === POLARITY.mixed) {
          return requestedPolarity === POLARITY.positive || requestedPolarity === POLARITY.negative
            ? requestedPolarity
            : '';
        }

        if (requestedPolarity && requestedPolarity !== ingredientClass) {
          return '';
        }

        return ingredientClass;
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
        if (polarity === POLARITY.positive) return state.positiveEffects.has(effect);
        if (polarity === POLARITY.negative) return state.negativeEffects.has(effect);
        return false;
      };

      const getEffectMatchesSelectedPolarity = effect => getEffectMatchesPolarity(effect, state.selectedPolarity);

      const getOppositePolarity = polarity => {
        if (polarity === POLARITY.positive) return POLARITY.negative;
        if (polarity === POLARITY.negative) return POLARITY.positive;
        return '';
      };

      const getOppositeMatchedEffects = selectedIngredients => {
        const oppositePolarity = getOppositePolarity(state.selectedPolarity);

        if (!state.selectedEffects.length || !oppositePolarity || !selectedIngredients.length) {
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
        if (!state.selectedPolarity) {
          return orderEffectsByPriority(effects, effect => (matchedEffects.has(effect) ? 0 : 1));
        }

        return orderEffectsByPriority(effects, effect => {
          if (!getEffectMatchesSelectedPolarity(effect)) return 2;
          return matchedEffects.has(effect) ? 0 : 1;
        });
      };

      const orderCombinationEffects = (effects, matchedEffects, matchedEffectPriority) => effects
        .map((effect, index) => {
          const isMatched = matchedEffects.has(effect);

          return {
            effect,
            index,
            priority: isMatched ? 0 : getEffectMatchesSelectedPolarity(effect) ? 1 : 2,
            matchedPriority: isMatched
              ? matchedEffectPriority.get(effect) ?? Number.POSITIVE_INFINITY
              : Number.POSITIVE_INFINITY
          };
        })
        .sort((left, right) => left.priority - right.priority
          || left.matchedPriority - right.matchedPriority
          || left.index - right.index)
        .map(item => item.effect);

      const orderSelectedEffectTableEffects = effects => {
        if (!state.selectedEffects.length) return effects;

        const selectedEffectPolarity = getEffectClass(state.selectedEffect);
        const selectedEffectSet = new Set(state.selectedEffects);
        const selectedEffectsInRow = state.selectedEffects.filter(effect => effects.includes(effect));
        const otherEffects = effects.filter(effect => !selectedEffectSet.has(effect));

        if (!selectedEffectPolarity) {
          return [...selectedEffectsInRow, ...otherEffects];
        }

        const oppositePolarity = getOppositePolarity(selectedEffectPolarity);

        return [
          ...selectedEffectsInRow,
          ...orderEffectsByPriority(otherEffects, effect => {
            if (getEffectMatchesPolarity(effect, selectedEffectPolarity)) return 0;
            if (oppositePolarity && getEffectMatchesPolarity(effect, oppositePolarity)) return 2;
            return 1;
          })
        ];
      };

      const orderBrewResultEffects = effects => {
        if (!state.selectedPolarity) return effects;

        return orderEffectsByPriority(effects, effect => (getEffectMatchesSelectedPolarity(effect) ? 0 : 1));
      };

      const rebuildIndexes = () => {
        state.ingredientByName = new Map();
        state.namesByEffect = new Map();

        state.ingredients.forEach(ingredient => {
          state.ingredientByName.set(ingredient.name, ingredient);

          ingredient.effects.forEach(effect => {
            if (!state.namesByEffect.has(effect)) {
              state.namesByEffect.set(effect, new Set());
            }

            state.namesByEffect.get(effect).add(ingredient.name);
          });
        });
      };

      const getVisibleIngredients = () => state.ingredients.filter(ingredient => {
        if (state.selectedNames.has(ingredient.name)) return false;
        if (state.selectedEffects.length && !state.selectedEffects.every(effect => ingredient.effects.includes(effect))) return false;
        if (state.searchQuery && !ingredient.name.toLowerCase().includes(state.searchQuery)) return false;
        return true;
      });

      const getAdditionalEffectCandidates = () => {
        const candidates = new Set();

        state.ingredients.forEach(ingredient => {
          if (state.selectedNames.has(ingredient.name)) return;
          if (state.searchQuery && !ingredient.name.toLowerCase().includes(state.searchQuery)) return;
          if (!state.selectedEffects.every(effect => ingredient.effects.includes(effect))) return;

          ingredient.effects.forEach(effect => {
            if (!state.selectedEffects.includes(effect)) {
              candidates.add(effect);
            }
          });
        });

        return candidates;
      };

      const canAddIngredient = ingredient => {
        if (!ingredient || state.selectedNames.has(ingredient.name)) return false;
        if (state.selectedNames.size >= config.MAX_SELECTION_COUNT) return false;
        if (!state.selectedPolarity) return true;

        const ingredientClass = getIngredientClass(ingredient);

        if (state.selectedPolarity === POLARITY.positive) {
          return ingredientClass === POLARITY.positive || ingredientClass === POLARITY.mixed;
        }

        return ingredientClass === POLARITY.negative || ingredientClass === POLARITY.mixed;
      };

      const syncSelectedEffect = () => {
        state.selectedEffect = state.selectedEffects[0] || null;
      };

      const setSelectedEffects = effects => {
        const uniqueEffects = [];

        effects.forEach(effect => {
          if (effect && state.namesByEffect.has(effect) && !uniqueEffects.includes(effect)) {
            uniqueEffects.push(effect);
          }
        });

        state.selectedEffects = uniqueEffects.slice(0, MAX_EFFECT_FILTER_COUNT);
        syncSelectedEffect();
      };

      const setSelectedEffect = effect => {
        setSelectedEffects([effect]);
      };

      const addSelectedEffect = effect => {
        setSelectedEffects([...state.selectedEffects, effect]);
      };

      const stepBackSelectedEffect = () => {
        if (!state.selectedEffects.length) return false;

        state.selectedEffects = state.selectedEffects.slice(0, -1);
        syncSelectedEffect();
        return true;
      };

      const reconcileSelectionWithLoadedData = () => {
        state.selectedNames.forEach(name => {
          if (!state.ingredientByName.has(name)) {
            state.selectedNames.delete(name);
            state.selectedClasses.delete(name);
          }
        });

        if (state.selectedNames.size === 0) {
          state.selectedPolarity = null;
        }

        state.selectedEffects = state.selectedEffects.filter(effect => state.namesByEffect.has(effect));
        syncSelectedEffect();
      };

      const getUniqueEffects = effects => Array.from(new Set(
        effects.filter(effect => typeof effect === 'string' && effect)
      ));

      return {
        normalizeSearch,
        normalizeAddonKey,
        encodePath,
        compareRu,
        compareEffectListsByPolarity,
        getEffectClass,
        getEffectMenuPriority,
        getIngredientClass,
        getSelectionClass,
        getBrewResultEffects,
        getEffectMatchesPolarity,
        getOppositePolarity,
        getOppositeMatchedEffects,
        orderSelectedEffects,
        orderCombinationEffects,
        orderSelectedEffectTableEffects,
        orderBrewResultEffects,
        rebuildIndexes,
        getVisibleIngredients,
        getAdditionalEffectCandidates,
        canAddIngredient,
        syncSelectedEffect,
        setSelectedEffects,
        setSelectedEffect,
        addSelectedEffect,
        stepBackSelectedEffect,
        reconcileSelectionWithLoadedData,
        getUniqueEffects
      };
    }
  };
})(window);
