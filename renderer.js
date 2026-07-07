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

  let fullText = '';
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

    return cleanText.trim();
  }

  function applyImportedText(text) {
    fullText = text;
    updateCounters(fullText);

    if (fullText) {
      if (currentMode === 'read') {
        prepareSentenceUI(fullText);
      } else {
        renderTextMessage('🎧 Текст загружен. Переключитесь в режим чтения или нажмите воспроизведение.', {
          color: '#2f54eb',
          fontWeight: 'bold',
          display: 'block',
          textAlign: 'center',
          marginTop: '40px'
        });
      }
    } else {
      renderTextMessage('Текст загружен, но после очистки субтитров содержимое оказалось пустым.', {
        color: '#747d8c',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px'
      });
    }
  }

  function showProcessingError(message, fallbackText = 'Произошла ошибка ИИ-модуля.') {
    const safeMessage = normalizeRuntimeError(message || fallbackText);
    alert(safeMessage);
    renderTextMessage(fallbackText, {
      color: '#747d8c',
      display: 'block',
      textAlign: 'center',
      marginTop: '40px'
    });
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
    if (!filePath) return;
    if (uploadModal) uploadModal.classList.remove('active');

    const isYoutube = filePath.includes('youtube.com') || filePath.includes('youtu.be');
    const ext = isYoutube ? 'youtube' : filePath.split('.').pop().toLowerCase();

    if (ext === 'pdf') {
      renderTextMessage('📄 ИИ извлекает страницы из PDF книги...', {
        color: '#d35400',
        fontWeight: 'bold',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px',
        fontSize: '22px'
      });
    } else if (ext === 'docx') {
      renderTextMessage('📝 ИИ считывает текстовые блоки документа Word (.docx)...', {
        color: '#2f54eb',
        fontWeight: 'bold',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px',
        fontSize: '22px'
      });
    } else if (ext === 'epub') {
      renderTextMessage('📚 ИИ распаковывает и форматирует электронную книгу (.epub)...', {
        color: '#2ed573',
        fontWeight: 'bold',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px',
        fontSize: '22px'
      });
    } else if (ext === 'youtube') {
      renderTextMessage('⚙️ ИИ связывается с YouTube и расшифровывает субтитры видео...', {
        color: '#ff4757',
        fontWeight: 'bold',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px',
        fontSize: '22px'
      });
    } else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
      renderTextMessage('🎙️ ИИ переводит аудиозапись в текст...', {
        color: '#0d47a1',
        fontWeight: 'bold',
        display: 'block',
        textAlign: 'center',
        marginTop: '40px',
        fontSize: '22px'
      });
    } else if (['txt', 'md', 'vtt', 'srt'].includes(ext)) {
      const fileResult = await smartReader.readTextFile(filePath);
      if (!fileResult.ok) {
        alert(`Ошибка чтения: ${fileResult.error}`);
        return;
      }

      applyImportedText(prepareImportedText(fileResult.text, ext));
      return;
    } else {
      alert(`Формат .${ext} пока не поддерживается ИИ. Используйте PDF, DOCX, EPUB, TXT, VTT, SRT, аудио или YouTube.`);
      return;
    }

    const result = await smartReader.processImport(filePath);
    const output = result.stdout || result.stderr;

    if (output.includes('FILE_SUCCESS:')) {
      applyImportedText(output.split('FILE_SUCCESS:')[1].trim());
      return;
    }

    const message = result.error || output || `Процесс завершился с кодом ${result.code}.`;
    showProcessingError(message);
  }

  async function startSpeaking(text) {
    if (isEditing && btnEditToggle) btnEditToggle.click();

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

  if (btnFontToggle) {
    btnFontToggle.addEventListener('click', () => {
      textContainer.classList.toggle('dyslexic-mode');
      btnFontToggle.classList.toggle('active');
    });
  }

  if (btnTriggerUpload && uploadModal && btnModalClose) {
    btnTriggerUpload.addEventListener('click', () => uploadModal.classList.add('active'));
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

  if (btnYoutubeSubmit && youtubeUrlInput) {
    btnYoutubeSubmit.addEventListener('click', () => {
      const url = youtubeUrlInput.value.trim();
      if (!url) {
        alert('Пожалуйста, вставьте ссылку на видео YouTube!');
        return;
      }

      void processUploadedFile(url);
      if (youtubeUrlInput) youtubeUrlInput.value = '';
    });
  }

  if (btnTranscriptPaste && transcriptPasteInput) {
    btnTranscriptPaste.addEventListener('click', () => {
      const rawText = transcriptPasteInput.value.trim();
      if (!rawText) {
        alert('Пожалуйста, вставьте текст расшифровки или субтитров.');
        return;
      }

      if (uploadModal) uploadModal.classList.remove('active');
      applyImportedText(prepareImportedText(rawText, 'pasted'));
      clearImportInputs();
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
      if (file) void processUploadedFile(file.path);
    });
  }

  if (btnBrowseTrigger && universalFileInput) {
    btnBrowseTrigger.addEventListener('click', () => universalFileInput.click());
    universalFileInput.addEventListener('change', () => {
      const file = universalFileInput.files[0];
      if (file) {
        void processUploadedFile(file.path);
        universalFileInput.value = '';
      }
    });
  }

  if (btnEditToggle) {
    btnEditToggle.addEventListener('click', () => {
      if (!isEditing) {
        isEditing = true;
        audioPlayer.pause();
        clearAllHighlightsDirectly();
        textContainer.contentEditable = 'true';
        textContainer.focus();
        clearTextContainer();
        textContainer.textContent = fullText;
        textContainer.style.whiteSpace = 'pre-wrap';
        btnEditToggle.textContent = '✔️ Готово';
        btnEditToggle.style.backgroundColor = '#2ed573';
        btnEditToggle.style.color = '#ffffff';
        lblStatus.textContent = 'Режим редактирования...';
      } else {
        isEditing = false;
        textContainer.contentEditable = 'false';
        resetTextContainerWhiteSpace();
        fullText = textContainer.innerText.trim();
        updateCounters(fullText);
        if (currentMode === 'read' && fullText) prepareSentenceUI(fullText);
        btnEditToggle.textContent = '✍️ Редактировать';
        btnEditToggle.style.backgroundColor = '#ffeaa7';
        btnEditToggle.style.color = '#d35400';
        lblStatus.textContent = 'Режим просмотра';
      }
    });
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

  if (modeRead && modeListen) {
    modeRead.addEventListener('click', () => {
      currentMode = 'read';
      modeRead.classList.add('active');
      modeListen.classList.remove('active');
      textContainer.classList.remove('listen-mode');
      if (fullText) prepareSentenceUI(fullText);
    });

    modeListen.addEventListener('click', () => {
      currentMode = 'listen';
      modeListen.classList.add('active');
      modeRead.classList.remove('active');
      textContainer.classList.add('listen-mode');
      renderTextMessage('🎧 Режим прослушивания активен...');
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
    fullText = text;
    updateCounters(fullText);
    if (currentMode === 'read') prepareSentenceUI(text);
    void startSpeaking(text);
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
      fullText = accumulatedSttText.trim();
      updateCounters(fullText);
      if (fullText && currentMode === 'read') prepareSentenceUI(fullText);
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

  if (btnStt) {
    btnStt.addEventListener('click', async () => {
      if (isEditing && btnEditToggle) btnEditToggle.click();

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
    btnExport.addEventListener('click', async () => {
      if (!fullText || fullText.trim() === '') {
        alert('Нет текста для экспорта!');
        return;
      }

      const result = await smartReader.showSaveDialog();
      if (!result.canceled && result.filePath) {
        const exportResult = await smartReader.exportText(result.filePath, fullText);
        if (exportResult.ok) {
          alert('Файл сохранен!');
        } else {
          alert(`Ошибка сохранения: ${exportResult.error}`);
        }
      }
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
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      clearAllHighlightsDirectly();
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
});
