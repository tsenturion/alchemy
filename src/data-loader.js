(function (global, $) {
  global.AlchemyDataLoader = {
    create(config, state, logic, renderer) {
      const {
        DATA_ROOT,
        DATA_FILE_NAME,
        EFFECTS_FILE_NAME,
        EFFECT_POLARITY_FILE_NAME,
        EFFECT_TRANSLATIONS_FILE_NAME,
        ROOT_DATA_PATH,
        ROOT_EFFECTS_PATH,
        ROOT_EFFECT_POLARITY_PATH,
        SOURCE_STATUS,
        POLARITY
      } = config;

      const fetchJson = async path => {
        const response = await fetch(logic.encodePath(path));

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${path}`);
        }

        return response.json();
      };

      const fetchOptionalJson = async path => {
        try {
          const response = await fetch(logic.encodePath(path));

          if (!response.ok) return null;
          return response.json();
        } catch (error) {
          console.warn(`Не удалось загрузить необязательный файл ${path}`, error);
          return null;
        }
      };

      const uniqueSortedPaths = paths => Array.from(new Set(paths))
        .filter(path => path && path !== ROOT_DATA_PATH)
        .sort(logic.compareRu);

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
          const normalizedFolderName = logic.normalizeAddonKey(folderName);
          const defaultEnabled = config.DEFAULT_ENABLED_ADDON_FOLDERS.has(normalizedFolderName);

          return {
            id: directoryPath,
            dataPath,
            effectsPath: getEffectsPath(dataPath),
            polarityPath: getEffectPolarityPath(dataPath),
            translationsPath: getEffectTranslationsPath(dataPath),
            folderName,
            name: config.ADDON_DISPLAY_NAMES.get(normalizedFolderName) || folderName,
            defaultEnabled,
            selectable: !defaultEnabled
          };
        })
        .sort((a, b) => logic.compareRu(a.name, b.name) || logic.compareRu(a.id, b.id));

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
          `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${logic.encodePath(directoryPath)}`
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
          response = await fetch(`${logic.encodePath(normalizedDirectoryPath)}/`);
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

        return config.FALLBACK_ADDON_DATA_PATHS;
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

      const getAddonIsActive = addon => (state.rootDataEnabled && addon.defaultEnabled) || state.selectedAddonIds.has(addon.id);

      const getActiveSourceDefinitions = () => {
        const sources = [];

        if (state.rootDataEnabled) {
          sources.push(createRootSourceDefinition());
        }

        state.availableAddons.forEach(addon => {
          if (getAddonIsActive(addon)) {
            sources.push(addon);
          }
        });

        return sources;
      };

      const getSourceEntry = source => state.sourceCache.get(source.id);
      const isSourceLoaded = source => getSourceEntry(source)?.status === SOURCE_STATUS.loaded;

      const getLoadedActiveSourceDefinitions = () => getActiveSourceDefinitions()
        .filter(isSourceLoaded);

      const getOrCreateSourceEntry = source => {
        if (!state.sourceCache.has(source.id)) {
          state.sourceCache.set(source.id, {
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

        return state.sourceCache.get(source.id);
      };

      const rememberSourceCount = (source, data) => {
        const count = Array.isArray(data) ? data.length : 0;

        if (source.root) {
          state.rootIngredientCount = count;
          return;
        }

        state.addonIngredientCounts.set(source.id, count);
      };

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
          effectsByName.set(name, logic.getUniqueEffects(effects));
        });

        return effectsByName;
      };

      const normalizeSourceData = (data, effectsData) => {
        const effectsByName = buildEffectsByIngredientName(effectsData);

        return data
          .filter(ingredient => ingredient && typeof ingredient.name === 'string' && ingredient.name)
          .map(ingredient => {
            const ingredientEffects = Array.isArray(ingredient.effects)
              ? logic.getUniqueEffects(ingredient.effects)
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

        return logic.getUniqueEffects(effects.map(effect => translations.get(effect) || effect));
      };

      const ensureRootPolarityLoaded = async () => {
        if (state.rootPolarityStatus === SOURCE_STATUS.loaded) {
          return state.rootPolarityData;
        }

        if (state.rootPolarityStatus === SOURCE_STATUS.loading) {
          return state.rootPolarityPromise;
        }

        state.rootPolarityStatus = SOURCE_STATUS.loading;
        state.rootPolarityPromise = fetchJson(ROOT_EFFECT_POLARITY_PATH)
          .then(data => {
            state.rootPolarityData = data;
            state.rootPolarityStatus = SOURCE_STATUS.loaded;
            return data;
          })
          .catch(error => {
            state.rootPolarityStatus = SOURCE_STATUS.error;
            state.rootPolarityPromise = null;
            throw error;
          });

        return state.rootPolarityPromise;
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
        renderer.renderAddons();

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
            renderer.renderAddons();
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

        addEffectPolarityData(state.rootPolarityData, polarityByEffect);

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

        state.positiveEffects = new Set();
        state.negativeEffects = new Set();

        polarityByEffect.forEach((polarity, effect) => {
          if (polarity === POLARITY.positive) {
            state.positiveEffects.add(effect);
          }

          if (polarity === POLARITY.negative) {
            state.negativeEffects.add(effect);
          }
        });

        state.ingredients = Array.from(mergedByName.values())
          .sort((a, b) => logic.compareRu(a.name, b.name));

        logic.rebuildIndexes();
        logic.reconcileSelectionWithLoadedData();
        renderer.renderEffectsMenu();
        renderer.renderAddons();
        renderer.renderAllTables();
      };

      const loadActiveData = async () => {
        const currentLoadToken = ++state.dataLoadToken;
        const activeSources = getActiveSourceDefinitions();
        const hasLoadedActiveSource = activeSources.some(isSourceLoaded);

        rebuildCurrentData();

        if (activeSources.length && !hasLoadedActiveSource) {
          renderer.showMessageRow('Загрузка данных...');
        }

        try {
          if (activeSources.length) {
            await ensureRootPolarityLoaded();
          }

          for (const source of activeSources) {
            if (currentLoadToken !== state.dataLoadToken) return;

            const wasLoaded = isSourceLoaded(source);
            const entry = await ensureSourceLoaded(source);

            if (currentLoadToken !== state.dataLoadToken) return;

            if (!wasLoaded && entry.status === SOURCE_STATUS.loaded) {
              rebuildCurrentData();
            }
          }

          if (currentLoadToken === state.dataLoadToken) {
            rebuildCurrentData();
          }
        } catch (error) {
          if (currentLoadToken !== state.dataLoadToken) return;
          console.error('Ошибка загрузки данных:', error);
          renderer.showLoadError();
        }
      };

      const initializeData = async () => {
        renderer.showMessageRow('Загрузка данных...');

        try {
          state.availableAddons = createAddonDefinitions(await discoverAddonDataPaths());
          state.selectedAddonIds = new Set(state.availableAddons.filter(addon => addon.selectable).map(addon => addon.id));
          renderer.renderAddons();
          await loadActiveData();
        } catch (error) {
          console.error('Ошибка инициализации данных:', error);
          renderer.showLoadError();
        }
      };

      return {
        loadActiveData,
        initializeData
      };
    }
  };
})(window, window.jQuery);
