(() => {
  const canvas = document.getElementById('canvas');
  const viewport = document.getElementById('viewport');
  const svg = document.getElementById('edges');
  const edgeFlipButton = document.getElementById('edgeFlipButton');
  const emptyMessage = document.getElementById('emptyMessage');
  const statusBox = document.getElementById('status');
  const toggleAllBtn = document.getElementById('toggleAllBtn');
  const batchSelectBtn = document.getElementById('batchSelectBtn');
  const exportPortableBtn = document.getElementById('exportPortableBtn');
  const importProjectBtn = document.getElementById('importProjectBtn');
  const importProjectInput = document.getElementById('importProjectInput');
  const flowchartSearchInput =
    document.getElementById('flowchartSearchInput');
  const fileTree = document.getElementById('fileTree');
  const createFolderBtn = document.getElementById('createFolderBtn');
  const createChartBtn = document.getElementById('createChartBtn');
  const savePdfControl = document.getElementById('savePdfControl');
  const savePdfBtn = document.getElementById('savePdfBtn');
  const savePdfMenu = document.getElementById('savePdfMenu');
  const saveCurrentPdfBtn = document.getElementById('saveCurrentPdfBtn');
  const saveAllPdfBtn = document.getElementById('saveAllPdfBtn');
  const cacheManagerBtn = document.getElementById('cacheManagerBtn');
  const cacheManagerBackdrop = document.getElementById('cacheManagerBackdrop');
  const cacheManagerCloseBtn = document.getElementById('cacheManagerCloseBtn');
  const cacheManagerList = document.getElementById('cacheManagerList');
  const unsavedIndicator = document.getElementById('unsavedIndicator');
  const detailEditorPanel = document.getElementById('detailEditorPanel');
  const detailEditorTitle = document.getElementById('detailEditorTitle');
  const detailEditorContent = document.getElementById('detailEditorContent');
  const detailEditorSaveBtn = document.getElementById('detailEditorSaveBtn');
  const detailEditorCloseBtn = document.getElementById('detailEditorCloseBtn');
  const detailEditorCodeBtn = document.getElementById('detailEditorCodeBtn');
  const detailEditorBlankLineBtn =
    document.getElementById('detailEditorBlankLineBtn');
  const detailEditorImageBtn = document.getElementById('detailEditorImageBtn');
  const detailEditorVideoBtn = document.getElementById('detailEditorVideoBtn');
  const detailEditorGridBtn = document.getElementById('detailEditorGridBtn');
  const detailEditorImageInput = document.getElementById('detailEditorImageInput');
  const detailEditorVideoInput = document.getElementById('detailEditorVideoInput');

  let nodes = [];
  let edges = [];
  let incomingNodeIds = new Set();
  let selectedId = null;
  let selectedNodeElement = null;
  let idCounter = 1;
  let drag = null;
  let dragCandidate = null;
  let batchMode = false;
  let batchSelectionDrag = null;
  let batchSelectionAutoScrollFrame = null;
  let batchMove = null;
  const batchSelectedIds = new Set();
  const ARROW_TARGET_GAP = 4;
  const LEGACY_WORKSPACE_STORAGE_KEY = 'flowchart-workspace-v1';
  const DOCUMENT_CACHE_REGISTRY_KEY = 'flowchart-document-registry-v1';
  const DOCUMENT_STORAGE_PATH = window.location.pathname || '/index.html';
  const PATH_WORKSPACE_STORAGE_KEY =
    `${LEGACY_WORKSPACE_STORAGE_KEY}:${encodeURIComponent(DOCUMENT_STORAGE_PATH)}`;
  const DOCUMENT_STORAGE_ID = document
    .querySelector('meta[name="flowchart-document-id"]')
    ?.content.trim();
  const WORKSPACE_STORAGE_KEY = DOCUMENT_STORAGE_ID
    ? `${LEGACY_WORKSPACE_STORAGE_KEY}:document:${DOCUMENT_STORAGE_ID}`
    : PATH_WORKSPACE_STORAGE_KEY;
  const SHOULD_MIGRATE_LEGACY_WORKSPACE =
    /(?:^|\/)index\.html$/i.test(DOCUMENT_STORAGE_PATH) ||
    DOCUMENT_STORAGE_PATH.endsWith('/');
  let workspaceData = null;
  let cacheDeletionInProgress = false;
  let activeFolderId = null;
  let activeChartId = null;
  let autoSaveTimer = null;
  let isLoadingChart = false;
  let pendingFolderDeleteId = null;
  let pendingChartDeleteId = null;
  let chartDirectoryDrag = null;
  let suppressChartClickUntil = 0;
  let folderDirectoryDrag = null;
  let suppressFolderClickUntil = 0;
  let directorySearchQuery = '';
  let directorySearchTimer = null;
  let nodeClipboard = null;
  let clipboardPasteCount = 0;
  const undoStack = [];
  const redoStack = [];
  let historyTimer = null;
  let historyApplying = false;
  let lastHistoryState = null;
  let historyChangePending = false;
  let edgeRenderFrame = null;
  let unsavedIndicatorVisible = false;
  let detailEditorNodeId = null;
  let detailMediaResize = null;
  let detailMediaClipboard = null;
  let detailMediaDrag = null;
  let detailEditorGridVisible = false;
  let detailEditorGridCaretLine = null;
  let detailEditorGridCaretFrame = null;
  let detailEditorGridLayoutFrame = null;
  let edgeFlipTarget = null;
  let edgeFlipShowTimer = null;
  let edgeFlipHideTimer = null;
  const MEDIA_DATABASE_NAME = 'flowchart-media-v1';
  const MEDIA_DATABASE_VERSION = 1;
  const MEDIA_STORE_NAME = 'assets';
  const MEDIA_REFERENCE_PREFIX = 'flowchart-media:';
  const mediaObjectUrls = new Map();

  const initialState = window.__FLOW_STATE__ || null;

  function openMediaDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        MEDIA_DATABASE_NAME,
        MEDIA_DATABASE_VERSION
      );
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MEDIA_STORE_NAME)) {
          const store = database.createObjectStore(
            MEDIA_STORE_NAME,
            { keyPath: 'id' }
          );
          store.createIndex('documentId', 'documentId', { unique: false });
        }
      });
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
  }

  async function withMediaStore(mode, operation) {
    const database = await openMediaDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(MEDIA_STORE_NAME, mode);
        const store = transaction.objectStore(MEDIA_STORE_NAME);
        let result;
        try {
          result = operation(store, transaction);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.addEventListener('complete', () => resolve(result));
        transaction.addEventListener('abort', () =>
          reject(transaction.error || new Error('媒体数据库事务已中止'))
        );
        transaction.addEventListener('error', () =>
          reject(transaction.error || new Error('媒体数据库操作失败'))
        );
      });
    } finally {
      database.close();
    }
  }

  function mediaDocumentId() {
    return DOCUMENT_STORAGE_ID || DOCUMENT_STORAGE_PATH;
  }

  function createMediaId() {
    return `media-${Date.now()}-${crypto.randomUUID?.() ||
      Math.random().toString(36).slice(2)}`;
  }

  async function putMediaBlob(blob, metadata = {}) {
    const id = metadata.id || createMediaId();
    await withMediaStore('readwrite', store => {
      store.put({
        id,
        documentId: mediaDocumentId(),
        name: metadata.name || '媒体文件',
        type: metadata.type || blob.type || 'application/octet-stream',
        createdAt: metadata.createdAt || Date.now(),
        blob
      });
    });
    return id;
  }

  async function getMediaRecord(id) {
    const database = await openMediaDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database
          .transaction(MEDIA_STORE_NAME, 'readonly')
          .objectStore(MEDIA_STORE_NAME)
          .get(id);
        request.addEventListener('success', () => resolve(request.result || null));
        request.addEventListener('error', () => reject(request.error));
      });
    } finally {
      database.close();
    }
  }

  async function getDocumentMediaRecords() {
    const database = await openMediaDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(MEDIA_STORE_NAME, 'readonly');
        const store = transaction.objectStore(MEDIA_STORE_NAME);
        const index = store.index('documentId');
        const request = index.getAll(mediaDocumentId());
        request.addEventListener('success', () => resolve(request.result || []));
        request.addEventListener('error', () => reject(request.error));
      });
    } finally {
      database.close();
    }
  }

  async function deleteDocumentMedia() {
    const records = await getDocumentMediaRecords();
    if (!records.length) return;
    await withMediaStore('readwrite', store => {
      records.forEach(record => store.delete(record.id));
    });
    for (const record of records) {
      const url = mediaObjectUrls.get(record.id);
      if (url) URL.revokeObjectURL(url);
      mediaObjectUrls.delete(record.id);
    }
  }

  async function mediaObjectUrl(id) {
    if (mediaObjectUrls.has(id)) return mediaObjectUrls.get(id);
    const record = await getMediaRecord(id);
    if (!record?.blob) return '';
    const url = URL.createObjectURL(record.blob);
    mediaObjectUrls.set(id, url);
    return url;
  }

  async function hydrateMediaInElement(root) {
    const elements = [...root.querySelectorAll('[data-media-id]')];
    await Promise.all(elements.map(async element => {
      const id = element.dataset.mediaId;
      if (!id) return;
      const url = await mediaObjectUrl(id);
      if (url && element.isConnected) element.src = url;
    }));
  }

  function dataUrlToBlob(dataUrl) {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
    if (!match) throw new Error('无效的媒体 Data URL');
    const type = match[1] || 'application/octet-stream';
    const binary = match[2]
      ? atob(match[3])
      : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type });
  }

  async function externalizeMediaHTML(html) {
    if (!html || !html.includes('data:')) return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    const mediaElements = [...template.content.querySelectorAll('img, video')];
    for (const media of mediaElements) {
      const source = media.getAttribute('src') || '';
      if (!source.startsWith('data:')) continue;
      const blob = dataUrlToBlob(source);
      const id = await putMediaBlob(blob, {
        name: media.getAttribute('alt') || `${media.tagName.toLowerCase()}-${Date.now()}`,
        type: blob.type
      });
      media.dataset.mediaId = id;
      media.setAttribute('src', '');
    }
    return template.innerHTML;
  }

  function currentHTMLFileName() {
    const encodedName = DOCUMENT_STORAGE_PATH.split('/').pop() || 'index.html';
    try {
      return decodeURIComponent(encodedName);
    } catch {
      return encodedName;
    }
  }

  function readDocumentCacheRegistry() {
    try {
      const registry = JSON.parse(
        localStorage.getItem(DOCUMENT_CACHE_REGISTRY_KEY)
      );
      return registry && typeof registry === 'object' ? registry : {};
    } catch {
      return {};
    }
  }

  function writeDocumentCacheRegistry(registry) {
    try {
      localStorage.setItem(
        DOCUMENT_CACHE_REGISTRY_KEY,
        JSON.stringify(registry)
      );
    } catch {
      // 缓存登记失败不应影响流程图本身的使用。
    }
  }

  function registerCurrentDocumentCache() {
    if (!DOCUMENT_STORAGE_ID) return;
    const registry = readDocumentCacheRegistry();
    registry[DOCUMENT_STORAGE_ID] = {
      fileName: currentHTMLFileName(),
      path: DOCUMENT_STORAGE_PATH,
      lastOpenedAt: Date.now()
    };
    writeDocumentCacheRegistry(registry);
  }

  function formatCacheSize(value) {
    const bytes = new Blob([value || '']).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function cacheRecords() {
    const registry = readDocumentCacheRegistry();
    const documentPrefix = `${LEGACY_WORKSPACE_STORAGE_KEY}:document:`;
    const pathPrefix = `${LEGACY_WORKSPACE_STORAGE_KEY}:`;
    const records = [];

    for (const key of Object.keys(localStorage)) {
      if (
        key !== LEGACY_WORKSPACE_STORAGE_KEY &&
        !key.startsWith(pathPrefix)
      ) {
        continue;
      }
      const value = localStorage.getItem(key) || '';
      if (key.startsWith(documentPrefix)) {
        const id = key.slice(documentPrefix.length);
        const metadata = registry[id] || {};
        records.push({
          key,
          id,
          fileName: metadata.fileName || '未登记文件',
          path: metadata.path || '',
          lastOpenedAt: metadata.lastOpenedAt || 0,
          size: formatCacheSize(value),
          current: key === WORKSPACE_STORAGE_KEY
        });
      } else {
        let path = '';
        if (key.startsWith(pathPrefix)) {
          try {
            path = decodeURIComponent(key.slice(pathPrefix.length));
          } catch {
            path = key.slice(pathPrefix.length);
          }
        }
        const fileName = path.split('/').pop() ||
          (key === LEGACY_WORKSPACE_STORAGE_KEY ? '旧版公共缓存' : '未知文件');
        records.push({
          key,
          id: '旧版记录（无 flowchart-document-id）',
          fileName,
          path,
          lastOpenedAt: 0,
          size: formatCacheSize(value),
          current: key === WORKSPACE_STORAGE_KEY
        });
      }
    }

    return records.sort((first, second) =>
      Number(second.current) - Number(first.current) ||
      second.lastOpenedAt - first.lastOpenedAt ||
      first.fileName.localeCompare(second.fileName, 'zh-CN')
    );
  }

  function renderCacheManager() {
    const records = cacheRecords();
    cacheManagerList.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'cache-manager-empty';
      empty.textContent = '当前没有流程图缓存记录';
      cacheManagerList.appendChild(empty);
      return;
    }

    for (const record of records) {
      const row = document.createElement('div');
      row.className = 'cache-record';

      const information = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'cache-record-name';
      name.textContent = record.fileName;
      if (record.current) {
        const current = document.createElement('span');
        current.className = 'cache-record-current';
        current.textContent = '当前页面';
        name.appendChild(current);
      }

      const id = document.createElement('div');
      id.className = 'cache-record-id';
      id.textContent = `ID：${record.id}`;

      const metadata = document.createElement('div');
      metadata.className = 'cache-record-meta';
      const opened = record.lastOpenedAt
        ? ` · 最后打开 ${new Date(record.lastOpenedAt).toLocaleString()}`
        : '';
      metadata.textContent =
        `${record.path ? `路径：${record.path} · ` : ''}大小：${record.size}${opened}`;

      const deleteButton = document.createElement('button');
      deleteButton.className = 'cache-record-delete';
      deleteButton.type = 'button';
      deleteButton.textContent = '删除缓存';
      deleteButton.addEventListener('click', () => {
        const message = record.current
          ? `确定删除“${record.fileName}”的缓存吗？当前页面将重置为空白数据。`
          : `确定删除“${record.fileName}”的缓存吗？此操作无法撤销。`;
        if (!confirm(message)) return;

        if (record.current) cacheDeletionInProgress = true;
        localStorage.removeItem(record.key);
        if (!record.id.startsWith('旧版记录')) {
          const registry = readDocumentCacheRegistry();
          delete registry[record.id];
          writeDocumentCacheRegistry(registry);
        }
        if (record.current) {
          window.location.reload();
        } else {
          renderCacheManager();
        }
      });

      information.append(name, id, metadata);
      row.append(information, deleteButton);
      cacheManagerList.appendChild(row);
    }
  }

  function openCacheManager() {
    registerCurrentDocumentCache();
    renderCacheManager();
    cacheManagerBackdrop.hidden = false;
    cacheManagerCloseBtn.focus();
  }

  function closeCacheManager() {
    cacheManagerBackdrop.hidden = true;
    cacheManagerBtn.focus();
  }

  function showStatus(message) {
    statusBox.textContent = message;
    statusBox.classList.add('show');
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(() => statusBox.classList.remove('show'), 1800);
  }

  function updateUnsavedIndicator() {
    const visible = historyChangePending || undoStack.length > 0;
    if (visible === unsavedIndicatorVisible) return;
    unsavedIndicatorVisible = visible;
    unsavedIndicator.classList.toggle('visible', visible);
    unsavedIndicator.setAttribute('aria-hidden', String(!visible));
  }

  function nextId() {
    return 'node-' + (idCounter++);
  }

  function nodeById(id) {
    return nodes.find(n => n.id === id);
  }

  function rebuildIncomingNodeIds(updateRenderedNodes = true) {
    incomingNodeIds = new Set(edges.map(edge => edge.to));
    if (!updateRenderedNodes) return;
    canvas.querySelectorAll('.node').forEach(element => {
      const node = nodeById(element.dataset.id);
      element.classList.toggle(
        'start-node',
        Boolean(node && !node.expanded && !incomingNodeIds.has(node.id))
      );
    });
  }

  function prepareSectionDrag(e, node) {
    if (e.button !== 0) return;
    if (e.target.closest('.node-title, .node-text')) return;
    e.stopPropagation();
    selectNode(node.id);
    dragCandidate = {
      id: node.id,
      node,
      element: e.currentTarget.closest('.node'),
      startX: e.clientX,
      startY: e.clientY,
      originX: node.x,
      originY: node.y,
      originBaseX: Number(node.simplePosition?.x ?? node.x) || 0,
      originBaseY: Number(node.simplePosition?.y ?? node.y) || 0
    };
  }

  function defaultProperties() {
    return {
      status: '未完成',
      owner: '未分配',
      priority: '中',
      taskType: '任务',
      description: '添加描述'
    };
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function plainTextToRichHTML(value) {
    return escapeHTML(String(value || '')).replace(/\n/g, '<br>');
  }

  function sanitizeRichHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll(
      'script, style, iframe, object, embed, link, meta'
    ).forEach(element => element.remove());
    template.content.querySelectorAll('*').forEach(element => {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (
          name.startsWith('on') ||
          ((name === 'src' || name === 'href') && value.startsWith('javascript:'))
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    });
    return template.innerHTML;
  }

  function updateDetailEditorPosition() {
    const minimumWidth = Math.min(360, window.innerWidth);
    const desiredLeft = batchSelectBtn.getBoundingClientRect().right + 12;
    const left = Math.min(desiredLeft, window.innerWidth - minimumWidth);
    detailEditorPanel.style.setProperty(
      '--detail-editor-left',
      Math.max(0, left) + 'px'
    );
  }

  function openDetailEditor(nodeId) {
    const node = nodeById(nodeId);
    if (!node?.expanded) return;
    if (detailEditorNodeId && detailEditorNodeId !== nodeId) {
      saveDetailEditor();
    }
    detailEditorNodeId = nodeId;
    detailEditorTitle.textContent = node.title || '未命名卡片';
    detailEditorContent.innerHTML = sanitizeRichHTML(
      node.richContent ?? plainTextToRichHTML(node.text)
    );
    hydrateMediaInElement(detailEditorContent);
    detailEditorContent.classList.toggle(
      'show-grid',
      detailEditorGridVisible
    );
    prepareDetailEditorMedia();
    prepareDetailEditorCodeBlocks();
    ensureCodeBlockSpacing();
    updateDetailEditorPosition();
    detailEditorPanel.classList.add('open');
    detailEditorPanel.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      detailEditorContent.focus();
      updateEditorCommandStates();
      requestDetailEditorGridLayoutUpdate();
    });
  }

  function closeDetailEditor() {
    detailEditorPanel.classList.remove('open');
    detailEditorPanel.setAttribute('aria-hidden', 'true');
    detailEditorContent.querySelectorAll('.editor-media-frame.is-selected')
      .forEach(frame => frame.classList.remove('is-selected'));
    detailMediaResize = null;
    detailMediaDrag = null;
    detailEditorGridCaretLine?.classList.remove('has-editor-caret');
    detailEditorGridCaretLine = null;
    if (detailEditorGridCaretFrame) {
      cancelAnimationFrame(detailEditorGridCaretFrame);
      detailEditorGridCaretFrame = null;
    }
    if (detailEditorGridLayoutFrame) {
      cancelAnimationFrame(detailEditorGridLayoutFrame);
      detailEditorGridLayoutFrame = null;
    }
    detailEditorContent.querySelector('.editor-grid-overlay')?.remove();
    detailEditorContent.querySelectorAll('.editor-grid-empty-line')
      .forEach(line => line.classList.remove('editor-grid-empty-line'));
    detailEditorNodeId = null;
    updateEditorCommandStates();
  }

  async function saveDetailEditor() {
    const node = nodeById(detailEditorNodeId);
    if (!node) {
      closeDetailEditor();
      return;
    }
    detailEditorContent.querySelectorAll('.editor-media-frame.is-selected')
      .forEach(frame => frame.classList.remove('is-selected'));
    clearDetailMediaDropIndicators();
    ensureCodeBlockSpacing();
    const contentClone = detailEditorContent.cloneNode(true);
    contentClone.querySelectorAll('.editor-code-copy-btn')
      .forEach(button => button.remove());
    contentClone.querySelectorAll('.editor-grid-overlay')
      .forEach(overlay => overlay.remove());
    contentClone.querySelectorAll(
      '.editor-grid-empty-line, .has-editor-caret'
    ).forEach(element => {
      element.classList.remove(
        'editor-grid-empty-line',
        'has-editor-caret'
      );
    });
    contentClone.querySelectorAll('pre > code').forEach(code => {
      code.removeAttribute('data-placeholder');
      code.removeAttribute('contenteditable');
      code.removeAttribute('spellcheck');
      code.removeAttribute('tabindex');
    });
    const html = sanitizeRichHTML(
      await externalizeMediaHTML(contentClone.innerHTML)
    );
    const textContainer = document.createElement('div');
    textContainer.innerHTML = html;
    node.richContent = html;
    node.text = textContainer.innerText;
    if (detailEditorNodeId === node.id) {
      detailEditorContent.innerHTML = html;
      hydrateMediaInElement(detailEditorContent);
      prepareDetailEditorMedia();
      prepareDetailEditorCodeBlocks();
      requestDetailEditorGridLayoutUpdate();
    }
    const nodeText = getNodeElement(node.id)?.querySelector('.node-text');
    if (nodeText) {
      nodeText.innerHTML = html;
      hydrateMediaInElement(nodeText);
    }
    updateNodeSearchHighlights();
    requestEdgeRender();
    scheduleAutoSave();
    if (directorySearchQuery.trim()) {
      saveCurrentChart();
      renderFileTree();
    }
    showStatus('卡片内容已保存');
  }

  function insertDetailEditorHTML(html) {
    detailEditorContent.focus();
    document.execCommand('insertHTML', false, html);
  }

  function createDetailMediaFrame(width = null) {
    const frame = document.createElement('span');
    frame.className = 'editor-media-frame';
    frame.contentEditable = 'false';
    frame.draggable = true;
    frame.style.width = width
      ? `${Math.round(width)}px`
      : 'min(100%, 560px)';

    const handle = document.createElement('button');
    handle.className = 'editor-media-resize-handle';
    handle.type = 'button';
    handle.tabIndex = -1;
    handle.setAttribute('aria-label', '拖动调整媒体尺寸');
    frame.appendChild(handle);
    return frame;
  }

  function createDetailMediaRow() {
    const row = document.createElement('div');
    row.className = 'editor-media-row';
    row.contentEditable = 'false';
    return row;
  }

  function prepareDetailEditorMedia() {
    detailEditorContent.querySelectorAll('img, video').forEach(media => {
      let frame = media.closest('.editor-media-frame');
      if (!frame) {
        const parent = media.parentNode;
        const width = media.getBoundingClientRect().width || null;
        frame = createDetailMediaFrame(width);
        parent.insertBefore(frame, media);
        frame.prepend(media);
      }
      frame.contentEditable = 'false';
      frame.draggable = true;
      media.draggable = false;
      media.removeAttribute('width');
      media.removeAttribute('height');

      if (!frame.closest('.editor-media-row')) {
        const topLevel = topLevelEditorChild(frame);
        const row = createDetailMediaRow();
        if (topLevel === frame) {
          frame.before(row);
        } else if (topLevel) {
          topLevel.after(row);
        } else {
          detailEditorContent.appendChild(row);
        }
        row.appendChild(frame);
      }
    });

    detailEditorContent.querySelectorAll('.editor-media-row').forEach(row => {
      row.contentEditable = 'false';
      const topLevel = topLevelEditorChild(row);
      if (topLevel && topLevel !== row) {
        topLevel.after(row);
      }
    });
  }

  function selectedDetailEditorMedia() {
    return detailEditorContent.querySelector('.editor-media-frame.is-selected');
  }

  function copySelectedDetailEditorMedia() {
    const frame = selectedDetailEditorMedia();
    if (!frame) return false;
    const clone = frame.cloneNode(true);
    clone.classList.remove('is-selected');
    detailMediaClipboard = sanitizeRichHTML(clone.outerHTML);
    showStatus(
      `${frame.querySelector('video') ? '视频' : '图片'}已复制，可使用 Ctrl/Command + V 粘贴`
    );
    return true;
  }

  function pasteDetailEditorMedia() {
    if (!detailMediaClipboard) return false;
    const template = document.createElement('template');
    template.innerHTML = sanitizeRichHTML(detailMediaClipboard);
    const frame = template.content.querySelector('.editor-media-frame');
    if (!frame) return false;

    frame.classList.remove('is-selected');
    const blankAfter = createEditorBlankLine();
    const selectedFrame = selectedDetailEditorMedia();
    const range = editorSelectionRange();
    const currentLine = range ? topLevelEditorChild(range.startContainer) : null;

    if (selectedFrame) {
      selectedFrame.after(frame);
    } else if (currentLine?.classList?.contains('editor-media-row')) {
      currentLine.appendChild(frame);
    } else if (currentLine) {
      const row = createDetailMediaRow();
      row.appendChild(frame);
      currentLine.after(row, blankAfter);
    } else {
      const row = createDetailMediaRow();
      row.appendChild(frame);
      detailEditorContent.append(row, blankAfter);
    }

    detailEditorContent.querySelectorAll('.editor-media-frame.is-selected')
      .forEach(element => element.classList.remove('is-selected'));
    frame.classList.add('is-selected');
    const mediaRow = frame.closest('.editor-media-row');
    let caretLine = mediaRow?.nextElementSibling;
    if (
      !caretLine?.matches?.('p, div') ||
      caretLine.textContent.trim() ||
      caretLine.querySelector('img, video, pre')
    ) {
      caretLine = blankAfter;
      mediaRow.after(caretLine);
    }
    placeEditorCaret(caretLine);
    ensureCodeBlockSpacing();
    frame.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    showStatus(`${frame.querySelector('video') ? '视频' : '图片'}已粘贴`);
    return true;
  }

  function editorSelectionRange() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return detailEditorContent.contains(range.commonAncestorContainer)
      ? range
      : null;
  }

  function topLevelEditorChild(node) {
    let current = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (current && current.parentNode !== detailEditorContent) {
      current = current.parentNode;
    }
    return current?.parentNode === detailEditorContent ? current : null;
  }

  function updateDetailEditorGridCaretLine() {
    detailEditorGridCaretLine?.classList.remove('has-editor-caret');
    detailEditorGridCaretLine = null;
    if (
      !detailEditorGridVisible ||
      !detailEditorPanel.classList.contains('open')
    ) return;

    const range = editorSelectionRange();
    let line = range?.startContainer?.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentNode
      : range?.startContainer;
    while (
      line &&
      line !== detailEditorContent &&
      !line.classList?.contains('editor-grid-empty-line')
    ) {
      line = line.parentNode;
    }
    if (
      line !== detailEditorContent &&
      line?.classList?.contains('editor-grid-empty-line')
    ) {
      detailEditorGridCaretLine = line;
      line.classList.add('has-editor-caret');
    }
  }

  function requestDetailEditorGridCaretUpdate() {
    if (!detailEditorGridVisible || detailEditorGridCaretFrame) return;
    detailEditorGridCaretFrame = requestAnimationFrame(() => {
      detailEditorGridCaretFrame = null;
      updateDetailEditorGridCaretLine();
    });
  }

  function renderDetailEditorGridLayout() {
    detailEditorContent.querySelector('.editor-grid-overlay')?.remove();
    detailEditorContent.querySelectorAll('.editor-grid-empty-line')
      .forEach(line => line.classList.remove('editor-grid-empty-line'));
    if (!detailEditorGridVisible) return;

    const structuralSelector =
      'pre, .editor-media-row, ul, ol, blockquote';
    const textGroups = [];

    const collectTextGroups = container => {
      let group = [];
      const flush = () => {
        if (group.length) textGroups.push(group);
        group = [];
      };

      for (const child of [...container.childNodes]) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          child.classList.contains('editor-grid-overlay')
        ) continue;
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          child.matches(structuralSelector)
        ) {
          flush();
          continue;
        }
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          child.querySelector(structuralSelector)
        ) {
          flush();
          collectTextGroups(child);
          continue;
        }

        const isEmptyLine = (
          child.nodeType === Node.ELEMENT_NODE &&
          (
            child.tagName === 'BR' ||
            (
              child.matches('p, div:not(.editor-media-row)') &&
              !child.textContent.trim() &&
              !child.querySelector(
                'img, video, pre, .editor-media-row, ul, ol, blockquote'
              )
            )
          )
        );
        if (isEmptyLine) {
          flush();
          textGroups.push([child]);
          continue;
        }
        group.push(child);
      }
      flush();
    };

    collectTextGroups(detailEditorContent);
    const contentRect = detailEditorContent.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'editor-grid-overlay';
    overlay.contentEditable = 'false';
    overlay.setAttribute('aria-hidden', 'true');

    const appendOutline = rect => {
      if (!rect?.height) return;
      const outline = document.createElement('div');
      outline.className = 'editor-text-grid-outline';
      outline.style.top = `${rect.top - contentRect.top - 2}px`;
      outline.style.width = `${detailEditorContent.clientWidth}px`;
      outline.style.height = `${rect.height + 4}px`;
      overlay.appendChild(outline);
    };

    for (const group of textGroups) {
      for (const node of group) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.matches('p, div') &&
          !node.textContent.trim() &&
          !node.querySelector('img, video, pre, .editor-media-row')
        ) {
          node.classList.add('editor-grid-empty-line');
        }
      }

      const singleEmptyLine = group.length === 1 &&
        group[0].nodeType === Node.ELEMENT_NODE &&
        (
          group[0].tagName === 'BR' ||
          group[0].classList.contains('editor-grid-empty-line')
        );
      if (singleEmptyLine) {
        const element = group[0];
        const elementStyle = getComputedStyle(
          element.tagName === 'BR' ? element.parentElement : element
        );
        const lineHeight =
          parseFloat(elementStyle.lineHeight) ||
          parseFloat(elementStyle.fontSize) * 1.75 ||
          28;
        let rect = element.getBoundingClientRect();
        if (!rect.height) {
          const range = document.createRange();
          range.selectNode(element);
          rect = range.getBoundingClientRect();
        }
        appendOutline({
          top: rect.top,
          height: Math.min(
            Math.max(rect.height || lineHeight, lineHeight),
            lineHeight
          )
        });
        continue;
      }

      const range = document.createRange();
      range.setStartBefore(group[0]);
      range.setEndAfter(group[group.length - 1]);
      let rect = range.getBoundingClientRect();
      if (
        !rect.height &&
        group.length === 1 &&
        group[0].nodeType === Node.ELEMENT_NODE
      ) {
        rect = group[0].getBoundingClientRect();
      }
      if (!rect.height) continue;
      appendOutline(rect);
    }

    if (overlay.childElementCount) {
      detailEditorContent.appendChild(overlay);
    }
    updateDetailEditorGridCaretLine();
  }

  function requestDetailEditorGridLayoutUpdate() {
    if (!detailEditorGridVisible || detailEditorGridLayoutFrame) return;
    detailEditorGridLayoutFrame = requestAnimationFrame(() => {
      detailEditorGridLayoutFrame = null;
      renderDetailEditorGridLayout();
    });
  }

  function createEditorBlankLine() {
    const line = document.createElement('p');
    line.appendChild(document.createElement('br'));
    return line;
  }

  function insertDetailEditorBlankLine() {
    detailEditorContent.focus();
    const range = editorSelectionRange();
    const currentBlock = range
      ? topLevelEditorChild(range.startContainer)
      : null;
    const blankLine = createEditorBlankLine();

    if (currentBlock) {
      currentBlock.after(blankLine);
    } else if (range) {
      range.deleteContents();
      range.insertNode(blankLine);
    } else {
      detailEditorContent.appendChild(blankLine);
    }

    placeEditorCaret(blankLine);
    ensureCodeBlockSpacing();
    requestDetailEditorGridLayoutUpdate();
    updateEditorCommandStates();
  }

  function prepareDetailEditorCodeBlocks() {
    detailEditorContent.querySelectorAll('pre').forEach(codeBlock => {
      let code = codeBlock.querySelector(':scope > code');
      if (!code) {
        code = document.createElement('code');
        code.textContent = codeBlock.textContent;
        codeBlock.replaceChildren(code);
      }
      if (code.textContent === '在这里输入代码') {
        code.textContent = '';
      }
      code.dataset.placeholder = '在这里输入代码';
      code.contentEditable = 'true';
      code.spellcheck = false;
      code.tabIndex = -1;

      if (!codeBlock.querySelector(':scope > .editor-code-copy-btn')) {
        const copyButton = document.createElement('button');
        copyButton.className = 'editor-code-copy-btn';
        copyButton.type = 'button';
        copyButton.contentEditable = 'false';
        copyButton.textContent = '复制';
        copyButton.setAttribute('aria-label', '复制代码块');
        codeBlock.appendChild(copyButton);
      }
    });
  }

  async function copyCodeBlock(codeBlock) {
    if (!codeBlock) return;

    const copyButtons = [
      ...codeBlock.querySelectorAll('.editor-code-copy-btn')
    ];
    const previousHiddenStates = copyButtons.map(button => button.hidden);
    copyButtons.forEach(button => {
      button.hidden = true;
    });

    const text = codeBlock.innerText
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ');

    copyButtons.forEach((button, index) => {
      button.hidden = previousHiddenStates[index];
    });

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    showStatus('代码已复制');
  }

  function ensureCodeBlockSpacing() {
    const blocks = [...detailEditorContent.children];
    for (const block of blocks) {
      const next = block.nextElementSibling;
      if (!next) continue;
      const blockIsCode = block.tagName === 'PRE';
      const nextIsCode = next.tagName === 'PRE';
      const blockIsMedia = block.classList.contains('editor-media-row');
      const nextIsMedia = next.classList.contains('editor-media-row');
      if (
        (blockIsCode && nextIsCode) ||
        (blockIsCode && nextIsMedia) ||
        (blockIsMedia && nextIsCode)
      ) {
        block.after(createEditorBlankLine());
      }
    }
  }

  function placeEditorCaret(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertDetailEditorCodeBlock() {
    detailEditorContent.focus();
    let range = editorSelectionRange();
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(detailEditorContent);
      range.collapse(false);
    }

    const currentLine = topLevelEditorChild(range.startContainer);
    const codeBlock = document.createElement('pre');
    const code = document.createElement('code');
    codeBlock.appendChild(code);
    const blankBefore = createEditorBlankLine();
    const blankAfter = createEditorBlankLine();

    if (!currentLine) {
      detailEditorContent.append(blankBefore, codeBlock, blankAfter);
    } else if (
      currentLine.matches?.('p, div') &&
      !currentLine.textContent.trim() &&
      !currentLine.querySelector('img, video, pre')
    ) {
      currentLine.after(codeBlock, blankAfter);
    } else {
      currentLine.after(blankBefore, codeBlock, blankAfter);
    }

    prepareDetailEditorCodeBlocks();
    code.focus({preventScroll: true});
    placeEditorCaret(code);
    updateEditorCommandStates();
  }

  function updateEditorCommandStates() {
    document.querySelectorAll('[data-editor-command]').forEach(button => {
      const command = button.dataset.editorCommand;
      const active = detailEditorPanel.classList.contains('open') &&
        Boolean(editorSelectionRange()) &&
        document.queryCommandState(command);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  async function insertDetailEditorMedia(file, type) {
    if (!file) return;
    try {
      const mediaId = await putMediaBlob(file, {
        name: file.name,
        type: file.type
      });
      const source = URL.createObjectURL(file);
      mediaObjectUrls.set(mediaId, source);
      const name = escapeHTML(file.name);
      insertDetailEditorHTML(
        type === 'image'
          ? `<div class="editor-media-row" contenteditable="false"><span class="editor-media-frame" contenteditable="false" draggable="true" style="width:min(100%, 560px)"><img src="${source}" data-media-id="${mediaId}" alt="${name}" draggable="false"><button class="editor-media-resize-handle" type="button" tabindex="-1" aria-label="拖动调整媒体尺寸"></button></span></div><p><br></p>`
          : `<div class="editor-media-row" contenteditable="false"><span class="editor-media-frame" contenteditable="false" draggable="true" style="width:min(100%, 560px)"><video src="${source}" data-media-id="${mediaId}" controls preload="metadata" draggable="false"></video><button class="editor-media-resize-handle" type="button" tabindex="-1" aria-label="拖动调整媒体尺寸"></button></span></div><p><br></p>`
      );
      prepareDetailEditorMedia();
      ensureCodeBlockSpacing();
      showStatus('媒体已加入项目，点击保存同步到卡片');
    } catch (error) {
      console.error(error);
      showStatus('媒体保存失败，请检查浏览器可用空间');
    }
  }

  function createNode(x, y, text = '新节点', forcedId = null, title = '标题', properties = null, expanded = false) {
    const node = {
      id: forcedId || nextId(),
      x, y,
      text,
      simpleText: text,
      simplePosition: { x, y },
      title,
      richContent: null,
      properties: {...defaultProperties(), ...(properties || {})},
      expanded
    };
    nodes.push(node);
    renderNode(node);
    selectNode(node.id);
    updateEmptyMessage();
    scheduleAutoSave();
    return node;
  }

  function renderNode(node) {
    const el = document.createElement('div');
    el.className = 'node ' + (node.expanded ? 'expanded' : 'simple');
    el.classList.toggle(
      'search-match',
      nodeMatchesDirectorySearch(
        node,
        directorySearchQuery.trim().toLocaleLowerCase()
      )
    );
    el.classList.toggle(
      'start-node',
      !node.expanded && !incomingNodeIds.has(node.id)
    );
    el.dataset.id = node.id;
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';

    const focusEditableText = element => {
      element.classList.add('text-editing');
      element.focus();
      const hasText = Boolean(element.textContent);
      if (hasText) {
        document.execCommand?.('selectAll', false, null);
        return;
      }
      if (!element.hasChildNodes()) {
        element.appendChild(document.createElement('br'));
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    };

    const bindEditable = (element, onInput) => {
      element.contentEditable = 'true';
      element.spellcheck = false;
      element.addEventListener('input', () => {
        onInput();
        el.classList.toggle(
          'search-match',
          nodeMatchesDirectorySearch(
            node,
            directorySearchQuery.trim().toLocaleLowerCase()
          )
        );
        scheduleAutoSave();
        if (directorySearchQuery.trim()) {
          clearTimeout(directorySearchTimer);
          directorySearchTimer = setTimeout(() => {
            saveCurrentChart();
            renderFileTree();
          }, 180);
        }
      });
      element.addEventListener('mousedown', e => {
        e.stopPropagation();
        selectNode(node.id, el);
      });
      element.addEventListener('click', e => {
        e.stopPropagation();
        selectNode(node.id, el);
      });
      element.addEventListener('dblclick', e => {
        e.stopPropagation();
        focusEditableText(element);
      });
      element.addEventListener('blur', () => {
        element.classList.remove('text-editing');
      });
    };

    const simpleText = document.createElement('div');
    simpleText.className = 'simple-node-text';
    simpleText.textContent = node.simpleText;
    bindEditable(simpleText, () => {
      node.simpleText = simpleText.innerText;
    });

    const openButton = document.createElement('button');
    openButton.className = 'expand-button';
    openButton.type = 'button';
    openButton.textContent = node.expanded ? '关闭' : '打开';
    openButton.title = node.expanded ? '收起为简易节点' : '展开为多功能卡片';
    openButton.addEventListener('mousedown', e => e.stopPropagation());
    openButton.addEventListener('click', e => {
      e.stopPropagation();
      if (node.expanded) {
        collapseNode(node.id);
      } else {
        expandNode(node.id);
      }
    });

    const simpleContent = document.createElement('div');
    simpleContent.className = 'simple-node-content';
    simpleContent.appendChild(simpleText);

    const title = document.createElement('div');
    title.className = 'node-title';
    title.textContent = node.title;
    bindEditable(title, () => {
      node.title = title.innerText;
      if (detailEditorNodeId === node.id) {
        detailEditorTitle.textContent = node.title || '未命名卡片';
      }
    });

    const titleSection = document.createElement('div');
    titleSection.className = 'node-title-section';

    const detailButton = document.createElement('button');
    detailButton.className = 'detail-editor-button';
    detailButton.type = 'button';
    detailButton.textContent = '↗';
    detailButton.title = '在右侧编辑卡片内容';
    detailButton.setAttribute('aria-label', '在右侧编辑卡片内容');
    detailButton.addEventListener('mousedown', e => e.stopPropagation());
    detailButton.addEventListener('click', e => {
      e.stopPropagation();
      selectNode(node.id, el);
      openDetailEditor(node.id);
    });

    titleSection.append(title, detailButton);
    titleSection.addEventListener('mousedown', e => prepareSectionDrag(e, node), true);
    titleSection.addEventListener('dblclick', e => {
      e.stopPropagation();
      selectNode(node.id, el);
      focusEditableText(title);
    });

    const properties = document.createElement('div');
    properties.className = 'properties';

    const propertyDefinitions = [
      ['status', '◉', '状态', 'status-value'],
      ['owner', '♟', '负责人', 'owner'],
      ['priority', '◆', '优先级', 'priority'],
      ['taskType', '◒', '任务类型', 'task-type'],
      ['description', '☰', '描述', 'description']
    ];

    for (const [key, icon, label, className] of propertyDefinitions) {
      const row = document.createElement('div');
      row.className = 'property-row property-' + key;

      const propertyLabel = document.createElement('div');
      propertyLabel.className = 'property-label';

      const propertyIcon = document.createElement('span');
      propertyIcon.className = 'property-icon';
      propertyIcon.textContent = icon;

      const labelText = document.createElement('span');
      labelText.textContent = label;

      const value = document.createElement('div');
      value.className = 'property-value ' + className;
      value.textContent = node.properties[key];
      bindEditable(value, () => {
        node.properties[key] = value.innerText;
      });

      propertyLabel.append(propertyIcon, labelText);
      row.append(propertyLabel, value);
      properties.appendChild(row);
    }

    const text = document.createElement('div');
    text.className = 'node-text';
    text.innerHTML = sanitizeRichHTML(
      node.richContent ?? plainTextToRichHTML(node.text)
    );
    hydrateMediaInElement(text);
    bindEditable(text, () => {
      node.richContent = sanitizeRichHTML(text.innerHTML);
      node.text = text.innerText;
    });

    const bodySection = document.createElement('div');
    bodySection.className = 'node-body-section';
    bodySection.appendChild(text);
    bodySection.addEventListener('mousedown', e => prepareSectionDrag(e, node), true);
    bodySection.addEventListener('dblclick', e => {
      e.stopPropagation();
      selectNode(node.id, el);
      focusEditableText(text);
    });

    const expandedContent = document.createElement('div');
    expandedContent.className = 'expanded-card-content';
    expandedContent.append(titleSection, properties, bodySection);

    const directions = [
      ['top', '↑'],
      ['right', '→'],
      ['bottom', '↓'],
      ['left', '←']
    ];

    for (const [direction, symbol] of directions) {
      const handle = document.createElement('div');
      handle.className = 'handle ' + direction;
      handle.dataset.direction = direction;
      handle.textContent = symbol;
      handle.title = '向' + ({top:'上',right:'右',bottom:'下',left:'左'})[direction] + '创建节点';
      handle.addEventListener('mousedown', e => e.stopPropagation());
      handle.addEventListener('click', e => {
        e.stopPropagation();
        createBranch(node.id, direction);
      });
      el.appendChild(handle);
    }

    el.append(simpleContent, openButton, expandedContent);

    el.addEventListener('mousedown', e => {
      if (e.target.classList.contains('handle') || e.target.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      selectNode(node.id, el);
      drag = {
        id: node.id,
        node,
        element: el,
        startX: e.clientX,
        startY: e.clientY,
        originX: node.x,
        originY: node.y,
        originBaseX: Number(node.simplePosition?.x ?? node.x) || 0,
        originBaseY: Number(node.simplePosition?.y ?? node.y) || 0
      };
    });

    el.addEventListener('click', e => {
      e.stopPropagation();
      selectNode(node.id, el);
    });

    el.addEventListener('dblclick', e => {
      if (
        node.expanded ||
        e.target.closest('.handle, button, [contenteditable="true"]')
      ) return;
      e.preventDefault();
      e.stopPropagation();
      selectNode(node.id, el);
      drag = null;
      dragCandidate = null;
      focusEditableText(simpleText);
    });

    canvas.appendChild(el);
  }

  function expandNode(id) {
    const node = nodeById(id);
    if (!node || node.expanded) return;

    const preservedRootPositions = !incomingNodeIds.has(id)
      ? new Map(
          nodes
            .filter(other =>
              other.id !== id &&
              !incomingNodeIds.has(other.id)
            )
            .map(other => [
              other.id,
              { x: other.x, y: other.y }
            ])
        )
      : null;
    if (!node.simplePosition) {
      node.simplePosition = { x: node.x, y: node.y };
    }
    node.expanded = true;
    node.title = node.simpleText.trim() || '新节点';
    clearNodeSelection();
    reflowExpandedNodesFromBasePositions(preservedRootPositions);
    selectNode(id);
    renderEdges();
    updateToggleAllButton();

    requestAnimationFrame(() => {
      getNodeElement(id)?.querySelector('.node-title')?.focus();
    });
  }

  function collapseNode(id) {
    const node = nodeById(id);
    if (!node || !node.expanded) return;

    const preservedRootPositions = !incomingNodeIds.has(id)
      ? new Map(
          nodes
            .filter(other =>
              other.id !== id &&
              !incomingNodeIds.has(other.id)
            )
            .map(other => [
              other.id,
              { x: other.x, y: other.y }
            ])
        )
      : null;
    node.expanded = false;
    node.simpleText = node.title.trim() || '新节点';
    clearNodeSelection();
    reflowExpandedNodesFromBasePositions(preservedRootPositions);
    selectNode(id);
    renderEdges();
    updateToggleAllButton();

    requestAnimationFrame(() => {
      getNodeElement(id)?.querySelector('.simple-node-text')?.focus();
    });
  }

  function nodeRect(node) {
    const el = getNodeElement(node.id);
    return {
      x: node.x,
      y: node.y,
      width: el?.offsetWidth || (node.expanded ? 340 : 180),
      height: el?.offsetHeight || (node.expanded ? 320 : 74)
    };
  }

  function rectsOverlap(a, b, gap) {
    return (
      a.x < b.x + b.width + gap &&
      a.x + a.width + gap > b.x &&
      a.y < b.y + b.height + gap &&
      a.y + a.height + gap > b.y
    );
  }

  function moveNodeOutside(target, obstacle, gap) {
    const targetRect = nodeRect(target);
    const obstacleRect = nodeRect(obstacle);
    if (!rectsOverlap(targetRect, obstacleRect, gap)) return false;

    const candidates = [
      { x: obstacleRect.x - gap - targetRect.width, y: target.y },
      { x: obstacleRect.x + obstacleRect.width + gap, y: target.y },
      { x: target.x, y: obstacleRect.y - gap - targetRect.height },
      { x: target.x, y: obstacleRect.y + obstacleRect.height + gap }
    ]
      .filter(position => position.x >= 0 && position.y >= 0)
      .map(position => ({
        ...position,
        distance: Math.hypot(position.x - target.x, position.y - target.y)
      }))
      .sort((a, b) => a.distance - b.distance);

    const next = candidates[0];
    if (!next) return false;

    target.x = next.x;
    target.y = next.y;
    const targetEl = getNodeElement(target.id);
    if (targetEl) {
      targetEl.style.left = target.x + 'px';
      targetEl.style.top = target.y + 'px';
    }
    return true;
  }

  function resolveExpansionCollisions(expandedId) {
    const expandedNode = nodeById(expandedId);
    if (!expandedNode) return;

    const gap = 28;
    const expandedNodeIsRoot = !incomingNodeIds.has(expandedId);
    const protectedRootIds = expandedNodeIsRoot
      ? new Set(
          nodes
            .filter(node =>
              node.id !== expandedId &&
              !incomingNodeIds.has(node.id)
            )
            .map(node => node.id)
        )
      : new Set();
    const queue = [expandedNode];
    const maxMoves = Math.max(1, nodes.length * 12);
    let moveCount = 0;

    while (queue.length && moveCount < maxMoves) {
      const obstacle = queue.shift();

      if (
        obstacle.id !== expandedId &&
        moveNodeOutside(obstacle, expandedNode, gap)
      ) {
        moveCount++;
      }

      for (const node of nodes) {
        if (node.id === expandedId || node.id === obstacle.id) continue;
        if (protectedRootIds.has(node.id)) continue;
        if (!moveNodeOutside(node, obstacle, gap)) continue;

        queue.push(node);
        moveCount++;
        if (moveCount >= maxMoves) break;
      }
    }
  }

  function reflowExpandedNodesFromBasePositions(preservedPositions = null) {
    for (const node of nodes) {
      if (!node.simplePosition) {
        node.simplePosition = { x: node.x, y: node.y };
      }
      node.x = Number(node.simplePosition.x) || 0;
      node.y = Number(node.simplePosition.y) || 0;
    }

    for (const [id, position] of preservedPositions || []) {
      const node = nodeById(id);
      if (!node) continue;
      node.x = position.x;
      node.y = position.y;
    }

    renderAllNodes();
    for (const node of nodes) {
      if (node.expanded) resolveExpansionCollisions(node.id);
    }
  }

  function createBranch(sourceId, direction) {
    const source = nodeById(sourceId);
    if (!source) return;

    const spacingX = source.expanded ? 430 : 260;
    const spacingY = source.expanded ? 410 : 170;
    let x = source.x;
    let y = source.y;

    if (direction === 'top') y -= spacingY;
    if (direction === 'bottom') y += spacingY;
    if (direction === 'left') x -= spacingX;
    if (direction === 'right') x += spacingX;

    x = Math.max(20, x);
    y = Math.max(20, y);

    const target = createNode(x, y, '新节点');
    edges.push({ from: source.id, to: target.id });
    rebuildIncomingNodeIds();
    renderEdges();

    requestAnimationFrame(() => {
      const targetEl = getNodeElement(target.id);
      const textEl = targetEl?.querySelector('.simple-node-text');
      textEl?.focus();
      document.execCommand?.('selectAll', false, null);
    });
  }

  function getNodeElement(id) {
    return canvas.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
  }

  function selectNode(id, knownElement = null) {
    if (selectedId === id) return;

    const previousId = selectedId;
    const previousElement = selectedNodeElement;

    if (previousId && previousId !== id) {
      const previousNodeElement =
        previousElement || getNodeElement(previousId);
      const active = document.activeElement;
      if (active?.closest?.('.node') === previousNodeElement) {
        active.blur();
      }
      previousNodeElement?.querySelectorAll('.text-editing')
        .forEach(element => element.classList.remove('text-editing'));

      const selection = window.getSelection();
      const selectionNode = selection?.anchorNode;
      if (
        selectionNode &&
        previousNodeElement?.contains(
          selectionNode.nodeType === Node.TEXT_NODE
            ? selectionNode.parentNode
            : selectionNode
        )
      ) {
        selection.removeAllRanges();
      }
    }

    selectedId = id;

    if (previousId) {
      (previousElement || getNodeElement(previousId))?.classList.remove('selected');
    }

    selectedNodeElement = id
      ? knownElement || getNodeElement(id)
      : null;
    selectedNodeElement?.classList.add('selected');
  }

  function deleteSelected() {
    if (!selectedId) return;
    if (detailEditorNodeId === selectedId) closeDetailEditor();
    const el = getNodeElement(selectedId);
    el?.remove();
    nodes = nodes.filter(n => n.id !== selectedId);
    edges = edges.filter(e => e.from !== selectedId && e.to !== selectedId);
    rebuildIncomingNodeIds();
    selectedId = null;
    selectedNodeElement = null;
    renderEdges();
    updateEmptyMessage();
    updateToggleAllButton();
  }

  function deleteBatchSelected() {
    if (!batchSelectedIds.size) return false;

    const deletingIds = new Set(batchSelectedIds);
    if (detailEditorNodeId && deletingIds.has(detailEditorNodeId)) {
      closeDetailEditor();
    }

    for (const id of deletingIds) {
      getNodeElement(id)?.remove();
    }
    nodes = nodes.filter(node => !deletingIds.has(node.id));
    edges = edges.filter(edge =>
      !deletingIds.has(edge.from) && !deletingIds.has(edge.to)
    );

    clearBatchSelection();
    rebuildIncomingNodeIds();
    renderEdges();
    updateEmptyMessage();
    updateToggleAllButton();
    scheduleAutoSave();
    showStatus(`已删除 ${deletingIds.size} 张卡片`);
    return true;
  }

  function anchor(node, other, rectCache = null) {
    const rect = rectCache?.get(node.id) || nodeRect(node);
    const w = rect.width;
    const h = rect.height;
    const cx = node.x + w / 2;
    const cy = node.y + h / 2;

    const otherRect = rectCache?.get(other.id) || nodeRect(other);
    const ow = otherRect.width;
    const oh = otherRect.height;
    const ocx = other.x + ow / 2;
    const ocy = other.y + oh / 2;

    const dx = ocx - cx;
    const dy = ocy - cy;

    if (Math.abs(dx / w) > Math.abs(dy / h)) {
      return { x: dx > 0 ? node.x + w : node.x, y: cy };
    }
    return { x: cx, y: dy > 0 ? node.y + h : node.y };
  }

  function directionVector(direction) {
    if (direction === 'top') return { x: 0, y: -1 };
    if (direction === 'right') return { x: 1, y: 0 };
    if (direction === 'bottom') return { x: 0, y: 1 };
    return { x: -1, y: 0 };
  }

  function anchorDirection(node, point, rectCache = null) {
    const rect = rectCache?.get(node.id) || nodeRect(node);
    const width = rect.width;
    const height = rect.height;
    const distances = [
      { direction: 'top', value: Math.abs(point.y - node.y) },
      { direction: 'right', value: Math.abs(point.x - (node.x + width)) },
      { direction: 'bottom', value: Math.abs(point.y - (node.y + height)) },
      { direction: 'left', value: Math.abs(point.x - node.x) }
    ];
    distances.sort((a, b) => a.value - b.value);
    return distances[0].direction;
  }

  function visibleTargetAnchor(node, sourceAnchor, rectCache = null) {
    const rect = rectCache?.get(node.id) || nodeRect(node);
    const width = rect.width;
    const height = rect.height;
    const centerX = node.x + width / 2;
    const centerY = node.y + height / 2;
    const candidates = [
      { x: centerX, y: node.y, direction: 'top' },
      { x: node.x + width, y: centerY, direction: 'right' },
      { x: centerX, y: node.y + height, direction: 'bottom' },
      { x: node.x, y: centerY, direction: 'left' }
    ];

    const nearest = candidates.reduce((currentNearest, candidate) => (
      Math.hypot(
        candidate.x - sourceAnchor.x,
        candidate.y - sourceAnchor.y
      ) < Math.hypot(
        currentNearest.x - sourceAnchor.x,
        currentNearest.y - sourceAnchor.y
      )
        ? candidate
        : currentNearest
    ));
    const outward = directionVector(nearest.direction);

    return {
      x: nearest.x + outward.x * ARROW_TARGET_GAP,
      y: nearest.y + outward.y * ARROW_TARGET_GAP,
      direction: nearest.direction
    };
  }

  function pointInsideRect(point, rect) {
    return (
      point.x > rect.x &&
      point.x < rect.x + rect.width &&
      point.y > rect.y &&
      point.y < rect.y + rect.height
    );
  }

  function cubicPoint(a, c1, c2, b, t) {
    const mt = 1 - t;
    return {
      x: mt ** 3 * a.x +
        3 * mt ** 2 * t * c1.x +
        3 * mt * t ** 2 * c2.x +
        t ** 3 * b.x,
      y: mt ** 3 * a.y +
        3 * mt ** 2 * t * c1.y +
        3 * mt * t ** 2 * c2.y +
        t ** 3 * b.y
    };
  }

  function cubicHitsObstacles(a, c1, c2, b, obstacles) {
    for (let step = 1; step < 40; step++) {
      const point = cubicPoint(a, c1, c2, b, step / 40);
      if (obstacles.some(rect => pointInsideRect(point, rect))) return true;
    }
    return false;
  }

  function segmentHitsRect(a, b, rect) {
    if (a.x === b.x) {
      return (
        a.x > rect.x &&
        a.x < rect.x + rect.width &&
        Math.max(a.y, b.y) > rect.y &&
        Math.min(a.y, b.y) < rect.y + rect.height
      );
    }
    if (a.y === b.y) {
      return (
        a.y > rect.y &&
        a.y < rect.y + rect.height &&
        Math.max(a.x, b.x) > rect.x &&
        Math.min(a.x, b.x) < rect.x + rect.width
      );
    }
    return false;
  }

  function routeIsClear(points, obstacles) {
    for (let i = 1; i < points.length; i++) {
      if (obstacles.some(rect => segmentHitsRect(points[i - 1], points[i], rect))) {
        return false;
      }
    }
    return true;
  }

  function routeLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.abs(points[i].x - points[i - 1].x);
      length += Math.abs(points[i].y - points[i - 1].y);
    }
    return length;
  }

  function obstacleAvoidingPath(a, b, sourceDirection, obstacles) {
    const sourceVector = directionVector(sourceDirection);
    const targetVector = directionVector(b.direction);
    const sourceExit = {
      x: a.x + sourceVector.x * 24,
      y: a.y + sourceVector.y * 24
    };
    const targetEntry = {
      x: b.x + targetVector.x * 24,
      y: b.y + targetVector.y * 24
    };
    const minX = Math.min(sourceExit.x, targetEntry.x, ...obstacles.map(r => r.x));
    const maxX = Math.max(
      sourceExit.x,
      targetEntry.x,
      ...obstacles.map(r => r.x + r.width)
    );
    const minY = Math.min(sourceExit.y, targetEntry.y, ...obstacles.map(r => r.y));
    const maxY = Math.max(
      sourceExit.y,
      targetEntry.y,
      ...obstacles.map(r => r.y + r.height)
    );
    const topY = Math.max(8, minY - 32);
    const bottomY = maxY + 32;
    const leftX = Math.max(8, minX - 32);
    const rightX = maxX + 32;
    const candidates = [
      [sourceExit, { x: targetEntry.x, y: sourceExit.y }, targetEntry],
      [sourceExit, { x: sourceExit.x, y: targetEntry.y }, targetEntry],
      [
        sourceExit,
        { x: sourceExit.x, y: topY },
        { x: targetEntry.x, y: topY },
        targetEntry
      ],
      [
        sourceExit,
        { x: sourceExit.x, y: bottomY },
        { x: targetEntry.x, y: bottomY },
        targetEntry
      ],
      [
        sourceExit,
        { x: leftX, y: sourceExit.y },
        { x: leftX, y: targetEntry.y },
        targetEntry
      ],
      [
        sourceExit,
        { x: rightX, y: sourceExit.y },
        { x: rightX, y: targetEntry.y },
        targetEntry
      ]
    ];
    const route = candidates
      .filter(candidate => routeIsClear(candidate, obstacles))
      .sort((first, second) => routeLength(first) - routeLength(second))[0];

    if (!route) return null;
    return [
      `M ${a.x} ${a.y}`,
      `L ${sourceExit.x} ${sourceExit.y}`,
      ...route.slice(1).map(point => `L ${point.x} ${point.y}`),
      `L ${b.x} ${b.y}`
    ].join(' ');
  }

  function positionEdgeFlipButton(event) {
    const canvasRect = canvas.getBoundingClientRect();
    edgeFlipButton.style.left = `${event.clientX - canvasRect.left}px`;
    edgeFlipButton.style.top = `${event.clientY - canvasRect.top}px`;
  }

  function hideEdgeFlipButton(immediate = false) {
    clearTimeout(edgeFlipShowTimer);
    clearTimeout(edgeFlipHideTimer);
    edgeFlipShowTimer = null;
    const hide = () => {
      edgeFlipButton.classList.remove('visible');
      edgeFlipTarget = null;
    };
    if (immediate) {
      hide();
    } else {
      edgeFlipHideTimer = setTimeout(hide, 220);
    }
  }

  function scheduleEdgeFlipButton(edge, event) {
    clearTimeout(edgeFlipHideTimer);
    edgeFlipHideTimer = null;
    edgeFlipTarget = edge;
    positionEdgeFlipButton(event);
    if (edgeFlipButton.classList.contains('visible') || edgeFlipShowTimer) return;
    edgeFlipShowTimer = setTimeout(() => {
      edgeFlipShowTimer = null;
      if (!edgeFlipTarget) return;
      edgeFlipButton.classList.add('visible');
    }, 650);
  }

  function renderEdges(markChanged = true) {
    hideEdgeFlipButton(true);
    if (edgeRenderFrame !== null) {
      cancelAnimationFrame(edgeRenderFrame);
      edgeRenderFrame = null;
    }
    svg.querySelectorAll('.edge').forEach(el => el.remove());
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const elementMap = new Map(
      [...canvas.querySelectorAll('.node')].map(element => [
        element.dataset.id,
        element
      ])
    );
    const rectCache = new Map(nodes.map(node => {
      const element = elementMap.get(node.id);
      return [node.id, {
        x: node.x,
        y: node.y,
        width: element?.offsetWidth || (node.expanded ? 340 : 180),
        height: element?.offsetHeight || (node.expanded ? 320 : 74)
      }];
    }));
    const obstaclePadding = 12;
    const paddedRects = nodes.map(node => {
      const rect = rectCache.get(node.id);
      return {
        id: node.id,
        x: rect.x - obstaclePadding,
        y: rect.y - obstaclePadding,
        width: rect.width + obstaclePadding * 2,
        height: rect.height + obstaclePadding * 2
      };
    });
    const fragment = document.createDocumentFragment();

    for (const edge of edges) {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) continue;

      const a = anchor(from, to, rectCache);
      const b = visibleTargetAnchor(to, a, rectCache);

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const curveDistance = Math.max(
        48,
        Math.min(150, Math.hypot(dx, dy) * 0.38)
      );
      const sourceVector = directionVector(anchorDirection(from, a, rectCache));
      const targetVector = directionVector(b.direction);
      const sourceControlX = a.x + sourceVector.x * curveDistance;
      const sourceControlY = a.y + sourceVector.y * curveDistance;
      const targetControlX = b.x + targetVector.x * curveDistance;
      const targetControlY = b.y + targetVector.y * curveDistance;
      const curvedPath = [
        `M ${a.x} ${a.y}`,
        `C ${sourceControlX} ${sourceControlY},`,
        `${targetControlX} ${targetControlY},`,
        `${b.x} ${b.y}`
      ].join(' ');
      const obstacles = paddedRects.filter(
        rect => rect.id !== from.id && rect.id !== to.id
      );
      const sourceDirection = anchorDirection(from, a, rectCache);
      const d = cubicHitsObstacles(
        a,
        { x: sourceControlX, y: sourceControlY },
        { x: targetControlX, y: targetControlY },
        b,
        obstacles
      )
        ? obstacleAvoidingPath(a, b, sourceDirection, obstacles) || curvedPath
        : curvedPath;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'edge');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#64748b');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('marker-end', 'url(#arrowhead)');

      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('class', 'edge edge-hit-area');
      hitPath.setAttribute('d', d);
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', '16');
      hitPath.setAttribute('stroke-linecap', 'round');
      hitPath.setAttribute('stroke-linejoin', 'round');
      hitPath.addEventListener('mouseenter', event => {
        scheduleEdgeFlipButton(edge, event);
      });
      hitPath.addEventListener('mousemove', event => {
        scheduleEdgeFlipButton(edge, event);
      });
      hitPath.addEventListener('mouseleave', () => {
        hideEdgeFlipButton();
      });
      fragment.append(path, hitPath);
    }
    svg.appendChild(fragment);
    if (markChanged) scheduleAutoSave();
  }

  function requestEdgeRender() {
    if (edgeRenderFrame !== null) return;
    edgeRenderFrame = requestAnimationFrame(() => {
      edgeRenderFrame = null;
      renderEdges();
    });
  }

  function directoryId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function activeChart() {
    for (const folder of workspaceData?.folders || []) {
      const chart = folder.charts.find(item => item.id === activeChartId);
      if (chart) return chart;
    }
    return null;
  }

  function activeChartDirectoryTitle() {
    for (const folder of workspaceData?.folders || []) {
      const chart = folder.charts.find(item => item.id === activeChartId);
      if (chart) return `${folder.name} - ${chart.name}`;
    }
    return '未命名文件夹 - 未命名流程图';
  }

  function persistWorkspace() {
    if (!workspaceData || cacheDeletionInProgress) return;
    workspaceData.activeFolderId = activeFolderId;
    workspaceData.activeChartId = activeChartId;
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceData));
    } catch {
      showStatus('自动保存失败：浏览器存储空间不足');
    }
  }

  function saveCurrentChart() {
    if (
      !workspaceData ||
      cacheDeletionInProgress ||
      isLoadingChart ||
      !activeChartId
    ) return;
    const chart = activeChart();
    if (!chart) return;
    chart.state = getState();
    chart.updatedAt = Date.now();
    persistWorkspace();
  }

  function scheduleAutoSave() {
    if (!workspaceData || isLoadingChart) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveCurrentChart, 250);
    scheduleHistorySnapshot();
  }

  const directoryNameMeasureCanvas = document.createElement('canvas');
  const directoryNameMeasureContext = directoryNameMeasureCanvas.getContext('2d');

  function restoreDirectoryName(input) {
    if (!input?.dataset.fullName) return;
    input.value = input.dataset.fullName;
    delete input.dataset.fullName;
  }

  function fitDirectoryName(input, fullName) {
    if (!input || !input.readOnly || !directoryNameMeasureContext) return;

    input.dataset.fullName = fullName;
    input.value = fullName;

    const style = getComputedStyle(input);
    const horizontalInset =
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight) +
      parseFloat(style.borderLeftWidth) +
      parseFloat(style.borderRightWidth);
    const availableWidth = Math.max(0, input.clientWidth - horizontalInset);
    directoryNameMeasureContext.font = style.font;

    if (
      directoryNameMeasureContext.measureText(fullName).width <= availableWidth
    ) return;

    const characters = Array.from(fullName);
    const ellipsis = '…';
    const ellipsisWidth =
      directoryNameMeasureContext.measureText(ellipsis).width;
    let low = 0;
    let high = characters.length;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const width = directoryNameMeasureContext
        .measureText(characters.slice(0, middle).join('')).width;
      if (width + ellipsisWidth <= availableWidth) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    input.value = `${characters.slice(0, low).join('')}${ellipsis}`;
  }

  function updateDirectoryDeleteLayout(row, button, input, fullName) {
    const buttonWidth = button.getBoundingClientRect().width;
    row.style.paddingRight = `${Math.ceil(buttonWidth) + 15}px`;
    fitDirectoryName(input, fullName);
  }

  function beginFolderRename(folder, input) {
    cancelFolderDelete();
    const originalName = folder.name;
    restoreDirectoryName(input);
    input.readOnly = false;
    input.classList.add('editing');
    input.focus();
    input.select();

    const finish = (restoreOriginal = false) => {
      const name = restoreOriginal
        ? originalName
        : input.value.trim() || '新文件夹';
      folder.name = name;
      input.value = name;
      input.readOnly = true;
      input.classList.remove('editing');
      input.closest('.folder-row').title = name;
      persistWorkspace();
    };

    input.onblur = () => finish(false);
    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      }
    };
  }

  function cancelFolderDelete() {
    pendingFolderDeleteId = null;
    fileTree.querySelectorAll('.folder-delete-btn').forEach(button => {
      const row = button.closest('.folder-row');
      const input = row?.querySelector('.folder-name-input');
      restoreDirectoryName(input);
      row?.style.removeProperty('padding-right');
      button.remove();
    });
  }

  function deleteFolder(folderId) {
    const folderIndex = workspaceData.folders.findIndex(folder => folder.id === folderId);
    if (folderIndex < 0) return;

    const deletedFolder = workspaceData.folders[folderIndex];
    const activeChartWasDeleted = deletedFolder.charts.some(
      chart => chart.id === activeChartId
    );
    workspaceData.folders.splice(folderIndex, 1);
    cancelFolderDelete();

    if (!workspaceData.folders.length) {
      workspaceData.folders.push({
        id: directoryId('folder'),
        name: '我的流程图',
        charts: []
      });
    }

    if (activeFolderId === folderId) {
      activeFolderId = workspaceData.folders[0].id;
    }

    let nextChart = null;
    let nextFolder = null;
    if (!activeChartWasDeleted) {
      nextChart = activeChart();
      nextFolder = workspaceData.folders.find(folder =>
        folder.charts.some(chart => chart.id === activeChartId)
      );
    }

    if (!nextChart) {
      for (const folder of workspaceData.folders) {
        if (!folder.charts.length) continue;
        nextFolder = folder;
        nextChart = folder.charts[0];
        break;
      }
    }

    if (!nextChart) {
      nextFolder = workspaceData.folders[0];
      nextChart = {
        id: directoryId('chart'),
        name: '默认流程图',
        updatedAt: Date.now(),
        state: null
      };
      nextFolder.charts.push(nextChart);
    }

    activeChartId = nextChart.id;
    isLoadingChart = true;
    if (!loadState(nextChart.state)) {
      nodes = [];
      edges = [];
      rebuildIncomingNodeIds(false);
      idCounter = 1;
      canvas.querySelectorAll('.node').forEach(el => el.remove());
      createNode(360, 220, '开始');
      nextChart.state = getState();
    }
    isLoadingChart = false;
    renderFileTree();
    renderEdges();
    persistWorkspace();
    resetHistory();
    showStatus('文件夹及其流程图已删除');
  }

  function showFolderDelete(folder, folderRow) {
    cancelFolderDelete();
    pendingFolderDeleteId = folder.id;

    const button = document.createElement('button');
    button.className = 'folder-delete-btn';
    button.type = 'button';
    button.textContent = '删除';
    button.dataset.stage = 'initial';
    button.addEventListener('mousedown', e => e.stopPropagation());
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      if (button.dataset.stage === 'initial') {
        button.dataset.stage = 'confirm';
        button.textContent = '确定删除';
        button.classList.add('confirm');
        updateDirectoryDeleteLayout(
          folderRow,
          button,
          folderRow.querySelector('.folder-name-input'),
          folder.name
        );
        return;
      }

      deleteFolder(folder.id);
    });
    folderRow.appendChild(button);
    updateDirectoryDeleteLayout(
      folderRow,
      button,
      folderRow.querySelector('.folder-name-input'),
      folder.name
    );
  }

  function beginChartRename(chart, input) {
    cancelChartDelete();
    const originalName = chart.name;
    restoreDirectoryName(input);
    input.readOnly = false;
    input.classList.add('editing');
    input.focus();
    input.select();

    const finish = (restoreOriginal = false) => {
      const name = restoreOriginal
        ? originalName
        : input.value.trim() || '新流程图';
      chart.name = name;
      input.value = name;
      input.readOnly = true;
      input.classList.remove('editing');
      input.closest('.chart-row').title = name;
      persistWorkspace();
    };

    input.onblur = () => finish(false);
    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      }
    };
  }

  function cancelChartDelete() {
    pendingChartDeleteId = null;
    fileTree.querySelectorAll('.chart-delete-btn').forEach(button => {
      const row = button.closest('.chart-row');
      const input = row?.querySelector('.chart-name-input');
      restoreDirectoryName(input);
      row?.style.removeProperty('padding-right');
      button.remove();
    });
  }

  function deleteStoredChart(folderId, chartId) {
    const folder = workspaceData.folders.find(item => item.id === folderId);
    const chartIndex = folder?.charts.findIndex(chart => chart.id === chartId) ?? -1;
    if (!folder || chartIndex < 0) return;

    const deletingActiveChart = chartId === activeChartId;
    folder.charts.splice(chartIndex, 1);
    cancelChartDelete();

    if (deletingActiveChart) {
      let nextFolder = null;
      let nextChart = null;
      for (const candidateFolder of workspaceData.folders) {
        if (!candidateFolder.charts.length) continue;
        nextFolder = candidateFolder;
        nextChart = candidateFolder.charts[0];
        break;
      }

      if (!nextChart) {
        nextFolder = folder;
        nextChart = {
          id: directoryId('chart'),
          name: '默认流程图',
          updatedAt: Date.now(),
          state: null
        };
        nextFolder.charts.push(nextChart);
      }

      activeChartId = nextChart.id;
      isLoadingChart = true;
      if (!loadState(nextChart.state)) {
        nodes = [];
        edges = [];
        rebuildIncomingNodeIds(false);
        idCounter = 1;
        canvas.querySelectorAll('.node').forEach(el => el.remove());
        createNode(360, 220, '开始');
        nextChart.state = getState();
      }
      isLoadingChart = false;
      renderEdges();
      resetHistory();
    }

    renderFileTree();
    persistWorkspace();
    showStatus('流程图已删除');
  }

  function showChartDelete(folder, chart, chartRow) {
    cancelChartDelete();
    pendingChartDeleteId = chart.id;

    const button = document.createElement('button');
    button.className = 'chart-delete-btn';
    button.type = 'button';
    button.textContent = '删除';
    button.dataset.stage = 'initial';
    button.addEventListener('mousedown', e => e.stopPropagation());
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      if (button.dataset.stage === 'initial') {
        button.dataset.stage = 'confirm';
        button.textContent = '确定删除';
        button.classList.add('confirm');
        updateDirectoryDeleteLayout(
          chartRow,
          button,
          chartRow.querySelector('.chart-name-input'),
          chart.name
        );
        return;
      }

      deleteStoredChart(folder.id, chart.id);
    });
    chartRow.appendChild(button);
    updateDirectoryDeleteLayout(
      chartRow,
      button,
      chartRow.querySelector('.chart-name-input'),
      chart.name
    );
  }

  function clearChartDirectoryDrag() {
    if (!chartDirectoryDrag) return;
    clearTimeout(chartDirectoryDrag.timer);
    chartDirectoryDrag.ghost?.remove();
    fileTree.querySelectorAll('.folder-row.chart-drop-target').forEach(row => {
      row.classList.remove('chart-drop-target');
    });
    fileTree.querySelectorAll('.chart-row.chart-drop-before, .chart-row.chart-drop-after')
      .forEach(row => {
        row.classList.remove('chart-drop-before', 'chart-drop-after');
      });
    chartDirectoryDrag = null;
  }

  function clearFolderDirectoryDrag() {
    if (!folderDirectoryDrag) return;
    clearTimeout(folderDirectoryDrag.timer);
    folderDirectoryDrag.ghost?.remove();
    fileTree.querySelectorAll(
      '.folder-row.folder-drop-before, .folder-drop-group-after'
    ).forEach(row => {
      row.classList.remove('folder-drop-before', 'folder-drop-group-after');
    });
    folderDirectoryDrag.row
      ?.closest('.folder-item')
      ?.classList.remove('folder-directory-drag-source');
    folderDirectoryDrag.row?.classList.remove('directory-drag-source');
    folderDirectoryDrag = null;
  }

  function beginFolderDirectoryPress(e, folder, folderRow) {
    if (e.button !== 0 || e.target.closest('.folder-delete-btn')) return;
    if (e.target.closest('.folder-name-input:not([readonly])')) return;

    clearFolderDirectoryDrag();
    clearChartDirectoryDrag();
    folderDirectoryDrag = {
      folderId: folder.id,
      folderName: folder.name,
      row: folderRow,
      startX: e.clientX,
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      active: false,
      targetFolderId: null,
      insertAfter: false,
      ghost: null,
      timer: null
    };

    folderDirectoryDrag.timer = setTimeout(() => {
      if (!folderDirectoryDrag) return;
      cancelFolderDelete();
      cancelChartDelete();
      folderDirectoryDrag.active = true;
      folderRow.classList.add('directory-drag-source');
      folderRow
        .closest('.folder-item')
        ?.classList.add('folder-directory-drag-source');

      const ghost = document.createElement('div');
      ghost.className = 'folder-drag-ghost';
      ghost.textContent = `▾  ${folderDirectoryDrag.folderName}`;
      document.body.appendChild(ghost);
      folderDirectoryDrag.ghost = ghost;
      ghost.style.left = folderDirectoryDrag.clientX + 12 + 'px';
      ghost.style.top = folderDirectoryDrag.clientY + 12 + 'px';
      showStatus('拖动到其他文件夹的前方或后方');
    }, 450);
  }

  function placeFolder(folderId, targetFolderId, insertAfter) {
    if (folderId === targetFolderId) return false;
    const sourceIndex = workspaceData.folders.findIndex(folder => folder.id === folderId);
    if (sourceIndex < 0) return false;
    const [folder] = workspaceData.folders.splice(sourceIndex, 1);
    const targetIndex = workspaceData.folders.findIndex(
      target => target.id === targetFolderId
    );
    if (targetIndex < 0) {
      workspaceData.folders.splice(sourceIndex, 0, folder);
      return false;
    }
    const insertIndex = targetIndex + (insertAfter ? 1 : 0);
    workspaceData.folders.splice(insertIndex, 0, folder);
    if (sourceIndex === insertIndex) return false;
    persistWorkspace();
    renderFileTree();
    showStatus(`“${folder.name}”及其流程图的排序已更新`);
    return true;
  }

  function beginChartDirectoryPress(e, folder, chart, chartRow) {
    if (e.button !== 0 || e.target.closest('.chart-delete-btn')) return;
    if (e.target.closest('.chart-name-input:not([readonly])')) return;

    clearChartDirectoryDrag();
    chartDirectoryDrag = {
      sourceFolderId: folder.id,
      chartId: chart.id,
      chartName: chart.name,
      row: chartRow,
      startX: e.clientX,
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      active: false,
      targetFolderId: null,
      targetChartId: null,
      insertAfter: false,
      ghost: null,
      timer: null
    };

    chartDirectoryDrag.timer = setTimeout(() => {
      if (!chartDirectoryDrag) return;
      cancelChartDelete();
      cancelFolderDelete();
      chartDirectoryDrag.active = true;
      chartRow.classList.add('directory-drag-source');

      const ghost = document.createElement('div');
      ghost.className = 'chart-drag-ghost';
      ghost.textContent = `◇  ${chartDirectoryDrag.chartName}`;
      document.body.appendChild(ghost);
      chartDirectoryDrag.ghost = ghost;
      ghost.style.left = chartDirectoryDrag.clientX + 12 + 'px';
      ghost.style.top = chartDirectoryDrag.clientY + 12 + 'px';
      showStatus('拖动到流程图之间或目标文件夹后松开');
    }, 450);
  }

  function placeChart(sourceFolderId, chartId, targetFolderId, targetChartId, insertAfter) {
    if (targetChartId === chartId) return false;
    if (activeChartId === chartId) saveCurrentChart();
    const sourceFolder = workspaceData.folders.find(folder => folder.id === sourceFolderId);
    const targetFolder = workspaceData.folders.find(folder => folder.id === targetFolderId);
    const chartIndex = sourceFolder?.charts.findIndex(chart => chart.id === chartId) ?? -1;
    if (!sourceFolder || !targetFolder || chartIndex < 0) return false;

    const [chart] = sourceFolder.charts.splice(chartIndex, 1);
    let insertIndex = targetFolder.charts.length;
    if (targetChartId) {
      const targetIndex = targetFolder.charts.findIndex(item => item.id === targetChartId);
      if (targetIndex >= 0) insertIndex = targetIndex + (insertAfter ? 1 : 0);
    }
    targetFolder.charts.splice(insertIndex, 0, chart);

    const positionUnchanged =
      sourceFolder === targetFolder &&
      chartIndex === insertIndex;
    if (positionUnchanged) return false;

    persistWorkspace();
    renderFileTree();
    showStatus(
      sourceFolder === targetFolder
        ? `“${chart.name}”的排序已更新`
        : `“${chart.name}”已移动到“${targetFolder.name}”`
    );
    return true;
  }

  function nodeMatchesDirectorySearch(node, query) {
    if (!query) return false;
    const searchableParts = [
      node.simpleText,
      node.title,
      node.text,
      node.richContent?.replace(/<[^>]*>/g, ' '),
      ...Object.values(node.properties || {})
    ];
    return searchableParts.some(value =>
      String(value ?? '').toLocaleLowerCase().includes(query)
    );
  }

  function chartMatchesDirectorySearch(chart, query) {
    if (!query) return true;
    if (chart.name.toLocaleLowerCase().includes(query)) return true;
    return (chart.state?.nodes || []).some(node =>
      nodeMatchesDirectorySearch(node, query)
    );
  }

  function updateNodeSearchHighlights() {
    const query = directorySearchQuery.trim().toLocaleLowerCase();
    canvas.querySelectorAll('.node').forEach(element => {
      const node = nodeById(element.dataset.id);
      element.classList.toggle(
        'search-match',
        Boolean(node && nodeMatchesDirectorySearch(node, query))
      );
    });
  }

  function renderFileTree() {
    pendingFolderDeleteId = null;
    pendingChartDeleteId = null;
    fileTree.replaceChildren();
    const searchQuery = directorySearchQuery
      .trim()
      .toLocaleLowerCase();
    let visibleChartCount = 0;

    for (const folder of workspaceData?.folders || []) {
      const visibleCharts = folder.charts.filter(chart =>
        chartMatchesDirectorySearch(chart, searchQuery)
      );
      if (searchQuery && !visibleCharts.length) continue;
      const folderItem = document.createElement('div');
      folderItem.className = 'folder-item';

      const folderRow = document.createElement('div');
      folderRow.className = 'folder-row';
      folderRow.classList.toggle('current-folder', folder.id === activeFolderId);
      folderRow.dataset.folderId = folder.id;
      folderRow.tabIndex = 0;
      folderRow.setAttribute('role', 'button');
      folderRow.title = folder.name;
      folderRow.innerHTML = '<span class="tree-icon">▾</span>';

      const folderName = document.createElement('input');
      folderName.className = 'tree-name folder-name-input';
      folderName.dataset.folderId = folder.id;
      folderName.type = 'text';
      folderName.value = folder.name;
      folderName.readOnly = true;
      folderName.setAttribute('aria-label', '文件夹名称');
      folderName.addEventListener('selectstart', e => {
        if (folderName.readOnly) e.preventDefault();
      });
      folderName.addEventListener('dragstart', e => e.preventDefault());
      folderName.addEventListener('dblclick', e => {
        e.preventDefault();
        e.stopPropagation();
        beginFolderRename(folder, folderName);
      });
      folderName.addEventListener('click', e => {
        if (Date.now() < suppressFolderClickUntil) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (!folderName.readOnly) {
          e.stopPropagation();
          return;
        }
        showFolderDelete(folder, folderRow);
      });
      folderRow.appendChild(folderName);
      folderRow.addEventListener('mousedown', e => {
        beginFolderDirectoryPress(e, folder, folderRow);
      });
      folderRow.addEventListener('click', e => {
        if (Date.now() < suppressFolderClickUntil) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        activeFolderId = folder.id;
        fileTree.querySelectorAll('.folder-row.current-folder').forEach(row => {
          row.classList.remove('current-folder');
        });
        folderRow.classList.add('current-folder');
        persistWorkspace();
      });
      folderItem.appendChild(folderRow);

      for (const chart of visibleCharts) {
        visibleChartCount += 1;
        const chartRow = document.createElement('div');
        chartRow.className = 'chart-row';
        chartRow.classList.toggle('active', chart.id === activeChartId);
        chartRow.dataset.chartId = chart.id;
        chartRow.dataset.folderId = folder.id;
        chartRow.tabIndex = 0;
        chartRow.setAttribute('role', 'button');
        chartRow.title = chart.name;
        chartRow.innerHTML = '<span class="tree-icon">◇</span>';

        const chartName = document.createElement('input');
        chartName.className = 'tree-name chart-name-input';
        chartName.dataset.chartId = chart.id;
        chartName.type = 'text';
        chartName.value = chart.name;
        chartName.readOnly = true;
        chartName.setAttribute('aria-label', '流程图名称');
        chartName.addEventListener('selectstart', e => {
          if (chartName.readOnly) e.preventDefault();
        });
        chartName.addEventListener('dragstart', e => e.preventDefault());
        chartName.addEventListener('dblclick', e => {
          e.preventDefault();
          e.stopPropagation();
          beginChartRename(chart, chartName);
        });
        chartName.addEventListener('click', e => {
          if (Date.now() < suppressChartClickUntil) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (!chartName.readOnly) {
            e.stopPropagation();
            return;
          }
          showChartDelete(folder, chart, chartRow);
        });
        chartRow.appendChild(chartName);
        chartRow.addEventListener('mousedown', e => {
          beginChartDirectoryPress(e, folder, chart, chartRow);
        });
        chartRow.addEventListener('click', e => {
          if (Date.now() < suppressChartClickUntil) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          openStoredChart(folder.id, chart.id);
        });
        folderItem.appendChild(chartRow);
      }

      fileTree.appendChild(folderItem);
    }
    if (searchQuery && !visibleChartCount) {
      const empty = document.createElement('div');
      empty.className = 'file-tree-empty';
      empty.textContent = '没有找到包含该关键词的流程图或节点卡片';
      fileTree.appendChild(empty);
    }
  }

  function openStoredChart(folderId, chartId) {
    if (chartId === activeChartId) return;
    saveCurrentChart();
    if (batchMode) setBatchMode(false);

    const folder = workspaceData.folders.find(item => item.id === folderId);
    const chart = folder?.charts.find(item => item.id === chartId);
    if (!folder || !chart) return;

    activeChartId = chart.id;
    isLoadingChart = true;
    loadState(chart.state);
    isLoadingChart = false;
    resetHistory();
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    fileTree.querySelectorAll('.chart-row.active').forEach(row => {
      row.classList.remove('active');
    });
    fileTree.querySelector(
      `.chart-row[data-chart-id="${CSS.escape(chart.id)}"]`
    )?.classList.add('active');
    persistWorkspace();
  }

  function createFolder() {
    const folder = {
      id: directoryId('folder'),
      name: '新文件夹',
      charts: []
    };
    workspaceData.folders.push(folder);
    activeFolderId = folder.id;
    renderFileTree();
    persistWorkspace();

    const input = fileTree.querySelector(
      `.folder-name-input[data-folder-id="${CSS.escape(folder.id)}"]`
    );
    if (input) beginFolderRename(folder, input);
  }

  function createStoredChart() {
    const folder = workspaceData.folders.find(item => item.id === activeFolderId);
    if (!folder) {
      showStatus('请先创建或选择一个文件夹');
      return;
    }

    saveCurrentChart();
    const chart = {
      id: directoryId('chart'),
      name: '新流程图',
      updatedAt: Date.now(),
      state: { version: 1, idCounter: 1, nodes: [], edges: [] }
    };
    folder.charts.push(chart);
    activeChartId = chart.id;
    isLoadingChart = true;
    loadState(chart.state);
    createNode(360, 220, '开始');
    chart.state = getState();
    isLoadingChart = false;
    resetHistory();
    renderFileTree();
    persistWorkspace();

    const input = fileTree.querySelector(
      `.chart-name-input[data-chart-id="${CSS.escape(chart.id)}"]`
    );
    if (input) beginChartRename(chart, input);
  }

  function initializeWorkspace() {
    registerCurrentDocumentCache();
    try {
      let storedWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (
        storedWorkspace == null &&
        WORKSPACE_STORAGE_KEY !== PATH_WORKSPACE_STORAGE_KEY
      ) {
        storedWorkspace = localStorage.getItem(PATH_WORKSPACE_STORAGE_KEY);
        if (storedWorkspace != null) {
          localStorage.setItem(WORKSPACE_STORAGE_KEY, storedWorkspace);
        }
      }
      if (storedWorkspace == null && SHOULD_MIGRATE_LEGACY_WORKSPACE) {
        storedWorkspace = localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
        if (storedWorkspace != null) {
          localStorage.setItem(WORKSPACE_STORAGE_KEY, storedWorkspace);
        }
      }
      workspaceData = JSON.parse(storedWorkspace);
    } catch {
      workspaceData = null;
    }

    if (!workspaceData || !Array.isArray(workspaceData.folders)) {
      const folderId = directoryId('folder');
      const chartId = directoryId('chart');
      workspaceData = {
        version: 1,
        activeFolderId: folderId,
        activeChartId: chartId,
        folders: [{
          id: folderId,
          name: '我的流程图',
          charts: [{
            id: chartId,
            name: '默认流程图',
            updatedAt: Date.now(),
            state: initialState
          }]
        }]
      };
    }

    activeFolderId = workspaceData.activeFolderId ||
      workspaceData.folders[0]?.id ||
      null;
    const availableCharts = workspaceData.folders.flatMap(folder => folder.charts);
    activeChartId = availableCharts.some(chart => chart.id === workspaceData.activeChartId)
      ? workspaceData.activeChartId
      : availableCharts[0]?.id || null;

    if (!activeChartId) {
      const folder = workspaceData.folders.find(item => item.id === activeFolderId) ||
        workspaceData.folders[0];
      if (folder) {
        const chart = {
          id: directoryId('chart'),
          name: '默认流程图',
          updatedAt: Date.now(),
          state: null
        };
        folder.charts.push(chart);
        activeFolderId = folder.id;
        activeChartId = chart.id;
      }
    }

    const chart = activeChart();
    isLoadingChart = true;
    if (!loadState(chart?.state)) {
      nodes = [];
      edges = [];
      rebuildIncomingNodeIds(false);
      idCounter = 1;
      canvas.querySelectorAll('.node').forEach(el => el.remove());
      createNode(360, 220, '开始');
      if (chart) chart.state = getState();
    }
    isLoadingChart = false;
    resetHistory();
    renderFileTree();
    persistWorkspace();
  }

  async function migrateLegacyWorkspaceMedia() {
    let changed = false;
    try {
      for (const folder of workspaceData?.folders || []) {
        for (const chart of folder.charts || []) {
          for (const node of chart.state?.nodes || []) {
            if (!node.richContent?.includes('data:')) continue;
            const migrated = await externalizeMediaHTML(node.richContent);
            if (migrated !== node.richContent) {
              node.richContent = migrated;
              changed = true;
            }
          }
        }
      }
      if (!changed) return;
      persistWorkspace();
      const chart = activeChart();
      if (chart?.state) {
        isLoadingChart = true;
        loadState(chart.state);
        isLoadingChart = false;
        resetHistory();
      }
      showStatus('旧版媒体已迁移到 IndexedDB');
    } catch (error) {
      console.error('旧版媒体迁移失败', error);
      showStatus('部分旧版媒体暂未迁移，原数据仍保留');
    }
  }

  function updateEmptyMessage() {
    emptyMessage.style.display = nodes.length ? 'none' : 'block';
  }

  function updateToggleAllButton() {
    const hasExpandedNode = nodes.some(node => node.expanded);
    toggleAllBtn.textContent = hasExpandedNode ? '全部关闭' : '全部打开';
    toggleAllBtn.title = hasExpandedNode
      ? '将所有卡片关闭为简易节点'
      : '将所有简易节点打开为多功能卡片';
  }

  function clearNodeSelection() {
    canvas.querySelectorAll('.node.selected').forEach(el => {
      el.classList.remove('selected');
    });
    selectedId = null;
    selectedNodeElement = null;
  }

  function clearBatchSelection() {
    batchSelectedIds.clear();
    canvas.querySelectorAll('.node.batch-selected').forEach(el => {
      el.classList.remove('batch-selected');
    });
  }

  function copySelectedNodes() {
    const selectedIds = batchSelectedIds.size
      ? new Set(batchSelectedIds)
      : selectedId
        ? new Set([selectedId])
        : null;
    if (!selectedIds?.size) return false;

    const copiedNodes = nodes
      .filter(node => selectedIds.has(node.id))
      .map(node => JSON.parse(JSON.stringify(node)));
    nodeClipboard = {
      nodes: copiedNodes,
      edges: edges
        .filter(edge => selectedIds.has(edge.from) && selectedIds.has(edge.to))
        .map(edge => ({...edge}))
    };
    clipboardPasteCount = 0;
    showStatus(
      copiedNodes.length > 1
        ? `已复制 ${copiedNodes.length} 张卡片`
        : '已复制卡片'
    );
    return true;
  }

  function pasteCopiedNodes() {
    if (!nodeClipboard?.nodes.length) return false;
    const replacementTarget =
      !batchSelectedIds.size &&
      selectedId &&
      !nodeClipboard.nodes.some(node => node.id === selectedId)
      ? nodeById(selectedId)
      : null;
    const clipboardIncomingIds = new Set(
      nodeClipboard.edges.map(edge => edge.to)
    );
    const sourceRoot = nodeClipboard.nodes.find(
      node => !clipboardIncomingIds.has(node.id)
    ) || nodeClipboard.nodes[0];
    if (!replacementTarget) clipboardPasteCount += 1;
    const offset = replacementTarget ? 0 : 36 * clipboardPasteCount;
    const idMap = new Map();
    const pastedIds = [];
    let positionDeltaX = 0;
    let positionDeltaY = 0;
    let basePositionDeltaX = 0;
    let basePositionDeltaY = 0;

    if (replacementTarget) {
      positionDeltaX =
        (Number(replacementTarget.x) || 0) - (Number(sourceRoot.x) || 0);
      positionDeltaY =
        (Number(replacementTarget.y) || 0) - (Number(sourceRoot.y) || 0);
      basePositionDeltaX =
        (Number(
          replacementTarget.simplePosition?.x ?? replacementTarget.x
        ) || 0) -
        (Number(sourceRoot.simplePosition?.x ?? sourceRoot.x) || 0);
      basePositionDeltaY =
        (Number(
          replacementTarget.simplePosition?.y ?? replacementTarget.y
        ) || 0) -
        (Number(sourceRoot.simplePosition?.y ?? sourceRoot.y) || 0);
      const preservedPosition = {
        id: replacementTarget.id,
        x: replacementTarget.x,
        y: replacementTarget.y,
        simplePosition: {
          x: Number(
            replacementTarget.simplePosition?.x ?? replacementTarget.x
          ) || 0,
          y: Number(
            replacementTarget.simplePosition?.y ?? replacementTarget.y
          ) || 0
        }
      };
      Object.assign(
        replacementTarget,
        JSON.parse(JSON.stringify(sourceRoot)),
        preservedPosition,
        {
          properties: {
            ...defaultProperties(),
            ...(sourceRoot.properties || {})
          }
        }
      );
      idMap.set(sourceRoot.id, replacementTarget.id);
      pastedIds.push(replacementTarget.id);
      clearNodeSelection();
      getNodeElement(replacementTarget.id)?.remove();
      renderNode(replacementTarget);
    }

    for (const source of nodeClipboard.nodes) {
      if (replacementTarget && source.id === sourceRoot.id) continue;
      const id = nextId();
      idMap.set(source.id, id);
      const sourceX = Number(source.x) || 0;
      const sourceY = Number(source.y) || 0;
      const sourceBaseX = Number(source.simplePosition?.x ?? source.x) || 0;
      const sourceBaseY = Number(source.simplePosition?.y ?? source.y) || 0;
      const node = {
        ...JSON.parse(JSON.stringify(source)),
        id,
        x: Math.max(0, sourceX + offset + positionDeltaX),
        y: Math.max(0, sourceY + offset + positionDeltaY),
        simplePosition: {
          x: Math.max(0, sourceBaseX + offset + basePositionDeltaX),
          y: Math.max(0, sourceBaseY + offset + basePositionDeltaY)
        },
        properties: {
          ...defaultProperties(),
          ...(source.properties || {})
        }
      };
      nodes.push(node);
      pastedIds.push(id);
      renderNode(node);
    }

    for (const edge of nodeClipboard.edges) {
      const from = idMap.get(edge.from);
      const to = idMap.get(edge.to);
      if (
        from &&
        to &&
        !edges.some(existing => existing.from === from && existing.to === to)
      ) {
        edges.push({...edge, from, to});
      }
    }
    rebuildIncomingNodeIds();

    if (pastedIds.length > 1) {
      setBatchMode(true);
      for (const id of pastedIds) {
        batchSelectedIds.add(id);
        getNodeElement(id)?.classList.add('batch-selected');
      }
    } else {
      if (batchMode) setBatchMode(false);
      clearBatchSelection();
      selectNode(pastedIds[0]);
    }

    renderEdges();
    updateEmptyMessage();
    updateToggleAllButton();
    scheduleAutoSave();
    showStatus(
      replacementTarget
        ? pastedIds.length > 1
          ? `已替换选中卡片，并粘贴其余 ${pastedIds.length - 1} 张卡片`
          : '已用复制的首节点替换选中卡片'
        : pastedIds.length > 1
        ? `已粘贴 ${pastedIds.length} 张卡片`
        : '已粘贴卡片'
    );
    return true;
  }

  function setBatchMode(enabled) {
    batchMode = enabled;
    batchSelectBtn.classList.toggle('active', enabled);
    batchSelectBtn.setAttribute('aria-pressed', String(enabled));
    clearNodeSelection();
    clearBatchSelection();
    batchSelectionDrag?.box.remove();
    batchSelectionDrag = null;
    if (batchSelectionAutoScrollFrame) {
      cancelAnimationFrame(batchSelectionAutoScrollFrame);
      batchSelectionAutoScrollFrame = null;
    }
    batchMove = null;
    drag = null;
    dragCandidate = null;
  }

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function selectionBounds(start, current) {
    return {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y)
    };
  }

  function updateBatchSelection(bounds) {
    clearBatchSelection();
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;

    for (const node of nodes) {
      const rect = nodeRect(node);
      const intersects = (
        rect.x < right &&
        rect.x + rect.width > bounds.x &&
        rect.y < bottom &&
        rect.y + rect.height > bounds.y
      );
      if (!intersects) continue;

      batchSelectedIds.add(node.id);
      getNodeElement(node.id)?.classList.add('batch-selected');
    }
  }

  function updateBatchSelectionDrag() {
    if (!batchSelectionDrag) return;
    const current = canvasPoint({
      clientX: batchSelectionDrag.clientX,
      clientY: batchSelectionDrag.clientY
    });
    const bounds = selectionBounds(batchSelectionDrag.start, current);
    batchSelectionDrag.box.style.left = bounds.x + 'px';
    batchSelectionDrag.box.style.top = bounds.y + 'px';
    batchSelectionDrag.box.style.width = bounds.width + 'px';
    batchSelectionDrag.box.style.height = bounds.height + 'px';
    updateBatchSelection(bounds);
  }

  function runBatchSelectionAutoScroll() {
    batchSelectionAutoScrollFrame = null;
    if (!batchMode || !batchSelectionDrag) return;

    const rect = viewport.getBoundingClientRect();
    const threshold = 56;
    const maxSpeed = 18;
    const pointerX = batchSelectionDrag.clientX;
    const pointerY = batchSelectionDrag.clientY;
    let scrollDeltaX = 0;
    let scrollDeltaY = 0;

    if (pointerX < rect.left + threshold) {
      scrollDeltaX = -Math.ceil(
        Math.min(
          1,
          (rect.left + threshold - pointerX) / threshold
        ) * maxSpeed
      );
    } else if (pointerX > rect.right - threshold) {
      scrollDeltaX = Math.ceil(
        Math.min(
          1,
          (pointerX - (rect.right - threshold)) / threshold
        ) * maxSpeed
      );
    }

    if (pointerY < rect.top + threshold) {
      scrollDeltaY = -Math.ceil(
        Math.min(
          1,
          (rect.top + threshold - pointerY) / threshold
        ) * maxSpeed
      );
    } else if (pointerY > rect.bottom - threshold) {
      scrollDeltaY = Math.ceil(
        Math.min(
          1,
          (pointerY - (rect.bottom - threshold)) / threshold
        ) * maxSpeed
      );
    }

    if (!scrollDeltaX && !scrollDeltaY) return;
    const previousScrollLeft = viewport.scrollLeft;
    const previousScrollTop = viewport.scrollTop;
    viewport.scrollLeft += scrollDeltaX;
    viewport.scrollTop += scrollDeltaY;
    updateBatchSelectionDrag();

    if (
      viewport.scrollLeft !== previousScrollLeft ||
      viewport.scrollTop !== previousScrollTop
    ) {
      batchSelectionAutoScrollFrame = requestAnimationFrame(
        runBatchSelectionAutoScroll
      );
    }
  }

  function requestBatchSelectionAutoScroll() {
    if (!batchSelectionDrag || batchSelectionAutoScrollFrame) return;
    const rect = viewport.getBoundingClientRect();
    const pointerX = batchSelectionDrag.clientX;
    const pointerY = batchSelectionDrag.clientY;
    if (
      pointerX >= rect.left + 56 &&
      pointerX <= rect.right - 56 &&
      pointerY >= rect.top + 56 &&
      pointerY <= rect.bottom - 56
    ) return;
    batchSelectionAutoScrollFrame = requestAnimationFrame(
      runBatchSelectionAutoScroll
    );
  }

  function beginBatchInteraction(e) {
    if (!batchMode || e.button !== 0) return;

    const nodeEl = e.target.closest('.node');
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      if (!batchSelectedIds.has(id)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const positions = [...batchSelectedIds].map(selectedId => {
        const node = nodeById(selectedId);
        return {
          id: selectedId,
          node,
          element: getNodeElement(selectedId),
          x: node.x,
          y: node.y,
          baseX: Number(node.simplePosition?.x ?? node.x) || 0,
          baseY: Number(node.simplePosition?.y ?? node.y) || 0
        };
      });
      batchMove = {
        startX: e.clientX,
        startY: e.clientY,
        positions,
        minX: Math.min(...positions.map(position => position.x)),
        minY: Math.min(...positions.map(position => position.y))
      };
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    clearBatchSelection();
    const start = canvasPoint(e);
    const box = document.createElement('div');
    box.className = 'selection-box';
    box.style.left = start.x + 'px';
    box.style.top = start.y + 'px';
    canvas.appendChild(box);
    batchSelectionDrag = {
      start,
      box,
      clientX: e.clientX,
      clientY: e.clientY
    };
  }

  function renderAllNodes() {
    canvas.querySelectorAll('.node').forEach(el => el.remove());
    for (const node of nodes) {
      renderNode(node);
    }
  }

  function layoutAllExpandedNodes() {
    if (!nodes.length) return;

    const positions = nodes.map(node => ({
      node,
      x: Number(node.simplePosition?.x ?? node.x) || 0,
      y: Number(node.simplePosition?.y ?? node.y) || 0
    }));
    const minX = Math.min(...positions.map(position => position.x));
    const minY = Math.min(...positions.map(position => position.y));
    const horizontalScale = 1.65;
    const verticalScale = 2.35;

    for (const position of positions) {
      position.node.x = minX + (position.x - minX) * horizontalScale;
      position.node.y = minY + (position.y - minY) * verticalScale;
    }
  }

  function resolveAllCardOverlaps() {
    const gap = 48;
    const orderedNodes = [...nodes].sort((a, b) => {
      const ay = Number(a.simplePosition?.y ?? a.y) || 0;
      const by = Number(b.simplePosition?.y ?? b.y) || 0;
      if (ay !== by) return ay - by;
      const ax = Number(a.simplePosition?.x ?? a.x) || 0;
      const bx = Number(b.simplePosition?.x ?? b.x) || 0;
      return ax - bx;
    });

    for (let i = 1; i < orderedNodes.length; i++) {
      const node = orderedNodes[i];
      const maxPasses = Math.max(8, i * 8);

      for (let pass = 0; pass < maxPasses; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          moved = moveNodeOutside(node, orderedNodes[j], gap) || moved;
        }
        if (!moved) break;
      }

      const stillOverlapping = orderedNodes
        .slice(0, i)
        .some(previous => rectsOverlap(nodeRect(node), nodeRect(previous), gap));

      if (stillOverlapping) {
        const rightEdge = Math.max(...orderedNodes.slice(0, i).map(previous => {
          const rect = nodeRect(previous);
          return rect.x + rect.width;
        }));
        node.x = rightEdge + gap;
        const el = getNodeElement(node.id);
        if (el) el.style.left = node.x + 'px';
      }
    }
  }

  function toggleAllNodes() {
    if (batchMode) setBatchMode(false);
    const shouldCollapse = nodes.some(node => node.expanded);
    clearNodeSelection();

    if (shouldCollapse) {
      for (const node of nodes) {
        if (node.expanded) {
          node.expanded = false;
          node.simpleText = node.title.trim() || '新节点';
        }
        node.x = Number(node.simplePosition?.x) || 0;
        node.y = Number(node.simplePosition?.y) || 0;
      }
    } else {
      for (const node of nodes) {
        if (!node.simplePosition) {
          node.simplePosition = { x: node.x, y: node.y };
        }
        node.expanded = true;
        node.title = node.simpleText.trim() || '新节点';
      }
      layoutAllExpandedNodes();
      renderAllNodes();
      resolveAllCardOverlaps();
    }

    renderAllNodes();
    clearNodeSelection();
    renderEdges();
    updateToggleAllButton();
  }

  function clearAll() {
    if (!confirm('确定清空整个流程图吗？')) return;
    closeDetailEditor();
    if (batchMode) setBatchMode(false);
    nodes = [];
    edges = [];
    rebuildIncomingNodeIds(false);
    selectedId = null;
    selectedNodeElement = null;
    canvas.querySelectorAll('.node').forEach(el => el.remove());
    renderEdges();
    updateEmptyMessage();
    updateToggleAllButton();
  }

  function getState() {
    return {
      version: 1,
      idCounter,
      nodes: nodes.map(n => ({...n})),
      edges: edges.map(e => ({...e}))
    };
  }

  function resetHistory() {
    clearTimeout(historyTimer);
    undoStack.length = 0;
    redoStack.length = 0;
    historyChangePending = false;
    lastHistoryState = JSON.stringify(getState());
    updateUnsavedIndicator();
  }

  function commitHistorySnapshot() {
    clearTimeout(historyTimer);
    if (historyApplying || isLoadingChart) return;
    const current = JSON.stringify(getState());
    if (lastHistoryState === null) {
      lastHistoryState = current;
      historyChangePending = false;
      updateUnsavedIndicator();
      return;
    }
    if (current === lastHistoryState) {
      historyChangePending = false;
      updateUnsavedIndicator();
      return;
    }
    undoStack.push(lastHistoryState);
    if (undoStack.length > 100) undoStack.shift();
    lastHistoryState = current;
    redoStack.length = 0;
    historyChangePending = false;
    updateUnsavedIndicator();
  }

  function scheduleHistorySnapshot() {
    if (historyApplying || isLoadingChart) return;
    if (!historyChangePending) {
      historyChangePending = true;
      updateUnsavedIndicator();
    }
    clearTimeout(historyTimer);
    historyTimer = setTimeout(commitHistorySnapshot, 300);
  }

  function restoreHistoryState(serializedState) {
    historyApplying = true;
    clearTimeout(autoSaveTimer);
    clearTimeout(historyTimer);
    isLoadingChart = true;
    loadState(JSON.parse(serializedState));
    isLoadingChart = false;
    lastHistoryState = serializedState;
    historyApplying = false;
    saveCurrentChart();
    updateUnsavedIndicator();
  }

  function undoFlowchartChange() {
    commitHistorySnapshot();
    if (!undoStack.length) {
      showStatus('没有可撤销的操作');
      return;
    }
    const current = JSON.stringify(getState());
    const previous = undoStack.pop();
    redoStack.push(current);
    restoreHistoryState(previous);
    showStatus('已撤销');
  }

  function redoFlowchartChange() {
    if (!redoStack.length) {
      showStatus('没有可恢复的操作');
      return;
    }
    const current = JSON.stringify(getState());
    const next = redoStack.pop();
    undoStack.push(current);
    restoreHistoryState(next);
    showStatus('已恢复');
  }

  function saveWorkspaceCheckpoint() {
    if (batchMode) setBatchMode(false);
    clearTimeout(autoSaveTimer);
    commitHistorySnapshot();
    saveCurrentChart();
    resetHistory();
    showStatus('已保存，并设为新的初始版本');
  }

  function loadState(state) {
    if (!state || !Array.isArray(state.nodes)) return false;
    closeDetailEditor();
    clearTimeout(autoSaveTimer);
    canvas.querySelectorAll('.node, .selection-box').forEach(el => el.remove());
    clearNodeSelection();
    clearBatchSelection();
    nodes = [];
    edges = Array.isArray(state.edges) ? state.edges : [];
    rebuildIncomingNodeIds(false);
    idCounter = Number(state.idCounter) || 1;

    for (const data of state.nodes) {
      const node = {
        id: data.id || nextId(),
        x: Number(data.x) || 100,
        y: Number(data.y) || 100,
        text: data.text ?? '节点',
        simpleText: data.simpleText ?? (
          data.expanded === false
            ? (data.text ?? '节点')
            : (data.title ?? data.text ?? '节点')
        ),
        simplePosition: {
          x: Number(data.simplePosition?.x ?? data.x) || 0,
          y: Number(data.simplePosition?.y ?? data.y) || 0
        },
        title: data.title ?? '标题',
        richContent: data.richContent ?? null,
        properties: {...defaultProperties(), ...(data.properties || {})},
        expanded: data.expanded ?? true
      };
      nodes.push(node);
      renderNode(node);
    }

    renderEdges();
    selectedId = null;
    selectedNodeElement = null;
    canvas.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
    updateEmptyMessage();
    updateToggleAllButton();
    return true;
  }

  function exportBounds() {
    if (!nodes.length) return null;
    const bounds = [];
    canvas.querySelectorAll('.node').forEach(node => {
      bounds.push({
        left: node.offsetLeft,
        top: node.offsetTop,
        right: node.offsetLeft + node.offsetWidth,
        bottom: node.offsetTop + node.offsetHeight
      });
    });
    svg.querySelectorAll('.edge:not(.edge-hit-area)').forEach(path => {
      try {
        const box = path.getBBox();
        bounds.push({
          left: box.x,
          top: box.y,
          right: box.x + box.width,
          bottom: box.y + box.height
        });
      } catch {}
    });

    const margin = 36;
    const left = Math.floor(Math.min(...bounds.map(item => item.left)) - margin);
    const top = Math.floor(Math.min(...bounds.map(item => item.top)) - margin);
    const right = Math.ceil(Math.max(...bounds.map(item => item.right)) + margin);
    const bottom = Math.ceil(Math.max(...bounds.map(item => item.bottom)) + margin);
    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  function canvasRoundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  const zipTextEncoder = new TextEncoder();
  const zipTextDecoder = new TextDecoder();
  let zipCrcTable = null;

  function crc32(bytes) {
    if (!zipCrcTable) {
      zipCrcTable = new Uint32Array(256);
      for (let value = 0; value < 256; value += 1) {
        let current = value;
        for (let bit = 0; bit < 8; bit += 1) {
          current = (current & 1)
            ? (0xedb88320 ^ (current >>> 1))
            : (current >>> 1);
        }
        zipCrcTable[value] = current >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = zipCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time:
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        Math.floor(date.getSeconds() / 2),
      date:
        ((year - 1980) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate()
    };
  }

  function concatenateBytes(parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function createZipArchive(entries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const timestamp = zipDateTime();

    for (const entry of entries) {
      const name = zipTextEncoder.encode(entry.name);
      const data = entry.data instanceof Uint8Array
        ? entry.data
        : zipTextEncoder.encode(String(entry.data));
      const checksum = crc32(data);
      const localHeader = new Uint8Array(30 + name.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, timestamp.time, true);
      localView.setUint16(12, timestamp.date, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      localHeader.set(name, 30);
      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + name.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, timestamp.time, true);
      centralView.setUint16(14, timestamp.date, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, localOffset, true);
      centralHeader.set(name, 46);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + data.length;
    }

    const centralDirectory = concatenateBytes(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localOffset, true);
    return new Blob(
      [...localParts, centralDirectory, end],
      { type: 'application/zip' }
    );
  }

  function readZipArchive(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let endOffset = -1;
    const minimum = Math.max(0, bytes.length - 65557);
    for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        endOffset = offset;
        break;
      }
    }
    if (endOffset < 0) throw new Error('不是有效的 .flowchart 项目包');
    const entryCount = view.getUint16(endOffset + 10, true);
    let offset = view.getUint32(endOffset + 16, true);
    const entries = new Map();

    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error('项目包目录已损坏');
      }
      const method = view.getUint16(offset + 10, true);
      const checksum = view.getUint32(offset + 16, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const name = zipTextDecoder.decode(
        bytes.slice(offset + 46, offset + 46 + nameLength)
      );
      if (method !== 0) {
        throw new Error('该项目包使用了当前版本不支持的压缩算法');
      }
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error('项目包文件记录已损坏');
      }
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset =
        localHeaderOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.slice(dataOffset, dataOffset + compressedSize);
      if (crc32(data) !== checksum) {
        throw new Error(`项目包文件校验失败：${name}`);
      }
      entries.set(name, data);
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function safePackageName(value) {
    return String(value || 'flowchart')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'flowchart';
  }

  async function fetchPageAsset(path) {
    try {
      const response = await fetch(new URL(path, window.location.href));
      if (!response.ok) return '';
      return await response.text();
    } catch {
      return '';
    }
  }

  async function exportPortableProject() {
    saveCurrentChart();
    exportPortableBtn.disabled = true;
    exportPortableBtn.textContent = '正在打包…';
    try {
      const mediaRecords = await getDocumentMediaRecords();
      const assetManifest = [];
      const entries = [];
      for (const record of mediaRecords) {
        const extension =
          record.name?.match(/\.([a-z0-9]{1,8})$/i)?.[1] ||
          record.type?.split('/')[1]?.split('+')[0] ||
          'bin';
        const path = `assets/${record.id}.${extension}`;
        entries.push({
          name: path,
          data: new Uint8Array(await record.blob.arrayBuffer())
        });
        assetManifest.push({
          id: record.id,
          path,
          name: record.name,
          type: record.type,
          createdAt: record.createdAt
        });
      }

      const manifest = {
        format: 'htmlflowchart-project',
        version: 1,
        createdAt: new Date().toISOString(),
        sourceDocumentId: mediaDocumentId(),
        sourceFileName: currentHTMLFileName(),
        projectFile: 'project.json',
        htmlFile: 'transferable.html',
        assets: assetManifest
      };
      const portableDocument = '<!DOCTYPE html>\n' +
        document.documentElement.outerHTML;
      const [styleSource, appSource] = await Promise.all([
        fetchPageAsset('style.css'),
        fetchPageAsset('app.js')
      ]);
      entries.unshift(
        {
          name: 'manifest.json',
          data: JSON.stringify(manifest, null, 2)
        },
        {
          name: 'project.json',
          data: JSON.stringify(workspaceData)
        },
        {
          name: 'transferable.html',
          data: portableDocument
        }
      );
      if (styleSource) entries.push({ name: 'style.css', data: styleSource });
      if (appSource) entries.push({ name: 'app.js', data: appSource });

      const archive = createZipArchive(entries);
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safePackageName(
        currentHTMLFileName().replace(/\.html?$/i, '')
      )}-${new Date().toISOString().slice(0, 10)}.flowchart`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus(`项目包已导出，包含 ${mediaRecords.length} 个媒体文件`);
    } catch (error) {
      console.error(error);
      showStatus(`项目包导出失败：${error.message || '请重试'}`);
    } finally {
      exportPortableBtn.disabled = false;
      exportPortableBtn.textContent = '导出可迁移 HTML';
    }
  }

  async function importPortableProject(file) {
    if (!file) return;
    importProjectBtn.disabled = true;
    importProjectBtn.textContent = '正在导入…';
    try {
      const entries = readZipArchive(await file.arrayBuffer());
      const manifestBytes = entries.get('manifest.json');
      const projectBytes = entries.get('project.json');
      if (!manifestBytes || !projectBytes) {
        throw new Error('项目包缺少 manifest.json 或 project.json');
      }
      const manifest = JSON.parse(zipTextDecoder.decode(manifestBytes));
      if (
        manifest.format !== 'htmlflowchart-project' ||
        Number(manifest.version) !== 1
      ) {
        throw new Error('项目包格式或版本不受支持');
      }
      const importedWorkspace = JSON.parse(zipTextDecoder.decode(projectBytes));
      if (!importedWorkspace || !Array.isArray(importedWorkspace.folders)) {
        throw new Error('project.json 数据结构无效');
      }
      for (const asset of manifest.assets || []) {
        if (!asset?.id || !asset?.path || !entries.has(asset.path)) {
          throw new Error(`项目包媒体记录不完整：${asset?.name || '未知文件'}`);
        }
      }
      if (!confirm('导入会覆盖当前 HTML 的流程图数据，是否继续？')) return;

      saveCurrentChart();
      await deleteDocumentMedia();
      for (const asset of manifest.assets || []) {
        const bytes = entries.get(asset.path);
        await putMediaBlob(
          new Blob([bytes], {
            type: asset.type || 'application/octet-stream'
          }),
          {
            id: asset.id,
            name: asset.name,
            type: asset.type,
            createdAt: asset.createdAt
          }
        );
      }
      workspaceData = importedWorkspace;
      activeFolderId =
        workspaceData.activeFolderId || workspaceData.folders[0]?.id || null;
      const importedCharts = workspaceData.folders.flatMap(
        folder => folder.charts || []
      );
      activeChartId = importedCharts.some(
        chart => chart.id === workspaceData.activeChartId
      )
        ? workspaceData.activeChartId
        : importedCharts[0]?.id || null;
      persistWorkspace();
      renderFileTree();
      const chart = activeChart();
      if (chart?.state) loadState(chart.state);
      else loadState({ version: 1, idCounter: 1, nodes: [], edges: [] });
      resetHistory();
      registerCurrentDocumentCache();
      showStatus(`项目包导入成功，共恢复 ${manifest.assets?.length || 0} 个媒体文件`);
    } catch (error) {
      console.error(error);
      showStatus(`项目包导入失败：${error.message || '文件无法读取'}`);
    } finally {
      importProjectBtn.disabled = false;
      importProjectBtn.textContent = '导入项目包';
      importProjectInput.value = '';
    }
  }

  function canvasTextLines(context, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      if (!paragraph) {
        lines.push('');
        continue;
      }
      let line = '';
      for (const character of paragraph) {
        const candidate = line + character;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = character;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  function drawElementText(context, element, nodeElement, nodeX, nodeY) {
    if (!element) return;
    const text = element.innerText;
    if (!text) return;
    const style = getComputedStyle(element);
    const elementRect = element.getBoundingClientRect();
    const nodeRect = nodeElement.getBoundingClientRect();
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const x = nodeX + elementRect.left - nodeRect.left + paddingLeft;
    const y = nodeY + elementRect.top - nodeRect.top + paddingTop;
    const maxWidth = Math.max(
      1,
      elementRect.width - paddingLeft - paddingRight
    );
    const fontSize = parseFloat(style.fontSize) || 13;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.45;

    context.save();
    context.fillStyle = style.color;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = 'top';
    const lines = canvasTextLines(context, text, maxWidth);
    for (let index = 0; index < lines.length; index++) {
      let lineX = x;
      if (style.textAlign === 'center') {
        lineX += (maxWidth - context.measureText(lines[index]).width) / 2;
      } else if (style.textAlign === 'right') {
        lineX += maxWidth - context.measureText(lines[index]).width;
      }
      context.fillText(lines[index], lineX, y + index * lineHeight);
    }
    context.restore();
  }

  function drawExportEdge(context, path, bounds) {
    const d = path.getAttribute('d');
    if (!d) return;
    context.save();
    context.translate(-bounds.left, -bounds.top);
    context.strokeStyle = '#64748b';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke(new Path2D(d));

    const length = path.getTotalLength();
    const end = path.getPointAtLength(length);
    const before = path.getPointAtLength(Math.max(0, length - 4));
    const angle = Math.atan2(end.y - before.y, end.x - before.x);
    context.translate(end.x, end.y);
    context.rotate(angle);
    context.fillStyle = '#64748b';
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(-10, -4);
    context.lineTo(-10, 4);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawExportNode(context, nodeElement, bounds) {
    const nodeX = nodeElement.offsetLeft - bounds.left;
    const nodeY = nodeElement.offsetTop - bounds.top;
    const width = nodeElement.offsetWidth;
    const height = nodeElement.offsetHeight;
    const simple = nodeElement.classList.contains('simple');
    const radius = simple ? 12 : 14;

    context.save();
    context.shadowColor = 'rgba(15, 23, 42, .10)';
    context.shadowBlur = 20;
    context.shadowOffsetY = 8;
    context.fillStyle = '#ffffff';
    canvasRoundedRect(context, nodeX, nodeY, width, height, radius);
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = '#94a3b8';
    context.lineWidth = 2;
    context.stroke();
    context.restore();

    if (simple) {
      drawElementText(
        context,
        nodeElement.querySelector('.simple-node-text'),
        nodeElement,
        nodeX,
        nodeY
      );
      return;
    }

    for (const section of [
      nodeElement.querySelector('.node-title-section'),
      nodeElement.querySelector('.properties')
    ]) {
      if (!section) continue;
      const nodeRect = nodeElement.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const dividerY = nodeY + sectionRect.bottom - nodeRect.top;
      context.strokeStyle = '#edf0f4';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(nodeX + 1, dividerY);
      context.lineTo(nodeX + width - 1, dividerY);
      context.stroke();
    }

    nodeElement.querySelectorAll('.property-value').forEach(value => {
      const style = getComputedStyle(value);
      const rect = value.getBoundingClientRect();
      const nodeRect = nodeElement.getBoundingClientRect();
      const x = nodeX + rect.left - nodeRect.left;
      const y = nodeY + rect.top - nodeRect.top;
      if (
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        style.backgroundColor !== 'transparent'
      ) {
        context.fillStyle = style.backgroundColor;
        canvasRoundedRect(context, x, y, rect.width, rect.height, 6);
        context.fill();
      }
      const borderWidth = parseFloat(style.borderLeftWidth) || 0;
      if (borderWidth) {
        context.fillStyle = style.borderLeftColor;
        context.fillRect(x, y, borderWidth, rect.height);
      }
    });

    const textElements = [
      nodeElement.querySelector('.node-title'),
      ...nodeElement.querySelectorAll('.property-icon'),
      ...nodeElement.querySelectorAll('.property-label span:not(.property-icon)'),
      ...nodeElement.querySelectorAll('.property-value'),
      nodeElement.querySelector('.node-text')
    ];
    textElements.forEach(element => {
      drawElementText(context, element, nodeElement, nodeX, nodeY);
    });
  }

  function createFlowchartExportCanvas(bounds) {
    const maxSide = 12000;
    const maxPixels = 40000000;
    const scale = Math.max(
      1,
      Math.min(
        2,
        maxSide / bounds.width,
        maxSide / bounds.height,
        Math.sqrt(maxPixels / (bounds.width * bounds.height))
      )
    );
    const output = document.createElement('canvas');
    output.width = Math.round(bounds.width * scale);
    output.height = Math.round(bounds.height * scale);
    output.pdfLandscape = bounds.width > bounds.height;
    const context = output.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.scale(scale, scale);
    context.fillStyle = '#f5f7fb';
    context.fillRect(0, 0, bounds.width, bounds.height);
    context.strokeStyle = '#e8edf4';
    context.lineWidth = 1;
    const firstGridX = Math.ceil(bounds.left / 24) * 24 - bounds.left;
    const firstGridY = Math.ceil(bounds.top / 24) * 24 - bounds.top;
    for (let x = firstGridX; x <= bounds.width; x += 24) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, bounds.height);
      context.stroke();
    }
    for (let y = firstGridY; y <= bounds.height; y += 24) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(bounds.width, y);
      context.stroke();
    }
    svg.querySelectorAll('.edge:not(.edge-hit-area)').forEach(path => {
      drawExportEdge(context, path, bounds);
    });
    canvas.querySelectorAll('.node').forEach(node => {
      drawExportNode(context, node, bounds);
    });
    return output;
  }

  function createPdfFlowchartCanvas(bounds, directoryTitle) {
    const flowchart = createFlowchartExportCanvas(bounds);
    const title = directoryTitle || '未命名流程图';
    const output = document.createElement('canvas');
    output.width = flowchart.width;
    const context = output.getContext('2d');
    const horizontalPadding = Math.max(28, output.width * .035);
    let fontSize = Math.max(30, output.width * .03);
    context.font =
      `700 ${fontSize}px Arial, "Microsoft YaHei", sans-serif`;
    while (
      fontSize > 24 &&
      context.measureText(title).width >
        output.width - horizontalPadding * 2
    ) {
      fontSize -= 2;
      context.font =
        `700 ${fontSize}px Arial, "Microsoft YaHei", sans-serif`;
    }
    const headerHeight = Math.ceil(fontSize * 2.15);
    output.height = flowchart.height + headerHeight;
    context.font =
      `700 ${fontSize}px Arial, "Microsoft YaHei", sans-serif`;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, headerHeight);
    context.fillStyle = '#263244';
    const textY = Math.round(
      (headerHeight - fontSize) / 2 + fontSize * .82
    );
    context.fillText(title, horizontalPadding, textY);
    context.strokeStyle = '#dce2ea';
    context.lineWidth = Math.max(1, output.width / 1600);
    context.beginPath();
    context.moveTo(0, headerHeight - context.lineWidth);
    context.lineTo(output.width, headerHeight - context.lineWidth);
    context.stroke();
    context.drawImage(flowchart, 0, headerHeight);
    output.pdfTextItems = [{
      text: title,
      x: horizontalPadding,
      y: textY,
      fontSize
    }];
    output.pdfLandscape = output.width > output.height;
    return output;
  }

  async function saveAsPNG() {
    const bounds = exportBounds();
    if (!bounds) {
      showStatus('当前流程图没有可导出的卡片');
      return;
    }

    saveCurrentChart();
    const button = document.getElementById('saveBtn');
    button.disabled = true;
    button.textContent = '正在生成…';

    try {
      const output = createFlowchartExportCanvas(bounds);

      const png = await new Promise((resolve, reject) => {
        output.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('PNG 生成失败')),
          'image/png'
        );
      });
      const pngUrl = URL.createObjectURL(png);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const chartName = (activeChart()?.name || 'flowchart')
        .replace(/[\\/:*?"<>|]/g, '-');
      link.href = pngUrl;
      link.download = `${chartName}-${stamp}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      showStatus('当前流程图已完整保存为 PNG');
    } catch (error) {
      console.error(error);
      showStatus('PNG 导出失败，请重试');
    } finally {
      button.disabled = false;
      button.textContent = '导出 PNG';
    }
  }

  function pdfDetailPlainText(element) {
    let text = '';
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.data;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          text += '\n';
        } else {
          text += pdfDetailPlainText(child);
          if (child.matches('div, p, li')) text += '\n';
        }
      }
    }
    return text.replace(/\n+$/, '');
  }

  function pdfDetailBlocks(node) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeRichHTML(
      node.richContent ?? plainTextToRichHTML(node.text)
    );
    const blocks = [];

    const visit = element => {
      if (element.nodeType === Node.TEXT_NODE) {
        if (element.data.trim()) {
          blocks.push({ type: 'text', text: element.data });
        }
        return;
      }
      if (element.nodeType !== Node.ELEMENT_NODE) return;

      if (element.tagName === 'PRE') {
        blocks.push({
          type: 'code',
          text: pdfDetailPlainText(element)
        });
        return;
      }
      if (element.tagName === 'IMG') {
        blocks.push({
          type: 'image',
          source: element.getAttribute('src'),
          label: element.getAttribute('alt') || '图片'
        });
        return;
      }
      if (element.tagName === 'VIDEO') {
        blocks.push({ type: 'video', text: '视频内容' });
        return;
      }
      if (element.matches('ul, ol')) {
        [...element.children].forEach((item, index) => {
          blocks.push({
            type: 'text',
            text: `${element.tagName === 'OL' ? `${index + 1}.` : '•'} ${
              pdfDetailPlainText(item).trim()
            }`
          });
        });
        return;
      }
      if (element.classList.contains('editor-media-row')) {
        element.querySelectorAll('img, video').forEach(visit);
        return;
      }

      const containsStructuredContent = element.querySelector(
        'pre, img, video, ul, ol, .editor-media-row'
      );
      if (
        element.matches('p, div, blockquote') &&
        !containsStructuredContent
      ) {
        blocks.push({
          type: 'text',
          text: pdfDetailPlainText(element)
        });
        return;
      }
      [...element.childNodes].forEach(visit);
    };

    [...template.content.childNodes].forEach(visit);
    return blocks.length
      ? blocks
      : [{ type: 'text', text: node.text || '' }];
  }

  function loadPdfImage(source) {
    return new Promise(resolve => {
      if (!source) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.addEventListener('load', () => resolve(image), { once: true });
      image.addEventListener('error', () => resolve(null), { once: true });
      image.src = source;
    });
  }

  async function createCardDetailPdfPages(
    node,
    cardIndex,
    cardCount,
    isRootNode = false
  ) {
    const pageWidth = 1240;
    const pageHeight = 1754;
    const margin = 86;
    const contentWidth = pageWidth - margin * 2;
    const bottom = pageHeight - 82;
    const pages = [];
    let page = null;

    const createPage = continuation => {
      const output = document.createElement('canvas');
      output.width = pageWidth;
      output.height = pageHeight;
      output.pdfTextItems = [];
      const context = output.getContext('2d');
      const drawText = context.fillText.bind(context);
      context.fillText = (text, x, y, maxWidth) => {
        const fontSize = parseFloat(context.font) || 16;
        output.pdfTextItems.push({
          text: String(text),
          x,
          y,
          fontSize
        });
        if (maxWidth === undefined) {
          drawText(text, x, y);
        } else {
          drawText(text, x, y, maxWidth);
        }
      };
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageWidth, pageHeight);
      context.fillStyle = '#8b95a5';
      context.font = '600 21px Arial, "Microsoft YaHei", sans-serif';
      context.fillText(
        `${isRootNode ? '首节点 · ' : ''}卡片 ${
          cardIndex + 1
        } / ${cardCount}${
          continuation ? ' · 续页' : ''
        }`,
        margin,
        62
      );
      context.fillStyle = '#111827';
      context.font = '700 46px Arial, "Microsoft YaHei", sans-serif';
      const titleLines = canvasTextLines(
        context,
        node.title || node.simpleText || '未命名卡片',
        contentWidth
      );
      titleLines.slice(0, 2).forEach((line, index) => {
        context.fillText(line, margin, 108 + index * 58);
      });
      const headerBottom = 108 + Math.min(2, titleLines.length) * 58 + 18;
      context.strokeStyle = '#e4e9f0';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(margin, headerBottom);
      context.lineTo(pageWidth - margin, headerBottom);
      context.stroke();
      pages.push(output);
      return {
        canvas: output,
        context,
        y: headerBottom + 34
      };
    };

    const ensureSpace = height => {
      if (!page || page.y + height > bottom) {
        if (page) {
          page.canvas.pdfUsedHeight = Math.min(
            pageHeight,
            page.y + 18
          );
        }
        page = createPage(Boolean(page));
      }
    };

    page = createPage(false);
    const propertyItems = [
      ['状态', node.properties?.status || '未完成', '#dfeee4', '#39715a'],
      ['负责人', node.properties?.owner || '未分配', '#f8edc9', '#80652d'],
      ['优先级', node.properties?.priority || '中', '#f8dddd', '#9a4242'],
      ['任务类型', node.properties?.taskType || '任务', '#f4dfea', '#93496e'],
      ['描述', node.properties?.description || '添加描述', '#eef1f5', '#526174']
    ];
    propertyItems.forEach((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + column * (contentWidth / 2);
      const y = page.y + row * 68;
      page.context.fillStyle = '#728096';
      page.context.font = '600 24px Arial, "Microsoft YaHei", sans-serif';
      page.context.fillText(item[0], x, y + 10);
      page.context.font = '500 24px Arial, "Microsoft YaHei", sans-serif';
      const chipX = x + 126;
      const chipWidth = Math.min(
        contentWidth / 2 - 144,
        page.context.measureText(item[1]).width + 34
      );
      page.context.fillStyle = item[2];
      canvasRoundedRect(page.context, chipX, y, chipWidth, 48, 12);
      page.context.fill();
      page.context.fillStyle = item[3];
      page.context.fillText(item[1], chipX + 17, y + 10);
    });
    page.y += Math.ceil(propertyItems.length / 2) * 68 + 28;
    page.context.strokeStyle = '#e4e9f0';
    page.context.beginPath();
    page.context.moveTo(margin, page.y);
    page.context.lineTo(pageWidth - margin, page.y);
    page.context.stroke();
    page.y += 34;

    for (const block of pdfDetailBlocks(node)) {
      if (block.type === 'image') {
        const image = await loadPdfImage(block.source);
        if (!image) {
          ensureSpace(90);
          page.context.fillStyle = '#f3f5f8';
          canvasRoundedRect(
            page.context,
            margin,
            page.y,
            contentWidth,
            70,
            10
          );
          page.context.fill();
          page.context.fillStyle = '#7b8798';
          page.context.font = '24px Arial, "Microsoft YaHei", sans-serif';
          page.context.fillText(
            `${block.label}（无法载入）`,
            margin + 24,
            page.y + 22
          );
          page.y += 94;
          continue;
        }
        const height = Math.min(
          600,
          contentWidth * image.naturalHeight / image.naturalWidth
        );
        ensureSpace(height + 28);
        const width = Math.min(
          contentWidth,
          height * image.naturalWidth / image.naturalHeight
        );
        page.context.drawImage(image, margin, page.y, width, height);
        page.y += height + 28;
        continue;
      }

      if (block.type === 'video') {
        ensureSpace(150);
        page.context.fillStyle = '#eef1f5';
        canvasRoundedRect(
          page.context,
          margin,
          page.y,
          contentWidth,
          120,
          12
        );
        page.context.fill();
        page.context.fillStyle = '#64748b';
        page.context.font = '600 26px Arial, "Microsoft YaHei", sans-serif';
        page.context.fillText(
          '▷ 视频内容（请在原流程图中查看）',
          margin + 28,
          page.y + 42
        );
        page.y += 148;
        continue;
      }

      const code = block.type === 'code';
      page.context.font = code
        ? '23px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
        : '28px Arial, "Microsoft YaHei", sans-serif';
      const lineHeight = code ? 36 : 44;
      const padding = code ? 24 : 0;
      const lines = canvasTextLines(
        page.context,
        block.text || '',
        contentWidth - padding * 2
      );

      if (code) {
        let lineIndex = 0;
        while (lineIndex < lines.length) {
          ensureSpace(lineHeight + padding * 2 + 20);
          const capacity = Math.max(
            1,
            Math.floor(
              (bottom - page.y - padding * 2 - 20) / lineHeight
            )
          );
          const chunk = lines.slice(lineIndex, lineIndex + capacity);
          const boxHeight = chunk.length * lineHeight + padding * 2;
          page.context.fillStyle = '#f6f8fa';
          canvasRoundedRect(
            page.context,
            margin,
            page.y,
            contentWidth,
            boxHeight,
            12
          );
          page.context.fill();
          page.context.strokeStyle = '#dfe5ec';
          page.context.stroke();
          page.context.fillStyle = '#263244';
          chunk.forEach((line, index) => {
            page.context.fillText(
              line,
              margin + padding,
              page.y + padding + index * lineHeight
            );
          });
          page.y += boxHeight + 24;
          lineIndex += chunk.length;
        }
        continue;
      }

      for (const line of lines) {
        ensureSpace(lineHeight + 8);
        page.context.fillStyle = '#334155';
        page.context.font =
          '28px Arial, "Microsoft YaHei", sans-serif';
        page.context.fillText(line, margin, page.y);
        page.y += lineHeight;
      }
      page.y += 18;
    }
    if (page) {
      page.canvas.pdfUsedHeight = Math.min(
        pageHeight,
        page.y + 18
      );
    }
    return pages;
  }

  function packCardDetailPdfPages(fragments) {
    const pageWidth = 1240;
    const pageHeight = 1754;
    const gap = 18;
    const pages = [];
    let output = null;
    let context = null;
    let cursorY = 0;

    const createPage = () => {
      output = document.createElement('canvas');
      output.width = pageWidth;
      output.height = pageHeight;
      output.pdfTextItems = [];
      context = output.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageWidth, pageHeight);
      pages.push(output);
      cursorY = 0;
    };

    fragments.forEach(fragment => {
      const fragmentHeight = Math.min(
        pageHeight,
        Math.max(1, Math.ceil(fragment.pdfUsedHeight || pageHeight))
      );
      if (!output || (cursorY && cursorY + fragmentHeight > pageHeight)) {
        createPage();
      }
      context.drawImage(
        fragment,
        0,
        0,
        pageWidth,
        fragmentHeight,
        0,
        cursorY,
        pageWidth,
        fragmentHeight
      );
      (fragment.pdfTextItems || []).forEach(item => {
        if (item.y <= fragmentHeight) {
          output.pdfTextItems.push({
            ...item,
            y: item.y + cursorY
          });
        }
      });
      cursorY += fragmentHeight + gap;
    });
    return pages;
  }

  function base64ToBytes(dataUrl) {
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function concatPdfBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function pdfUnicodeHex(text) {
    let output = '';
    for (let index = 0; index < text.length; index++) {
      output += text.charCodeAt(index).toString(16).padStart(4, '0');
    }
    return output.toUpperCase();
  }

  function buildImagePdf(pageCanvases) {
    const encoder = new TextEncoder();
    const ascii = text => encoder.encode(text);
    const pageData = pageCanvases.map((canvas, index) => {
      const landscape = canvas.pdfLandscape ??
        (index === 0 && canvas.width > canvas.height);
      return {
        canvas,
        jpeg: base64ToBytes(canvas.toDataURL('image/jpeg', .9)),
        pageWidth: landscape ? 842 : 595,
        pageHeight: landscape ? 595 : 842
      };
    });
    const fontId = 3 + pageData.length * 3;
    const descendantFontId = fontId + 1;
    const objects = new Array(descendantFontId + 1);
    const pageObjectIds = [];

    pageData.forEach((data, index) => {
      const imageId = 3 + index * 3;
      const contentId = imageId + 1;
      const pageId = imageId + 2;
      pageObjectIds.push(pageId);

      objects[imageId] = concatPdfBytes([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${
            data.canvas.width
          } /Height ${data.canvas.height} /ColorSpace /DeviceRGB ` +
          `/BitsPerComponent 8 /Filter /DCTDecode /Length ${
            data.jpeg.length
          } >>\nstream\n`
        ),
        data.jpeg,
        ascii('\nendstream')
      ]);

      const margin = 24;
      const scale = Math.min(
        (data.pageWidth - margin * 2) / data.canvas.width,
        (data.pageHeight - margin * 2) / data.canvas.height
      );
      const width = data.canvas.width * scale;
      const height = data.canvas.height * scale;
      const x = (data.pageWidth - width) / 2;
      const y = (data.pageHeight - height) / 2;
      let stream =
        `q\n${width.toFixed(3)} 0 0 ${height.toFixed(3)} ` +
        `${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im0 Do\nQ`;
      const textItems = data.canvas.pdfTextItems || [];
      if (textItems.length) {
        const canvasScale = width / data.canvas.width;
        stream += '\nBT\n3 Tr\n';
        textItems.forEach(item => {
          if (!item.text) return;
          const fontSize = Math.max(1, item.fontSize * canvasScale);
          const textX = x + item.x * canvasScale;
          const textY =
            y + height - item.y * canvasScale;
          stream +=
            `/F0 ${fontSize.toFixed(3)} Tf\n` +
            `1 0 0 1 ${textX.toFixed(3)} ${textY.toFixed(3)} Tm\n` +
            `<${pdfUnicodeHex(item.text)}> Tj\n`;
        });
        stream += 'ET';
      }
      objects[contentId] = ascii(
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
      );
      objects[pageId] = ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${
          data.pageWidth
        } ${data.pageHeight}] /Resources << /XObject << /Im0 ${
          imageId
        } 0 R >> /Font << /F0 ${fontId} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`
      );
    });

    objects[fontId] = ascii(
      `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light ` +
      `/Encoding /UniGB-UCS2-H /DescendantFonts [` +
      `${descendantFontId} 0 R] >>`
    );
    objects[descendantFontId] = ascii(
      `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) ` +
      `/Supplement 4 >> >>`
    );
    objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = ascii(
      `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [` +
      `${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] >>`
    );

    const header = concatPdfBytes([
      ascii('%PDF-1.4\n%'),
      new Uint8Array([226, 227, 207, 211]),
      ascii('\n')
    ]);
    const parts = [header];
    const offsets = new Array(objects.length).fill(0);
    let length = header.length;
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = length;
      const object = concatPdfBytes([
        ascii(`${id} 0 obj\n`),
        objects[id],
        ascii('\nendobj\n')
      ]);
      parts.push(object);
      length += object.length;
    }

    const xrefOffset = length;
    let xref = `xref\n0 ${objects.length}\n`;
    xref += '0000000000 65535 f \n';
    for (let id = 1; id < objects.length; id++) {
      xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    xref +=
      `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF`;
    parts.push(ascii(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }

  function closePdfExportMenu() {
    savePdfMenu.hidden = true;
    savePdfBtn.setAttribute('aria-expanded', 'false');
  }

  async function createLoadedChartPdfPages() {
    const bounds = exportBounds();
    if (!bounds) return [];
    const pageCanvases = [
      createPdfFlowchartCanvas(bounds, activeChartDirectoryTitle())
    ];
    const cardFragments = [];
    const rootNodes = nodes.filter(node => !incomingNodeIds.has(node.id));
    const nonRootNodes = nodes.filter(node => incomingNodeIds.has(node.id));
    const exportNodes = [...rootNodes, ...nonRootNodes];
    for (let index = 0; index < exportNodes.length; index++) {
      const detailPages = await createCardDetailPdfPages(
        exportNodes[index],
        index,
        exportNodes.length,
        index < rootNodes.length
      );
      cardFragments.push(...detailPages);
    }
    pageCanvases.push(...packCardDetailPdfPages(cardFragments));
    return pageCanvases;
  }

  function downloadPdfPages(pageCanvases, fileName) {
    const pdf = buildImagePdf(pageCanvases);
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19)
      .replace(/[:T]/g, '-');
    const safeName = (fileName || 'flowchart')
      .replace(/[\\/:*?"<>|]/g, '-');
    link.href = url;
    link.download = `${safeName}-${stamp}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveAsPDF(scope = 'current') {
    closePdfExportMenu();
    saveCurrentChart();
    const originalChartId = activeChartId;
    const originalState = getState();
    const originalSelectedId = selectedId;
    const originalBatchIds = [...batchSelectedIds];
    const originalScrollLeft = viewport.scrollLeft;
    const originalScrollTop = viewport.scrollTop;
    const allCharts = (workspaceData?.folders || [])
      .flatMap(folder => folder.charts);
    savePdfBtn.disabled = true;
    saveCurrentPdfBtn.disabled = true;
    saveAllPdfBtn.disabled = true;
    savePdfBtn.textContent = '正在生成…';

    try {
      let pageCanvases = [];
      let exportedChartCount = 0;
      if (scope === 'all') {
        isLoadingChart = true;
        for (const chart of allCharts) {
          activeChartId = chart.id;
          if (!loadState(chart.state)) continue;
          await new Promise(resolve => requestAnimationFrame(resolve));
          const chartPages = await createLoadedChartPdfPages();
          if (!chartPages.length) continue;
          pageCanvases.push(...chartPages);
          exportedChartCount += 1;
        }
      } else {
        pageCanvases = await createLoadedChartPdfPages();
        exportedChartCount = pageCanvases.length ? 1 : 0;
      }
      if (!pageCanvases.length) {
        showStatus(
          scope === 'all'
            ? '当前 HTML 内没有可导出的流程图'
            : '当前流程图没有可导出的卡片'
        );
        return;
      }
      const fileName = scope === 'all'
        ? `${currentHTMLFileName().replace(/\.html?$/i, '')}-全部流程图`
        : activeChart()?.name || 'flowchart';
      downloadPdfPages(pageCanvases, fileName);
      showStatus(
        scope === 'all'
          ? `已合并导出 ${exportedChartCount} 个流程图，共 ${pageCanvases.length} 页`
          : `PDF 已生成，共 ${pageCanvases.length} 页`
      );
    } catch (error) {
      console.error(error);
      showStatus('PDF 导出失败，请重试');
    } finally {
      if (scope === 'all') {
        activeChartId = originalChartId;
        loadState(originalState);
        if (batchMode) {
          originalBatchIds.forEach(id => {
            batchSelectedIds.add(id);
            getNodeElement(id)?.classList.add('batch-selected');
          });
        } else if (originalSelectedId) {
          selectNode(originalSelectedId);
        }
        viewport.scrollLeft = originalScrollLeft;
        viewport.scrollTop = originalScrollTop;
      }
      isLoadingChart = false;
      savePdfBtn.disabled = false;
      saveCurrentPdfBtn.disabled = false;
      saveAllPdfBtn.disabled = false;
      savePdfBtn.textContent = '导出 PDF ▾';
    }
  }

  canvas.addEventListener('pointerdown', e => {
    if (batchMode || e.button !== 0) return;
    const nodeElement = e.target.closest('.node');
    if (!nodeElement) return;
    selectNode(nodeElement.dataset.id, nodeElement);
  }, true);

  canvas.addEventListener('mousedown', beginBatchInteraction, true);

  document.addEventListener('mousedown', e => {
    if (
      pendingFolderDeleteId &&
      !e.target.closest('.folder-delete-btn')
    ) {
      cancelFolderDelete();
    }
    if (
      pendingChartDeleteId &&
      !e.target.closest('.chart-delete-btn')
    ) {
      cancelChartDelete();
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (
      pendingFolderDeleteId &&
      !e.target.closest?.('.folder-delete-btn')
    ) {
      cancelFolderDelete();
    }
    if (
      pendingChartDeleteId &&
      !e.target.closest?.('.chart-delete-btn')
    ) {
      cancelChartDelete();
    }
  }, true);

  document.addEventListener('mousemove', e => {
    if (!folderDirectoryDrag) return;
    folderDirectoryDrag.clientX = e.clientX;
    folderDirectoryDrag.clientY = e.clientY;

    if (!folderDirectoryDrag.active) {
      const distance = Math.hypot(
        e.clientX - folderDirectoryDrag.startX,
        e.clientY - folderDirectoryDrag.startY
      );
      if (distance > 7) clearFolderDirectoryDrag();
      return;
    }

    e.preventDefault();
    folderDirectoryDrag.ghost.style.left = e.clientX + 12 + 'px';
    folderDirectoryDrag.ghost.style.top = e.clientY + 12 + 'px';
    fileTree.querySelectorAll(
      '.folder-row.folder-drop-before, .folder-drop-group-after'
    ).forEach(row => {
      row.classList.remove('folder-drop-before', 'folder-drop-group-after');
    });

    const targetItem = document.elementFromPoint(e.clientX, e.clientY)
      ?.closest('.folder-item');
    const targetRow = targetItem?.querySelector(':scope > .folder-row');
    const targetFolderId = targetRow?.dataset.folderId || null;
    folderDirectoryDrag.targetFolderId = null;
    folderDirectoryDrag.insertAfter = false;

    if (targetFolderId && targetFolderId !== folderDirectoryDrag.folderId) {
      const itemRect = targetItem.getBoundingClientRect();
      const insertAfter = e.clientY >= itemRect.top + itemRect.height / 2;
      folderDirectoryDrag.targetFolderId = targetFolderId;
      folderDirectoryDrag.insertAfter = insertAfter;
      if (insertAfter) {
        const chartRows = targetItem.querySelectorAll(':scope > .chart-row');
        const lastChartRow = chartRows[chartRows.length - 1];
        (lastChartRow || targetRow).classList.add('folder-drop-group-after');
      } else {
        targetRow.classList.add('folder-drop-before');
      }
    }
  }, true);

  document.addEventListener('mouseup', () => {
    if (!folderDirectoryDrag) return;
    const {
      active,
      folderId,
      targetFolderId,
      insertAfter,
      row
    } = folderDirectoryDrag;
    clearTimeout(folderDirectoryDrag.timer);
    row?.classList.remove('directory-drag-source');

    if (active) {
      suppressFolderClickUntil = Date.now() + 250;
      if (targetFolderId) {
        const moved = placeFolder(folderId, targetFolderId, insertAfter);
        if (!moved) showStatus('文件夹位置未改变');
      } else {
        showStatus('未移动：请松开到其他文件夹附近');
      }
    }
    clearFolderDirectoryDrag();
  }, true);

  document.addEventListener('mousemove', e => {
    if (!chartDirectoryDrag) return;
    chartDirectoryDrag.clientX = e.clientX;
    chartDirectoryDrag.clientY = e.clientY;

    if (!chartDirectoryDrag.active) {
      const distance = Math.hypot(
        e.clientX - chartDirectoryDrag.startX,
        e.clientY - chartDirectoryDrag.startY
      );
      if (distance > 7) clearChartDirectoryDrag();
      return;
    }

    e.preventDefault();
    chartDirectoryDrag.ghost.style.left = e.clientX + 12 + 'px';
    chartDirectoryDrag.ghost.style.top = e.clientY + 12 + 'px';

    fileTree.querySelectorAll('.folder-row.chart-drop-target').forEach(row => {
      row.classList.remove('chart-drop-target');
    });
    fileTree.querySelectorAll('.chart-row.chart-drop-before, .chart-row.chart-drop-after')
      .forEach(row => {
        row.classList.remove('chart-drop-before', 'chart-drop-after');
      });

    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const targetChartRow = hit?.closest('.chart-row');
    const targetFolderRow = hit?.closest('.folder-row');
    chartDirectoryDrag.targetFolderId = null;
    chartDirectoryDrag.targetChartId = null;
    chartDirectoryDrag.insertAfter = false;

    if (
      targetChartRow &&
      targetChartRow.dataset.chartId !== chartDirectoryDrag.chartId
    ) {
      const rect = targetChartRow.getBoundingClientRect();
      const insertAfter = e.clientY >= rect.top + rect.height / 2;
      chartDirectoryDrag.targetFolderId = targetChartRow.dataset.folderId;
      chartDirectoryDrag.targetChartId = targetChartRow.dataset.chartId;
      chartDirectoryDrag.insertAfter = insertAfter;
      targetChartRow.classList.add(
        insertAfter ? 'chart-drop-after' : 'chart-drop-before'
      );
    } else if (targetFolderRow) {
      chartDirectoryDrag.targetFolderId = targetFolderRow.dataset.folderId;
      targetFolderRow.classList.add('chart-drop-target');
    }
  }, true);

  document.addEventListener('mouseup', () => {
    if (!chartDirectoryDrag) return;
    const {
      active,
      sourceFolderId,
      chartId,
      targetFolderId,
      targetChartId,
      insertAfter,
      row
    } = chartDirectoryDrag;
    clearTimeout(chartDirectoryDrag.timer);
    row?.classList.remove('directory-drag-source');

    if (active) {
      suppressChartClickUntil = Date.now() + 250;
      if (targetFolderId) {
        const moved = placeChart(
          sourceFolderId,
          chartId,
          targetFolderId,
          targetChartId,
          insertAfter
        );
        if (!moved) showStatus('流程图位置未改变');
      } else {
        showStatus('未移动：请松开到流程图之间或文件夹名称上');
      }
    }
    clearChartDirectoryDrag();
  }, true);

  document.addEventListener('mousemove', e => {
    if (batchMode && batchSelectionDrag) {
      e.preventDefault();
      batchSelectionDrag.clientX = e.clientX;
      batchSelectionDrag.clientY = e.clientY;
      updateBatchSelectionDrag();
      requestBatchSelectionAutoScroll();
      return;
    }

    if (batchMode && batchMove) {
      e.preventDefault();
      const dx = Math.max(
        -batchMove.minX,
        e.clientX - batchMove.startX
      );
      const dy = Math.max(
        -batchMove.minY,
        e.clientY - batchMove.startY
      );
      for (const position of batchMove.positions) {
        const node = position.node || nodeById(position.id);
        const el = position.element || getNodeElement(position.id);
        if (!node || !el) continue;
        node.x = position.x + dx;
        node.y = position.y + dy;
        node.simplePosition = {
          x: Math.max(0, position.baseX + dx),
          y: Math.max(0, position.baseY + dy)
        };
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
      }
      requestEdgeRender();
      return;
    }

    if (!drag && dragCandidate) {
      const distance = Math.hypot(
        e.clientX - dragCandidate.startX,
        e.clientY - dragCandidate.startY
      );

      if (distance >= 5) {
        drag = dragCandidate;
        dragCandidate = null;
        document.activeElement?.blur();
        window.getSelection()?.removeAllRanges();
        selectNode(drag.id);
      }
    }

    if (!drag) return;
    e.preventDefault();
    const node = drag.node || nodeById(drag.id);
    const el = drag.element || getNodeElement(drag.id);
    if (!node || !el) return;

    const dragDeltaX = e.clientX - drag.startX;
    const dragDeltaY = e.clientY - drag.startY;
    node.x = Math.max(0, drag.originX + dragDeltaX);
    node.y = Math.max(0, drag.originY + dragDeltaY);
    node.simplePosition = {
      x: Math.max(0, drag.originBaseX + dragDeltaX),
      y: Math.max(0, drag.originBaseY + dragDeltaY)
    };
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    requestEdgeRender();
  });

  document.addEventListener('mouseup', () => {
    batchSelectionDrag?.box.remove();
    batchSelectionDrag = null;
    if (batchSelectionAutoScrollFrame) {
      cancelAnimationFrame(batchSelectionAutoScrollFrame);
      batchSelectionAutoScrollFrame = null;
    }
    batchMove = null;
    drag = null;
    dragCandidate = null;
  });

  viewport.addEventListener('scroll', () => {
    if (batchMode && batchSelectionDrag) {
      updateBatchSelectionDrag();
    }
  });

  document.addEventListener('paste', e => {
    const editable = e.target.closest?.('[contenteditable="true"]');
    if (!editable) return;
    const plainText = e.clipboardData?.getData('text/plain');
    if (plainText == null) return;
    e.preventDefault();
    document.execCommand('insertText', false, plainText);
  });

  canvas.addEventListener('click', () => selectNode(null));

  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    const editing = active?.classList?.contains('text-editing') ||
      active?.isContentEditable ||
      active?.matches?.('input:not([readonly]), textarea') ||
      Boolean(active?.closest?.('.detail-editor-panel'));
    const shortcut = e.ctrlKey || e.metaKey;

    if (shortcut && !editing && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redoFlowchartChange();
      } else {
        undoFlowchartChange();
      }
      return;
    }

    if (shortcut && !editing && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoFlowchartChange();
      return;
    }

    if (shortcut && !editing && e.key.toLowerCase() === 'c') {
      if (copySelectedNodes()) e.preventDefault();
      return;
    }

    if (shortcut && !editing && e.key.toLowerCase() === 'v') {
      if (pasteCopiedNodes()) e.preventDefault();
      return;
    }

    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      !editing
    ) {
      if (batchMode && batchSelectedIds.size) {
        e.preventDefault();
        deleteBatchSelected();
        return;
      }
      if (selectedId) {
        e.preventDefault();
        deleteSelected();
        return;
      }
    }

    if (shortcut && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveWorkspaceCheckpoint();
    }
  });

  document.getElementById('addNodeBtn').addEventListener('click', () => {
    const x = viewport.scrollLeft + viewport.clientWidth / 2 - 170;
    const y = viewport.scrollTop + viewport.clientHeight / 2 - 160;
    const node = createNode(x, y, '新节点');
    requestAnimationFrame(() => {
      const text = getNodeElement(node.id)?.querySelector('.simple-node-text');
      text?.focus();
      document.execCommand?.('selectAll', false, null);
    });
  });

  document.getElementById('deleteBtn').addEventListener('click', deleteSelected);
  document.getElementById('clearBtn').addEventListener('click', clearAll);
  document.getElementById('saveBtn').addEventListener('click', saveAsPNG);
  exportPortableBtn.addEventListener('click', exportPortableProject);
  importProjectBtn.addEventListener('click', () => {
    importProjectInput.click();
  });
  importProjectInput.addEventListener('change', () => {
    importPortableProject(importProjectInput.files?.[0]);
  });
  savePdfBtn.addEventListener('click', () => {
    const willOpen = savePdfMenu.hidden;
    savePdfMenu.hidden = !willOpen;
    savePdfBtn.setAttribute('aria-expanded', String(willOpen));
  });
  saveCurrentPdfBtn.addEventListener('click', () => {
    saveAsPDF('current');
  });
  saveAllPdfBtn.addEventListener('click', () => {
    saveAsPDF('all');
  });
  document.addEventListener('mousedown', event => {
    if (!savePdfControl.contains(event.target)) closePdfExportMenu();
  });
  toggleAllBtn.addEventListener('click', toggleAllNodes);
  batchSelectBtn.addEventListener('click', () => {
    setBatchMode(!batchMode);
  });
  flowchartSearchInput.addEventListener('input', () => {
    clearTimeout(directorySearchTimer);
    directorySearchTimer = setTimeout(() => {
      saveCurrentChart();
      directorySearchQuery = flowchartSearchInput.value;
      renderFileTree();
      updateNodeSearchHighlights();
    }, 90);
  });
  edgeFlipButton.addEventListener('mouseenter', () => {
    clearTimeout(edgeFlipHideTimer);
    edgeFlipHideTimer = null;
  });
  edgeFlipButton.addEventListener('mouseleave', () => {
    hideEdgeFlipButton();
  });
  edgeFlipButton.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
  });
  edgeFlipButton.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const edge = edgeFlipTarget;
    const index = edges.indexOf(edge);
    if (index < 0) {
      hideEdgeFlipButton(true);
      return;
    }
    const previousFrom = edge.from;
    edge.from = edge.to;
    edge.to = previousFrom;
    rebuildIncomingNodeIds();
    hideEdgeFlipButton(true);
    renderEdges();
  });
  detailEditorSaveBtn.addEventListener('click', saveDetailEditor);
  detailEditorCloseBtn.addEventListener('click', closeDetailEditor);
  document.querySelectorAll('[data-editor-command]').forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('click', () => {
      detailEditorContent.focus();
      document.execCommand(button.dataset.editorCommand, false, null);
      updateEditorCommandStates();
    });
  });
  detailEditorCodeBtn.addEventListener('mousedown', e => e.preventDefault());
  detailEditorCodeBtn.addEventListener('click', () => {
    insertDetailEditorCodeBlock();
  });
  detailEditorBlankLineBtn.addEventListener('mousedown', e => {
    e.preventDefault();
  });
  detailEditorBlankLineBtn.addEventListener('click', () => {
    insertDetailEditorBlankLine();
  });
  detailEditorImageBtn.addEventListener('click', () => {
    detailEditorImageInput.click();
  });
  detailEditorVideoBtn.addEventListener('click', () => {
    detailEditorVideoInput.click();
  });
  detailEditorGridBtn.addEventListener('click', () => {
    detailEditorGridVisible = !detailEditorGridVisible;
    detailEditorGridBtn.classList.toggle(
      'is-active',
      detailEditorGridVisible
    );
    detailEditorGridBtn.setAttribute(
      'aria-pressed',
      String(detailEditorGridVisible)
    );
    detailEditorContent.classList.toggle(
      'show-grid',
      detailEditorGridVisible
    );
    if (detailEditorGridVisible) {
      requestDetailEditorGridLayoutUpdate();
    } else {
      renderDetailEditorGridLayout();
    }
    updateDetailEditorGridCaretLine();
  });
  detailEditorImageInput.addEventListener('change', () => {
    insertDetailEditorMedia(detailEditorImageInput.files?.[0], 'image');
    detailEditorImageInput.value = '';
  });
  detailEditorVideoInput.addEventListener('change', () => {
    insertDetailEditorMedia(detailEditorVideoInput.files?.[0], 'video');
    detailEditorVideoInput.value = '';
  });
  detailEditorContent.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      saveDetailEditor();
    }
  });
  detailEditorContent.addEventListener('input', () => {
    ensureCodeBlockSpacing();
    updateEditorCommandStates();
    requestDetailEditorGridCaretUpdate();
    requestDetailEditorGridLayoutUpdate();
  });
  detailEditorContent.addEventListener('keyup', () => {
    updateEditorCommandStates();
    requestDetailEditorGridCaretUpdate();
  });
  detailEditorContent.addEventListener('mouseup', () => {
    updateEditorCommandStates();
    requestDetailEditorGridCaretUpdate();
  });
  detailEditorContent.addEventListener('mousedown', e => {
    if (!e.target.closest('.editor-code-copy-btn')) return;
    e.preventDefault();
    e.stopPropagation();
  });
  detailEditorContent.addEventListener('click', e => {
    const codeCopyButton = e.target.closest('.editor-code-copy-btn');
    if (codeCopyButton) {
      e.preventDefault();
      e.stopPropagation();
      copyCodeBlock(codeCopyButton.closest('pre'));
      return;
    }

    const frame = e.target.closest('.editor-media-frame');
    detailEditorContent.querySelectorAll('.editor-media-frame.is-selected')
      .forEach(element => {
        if (element !== frame) element.classList.remove('is-selected');
    });
    if (frame) {
      frame.classList.add('is-selected');
      detailEditorContent.focus({preventScroll: true});
    }
    requestDetailEditorGridCaretUpdate();
  });
  document.addEventListener(
    'selectionchange',
    requestDetailEditorGridCaretUpdate
  );
  detailEditorContent.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.editor-media-resize-handle');
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = handle.closest('.editor-media-frame');
    detailEditorContent.querySelectorAll('.editor-media-frame.is-selected')
      .forEach(element => element.classList.toggle('is-selected', element === frame));
    detailMediaResize = {
      pointerId: e.pointerId,
      frame,
      startX: e.clientX,
      startWidth: frame.getBoundingClientRect().width,
      maxWidth: detailEditorContent.clientWidth
    };
    handle.setPointerCapture?.(e.pointerId);
  });
  const clearDetailMediaDropIndicators = () => {
    detailEditorContent.querySelectorAll(
      '.media-drop-before, .media-drop-after, .media-drop-row, ' +
      '.media-drop-block-before, .media-drop-block-after'
    ).forEach(element => {
      element.classList.remove(
        'media-drop-before',
        'media-drop-after',
        'media-drop-row',
        'media-drop-block-before',
        'media-drop-block-after'
      );
    });
  };
  detailEditorContent.addEventListener('dragstart', e => {
    const frame = e.target.closest('.editor-media-frame');
    if (!frame || e.target.closest('.editor-media-resize-handle')) {
      e.preventDefault();
      return;
    }
    detailMediaDrag = frame;
    frame.classList.add('is-dragging', 'is-selected');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'flowchart-editor-media');
  });
  detailEditorContent.addEventListener('dragover', e => {
    if (!detailMediaDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDetailMediaDropIndicators();

    const targetFrame = e.target.closest('.editor-media-frame');
    if (targetFrame && targetFrame !== detailMediaDrag) {
      const after = e.clientX >
        targetFrame.getBoundingClientRect().left +
        targetFrame.getBoundingClientRect().width / 2;
      targetFrame.classList.add(after ? 'media-drop-after' : 'media-drop-before');
      return;
    }

    const targetRow = e.target.closest('.editor-media-row');
    if (targetRow) {
      targetRow.classList.add('media-drop-row');
      return;
    }

    const topLevel = topLevelEditorChild(e.target);
    if (topLevel && !topLevel.contains(detailMediaDrag)) {
      const after = e.clientY >
        topLevel.getBoundingClientRect().top +
        topLevel.getBoundingClientRect().height / 2;
      topLevel.classList.add(
        after ? 'media-drop-block-after' : 'media-drop-block-before'
      );
    }
  });
  detailEditorContent.addEventListener('drop', e => {
    if (!detailMediaDrag) return;
    e.preventDefault();
    const sourceRow = detailMediaDrag.closest('.editor-media-row');
    const targetFrame = e.target.closest('.editor-media-frame');
    const targetRow = e.target.closest('.editor-media-row');
    const topLevel = topLevelEditorChild(e.target);

    if (targetFrame && targetFrame !== detailMediaDrag) {
      const after = e.clientX >
        targetFrame.getBoundingClientRect().left +
        targetFrame.getBoundingClientRect().width / 2;
      targetFrame[after ? 'after' : 'before'](detailMediaDrag);
    } else if (targetRow) {
      targetRow.appendChild(detailMediaDrag);
    } else if (topLevel && !topLevel.contains(detailMediaDrag)) {
      const row = createDetailMediaRow();
      const after = e.clientY >
        topLevel.getBoundingClientRect().top +
        topLevel.getBoundingClientRect().height / 2;
      topLevel[after ? 'after' : 'before'](row);
      row.appendChild(detailMediaDrag);
    } else if (!topLevel) {
      const row = createDetailMediaRow();
      detailEditorContent.appendChild(row);
      row.appendChild(detailMediaDrag);
    }

    if (sourceRow && !sourceRow.querySelector('.editor-media-frame')) {
      sourceRow.remove();
    }
    detailMediaDrag.classList.remove('is-dragging');
    detailMediaDrag.classList.add('is-selected');
    detailMediaDrag = null;
    clearDetailMediaDropIndicators();
    ensureCodeBlockSpacing();
    showStatus('媒体位置已调整，点击保存同步到卡片');
  });
  detailEditorContent.addEventListener('dragend', () => {
    detailMediaDrag?.classList.remove('is-dragging');
    detailMediaDrag = null;
    clearDetailMediaDropIndicators();
  });
  document.addEventListener('pointermove', e => {
    if (!detailMediaResize || e.pointerId !== detailMediaResize.pointerId) return;
    e.preventDefault();
    const width = Math.max(
      120,
      Math.min(
        detailMediaResize.maxWidth,
        detailMediaResize.startWidth + e.clientX - detailMediaResize.startX
      )
    );
    detailMediaResize.frame.style.width = `${Math.round(width)}px`;
  });
  document.addEventListener('pointerup', e => {
    if (!detailMediaResize || e.pointerId !== detailMediaResize.pointerId) return;
    detailMediaResize = null;
    showStatus('媒体尺寸已调整，点击保存同步到卡片');
  });
  document.addEventListener('selectionchange', () => {
    if (detailEditorPanel.classList.contains('open')) {
      updateEditorCommandStates();
    }
  });
  detailEditorPanel.addEventListener('keydown', e => {
    const shortcut = e.ctrlKey || e.metaKey;
    if (shortcut && e.key.toLowerCase() === 'c' && copySelectedDetailEditorMedia()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (shortcut && e.key.toLowerCase() === 'v' && pasteDetailEditorMedia()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape') closeDetailEditor();
  });
  createFolderBtn.addEventListener('click', createFolder);
  createChartBtn.addEventListener('click', createStoredChart);
  cacheManagerBtn.addEventListener('click', openCacheManager);
  cacheManagerCloseBtn.addEventListener('click', closeCacheManager);
  cacheManagerBackdrop.addEventListener('mousedown', e => {
    if (e.target === cacheManagerBackdrop) closeCacheManager();
  });
  cacheManagerBackdrop.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCacheManager();
  });
  window.addEventListener('beforeunload', () => {
    if (!cacheDeletionInProgress) saveCurrentChart();
  });

  window.addEventListener('resize', () => {
    renderEdges(false);
    if (detailEditorPanel.classList.contains('open')) {
      updateDetailEditorPosition();
      requestDetailEditorGridLayoutUpdate();
    }
  });

  initializeWorkspace();
  migrateLegacyWorkspaceMedia();
  updateToggleAllButton();
  document.body.classList.remove('app-loading');
})();
