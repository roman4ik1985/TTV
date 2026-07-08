window.addEventListener('DOMContentLoaded', () => {
  const smartReader = window.smartReader;

  const textContainer = document.getElementById('text-container');
  const btnPlay = document.getElementById('btn-play');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const rateSlider = document.getElementById('rate-slider');
  const volumeSlider = document.getElementById('volume-slider');
  const btnStt = document.getElementById('btn-stt');
  const btnExport = document.getElementById('btn-export');
  const btnEditToggle = document.getElementById('btn-edit-toggle');
  const btnBold = document.getElementById('btn-bold');
  const btnItalic = document.getElementById('btn-italic');
  const btnList = document.getElementById('btn-list');
  const btnDictionary = document.getElementById('btn-dictionary');
  const translateSourceLanguage = document.getElementById('translate-source-language');
  const translateTargetLanguage = document.getElementById('translate-target-language');
  const btnTranslate = document.getElementById('btn-translate');
  const cntChars = document.getElementById('cnt-chars');
  const cntWords = document.getElementById('cnt-words');
  const lblStatus = document.getElementById('lbl-status');
  const btnFontToggle = document.getElementById('btn-font-toggle');
  const btnTriggerUpload = document.getElementById('btn-trigger-upload');
  const uploadModal = document.getElementById('upload-modal');
  const btnModalClose = document.getElementById('btn-modal-close');
  const dropzone = document.getElementById('dropzone');
  const btnBrowseTrigger = document.getElementById('btn-browse-trigger');
  const universalFileInput = document.getElementById('universal-file-input');
  const youtubeUrlInput = document.getElementById('youtube-url-input');
  const btnYoutubeSubmit = document.getElementById('btn-youtube-submit');
  const transcriptPasteInput = document.getElementById('transcript-paste-input');
  const btnTranscriptPaste = document.getElementById('btn-transcript-paste');
  const modeRead = document.getElementById('mode-read');
  const modeListen = document.getElementById('mode-listen');
  const avatarCards = document.querySelectorAll('.avatar-card');
  const historyList = document.getElementById('history-list');
  const historyMeta = document.getElementById('history-meta');
  const btnHistoryClear = document.getElementById('btn-history-clear');
  const cloudProviderCards = document.querySelectorAll('[data-provider-id]');
  const cloudPanel = document.getElementById('cloud-panel');
  const cloudPanelTitle = document.getElementById('cloud-panel-title');
  const cloudStatus = document.getElementById('cloud-status');
  const cloudSetupNote = document.getElementById('cloud-setup-note');
  const cloudSearchRow = document.getElementById('cloud-search-row');
  const cloudSearchInput = document.getElementById('cloud-search-input');
  const btnCloudSearch = document.getElementById('btn-cloud-search');
  const btnCloudConnect = document.getElementById('btn-cloud-connect');
  const btnCloudRefresh = document.getElementById('btn-cloud-refresh');
  const cloudFileList = document.getElementById('cloud-file-list');
  const cloudPagination = document.getElementById('cloud-pagination');
  const btnCloudLoadMore = document.getElementById('btn-cloud-load-more');

  let fullText = '';
  let textHistory = [];
  let activeHistoryId = null;
  let currentTextSource = 'Текст';
  let currentMode = 'read';
  let selectedGender = 'male';
  let isEditing = false;
  let isSttRecording = false;
  let accumulatedSttText = '';
  let audioPlayer = new Audio();
  let wordTimings = [];
  let sentenceTimings = [];
  let visualSentenceSpans = [];
  let lastActiveIndex = -1;
  let translationState = {
    provider: 'deepl',
    providerName: 'DeepL',
    configured: false,
    defaultSourceLanguage: 'AUTO',
    defaultTargetLanguage: 'EN',
    setupHint: ''
  };
  let isTranslateBusy = false;
  let cloudProviders = [];
  let activeCloudProviderId = '';
  let activeCloudQuery = '';
  let isCloudBusy = false;
  const cloudFilesByProvider = new Map();
  const cloudNextPageTokenByProvider = new Map();

  const TRANSLATION_LANGUAGE_OPTIONS = [
    { value: 'AUTO', label: 'Авто' },
    { value: 'RU', label: 'Русский' },
    { value: 'UK', label: 'Украинский' },
    { value: 'EN', label: 'Английский' },
    { value: 'DE', label: 'Немецкий' },
    { value: 'FR', label: 'Французский' },
    { value: 'ES', label: 'Испанский' },
    { value: 'IT', label: 'Итальянский' },
    { value: 'PL', label: 'Польский' },
    { value: 'PT-BR', label: 'Португальский (BR)' }
  ];

  function getPlaybackRate() {
    return rateSlider ? parseFloat(rateSlider.value) : 1;
  }

  function getPlaybackVolume() {
    return volumeSlider ? parseFloat(volumeSlider.value) : 1;
  }

  function applyInlineStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  function clearTextContainer() {
    if (textContainer) textContainer.replaceChildren();
  }

  function resetTextContainerWhiteSpace() {
    if (textContainer) textContainer.style.whiteSpace = '';
  }

  function renderTextMessage(message, styles = {}) {
    if (!textContainer) return null;
    resetTextContainerWhiteSpace();
    const node = document.createElement('span');
    node.textContent = message;
    applyInlineStyles(node, styles);
    textContainer.replaceChildren(node);
    return node;
  }

  function renderTextBlock(tagName, text, styles = {}) {
    const node = document.createElement(tagName);
    node.textContent = text;
    applyInlineStyles(node, styles);
    return node;
  }

  function clearImportInputs() {
    if (youtubeUrlInput) youtubeUrlInput.value = '';
    if (transcriptPasteInput) transcriptPasteInput.value = '';
  }

  function setStatus(message) {
    if (lblStatus) lblStatus.textContent = message;
  }

  function getNormalizedText(text) {
    return typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : '';
  }

  function isTypingTarget(target) {
    if (!target) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  }

  function formatHistoryTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function getTranslationLanguageLabel(value) {
    return TRANSLATION_LANGUAGE_OPTIONS.find((entry) => entry.value === value)?.label || value;
  }

  function fillLanguageSelect(selectNode, options = {}) {
    if (!selectNode) return;

    const { includeAuto = false, selectedValue = '' } = options;
    const optionNodes = TRANSLATION_LANGUAGE_OPTIONS
      .filter((entry) => includeAuto || entry.value !== 'AUTO')
      .map((entry) => {
        const optionNode = document.createElement('option');
        optionNode.value = entry.value;
        optionNode.textContent = entry.label;
        return optionNode;
      });

    selectNode.replaceChildren(...optionNodes);
    selectNode.value = optionNodes.some((entry) => entry.value === selectedValue)
      ? selectedValue
      : optionNodes[0]?.value || '';
  }

  function setTranslateBusy(nextBusy) {
    isTranslateBusy = nextBusy;
    if (translateSourceLanguage) translateSourceLanguage.disabled = nextBusy;
    if (translateTargetLanguage) translateTargetLanguage.disabled = nextBusy;
    if (btnTranslate) btnTranslate.disabled = nextBusy || !fullText;
  }

  function syncTranslateControls() {
    if (!btnTranslate) return;
    btnTranslate.disabled = isTranslateBusy || !fullText;
    btnTranslate.title = translationState.setupHint || 'Перевести текущий текст';
  }

  function renderEmptyWorkspace() {
    renderTextMessage('Приложение готово. Вставьте текст, начните диктовку или импортируйте файл.', {
      color: '#a4b0be',
      display: 'block',
      textAlign: 'center',
      marginTop: '40px',
      lineHeight: '1.6'
    });
  }

  function renderListenModeState() {
    if (!textContainer) return;
    textContainer.classList.add('listen-mode');
    renderTextMessage(
      fullText
        ? 'Текст готов к прослушиванию. Нажмите воспроизведение.'
        : 'Режим прослушивания активен.',
      {
        color: fullText ? '#ffffff' : '#95a5a6',
        fontWeight: 'bold',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px'
      }
    );
  }

  function renderCurrentText() {
    if (!textContainer) return;

    if (!fullText) {
      syncTranslateControls();
      textContainer.classList.remove('listen-mode');
      if (currentMode === 'listen') {
        renderListenModeState();
      } else {
        renderEmptyWorkspace();
      }
      return;
    }

    if (currentMode === 'read') {
      syncTranslateControls();
      textContainer.classList.remove('listen-mode');
      prepareSentenceUI(fullText);
      return;
    }

    syncTranslateControls();
    renderListenModeState();
  }

  function setTextHistory(history, nextActiveHistoryId = activeHistoryId) {
    textHistory = Array.isArray(history) ? history : [];
    activeHistoryId = nextActiveHistoryId && textHistory.some((entry) => entry.id === nextActiveHistoryId)
      ? nextActiveHistoryId
      : null;
    renderHistoryList();
  }

  function renderHistoryList() {
    if (!historyList) return;

    historyList.replaceChildren();

    if (historyMeta) {
      historyMeta.textContent = textHistory.length ? `${textHistory.length} записей` : 'История пуста';
    }

    if (btnHistoryClear) {
      btnHistoryClear.disabled = textHistory.length === 0;
    }

    if (textHistory.length === 0) {
      const emptyNode = document.createElement('div');
      emptyNode.className = 'history-empty';
      emptyNode.textContent = 'История появится после импорта, диктовки, вставки из буфера или ручного редактирования.';
      historyList.appendChild(emptyNode);
      return;
    }

    textHistory.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'history-row';

      const itemButton = document.createElement('button');
      itemButton.type = 'button';
      itemButton.className = 'history-item';
      if (entry.id === activeHistoryId) itemButton.classList.add('active');

      const sourceNode = document.createElement('div');
      sourceNode.className = 'history-source';
      sourceNode.textContent = entry.source || 'Текст';

      const previewNode = document.createElement('div');
      previewNode.className = 'history-preview';
      previewNode.textContent = entry.text || '';

      const statsNode = document.createElement('div');
      statsNode.className = 'history-stats';
      statsNode.textContent = `${entry.charCount || 0} симв. · ${entry.wordCount || 0} слов · ${formatHistoryTimestamp(entry.updatedAt)}`;

      itemButton.append(sourceNode, previewNode, statsNode);
      itemButton.addEventListener('click', () => {
        void applyTextFromSource(entry.text, {
          sourceLabel: entry.source || 'История',
          statusMessage: `Загружен текст из истории: ${entry.charCount || entry.text.length} символов`,
          saveToHistory: false,
          historyId: entry.id
        });
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'history-delete';
      deleteButton.textContent = '✕';
      deleteButton.title = 'Удалить запись';
      deleteButton.addEventListener('click', async () => {
        const deleteResult = await smartReader.deleteTextHistoryEntry(entry.id);
        if (!deleteResult.ok) {
          alert(`Не удалось удалить запись: ${deleteResult.error}`);
          return;
        }

        const nextActiveHistoryId = activeHistoryId === entry.id ? null : activeHistoryId;
        setTextHistory(deleteResult.history, nextActiveHistoryId);
      });

      row.append(itemButton, deleteButton);
      historyList.appendChild(row);
    });
  }

  async function persistTextInHistory(text, sourceLabel, reuseActiveHistory = false, extraEntry = {}) {
    if (!smartReader.upsertTextHistory) return false;

    const normalizedText = getNormalizedText(text);
    if (!normalizedText) return false;

    const historyResult = await smartReader.upsertTextHistory({
      ...extraEntry,
      id: reuseActiveHistory ? activeHistoryId : undefined,
      text: normalizedText,
      source: sourceLabel,
      label: sourceLabel
    });

    if (!historyResult.ok) {
      console.error(historyResult.error);
      return false;
    }

    activeHistoryId = historyResult.savedEntry?.id || activeHistoryId;
    setTextHistory(historyResult.history, activeHistoryId);
    return true;
  }

  async function applyTextFromSource(text, options = {}) {
    const {
      sourceLabel = 'Текст',
      statusMessage,
      saveToHistory = true,
      reuseActiveHistory = false,
      historyId = null,
      autoSpeak = false,
      historyEntry = null
    } = options;

    currentTextSource = sourceLabel;
    fullText = getNormalizedText(text);

    if (historyId) {
      activeHistoryId = historyId;
      setTextHistory(textHistory, activeHistoryId);
    } else if (saveToHistory && !reuseActiveHistory) {
      activeHistoryId = null;
    }

    updateCounters(fullText);
    renderCurrentText();

    if (statusMessage) {
      setStatus(statusMessage);
    } else if (fullText) {
      setStatus(`${sourceLabel}: ${fullText.length} символов`);
    } else {
      setStatus(`${sourceLabel}: текст отсутствует`);
    }

    if (saveToHistory && fullText) {
      await persistTextInHistory(fullText, sourceLabel, reuseActiveHistory, historyEntry || {});
    }

    if (autoSpeak && fullText) {
      void startSpeaking(fullText);
    }

    return Boolean(fullText);
  }

  async function refreshTranslationState() {
    if (!smartReader.getTranslationState) return;

    const translationResult = await smartReader.getTranslationState();
    if (!translationResult.ok) {
      console.error(translationResult.error);
      return;
    }

    translationState = {
      ...translationState,
      ...(translationResult.state || {})
    };

    fillLanguageSelect(translateSourceLanguage, {
      includeAuto: true,
      selectedValue: translationState.defaultSourceLanguage || 'AUTO'
    });
    fillLanguageSelect(translateTargetLanguage, {
      selectedValue: translationState.defaultTargetLanguage || 'EN'
    });
    syncTranslateControls();
  }

  async function translateCurrentText() {
    if (!smartReader.translateText) return;

    if (isEditing) {
      await exitEditMode();
    }

    if (!fullText) {
      alert('Сначала загрузите, вставьте или продиктуйте текст.');
      return;
    }

    const sourceLanguage = translateSourceLanguage ? translateSourceLanguage.value : 'AUTO';
    const targetLanguage = translateTargetLanguage ? translateTargetLanguage.value : 'EN';
    const originHistoryId = activeHistoryId;

    if (sourceLanguage === targetLanguage && sourceLanguage !== 'AUTO') {
      alert('Источник и язык перевода совпадают. Выберите другой целевой язык.');
      return;
    }

    setTranslateBusy(true);
    setStatus(`Перевод ${getTranslationLanguageLabel(sourceLanguage)} -> ${getTranslationLanguageLabel(targetLanguage)}...`);

    try {
      const translationResult = await smartReader.translateText({
        text: fullText,
        sourceLanguage,
        targetLanguage
      });

      if (!translationResult.ok) {
        alert(`Не удалось перевести текст: ${translationResult.error}`);
        setStatus('Перевод не выполнен');
        return;
      }

      const actualSourceLanguage = (translationResult.sourceLanguage || sourceLanguage || 'AUTO').toUpperCase();
      const actualTargetLanguage = (translationResult.targetLanguage || targetLanguage || 'EN').toUpperCase();
      const sourceLabel = `Перевод ${actualSourceLanguage} -> ${actualTargetLanguage}`;

      await applyTextFromSource(translationResult.text, {
        sourceLabel,
        statusMessage: `${sourceLabel}: ${translationResult.text.length} символов`,
        saveToHistory: true,
        reuseActiveHistory: false,
        historyEntry: {
          sourceLanguage: actualSourceLanguage,
          targetLanguage: actualTargetLanguage,
          translationProvider: translationResult.provider || translationState.providerName || 'DeepL',
          originHistoryId: originHistoryId || ''
        }
      });
    } finally {
      setTranslateBusy(false);
      syncTranslateControls();
    }
  }

  function getCloudProvider(providerId = activeCloudProviderId) {
    return cloudProviders.find((provider) => provider.id === providerId) || null;
  }

  function formatCloudFileTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function renderCloudEmpty(message) {
    if (!cloudFileList) return;
    const emptyNode = document.createElement('div');
    emptyNode.className = 'cloud-empty';
    emptyNode.textContent = message;
    cloudFileList.replaceChildren(emptyNode);
  }

  function revealCloudPanel() {
    if (!cloudPanel || !cloudPanel.classList.contains('active')) return;
    cloudPanel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function setCloudBusy(nextBusy) {
    isCloudBusy = nextBusy;
    if (btnCloudConnect) btnCloudConnect.disabled = nextBusy;
    if (btnCloudRefresh) btnCloudRefresh.disabled = nextBusy;
    if (btnCloudSearch) btnCloudSearch.disabled = nextBusy;
    if (btnCloudLoadMore) btnCloudLoadMore.disabled = nextBusy;
    if (cloudSearchInput) cloudSearchInput.disabled = nextBusy;
  }

  function renderCloudPanel() {
    if (!cloudPanel) return;

    cloudProviderCards.forEach((card) => {
      card.classList.toggle('active', card.dataset.providerId === activeCloudProviderId);
    });

    const provider = getCloudProvider();
    if (!provider) {
      cloudPanel.classList.remove('active');
      return;
    }

    cloudPanel.classList.add('active');
    if (cloudPanelTitle) cloudPanelTitle.textContent = provider.name || 'Облачный импорт';
    if (cloudStatus) cloudStatus.textContent = provider.setupHint || 'Выберите действие.';

    const canConnect = provider.configured;
    if (btnCloudConnect) {
      btnCloudConnect.hidden = !canConnect;
      btnCloudConnect.textContent = provider.connected ? 'Переподключить' : 'Подключить';
    }

    if (btnCloudRefresh) {
      btnCloudRefresh.hidden = !provider.configured || !provider.canBrowse;
    }

    const canSearch = provider.configured && provider.connected && provider.supportsSearch;
    if (cloudSearchRow) cloudSearchRow.hidden = !canSearch;

    if (cloudSetupNote) {
      cloudSetupNote.hidden = !provider.setupHint;
      cloudSetupNote.textContent = provider.setupHint || '';
    }

    if (cloudPagination) {
      cloudPagination.hidden = !cloudNextPageTokenByProvider.get(provider.id);
    }

    const files = cloudFilesByProvider.get(provider.id) || [];
    if (!provider.configured) {
      renderCloudEmpty(provider.setupHint || 'Интеграция пока недоступна.');
      return;
    }

    if (!provider.connected && files.length === 0) {
      renderCloudEmpty('Подключите аккаунт, чтобы увидеть доступные файлы.');
      return;
    }

    if (files.length === 0) {
      renderCloudEmpty('Файлы не найдены. Попробуйте другой запрос или обновите список.');
      return;
    }

    cloudFileList.replaceChildren();
    files.forEach((file) => {
      const row = document.createElement('div');
      row.className = 'cloud-file-row';

      const textWrap = document.createElement('div');
      const nameNode = document.createElement('div');
      nameNode.className = 'cloud-file-name';
      nameNode.textContent = file.name || 'Без названия';

      const metaNode = document.createElement('div');
      metaNode.className = 'cloud-file-meta';
      const extensionLabel = file.extension ? `.${file.extension}` : file.importKind;
      metaNode.textContent = `${extensionLabel} · ${formatCloudFileTimestamp(file.modifiedTime)}`;
      textWrap.append(nameNode, metaNode);

      const importButton = document.createElement('button');
      importButton.type = 'button';
      importButton.className = 'cloud-import-btn';
      importButton.textContent = 'Импорт';
      importButton.disabled = isCloudBusy;
      importButton.addEventListener('click', () => {
        void importCloudFileEntry(file);
      });

      row.append(textWrap, importButton);
      cloudFileList.appendChild(row);
    });
  }

  async function refreshCloudProvidersState() {
    if (!smartReader.getCloudProvidersState) return;
    const providersResult = await smartReader.getCloudProvidersState();
    if (!providersResult.ok) {
      console.error(providersResult.error);
      return;
    }

    cloudProviders = Array.isArray(providersResult.providers) ? providersResult.providers : [];
    if (activeCloudProviderId && !getCloudProvider(activeCloudProviderId)) {
      activeCloudProviderId = '';
    }
    renderCloudPanel();
  }

  async function loadCloudFiles(options = {}) {
    const { append = false } = options;
    const provider = getCloudProvider();
    if (!provider || !provider.canBrowse) return;

    setCloudBusy(true);
    if (cloudStatus) {
      cloudStatus.textContent = append
        ? `Загружаю ещё файлы из ${provider.name}...`
        : `Загружаю файлы из ${provider.name}...`;
    }

    try {
      const nextPageToken = append ? (cloudNextPageTokenByProvider.get(provider.id) || '') : '';
      const filesResult = await smartReader.listCloudFiles(provider.id, activeCloudQuery, nextPageToken);

      if (!filesResult.ok) {
        cloudProviders = cloudProviders.map((entry) => entry.id === provider.id ? { ...entry, connected: false } : entry);
        cloudFilesByProvider.set(provider.id, []);
        cloudNextPageTokenByProvider.set(provider.id, '');
        if (cloudStatus) cloudStatus.textContent = filesResult.error || 'Не удалось загрузить файлы.';
        renderCloudPanel();
        return;
      }

      const currentFiles = append ? (cloudFilesByProvider.get(provider.id) || []) : [];
      cloudFilesByProvider.set(provider.id, currentFiles.concat(filesResult.files || []));
      cloudNextPageTokenByProvider.set(provider.id, filesResult.nextPageToken || '');
      cloudProviders = cloudProviders.map((entry) => entry.id === provider.id ? { ...entry, ...filesResult.provider, connected: true } : entry);
      if (cloudStatus) cloudStatus.textContent = `${provider.name}: ${cloudFilesByProvider.get(provider.id).length} файлов готовы к импорту.`;
      renderCloudPanel();
    } finally {
      setCloudBusy(false);
    }
  }

  async function openCloudProvider(providerId, options = {}) {
    const { reloadFiles = false } = options;
    activeCloudProviderId = providerId;
    activeCloudQuery = '';
    if (cloudSearchInput) cloudSearchInput.value = '';
    renderCloudPanel();
    revealCloudPanel();
    await refreshCloudProvidersState();
    revealCloudPanel();

    const provider = getCloudProvider(providerId);
    if (!provider) return;

    if (provider.configured && provider.connected && provider.canBrowse) {
      const cachedFiles = cloudFilesByProvider.get(provider.id) || [];
      if (reloadFiles || cachedFiles.length === 0) {
        await loadCloudFiles();
      } else {
        if (cloudStatus) cloudStatus.textContent = `${provider.name}: ${cachedFiles.length} файлов готовы к импорту.`;
        renderCloudPanel();
        revealCloudPanel();
      }
    }
  }

  async function connectActiveCloudProvider() {
    const provider = getCloudProvider();
    if (!provider) return;

    setCloudBusy(true);
    if (cloudStatus) cloudStatus.textContent = `Подключаю ${provider.name}...`;

    try {
      const connectResult = await smartReader.connectCloudProvider(provider.id);
      if (!connectResult.ok) {
        if (cloudStatus) cloudStatus.textContent = connectResult.error || `Не удалось подключить ${provider.name}.`;
        return;
      }

      await refreshCloudProvidersState();
      await openCloudProvider(provider.id, { reloadFiles: true });
    } finally {
      setCloudBusy(false);
    }
  }

  async function searchActiveCloudFiles() {
    const provider = getCloudProvider();
    if (!provider || !provider.supportsSearch) return;

    activeCloudQuery = cloudSearchInput ? cloudSearchInput.value.trim() : '';
    cloudFilesByProvider.set(provider.id, []);
    cloudNextPageTokenByProvider.set(provider.id, '');
    await loadCloudFiles();
  }

  async function importCloudFileEntry(file) {
    const provider = getCloudProvider();
    if (!provider) return;

    setCloudBusy(true);
    renderImportState(`${provider.name}: готовлю файл ${file.name}...`, '#2f54eb');
    setStatus(`${provider.name}: импорт...`);

    try {
      const importResult = await smartReader.importCloudFile(provider.id, file.id);
      if (!importResult.ok) {
        showProcessingError(importResult.error, `${provider.name} не импортирован.`, {
          failureTitle: `${provider.name} не импортирован`,
          failureAction: 'Проверьте подключение аккаунта или попробуйте выбрать другой файл.',
          reopenUploadModal: true
        });
        return;
      }

      await processUploadedFile(importResult.filePath);
    } finally {
      setCloudBusy(false);
      await refreshCloudProvidersState();
    }
  }

  function renderImportState(message, color = '#2f54eb') {
    renderTextMessage(message, {
      color,
      fontWeight: 'bold',
      display: 'block',
      textAlign: 'center',
      marginTop: '40px',
      fontSize: '22px'
    });
  }

  function renderImportProblem(title, detail, action) {
    if (!textContainer) return;
    resetTextContainerWhiteSpace();

    const wrapper = document.createElement('div');
    applyInlineStyles(wrapper, {
      textAlign: 'center',
      color: '#747d8c',
      marginTop: '40px',
      lineHeight: '1.55',
      padding: '0 20px'
    });

    const titleNode = renderTextBlock('div', title, {
      color: '#2f3542',
      fontWeight: '700',
      fontSize: '20px',
      marginBottom: '10px'
    });
    const detailNode = renderTextBlock('div', detail, { marginBottom: '8px' });
    const actionNode = renderTextBlock('div', action, {
      color: '#2f54eb',
      fontWeight: '600'
    });

    wrapper.append(titleNode, detailNode, actionNode);
    textContainer.replaceChildren(wrapper);
  }

  function isYoutubeUrl(value) {
    const normalized = (value || '').toLowerCase();
    return normalized.includes('youtube.com') || normalized.includes('youtu.be');
  }

  function getFileExtension(filePath) {
    const cleanPath = (filePath || '').split(/[\\/]/).pop() || '';
    const lastDotIndex = cleanPath.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === cleanPath.length - 1) return '';
    return cleanPath.slice(lastDotIndex + 1).toLowerCase();
  }

  function getImportKind(filePath) {
    if (isYoutubeUrl(filePath)) return 'youtube';
    return getFileExtension(filePath);
  }

  function getSelectedFilePath(file) {
    if (!file) return '';
    if (smartReader.getFilePath) return smartReader.getFilePath(file);
    return file.path || '';
  }

  function getImportConfig(kind) {
    const configs = {
      pdf: {
        label: 'PDF',
        loading: 'Извлекаю текст из PDF...',
        color: '#d35400',
        failureTitle: 'PDF не импортирован',
        failureAction: 'Если это скан или поврежденный текстовый слой, нужен текстовый PDF или OCR.'
      },
      docx: {
        label: 'Word',
        loading: 'Считываю текст из Word-документа...',
        color: '#2f54eb',
        failureTitle: 'Word-документ не импортирован',
        failureAction: 'Проверьте файл или сохраните документ как .txt и импортируйте повторно.'
      },
      epub: {
        label: 'EPUB',
        loading: 'Извлекаю текст из EPUB-книги...',
        color: '#2ed573',
        failureTitle: 'EPUB не импортирован',
        failureAction: 'Проверьте файл или попробуйте экспортировать книгу в .txt.'
      },
      youtube: {
        label: 'YouTube',
        loading: 'Получаю субтитры YouTube...',
        color: '#ff4757',
        failureTitle: 'YouTube не импортирован автоматически',
        failureAction: 'Вставьте готовую расшифровку ниже или импортируйте файл .vtt, .srt или .txt.',
        reopenUploadModal: true
      },
      audio: {
        label: 'Аудио',
        loading: 'Распознаю аудиозапись...',
        color: '#0d47a1',
        failureTitle: 'Аудиофайл не распознан',
        failureAction: 'Проверьте формат файла или попробуйте WAV/MP3/OGG/FLAC с чистой речью.'
      },
      text: {
        label: 'Текстовый файл',
        loading: 'Загружаю текстовый файл...',
        color: '#2f54eb',
        failureTitle: 'Текстовый файл не импортирован',
        failureAction: 'Проверьте кодировку и убедитесь, что файл содержит текст.'
      },
      manual: {
        label: 'Вставленная расшифровка',
        failureTitle: 'Расшифровка не импортирована',
        failureAction: 'Проверьте, что после очистки субтитров остается обычный текст.'
      }
    };

    if (['mp3', 'wav', 'ogg', 'flac'].includes(kind)) return configs.audio;
    if (['txt', 'md', 'vtt', 'srt'].includes(kind)) return configs.text;
    return configs[kind] || null;
  }

  function renderLiveTranscript(text) {
    if (!textContainer) return;
    resetTextContainerWhiteSpace();

    const wrapper = document.createElement('div');
    applyInlineStyles(wrapper, {
      textAlign: 'left',
      fontSize: '20px',
      lineHeight: '1.6',
      color: '#2f3542',
      padding: '10px'
    });

    const label = renderTextBlock('span', '🔴 ИДЁТ ЗАПИСЬ (LIVE):', {
      color: '#ff4757',
      fontWeight: 'bold',
      display: 'block',
      marginBottom: '15px',
      fontSize: '14px'
    });

    const paragraph = renderTextBlock('p', text, {
      background: '#fffdf0',
      borderLeft: '4px solid #ffde43',
      padding: '15px',
      borderRadius: '4px',
      whiteSpace: 'pre-wrap'
    });

    wrapper.append(label, paragraph);
    textContainer.replaceChildren(wrapper);
  }

  function extractPythonError(output) {
    if (!output) return 'Неизвестная ошибка Python-процесса.';
    if (output.includes('ERROR:')) return output.split('ERROR:').pop().trim();
    return output.trim();
  }

  function normalizeRuntimeError(message) {
    const text = extractPythonError(message);

    if (/spawn python/i.test(text) || /enoent/i.test(text)) {
      return 'Python не найден в PATH. Установите Python и добавьте его в системный PATH.';
    }

    if (/No module named/i.test(text)) {
      return `Не хватает Python-библиотеки. Выполните: pip install -r requirements.txt\n\n${text}`;
    }

    if (/default input device/i.test(text) || /error querying device/i.test(text) || /invalid input device/i.test(text)) {
      return 'Микрофон недоступен. Проверьте подключение устройства и системные разрешения.';
    }

    return text;
  }

  function decodeBasicEntities(text) {
    return text
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&nbsp;', ' ');
  }

  function looksLikeSubtitleText(text) {
    const raw = text || '';
    return raw.includes('WEBVTT')
      || /-->/m.test(raw)
      || /\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3}/m.test(raw);
  }

  function normalizeSubtitleText(text) {
    const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
    const cleanedLines = [];

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      if (line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:') || line.startsWith('NOTE')) return;
      if (/^\d+$/.test(line)) return;
      if (/^\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3}/.test(line)) return;

      const withoutTags = line.replace(/<[^>]+>/g, '');
      const normalized = decodeBasicEntities(withoutTags).trim();
      if (!normalized) return;
      if (cleanedLines[cleanedLines.length - 1] === normalized) return;
      cleanedLines.push(normalized);
    });

    return cleanedLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  function prepareImportedText(rawText, ext = '') {
    const normalizedExt = (ext || '').toLowerCase();
    const cleanText = rawText || '';

    if (['vtt', 'srt'].includes(normalizedExt) || looksLikeSubtitleText(cleanText)) {
      return normalizeSubtitleText(cleanText);
    }

    return getNormalizedText(cleanText);
  }

  async function applyImportedText(text, sourceLabel = 'Текст') {
    if (!text) {
      renderTextMessage('Текст загружен, но после очистки субтитров содержимое оказалось пустым.', {
        color: '#747d8c',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px'
      });
      setStatus('Импорт завершился без текста');
      return false;
    }

    await applyTextFromSource(text, {
      sourceLabel,
      statusMessage: `${sourceLabel} импортирован: ${text.length} символов`
    });
    return true;
  }

  async function completeImportedText(rawText, kind, importConfig) {
    const preparedText = prepareImportedText(rawText, kind);

    if (!preparedText) {
      showProcessingError('После обработки не найден импортируемый текст.', `${importConfig.label} не импортирован.`, {
        failureTitle: importConfig.failureTitle,
        failureAction: importConfig.failureAction,
        reopenUploadModal: importConfig.reopenUploadModal
      });
      return false;
    }

    return applyImportedText(preparedText, importConfig.label);
  }

  function showProcessingError(message, fallbackText = 'Произошла ошибка модуля обработки.', options = {}) {
    const safeMessage = normalizeRuntimeError(message || fallbackText);
    alert(safeMessage);

    if (options.reopenUploadModal && uploadModal) uploadModal.classList.add('active');

    if (options.failureTitle && options.failureAction) {
      renderImportProblem(options.failureTitle, safeMessage, options.failureAction);
    } else {
      renderTextMessage(fallbackText, {
        color: '#747d8c',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px'
      });
    }

    if (options.status) {
      setStatus(options.status);
    } else if (options.failureTitle) {
      setStatus('Импорт не выполнен');
    }
  }

  function updateCounters(text) {
    const cleanText = text || '';
    cntChars.textContent = cleanText.length;
    const words = cleanText.trim().split(/\s+/).filter((word) => word.length > 0);
    cntWords.textContent = words.length;
  }

  function resetSttInterface() {
    isSttRecording = false;
    accumulatedSttText = '';

    if (btnStt) {
      btnStt.disabled = false;
      btnStt.style.backgroundColor = '#dff9fb';
      btnStt.style.color = '#130cb7';
      btnStt.textContent = '🎙️ Диктовать';
    }
  }

  function clearAllHighlightsDirectly() {
    visualSentenceSpans.forEach((span) => {
      span.style.backgroundColor = 'transparent';
      span.style.color = '';
    });
    lastActiveIndex = -1;
  }

  function stopPlayback(resetPosition = false) {
    audioPlayer.pause();
    if (resetPosition) audioPlayer.currentTime = 0;
    clearAllHighlightsDirectly();
  }

  function enterEditMode() {
    if (!textContainer || !btnEditToggle) return;

    isEditing = true;
    stopPlayback(false);
    textContainer.classList.remove('listen-mode');
    textContainer.contentEditable = 'true';
    clearTextContainer();
    textContainer.textContent = fullText;
    textContainer.style.whiteSpace = 'pre-wrap';
    textContainer.focus();
    btnEditToggle.textContent = '✔️ Готово';
    btnEditToggle.style.backgroundColor = '#2ed573';
    btnEditToggle.style.color = '#ffffff';
    setStatus('Режим редактирования...');
  }

  async function exitEditMode(options = {}) {
    const { saveToHistory = true } = options;
    if (!textContainer || !btnEditToggle) return '';

    isEditing = false;
    textContainer.contentEditable = 'false';
    resetTextContainerWhiteSpace();
    btnEditToggle.textContent = '✍️ Редактировать';
    btnEditToggle.style.backgroundColor = '#ffeaa7';
    btnEditToggle.style.color = '#d35400';

    const editedText = getNormalizedText(textContainer.innerText);
    fullText = editedText;
    updateCounters(fullText);
    renderCurrentText();

    if (fullText) {
      setStatus('Режим просмотра');
      if (saveToHistory) {
        await persistTextInHistory(fullText, currentTextSource || 'Редактирование', true);
      } else {
        setTextHistory(textHistory, activeHistoryId);
      }
    } else {
      activeHistoryId = null;
      setTextHistory(textHistory, activeHistoryId);
      setStatus('Текст очищен');
    }

    return fullText;
  }

  function toggleEditMode() {
    if (isEditing) {
      void exitEditMode();
      return;
    }

    enterEditMode();
  }

  function prepareSentenceUI(text) {
    if (!textContainer || currentMode !== 'read') return;

    resetTextContainerWhiteSpace();
    clearTextContainer();
    visualSentenceSpans = [];
    lastActiveIndex = -1;

    const lines = text.split('\n');
    lines.forEach((line, lineIndex) => {
      if (line.trim() === '') {
        textContainer.appendChild(document.createElement('br'));
        return;
      }

      const sentences = line.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+(?:\s+|$)/g) || [line];
      sentences.forEach((sentenceText) => {
        const span = document.createElement('span');
        span.textContent = sentenceText;
        span.className = 'sentence-span';
        span.style.padding = '3px 5px';
        span.style.borderRadius = '6px';
        span.style.backgroundColor = 'transparent';
        span.style.display = 'inline';
        span.style.transition = 'background-color 0.15s ease, color 0.15s ease';
        textContainer.appendChild(span);
        visualSentenceSpans.push(span);
      });

      if (lineIndex < lines.length - 1) {
        textContainer.appendChild(document.createElement('br'));
      }
    });
  }

  function calculateSentenceTimings() {
    sentenceTimings = [];
    let timingIdx = 0;

    visualSentenceSpans.forEach((span) => {
      const cleanSentence = span.textContent.toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
      let start = null;
      let end = null;
      let accumulatedCleanWords = '';

      while (timingIdx < wordTimings.length) {
        const wordObj = wordTimings[timingIdx];
        const cleanWord = wordObj.word.toLowerCase().replace(/[^a-z0-9а-яё]/g, '');

        if (cleanSentence.includes(accumulatedCleanWords + cleanWord) || accumulatedCleanWords === '') {
          if (start === null) start = wordObj.start;
          end = wordObj.end;
          accumulatedCleanWords += cleanWord;
          timingIdx++;
        } else {
          break;
        }
      }

      sentenceTimings.push({
        start: start !== null ? start : (sentenceTimings[sentenceTimings.length - 1]?.end || 0),
        end: end !== null ? end : (start !== null ? start : (sentenceTimings[sentenceTimings.length - 1]?.end || 0))
      });
    });
  }

  async function processUploadedFile(filePath) {
    if (!filePath) return false;
    if (uploadModal) uploadModal.classList.remove('active');

    const ext = getImportKind(filePath);
    const importConfig = getImportConfig(ext);

    if (importConfig && importConfig.loading) {
      renderImportState(importConfig.loading, importConfig.color);
      setStatus(`${importConfig.label}: импорт...`);
    } else if (['txt', 'md', 'vtt', 'srt'].includes(ext)) {
      setStatus('Текстовый файл: импорт...');
    }

    if (['txt', 'md', 'vtt', 'srt'].includes(ext)) {
      const fileResult = await smartReader.readTextFile(filePath);
      if (!fileResult.ok) {
        showProcessingError(fileResult.error, 'Не удалось прочитать текстовый файл.', {
          failureTitle: importConfig.failureTitle,
          failureAction: importConfig.failureAction
        });
        return false;
      }

      return completeImportedText(fileResult.text, ext, importConfig);
    }

    if (!importConfig) {
      const displayExt = ext ? `.${ext}` : 'без расширения';
      showProcessingError(
        `Формат ${displayExt} не поддерживается.`,
        'Файл не импортирован.',
        {
          failureTitle: 'Формат не поддерживается',
          failureAction: 'Используйте PDF, DOCX, EPUB, TXT, MD, VTT, SRT, MP3, WAV, OGG, FLAC или ссылку YouTube.'
        }
      );
      return false;
    }

    const result = await smartReader.processImport(filePath);
    const output = result.stdout || result.stderr || '';

    if (output.includes('FILE_SUCCESS:')) {
      const successText = output.slice(output.indexOf('FILE_SUCCESS:') + 'FILE_SUCCESS:'.length).trim();
      return completeImportedText(successText, ext, importConfig);
    }

    const message = result.error || output || `Процесс завершился с кодом ${result.code}.`;
    showProcessingError(message, `${importConfig.label} не импортирован.`, {
      failureTitle: importConfig.failureTitle,
      failureAction: importConfig.failureAction,
      reopenUploadModal: importConfig.reopenUploadModal
    });
    return false;
  }

  async function startSpeaking(text) {
    if (isEditing) await exitEditMode();

    audioPlayer.pause();
    clearAllHighlightsDirectly();
    if (textContainer) textContainer.style.opacity = '0.6';

    const result = await smartReader.synthesizeText(text, selectedGender);

    if (textContainer) textContainer.style.opacity = '1';

    if (result.stdout && result.stdout.includes('SUCCESS')) {
      wordTimings = Array.isArray(result.timings) ? result.timings : [];
      prepareSentenceUI(text);
      calculateSentenceTimings();
      audioPlayer.src = `temp_voice.mp3?cb=${Date.now()}`;
      audioPlayer.volume = getPlaybackVolume();
      audioPlayer.playbackRate = getPlaybackRate();
      audioPlayer.play().catch((error) => console.error(error));
      return;
    }

    const message = result.error || result.stdout || result.stderr || `Процесс завершился с кодом ${result.code}.`;
    showProcessingError(message, 'Не удалось выполнить озвучку текста.');
  }

  async function exportCurrentText() {
    if (isEditing) await exitEditMode();

    if (!fullText || fullText.trim() === '') {
      alert('Нет текста для экспорта!');
      return;
    }

    const result = await smartReader.showSaveDialog();
    if (result.canceled || !result.filePath) return;

    const exportResult = await smartReader.exportText(result.filePath, fullText);
    if (exportResult.ok) {
      alert('Файл сохранен!');
    } else {
      alert(`Ошибка сохранения: ${exportResult.error}`);
    }
  }

  async function loadTextHistory() {
    if (!smartReader.readTextHistory) return;

    const historyResult = await smartReader.readTextHistory();
    if (!historyResult.ok) {
      console.error(historyResult.error);
      return;
    }

    setTextHistory(historyResult.history, activeHistoryId);
  }

  async function clearTextHistory() {
    const historyResult = await smartReader.clearTextHistory();
    if (!historyResult.ok) {
      alert(`Не удалось очистить историю: ${historyResult.error}`);
      return;
    }

    activeHistoryId = null;
    setTextHistory(historyResult.history, activeHistoryId);
  }

  if (btnFontToggle) {
    btnFontToggle.addEventListener('click', () => {
      textContainer.classList.toggle('dyslexic-mode');
      btnFontToggle.classList.toggle('active');
    });
  }

  if (btnTriggerUpload && uploadModal && btnModalClose) {
    btnTriggerUpload.addEventListener('click', async () => {
      uploadModal.classList.add('active');
      await refreshCloudProvidersState();
    });
    btnModalClose.addEventListener('click', () => {
      uploadModal.classList.remove('active');
      clearImportInputs();
    });

    uploadModal.addEventListener('click', (event) => {
      if (event.target === uploadModal) {
        uploadModal.classList.remove('active');
        clearImportInputs();
      }
    });
  }

  cloudProviderCards.forEach((card) => {
    card.addEventListener('click', () => {
      const providerId = card.dataset.providerId;
      if (providerId) {
        void openCloudProvider(providerId);
      }
    });
  });

  const dropboxCard = document.getElementById('cloud-dropbox');
  if (dropboxCard) {
    dropboxCard.addEventListener('click', () => {
      alert('Dropbox пока не входит в текущий cloud contour. Сейчас поддержаны Google Drive и OneDrive.');
    });
  }

  if (btnCloudConnect) {
    btnCloudConnect.addEventListener('click', () => {
      void connectActiveCloudProvider();
    });
  }

  if (btnCloudRefresh) {
    btnCloudRefresh.addEventListener('click', () => {
      void openCloudProvider(activeCloudProviderId, { reloadFiles: true });
    });
  }

  if (btnCloudSearch) {
    btnCloudSearch.addEventListener('click', () => {
      void searchActiveCloudFiles();
    });
  }

  if (cloudSearchInput) {
    cloudSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void searchActiveCloudFiles();
      }
    });
  }

  if (btnCloudLoadMore) {
    btnCloudLoadMore.addEventListener('click', () => {
      void loadCloudFiles({ append: true });
    });
  }

  if (btnYoutubeSubmit && youtubeUrlInput) {
    btnYoutubeSubmit.addEventListener('click', async () => {
      const url = youtubeUrlInput.value.trim();
      if (!url) {
        alert('Пожалуйста, вставьте ссылку на видео YouTube!');
        return;
      }

      if (!isYoutubeUrl(url)) {
        alert('Ссылка должна вести на youtube.com или youtu.be.');
        return;
      }

      const imported = await processUploadedFile(url);
      if (imported && youtubeUrlInput) youtubeUrlInput.value = '';
    });
  }

  if (btnTranscriptPaste && transcriptPasteInput) {
    btnTranscriptPaste.addEventListener('click', async () => {
      const rawText = transcriptPasteInput.value.trim();
      if (!rawText) {
        alert('Пожалуйста, вставьте текст расшифровки или субтитров.');
        return;
      }

      if (uploadModal) uploadModal.classList.remove('active');
      const importConfig = getImportConfig('manual');
      if (await completeImportedText(rawText, 'pasted', importConfig)) clearImportInputs();
    });
  }

  if (dropzone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => event.preventDefault(), false);
      document.body.addEventListener(eventName, (event) => event.preventDefault(), false);
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-over'), false);
    });

    dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer.files[0];
      if (file) void processUploadedFile(getSelectedFilePath(file));
    });
  }

  if (btnBrowseTrigger && universalFileInput) {
    btnBrowseTrigger.addEventListener('click', () => universalFileInput.click());
    universalFileInput.addEventListener('change', () => {
      const file = universalFileInput.files[0];
      if (file) {
        void processUploadedFile(getSelectedFilePath(file));
        universalFileInput.value = '';
      }
    });
  }

  if (btnEditToggle) {
    btnEditToggle.addEventListener('click', () => toggleEditMode());
  }

  btnBold.addEventListener('click', () => {
    if (isEditing) document.execCommand('bold', false, null);
  });

  btnItalic.addEventListener('click', () => {
    if (isEditing) document.execCommand('italic', false, null);
  });

  btnList.addEventListener('click', () => {
    if (isEditing) document.execCommand('insertUnorderedList', false, null);
  });

  if (btnDictionary) {
    btnDictionary.addEventListener('click', async () => {
      const dictResult = await smartReader.readUserDictionary();
      let currentDict = dictResult.ok ? dictResult.dictionary : {};

      if (!dictResult.ok) {
        alert(`Не удалось прочитать словарь: ${dictResult.error}`);
        currentDict = {};
      }

      const dictList = Object.entries(currentDict).map(([wrong, right]) => `• "${wrong}" -> "${right}"`).join('\n');
      const action = prompt(`📖 ТЕКУЩИЙ СЛОВАРЬ ИИ:\n${dictList || 'Словарь пуст.'}\n\nФормат добавления:\nошибка -> исправление`);

      if (action && action.includes('->')) {
        const parts = action.split('->');
        const wrong = parts[0].trim().toLowerCase();
        const right = parts[1].trim();

        if (wrong && right) {
          currentDict[wrong] = right;
          const saveResult = await smartReader.writeUserDictionary(currentDict);

          if (saveResult.ok) {
            alert(`Успешно добавлено! "${wrong}" -> "${right}".`);
          } else {
            alert(`Не удалось сохранить словарь: ${saveResult.error}`);
          }
        }
      }
    });
  }

  if (btnTranslate) {
    btnTranslate.addEventListener('click', () => {
      void translateCurrentText();
    });
  }

  if (modeRead && modeListen) {
    modeRead.addEventListener('click', () => {
      currentMode = 'read';
      modeRead.classList.add('active');
      modeListen.classList.remove('active');
      renderCurrentText();
    });

    modeListen.addEventListener('click', () => {
      currentMode = 'listen';
      modeListen.classList.add('active');
      modeRead.classList.remove('active');
      renderCurrentText();
    });
  }

  if (btnHistoryClear) {
    btnHistoryClear.addEventListener('click', () => {
      void clearTextHistory();
    });
  }

  avatarCards.forEach((card) => {
    card.addEventListener('click', () => {
      avatarCards.forEach((avatar) => avatar.classList.remove('active'));
      card.classList.add('active');
      selectedGender = card.getAttribute('data-voice-gender');
      if (!audioPlayer.paused && fullText) void startSpeaking(fullText);
    });
  });

  const removeClipboardListener = smartReader.onClipboardText((text) => {
    if (!text || text.trim() === '') return;
    void applyTextFromSource(text, {
      sourceLabel: 'Буфер обмена',
      statusMessage: `Буфер обмена: ${text.trim().length} символов`,
      autoSpeak: true
    });
  });

  const removeLiveSttListener = smartReader.onLiveSttEvent((event) => {
    if (event.type === 'ready') {
      btnStt.disabled = false;
      btnStt.textContent = '⏹️ Остановить';
      btnStt.style.backgroundColor = '#ff4757';
      renderTextMessage('🔴 Говорите, ИИ слушает...', {
        color: '#ff4757',
        fontWeight: 'bold',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px',
        fontSize: '22px'
      });
      return;
    }

    if (event.type === 'partial') {
      if (event.text) {
        accumulatedSttText += accumulatedSttText ? ` ${event.text}` : event.text;
        updateCounters(accumulatedSttText);
        renderLiveTranscript(accumulatedSttText);
      }
      return;
    }

    if (event.type === 'finished') {
      void applyTextFromSource(accumulatedSttText, {
        sourceLabel: 'Диктовка',
        statusMessage: `Диктовка завершена: ${accumulatedSttText.trim().length} символов`
      });
      return;
    }

    if (event.type === 'error' || event.type === 'spawn-error') {
      showProcessingError(event.message, 'Не удалось завершить распознавание речи.');
      resetSttInterface();
      return;
    }

    if (event.type === 'close') {
      if (event.trailingMessage && event.trailingMessage.startsWith('ERROR:')) {
        showProcessingError(event.trailingMessage, 'Не удалось завершить распознавание речи.');
      } else if (event.code !== 0 && event.stderr) {
        showProcessingError(event.stderr, 'Не удалось завершить распознавание речи.');
      }
      resetSttInterface();
    }
  });

  window.addEventListener('beforeunload', () => {
    removeClipboardListener();
    removeLiveSttListener();
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const hasPrimaryModifier = event.ctrlKey || event.metaKey;
    const typingTarget = isTypingTarget(event.target);

    if (event.key === 'Escape') {
      if (uploadModal && uploadModal.classList.contains('active')) {
        event.preventDefault();
        uploadModal.classList.remove('active');
        clearImportInputs();
        return;
      }

      if (isEditing) {
        event.preventDefault();
        void exitEditMode();
        return;
      }

      if (!audioPlayer.paused || audioPlayer.currentTime > 0) {
        event.preventDefault();
        stopPlayback(true);
      }
      return;
    }

    if (hasPrimaryModifier && key === 's') {
      event.preventDefault();
      void exportCurrentText();
      return;
    }

    if (typingTarget) return;

    if (hasPrimaryModifier && key === 'i') {
      event.preventDefault();
      if (uploadModal) uploadModal.classList.add('active');
      return;
    }

    if (hasPrimaryModifier && key === 'e') {
      event.preventDefault();
      toggleEditMode();
      return;
    }

    if (hasPrimaryModifier && key === '1' && modeRead) {
      event.preventDefault();
      modeRead.click();
      return;
    }

    if (hasPrimaryModifier && key === '2' && modeListen) {
      event.preventDefault();
      modeListen.click();
      return;
    }

    if (!event.altKey && !hasPrimaryModifier && key === ' ') {
      event.preventDefault();
      if (audioPlayer.src && !audioPlayer.paused) {
        audioPlayer.pause();
      } else if (audioPlayer.src && audioPlayer.paused) {
        audioPlayer.play().catch((error) => console.error(error));
      } else if (fullText) {
        void startSpeaking(fullText);
      }
    }
  });

  if (btnStt) {
    btnStt.addEventListener('click', async () => {
      if (isEditing) await exitEditMode();

      if (!isSttRecording) {
        isSttRecording = true;
        accumulatedSttText = '';
        btnStt.disabled = true;
        btnStt.textContent = '⏳ Настройка...';
        btnStt.style.backgroundColor = '#ffbe76';
        btnStt.style.color = '#ffffff';

        renderTextMessage('🎙️ Включаю микрофон...', {
          color: '#e67e22',
          fontWeight: 'bold',
          display: 'block',
          textAlign: 'center',
          marginTop: '40px',
          fontSize: '22px'
        });

        const startResult = await smartReader.startLiveStt();
        if (!startResult.ok) {
          showProcessingError(startResult.error, 'Не удалось запустить распознавание речи.');
          resetSttInterface();
        }
      } else {
        const stopResult = await smartReader.stopLiveStt();
        if (!stopResult.ok) {
          showProcessingError(stopResult.error, 'Не удалось остановить распознавание речи.');
          resetSttInterface();
        }
      }
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', () => {
      void exportCurrentText();
    });
  }

  audioPlayer.addEventListener('timeupdate', () => {
    if (currentMode !== 'read' || sentenceTimings.length === 0 || visualSentenceSpans.length === 0) return;

    const syncSlider = document.getElementById('sync-slider');
    const calibratedTime = audioPlayer.currentTime + (syncSlider ? parseFloat(syncSlider.value) : 0);
    let activeIndex = -1;

    for (let index = 0; index < sentenceTimings.length; index++) {
      if (calibratedTime >= sentenceTimings[index].start && calibratedTime <= sentenceTimings[index].end) {
        activeIndex = index;
        break;
      }
    }

    if (activeIndex !== -1 && activeIndex !== lastActiveIndex) {
      if (lastActiveIndex !== -1 && visualSentenceSpans[lastActiveIndex]) {
        visualSentenceSpans[lastActiveIndex].style.backgroundColor = 'transparent';
        visualSentenceSpans[lastActiveIndex].style.color = '';
      }

      const targetSpan = visualSentenceSpans[activeIndex];
      if (targetSpan) {
        targetSpan.style.backgroundColor = '#ffde43';
        targetSpan.style.color = '#000000';
        const parent = textContainer;
        const elemTop = targetSpan.offsetTop;
        const elemBottom = elemTop + targetSpan.clientHeight;

        if (elemBottom > parent.scrollTop + parent.clientHeight - 60 || elemTop < parent.scrollTop + 40) {
          parent.scrollTo({ top: elemTop - (parent.clientHeight / 2), behavior: 'smooth' });
        }
      }

      lastActiveIndex = activeIndex;
    }
  });

  audioPlayer.addEventListener('ended', () => {
    clearAllHighlightsDirectly();
  });

  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      if (audioPlayer.src && audioPlayer.paused) {
        audioPlayer.play().catch((error) => console.error(error));
      } else if (fullText) {
        void startSpeaking(fullText);
      }
    });
  }

  if (btnPause) {
    btnPause.addEventListener('click', () => audioPlayer.pause());
  }

  if (btnStop) {
    btnStop.addEventListener('click', () => {
      stopPlayback(true);
    });
  }

  if (rateSlider) {
    rateSlider.addEventListener('input', () => {
      audioPlayer.playbackRate = parseFloat(rateSlider.value);
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      audioPlayer.volume = parseFloat(volumeSlider.value);
    });
  }

  renderCurrentText();
  fillLanguageSelect(translateSourceLanguage, { includeAuto: true, selectedValue: 'AUTO' });
  fillLanguageSelect(translateTargetLanguage, { selectedValue: 'EN' });
  syncTranslateControls();
  void loadTextHistory();
  void refreshTranslationState();
  void refreshCloudProvidersState();
});
