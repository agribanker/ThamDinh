const SAFE_LIMIT_BYTES = 17 * 1024 * 1024;
const NEAR_LIMIT_BYTES = 16.5 * 1024 * 1024;
const STABLE_MAX_FILES_PER_PART = 6;
const STABLE_MAX_BYTES_PER_PART = 10 * 1024 * 1024;
const DEVICE_SAFE_FILES_PER_SHARE = 8;

const els = {
  caseCode: document.getElementById('caseCode'),
  customerName: document.getElementById('customerName'),
  customerAddress: document.getElementById('customerAddress'),
  assetAddress: document.getElementById('assetAddress'),
  mapsLink: document.getElementById('mapsLink'),
  mapStatus: document.getElementById('mapStatus'),
  getAssetLocationBtn: document.getElementById('getAssetLocationBtn'),
  assessmentDate: document.getElementById('assessmentDate'),
  notes: document.getElementById('notes'),
  landNotes: document.getElementById('landNotes'),
  officerName: document.getElementById('officerName'),
  photoInput: document.getElementById('photoInput'),
  cameraInput: document.getElementById('cameraInput'),
  pickLibraryBtn: document.getElementById('pickLibraryBtn'),
  pickCameraBtn: document.getElementById('pickCameraBtn'),
  addPhotosBtn: document.getElementById('addPhotosBtn'),
  imageHints: document.getElementById('imageHints'),
  originalCount: document.getElementById('originalCount'),
  originalSize: document.getElementById('originalSize'),
  compressedSize: document.getElementById('compressedSize'),
  limitStatus: document.getElementById('limitStatus'),
  partCount: document.getElementById('partCount'),
  limitWarning: document.getElementById('limitWarning'),
  partsList: document.getElementById('partsList'),
  previewGrid: document.getElementById('previewGrid'),
  statusCard: document.getElementById('statusCard'),
  statusTitle: document.getElementById('statusTitle'),
  statusDesc: document.getElementById('statusDesc'),
  newCaseBtn: document.getElementById('newCaseBtn'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),

  messengerBanner: document.getElementById('messengerBanner')
};

const template = document.getElementById('partTemplate');

const state = {
  originalFiles: [],
  compressedFiles: [],
  parts: [],
  previewUrls: [],
  addModeNextPick: false,
  autoMode: 'compact',
  deviceShareLimited: false,
  isLocatingAsset: false
};

function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toAsciiNoMark(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ä‘/g, 'd')
    .replace(/Ä/g, 'D');
}

function toCompactCustomerName(text) {
  const raw = toAsciiNoMark(text).replace(/[^a-zA-Z0-9]+/g, '');
  return raw || 'KhachHang';
}

function getDateStamp() {
  const source = els.assessmentDate?.value ? new Date(`${els.assessmentDate.value}T00:00:00`) : new Date();
  if (Number.isNaN(source.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  }
  return `${source.getFullYear()}${pad(source.getMonth() + 1)}${pad(source.getDate())}`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shortenFileName(name) {
  if (name.length <= 24) return name;
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  return `${name.slice(0, 18)}...${ext}`;
}

function setStatus(visible, title = '', desc = '') {
  els.statusCard.classList.toggle('hidden', !visible);
  els.statusTitle.textContent = title;
  els.statusDesc.textContent = desc;
}

function setWarning(message) {
  if (!message) {
    els.limitWarning.textContent = '';
    els.limitWarning.classList.add('hidden');
    return;
  }
  els.limitWarning.textContent = message;
  els.limitWarning.classList.remove('hidden');
}

function setImageHints(messages = []) {
  if (!els.imageHints) return;
  if (!messages.length) {
    els.imageHints.textContent = '';
    els.imageHints.classList.add('hidden');
    return;
  }

  els.imageHints.innerHTML = messages.map((msg) => `â€¢ ${escapeHtml(msg)}`).join('<br>');
  els.imageHints.classList.remove('hidden');
}

function simpleHash(bytes) {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

async function buildQuickSignature(file) {
  const chunk = 16 * 1024;
  const first = new Uint8Array(await file.slice(0, chunk).arrayBuffer());
  const startTail = Math.max(0, file.size - chunk);
  const last = new Uint8Array(await file.slice(startTail, file.size).arrayBuffer());
  return `${file.size}:${simpleHash(first)}:${simpleHash(last)}`;
}

async function getImageDimensions(file) {
  const image = await readFileAsImage(file);
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (typeof image.close === 'function') image.close();
  return { width, height };
}

async function analyzeImageHints(files) {
  if (!files.length) return [];

  const hints = [];
  const nameAndSizeMap = new Map();
  const signatureMap = new Map();
  const tinyFiles = [];
  const suspiciousSmallLargeDims = [];

  for (const file of files) {
    const nameAndSizeKey = `${file.name.toLowerCase()}|${file.size}`;
    nameAndSizeMap.set(nameAndSizeKey, (nameAndSizeMap.get(nameAndSizeKey) || 0) + 1);
    if (file.size < 100 * 1024) tinyFiles.push(file);
  }

  for (const file of files) {
    const signature = await buildQuickSignature(file);
    const list = signatureMap.get(signature) || [];
    list.push(file.name);
    signatureMap.set(signature, list);
  }

  const dimsLimit = Math.min(files.length, 16);
  for (let i = 0; i < dimsLimit; i += 1) {
    const file = files[i];
    try {
      const dims = await getImageDimensions(file);
      if (Math.max(dims.width, dims.height) >= 1400 && file.size < 130 * 1024) {
        suspiciousSmallLargeDims.push(file.name);
      }
    } catch {
      // Ignore dimension read errors for hint analysis.
    }
  }

  let duplicatedByNameSize = 0;
  nameAndSizeMap.forEach((count) => {
    if (count > 1) duplicatedByNameSize += count - 1;
  });
  if (duplicatedByNameSize > 0) {
    hints.push(`CÃ³ ${duplicatedByNameSize} áº£nh trÃ¹ng tÃªn + dung lÆ°á»£ng, nÃªn kiá»ƒm tra vÃ  xÃ³a bá»›t.`);
  }

  let duplicatedBySignature = 0;
  signatureMap.forEach((arr) => {
    if (arr.length > 1) duplicatedBySignature += arr.length - 1;
  });
  if (duplicatedBySignature > 0) {
    hints.push(`CÃ³ ${duplicatedBySignature} áº£nh cÃ³ ná»™i dung ráº¥t giá»‘ng nhau (hash gáº§n trÃ¹ng).`);
  }

  if (tinyFiles.length > 0) {
    hints.push(`CÃ³ ${tinyFiles.length} áº£nh dung lÆ°á»£ng ráº¥t nhá» (<100KB), nÃªn kiá»ƒm tra áº£nh má»/thiáº¿u chi tiáº¿t.`);
  }

  if (suspiciousSmallLargeDims.length > 0) {
    hints.push(`CÃ³ ${suspiciousSmallLargeDims.length} áº£nh Ä‘á»™ phÃ¢n giáº£i lá»›n nhÆ°ng dung lÆ°á»£ng quÃ¡ tháº¥p, nÃªn xem láº¡i cháº¥t lÆ°á»£ng.`);
  }

  return hints;
}

async function refreshImageHints() {
  if (!state.compressedFiles.length) {
    setImageHints([]);
    return;
  }
  try {
    const hints = await analyzeImageHints(state.compressedFiles);
    setImageHints(hints);
  } catch {
    setImageHints([]);
  }
}

function setMapStatus(message, type = 'success') {
  if (!els.mapStatus) return;
  if (!message) {
    els.mapStatus.textContent = '';
    els.mapStatus.className = 'map-status';
    return;
  }
  els.mapStatus.textContent = message;
  els.mapStatus.className = `map-status ${type}`;
}

function collectFormData() {
  return {
    caseCode: els.caseCode.value.trim(),
    customerName: els.customerName.value.trim(),
    customerAddress: els.customerAddress.value.trim(),
    assetAddress: els.assetAddress.value.trim(),
    mapsLink: els.mapsLink.value.trim(),
    assessmentDate: els.assessmentDate.value,
    notes: els.notes.value.trim(),
    landNotes: els.landNotes?.value.trim() || '',
    recipientEmail: '',
    officerName: els.officerName.value.trim(),
    officerEmail: ''
  };
}

function readFileAsImage(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => fallbackReadFileAsImage(file));
  }
  return fallbackReadFileAsImage(file);
}

function fallbackReadFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`KhÃ´ng Ä‘á»c Ä‘Æ°á»£c áº£nh: ${file.name}`));
    };
    img.src = objectUrl;
  });
}

function renderCompressedBlob(image, maxEdge, quality) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('TrÃ¬nh duyá»‡t khÃ´ng há»— trá»£ canvas.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('NÃ©n áº£nh tháº¥t báº¡i.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function getPresetConfig() {
  // Fixed to balanced mode for stable field usage.
  return { maxEdge: 1920, quality: 0.8, targetBytes: 1.4 * 1024 * 1024, minEdge: 1080, minQuality: 0.58 };
}

async function compressImage(file) {
  const image = await readFileAsImage(file);
  const cfg = getPresetConfig();

  let maxEdge = cfg.maxEdge;
  let quality = cfg.quality;
  let bestBlob = await renderCompressedBlob(image, maxEdge, quality);

  for (let i = 0; i < 6; i += 1) {
    if (bestBlob.size <= cfg.targetBytes) break;
    if (i % 2 === 0) {
      maxEdge = Math.max(cfg.minEdge, Math.round(maxEdge * 0.9));
    } else {
      quality = Math.max(cfg.minQuality, Number((quality - 0.06).toFixed(2)));
    }

    const candidate = await renderCompressedBlob(image, maxEdge, quality);
    if (candidate.size < bestBlob.size) bestBlob = candidate;
  }

  return bestBlob;
}

function blobToFile(blob, index) {
  const dateStamp = getDateStamp();
  const customer = toCompactCustomerName(els.customerName?.value || '');
  const seq = String(index + 1).padStart(2, '0');
  const filename = `${dateStamp}_${customer}_${seq}.jpg`;
  return new File([blob], filename, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
}

function splitIntoParts(items, mode) {
  const parts = [];
  let current = [];
  let currentSize = 0;

  const partSizeLimit = mode === 'stable' ? Math.min(SAFE_LIMIT_BYTES, STABLE_MAX_BYTES_PER_PART) : SAFE_LIMIT_BYTES;
  const maxFiles = mode === 'stable' ? STABLE_MAX_FILES_PER_PART : Number.POSITIVE_INFINITY;

  items.forEach((item) => {
    if (item.size > partSizeLimit) {
      if (current.length) {
        parts.push({ items: current, size: currentSize });
        current = [];
        currentSize = 0;
      }
      parts.push({ items: [item], size: item.size, oversize: true });
      return;
    }

    const willExceedSize = currentSize + item.size > partSizeLimit;
    const willExceedCount = current.length >= maxFiles;

    if ((willExceedSize || willExceedCount) && current.length) {
      parts.push({ items: current, size: currentSize });
      current = [item];
      currentSize = item.size;
      return;
    }

    current.push(item);
    currentSize += item.size;
  });

  if (current.length) parts.push({ items: current, size: currentSize });
  return parts;
}

function buildMailParts(parts) {
  const totalParts = parts.length;
  const form = collectFormData();

  return parts.map((part, partIndex) => {
    const indexLabel = `${partIndex + 1}/${totalParts}`;
    const subject = `[Tháº©m Ä‘á»‹nh] ${form.caseCode} - ${form.customerName || 'Khach hang'} - P${indexLabel} - CBTD: ${
      form.officerName || 'CBTD'
    }`;

    const body = [
      `MÃ£ khÃ¡ch hÃ ng: ${form.caseCode}`,
      '',
      `KhÃ¡ch hÃ ng: ${form.customerName || ''}`,
      `Äá»‹a chá»‰ khÃ¡ch hÃ ng: ${form.customerAddress || ''}`,
      `Äá»‹a chá»‰ TSÄB: ${form.assetAddress || ''}`,
      `Link map: ${form.mapsLink || ''}`,
      `NgÃ y tháº©m Ä‘á»‹nh: ${formatDateForDisplay(form.assessmentDate) || ''}`,
      '',
      `CBTD: ${form.officerName || ''}`,
      '',
      `Pháº§n: ${indexLabel}`,
      `Sá»‘ áº£nh: ${part.items.length}`,
      '',
      `ThÃ´ng tin GCN QSDÄ: ${form.notes || ''}`,
      `Ghi chÃº: ${form.landNotes || ''}`
    ].join('\n');

    return {
      index: partIndex + 1,
      totalParts,
      size: part.size,
      files: part.items.map((item) => item.file),
      subject,
      body,
      oversize: Boolean(part.oversize)
    };
  });
}

function getTotalCompressedBytes() {
  return state.compressedFiles.reduce((sum, file) => sum + file.size, 0);
}

function chooseAutoMode(totalBytes) {
  if (state.deviceShareLimited) return 'stable';
  if (totalBytes >= NEAR_LIMIT_BYTES) return 'stable';
  return 'compact';
}

function rebuildPreparedParts() {
  const payload = state.compressedFiles.map((file) => ({ file, size: file.size }));
  const totalBytes = getTotalCompressedBytes();
  state.autoMode = chooseAutoMode(totalBytes);
  state.parts = buildMailParts(splitIntoParts(payload, state.autoMode));
  renderPreview();
  updateSummary();
  renderParts();
}

function updateSummary() {
  const originalBytes = state.originalFiles.reduce((sum, file) => sum + file.size, 0);
  const compressedBytes = getTotalCompressedBytes();

  els.originalCount.textContent = String(state.originalFiles.length);
  els.originalSize.textContent = formatBytes(originalBytes);
  els.compressedSize.textContent = formatBytes(compressedBytes);
  els.partCount.textContent = String(state.parts.length);

  if (!state.compressedFiles.length) {
    els.limitStatus.textContent = 'ChÆ°a cÃ³ áº£nh';
    setWarning('');
    return;
  }

  if (compressedBytes > SAFE_LIMIT_BYTES) {
    els.limitStatus.textContent = `VÆ°á»£t ngÆ°á»¡ng, Ä‘Ã£ chia ${state.parts.length} pháº§n`;
    setWarning('Dung lÆ°á»£ng vÆ°á»£t ngÆ°á»¡ng gá»­i an toÃ n. HÃ£y xÃ³a bá»›t áº£nh rá»“i thá»­ láº¡i.');
    return;
  }

  if (state.autoMode === 'stable' && state.parts.length > 1) {
    els.limitStatus.textContent = `ÄÃ£ chia ${state.parts.length} pháº§n (á»•n Ä‘á»‹nh)`;
    if (compressedBytes >= NEAR_LIMIT_BYTES) {
      setWarning('Gáº§n ngÆ°á»¡ng gá»­i an toÃ n, há»‡ thá»‘ng tá»± tÃ¡ch nhá» Ä‘á»ƒ gá»­i dá»… hÆ¡n.');
    } else {
      setWarning('Thiáº¿t bá»‹ giá»›i háº¡n chia sáº» nhiá»u áº£nh má»™t láº§n, há»‡ thá»‘ng Ä‘Ã£ tÃ¡ch nhá» Ä‘á»ƒ má»Ÿ mail á»•n Ä‘á»‹nh hÆ¡n.');
    }
    return;
  }

  els.limitStatus.textContent = state.parts.length > 1 ? `ÄÃ£ chia ${state.parts.length} pháº§n` : 'ÄÃ£ sáºµn sÃ ng gá»­i 1 pháº§n';
  setWarning('');
}

function makePreviewItem(file, index) {
  const wrapper = document.createElement('article');
  wrapper.className = 'preview-item';

  const media = document.createElement('div');
  media.className = 'preview-media';

  const img = document.createElement('img');
  img.alt = file.name;
  img.loading = 'lazy';
  const previewUrl = URL.createObjectURL(file);
  state.previewUrls.push(previewUrl);
  img.src = previewUrl;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'preview-delete';
  deleteBtn.textContent = 'XÃ³a';
  deleteBtn.addEventListener('click', () => removeImageAt(index));

  media.appendChild(img);
  media.appendChild(deleteBtn);

  const meta = document.createElement('div');
  meta.className = 'preview-meta';
  meta.innerHTML = `<strong>${escapeHtml(shortenFileName(file.name))}</strong>`;

  wrapper.appendChild(media);
  wrapper.appendChild(meta);
  return wrapper;
}

function renderPreview() {
  state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls = [];
  els.previewGrid.innerHTML = '';
  state.compressedFiles.forEach((file, index) => {
    els.previewGrid.appendChild(makePreviewItem(file, index));
  });
}

function renderParts() {
  els.partsList.innerHTML = '';

  if (!state.parts.length) {
    const empty = document.createElement('div');
    empty.className = 'warning';
    empty.textContent = 'ChÆ°a cÃ³ áº£nh Ä‘á»ƒ chuáº©n bá»‹ pháº§n gá»­i.';
    els.partsList.appendChild(empty);
    return;
  }

  state.parts.forEach((part) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const title = card.querySelector('.part-title');
    const meta = card.querySelector('.part-meta');
    const badge = card.querySelector('.part-badge');
    const preview = card.querySelector('.part-preview');
    const shareBtn = card.querySelector('.share-btn');
    const copyBtn = card.querySelector('.copy-btn');

    title.textContent = `Pháº§n ${part.index}/${part.totalParts}`;
    meta.textContent = `${part.files.length} áº£nh â€¢ ${formatBytes(part.size)}`;
    badge.textContent = part.oversize ? 'Cáº§n kiá»ƒm tra' : 'Sáºµn sÃ ng';
    preview.textContent = `${part.subject}\n\n${part.body}`;

    shareBtn.addEventListener('click', () => sharePart(part));
    copyBtn.addEventListener('click', () => copyPartText(part));

    els.partsList.appendChild(card);
  });
}

function removeImageAt(index) {
  if (index < 0 || index >= state.compressedFiles.length) return;
  state.compressedFiles.splice(index, 1);
  if (index < state.originalFiles.length) state.originalFiles.splice(index, 1);
  rebuildPreparedParts();
  refreshImageHints();
  setStatus(true, 'ÄÃ£ xÃ³a 1 áº£nh', 'ÄÃ£ cáº­p nháº­t láº¡i dung lÆ°á»£ng vÃ  pháº§n gá»­i.');
}

function canShareFiles(files) {
  if (!navigator.share || !navigator.canShare) return false;
  return navigator.canShare({ files });
}

function cloneFilesForShare(files) {
  return files.map((file, idx) =>
    new File([file], file.name || `photo_${idx + 1}.jpg`, {
      type: file.type || 'image/jpeg',
      lastModified: Date.now()
    })
  );
}

function forceSplitForDeviceShare() {
  if (!state.compressedFiles.length) return false;
  const payload = state.compressedFiles.map((file) => ({ file, size: file.size }));
  const forcedParts = buildMailParts(splitIntoParts(payload, 'stable'));
  if (forcedParts.length <= state.parts.length) return false;

  state.deviceShareLimited = true;
  state.autoMode = 'stable';
  state.parts = forcedParts;
  updateSummary();
  renderParts();
  setWarning('Thiáº¿t bá»‹ giá»›i háº¡n sá»‘ áº£nh/láº§n chia sáº». Há»‡ thá»‘ng Ä‘Ã£ tá»± chia nhá» Ä‘á»ƒ má»Ÿ mail á»•n Ä‘á»‹nh hÆ¡n.');
  return true;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  return ok;
}

async function copyPartText(part) {
  try {
    await copyText(`${part.subject}\n\n${part.body}`);
    setStatus(true, 'ÄÃ£ sao chÃ©p ná»™i dung mail', 'Báº¡n cÃ³ thá»ƒ dÃ¡n vÃ o á»©ng dá»¥ng mail náº¿u khÃ´ng chia sáº» file trá»±c tiáº¿p Ä‘Æ°á»£c.');
  } catch (error) {
    setStatus(true, 'KhÃ´ng sao chÃ©p Ä‘Æ°á»£c', error.message || 'TrÃ¬nh duyá»‡t khÃ´ng cho phÃ©p sao chÃ©p.');
  }
}

async function exportSummaryPdf() {
  if (!state.compressedFiles.length) {
    setStatus(true, 'ChÆ°a cÃ³ áº£nh Ä‘á»ƒ xuáº¥t PDF', 'Vui lÃ²ng chá»n áº£nh trÆ°á»›c khi xuáº¥t file PDF.');
    return;
  }

  const form = collectFormData();
  if (!window.PdfSummary?.buildPdfSummaryHtml) {
    setStatus(true, 'Thiáº¿u module PDF', 'KhÃ´ng tÃ¬m tháº¥y file pdf-summary.js.');
    return;
  }

  const win = window.open('', '_blank');
  if (!win) {
    setStatus(
      true,
      'Trinh duyet chan popup',
      'Hay mo bang Chrome/Safari (ngoai Zalo/Messenger) va bat cho phep popup cho trang nay roi thu lai.'
    );
    return;
  }

  win.document.open();
  win.document.write('<!doctype html><html><body style="font-family:Arial,sans-serif;padding:16px">Dang chuan bi PDF...</body></html>');
  win.document.close();

  try {
    setStatus(true, 'Äang chuáº©n bá»‹ file PDF ...', 'Dang nhung anh va dung bo cuc PDF.');
    const html = await window.PdfSummary.buildPdfSummaryHtml({
      form,
      files: state.compressedFiles,
      totalBytes: getTotalCompressedBytes()
    });

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();

    const waitForImages = async (maxWaitMs = 12000) => {
      const started = Date.now();
      while (Date.now() - started < maxWaitMs) {
        const images = Array.from(win.document.images || []);
        const pending = images.filter((img) => !img.complete).length;
        if (pending === 0) {
          return { timedOut: false, pending: 0, total: images.length };
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const images = Array.from(win.document.images || []);
      const pending = images.filter((img) => !img.complete).length;
      return { timedOut: true, pending, total: images.length };
    };

    const imageState = await waitForImages();
    win.print();

    if (imageState.timedOut && imageState.pending > 0) {
      setStatus(
        true,
        'Da mo che do in PDF (mot so anh tai cham)',
        'Da cho ' + imageState.total + ' anh, con ' + imageState.pending + ' anh tai cham. Ban van co the luu PDF, hoac thu lai khi mang on dinh.'
      );
      return;
    }

    setStatus(true, 'ÄÃ£ xuáº¥t PDF', 'Chá»n "Save as PDF" Ä‘á»ƒ lÆ°u file.');
  } catch (error) {
    try {
      win.document.open();
      win.document.write('<!doctype html><html><body style="font-family:Arial,sans-serif;padding:16px">Xuat PDF that bai. Vui long quay lai trang va thu lai.</body></html>');
      win.document.close();
    } catch {
      // ignore window write failure
    }
    setStatus(true, 'Xuat PDF that bai', error?.message || 'Khong tao duoc noi dung PDF.');
  }
}


function buildShareConfirmMessage(part) {
  return `Báº¡n sáº¯p má»Ÿ mail Ä‘á»ƒ gá»­i pháº§n ${part.index}/${part.totalParts}\n${part.files.length} áº£nh - ${formatBytes(part.size)}\n\nTiáº¿p tá»¥c / Há»§y`;
}

async function sharePart(part) {
  const ok = window.confirm(buildShareConfirmMessage(part));
  if (!ok) return;

  const files = cloneFilesForShare(part.files);
  const qrAttachment = await createQrAttachmentIfNeeded(part);
  if (qrAttachment) files.push(qrAttachment);
  const textOnlyData = {
    title: part.subject,
    text: `${part.subject}\n\n${part.body}`
  };

  const shareData = {
    title: part.subject,
    text: `${part.subject}\n\n${part.body}`,
    files
  };

  if (!canShareFiles(files) && files.length > DEVICE_SAFE_FILES_PER_SHARE) {
    const wasSplit = forceSplitForDeviceShare();
    if (wasSplit) {
      setStatus(
        true,
        'Thiáº¿t bá»‹ khÃ´ng má»Ÿ mail vá»›i nhiá»u áº£nh cÃ¹ng lÃºc',
        'ÄÃ£ tá»± chia nhá» pháº§n gá»­i theo cháº¿ Ä‘á»™ á»•n Ä‘á»‹nh. Báº¡n báº¥m gá»­i láº¡i tá»«ng pháº§n.'
      );
      return;
    }
  }

  if (canShareFiles(files)) {
    try {
      await navigator.share(shareData);
      setStatus(true, `ÄÃ£ má»Ÿ chia sáº» pháº§n ${part.index}/${part.totalParts}`, 'Chá»n Gmail/Outlook/Mail rá»“i báº¥m gá»­i trong á»©ng dá»¥ng mail.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus(true, 'ÄÃ£ há»§y chia sáº»', 'Báº¡n vá»«a Ä‘Ã³ng báº£ng chia sáº».');
        return;
      }
      if (files.length > 1) {
        const wasSplit = forceSplitForDeviceShare();
        if (wasSplit) {
          setStatus(
            true,
            'Thiáº¿t bá»‹ tá»« chá»‘i chia sáº» nhiá»u áº£nh cÃ¹ng lÃºc',
            'ÄÃ£ tá»± chia nhá» áº£nh Ä‘á»ƒ gá»­i á»•n Ä‘á»‹nh hÆ¡n. Báº¡n báº¥m gá»­i láº¡i tá»«ng pháº§n.'
          );
          return;
        }
      }
    }
  }

  if (!canShareFiles(files) && files.length > 1) {
    const wasSplit = forceSplitForDeviceShare();
    if (wasSplit) {
      setStatus(
        true,
        'Thiáº¿t bá»‹ giá»›i háº¡n sá»‘ file Ä‘Ã­nh kÃ¨m',
        'ÄÃ£ chia nhá» áº£nh Ä‘á»ƒ gá»­i á»•n Ä‘á»‹nh hÆ¡n. Báº¡n báº¥m gá»­i láº¡i tá»«ng pháº§n.'
      );
      return;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share(textOnlyData);
      setStatus(
        true,
        'ÄÃ£ má»Ÿ á»©ng dá»¥ng chia sáº»',
        'Thiáº¿t bá»‹ khÃ´ng há»— trá»£ Ä‘Ã­nh kÃ¨m file trá»±c tiáº¿p tá»« web. HÃ£y Ä‘Ã­nh kÃ¨m áº£nh thá»§ cÃ´ng trong á»©ng dá»¥ng mail.'
      );
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus(true, 'ÄÃ£ há»§y chia sáº»', 'Báº¡n vá»«a Ä‘Ã³ng báº£ng chia sáº».');
        return;
      }
    }
  }

  const recipient = collectFormData().recipientEmail;
  if (recipient) {
    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(part.subject)}&body=${encodeURIComponent(part.body)}`;
    window.location.href = mailto;
    setStatus(true, 'ÄÃ£ má»Ÿ á»©ng dá»¥ng mail', 'Náº¿u khÃ´ng tá»± Ä‘Ã­nh kÃ¨m áº£nh, hÃ£y thÃªm áº£nh thá»§ cÃ´ng trong á»©ng dá»¥ng mail.');
    return;
  }

  await copyPartText(part);
  setStatus(true, 'Thiáº¿t bá»‹ khÃ´ng chia sáº» file trá»±c tiáº¿p Ä‘Æ°á»£c', 'ÄÃ£ sao chÃ©p ná»™i dung, báº¡n cÃ³ thá»ƒ dÃ¡n vÃ o mail vÃ  Ä‘Ã­nh kÃ¨m áº£nh thá»§ cÃ´ng.');
}

function getCurrentPosition(options = { enableHighAccuracy: true, timeout: 22000, maximumAge: 30000 }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('no-geo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPositionBestEffort() {
  const attempts = [
    { enableHighAccuracy: false, timeout: 16000, maximumAge: 300000 },
    { enableHighAccuracy: true, timeout: 26000, maximumAge: 60000 },
    { enableHighAccuracy: false, timeout: 22000, maximumAge: 0 }
  ];

  let lastError;
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      return await getCurrentPosition(attempts[i]);
    } catch (error) {
      lastError = error;
      if (i < attempts.length - 1) await wait(500);
    }
  }
  throw lastError || new Error('geo-failed');
}

function buildGoogleMapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function normalizeMapLink(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps)/i.test(value)) return `https://${value}`;
  return value;
}

function buildQrUrlMain(text) {
  if (!text) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&format=png&margin=8&data=${encodeURIComponent(text)}`;
}

function buildQrUrlFallback(text) {
  if (!text) return '';
  return `https://quickchart.io/qr?size=320&text=${encodeURIComponent(text)}`;
}

async function fetchQrBlobForMapLink(mapLink) {
  const normalized = normalizeMapLink(mapLink);
  if (!normalized) return null;
  const candidates = [buildQrUrlMain(normalized), buildQrUrlFallback(normalized)];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size === 0) continue;
      return blob;
    } catch {
      // Try next QR provider.
    }
  }

  return null;
}

async function createQrAttachmentIfNeeded(part) {
  if (!part || part.index !== 1) return null;
  const mapLink = collectFormData().mapsLink;
  const qrBlob = await fetchQrBlobForMapLink(mapLink);
  if (!qrBlob) return null;
  return new File([qrBlob], 'qr_vi_tri_tai_san.png', {
    type: 'image/png',
    lastModified: Date.now()
  });
}

async function fillAssetLocation() {
  if (state.isLocatingAsset) {
    setStatus(true, 'Äang láº¥y vá»‹ trÃ­ tÃ i sáº£n...', 'Há»‡ thá»‘ng Ä‘ang Ä‘á»‹nh vá»‹, vui lÃ²ng chá».');
    return;
  }

  state.isLocatingAsset = true;
  if (els.getAssetLocationBtn) els.getAssetLocationBtn.disabled = true;

  try {
    setMapStatus('Äang chá» cáº¥p quyá»n vá»‹ trÃ­ vÃ  Ä‘á»‹nh vá»‹ GPS...');
    setStatus(true, 'Äang láº¥y vá»‹ trÃ­ tÃ i sáº£n...', 'Vui lÃ²ng chá» vÃ i giÃ¢y Ä‘á»ƒ GPS Ä‘á»‹nh vá»‹.');
    const pos = await getPositionBestEffort();
    const lat = Number(pos.coords.latitude).toFixed(6);
    const lng = Number(pos.coords.longitude).toFixed(6);
    const url = buildGoogleMapsLink(lat, lng);
    const hadValue = Boolean(els.mapsLink.value.trim());

    els.mapsLink.value = url;
    try {
      await copyText(url);
    } catch {
      // copy may fail in some in-app browsers
    }

    setMapStatus(hadValue ? 'ÄÃ£ cáº­p nháº­t vá»‹ trÃ­ má»›i' : 'ÄÃ£ láº¥y vá»‹ trÃ­ thÃ nh cÃ´ng', 'success');
    setStatus(true, 'ÄÃ£ cáº­p nháº­t link map', 'Link vá»‹ trÃ­ Ä‘Ã£ Ä‘Æ°á»£c Ä‘iá»n vÃ o Ã´ Google Maps.');
  } catch (error) {
    let msg = 'KhÃ´ng láº¥y Ä‘Æ°á»£c vá»‹ trÃ­. HÃ£y má»Ÿ báº±ng Chrome hoáº·c dÃ¡n link Google Maps thá»§ cÃ´ng.';
    if (error?.code === 1) {
      msg = 'Báº¡n vá»«a tá»« chá»‘i quyá»n vá»‹ trÃ­. HÃ£y cho phÃ©p quyá»n vá»‹ trÃ­ rá»“i báº¥m láº¡i.';
    } else if (error?.code === 2) {
      msg = 'KhÃ´ng xÃ¡c Ä‘á»‹nh Ä‘Æ°á»£c vá»‹ trÃ­ hiá»‡n táº¡i. HÃ£y kiá»ƒm tra GPS/Internet rá»“i thá»­ láº¡i.';
    } else if (error?.code === 3) {
      msg = 'Láº¥y vá»‹ trÃ­ bá»‹ quÃ¡ thá»i gian chá». HÃ£y thá»­ láº¡i á»Ÿ nÆ¡i sÃ³ng GPS tá»‘t hÆ¡n.';
    }
    setMapStatus(msg, 'error');
    setStatus(true, 'KhÃ´ng láº¥y Ä‘Æ°á»£c vá»‹ trÃ­', msg);
  } finally {
    state.isLocatingAsset = false;
    if (els.getAssetLocationBtn) els.getAssetLocationBtn.disabled = false;
  }
}

function isMessengerInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Messenger|Zalo/i.test(ua);
}

async function processSelectedFiles(fileList, append = false) {
  if (!fileList.length) return;

  setStatus(true, 'Äang xá»­ lÃ½ áº£nh...', 'Äang nÃ©n áº£nh vÃ  chuáº©n bá»‹ pháº§n gá»­i.');
  els.photoInput.disabled = true;
  if (els.cameraInput) els.cameraInput.disabled = true;
  if (els.addPhotosBtn) els.addPhotosBtn.disabled = true;

  try {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!incoming.length) {
      setStatus(true, 'KhÃ´ng cÃ³ áº£nh há»£p lá»‡', 'Vui lÃ²ng chá»n láº¡i áº£nh tá»« thÆ° viá»‡n hoáº·c camera.');
      return;
    }

    const compressed = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const file = incoming[i];
      setStatus(true, 'Äang nÃ©n áº£nh...', `Äang xá»­ lÃ½ ${i + 1}/${incoming.length}: ${shortenFileName(file.name)}`);
      const blob = await compressImage(file);
      const offset = append ? state.compressedFiles.length : 0;
      compressed.push(blobToFile(blob, offset + i));
    }

    if (append) {
      state.originalFiles = [...state.originalFiles, ...incoming];
      state.compressedFiles = [...state.compressedFiles, ...compressed];
    } else {
      state.originalFiles = incoming.slice();
      state.compressedFiles = compressed;
    }
    state.deviceShareLimited = false;

    rebuildPreparedParts();
    await refreshImageHints();

    const totalBytes = getTotalCompressedBytes();
    if (totalBytes > SAFE_LIMIT_BYTES) {
      setStatus(true, 'áº¢nh vÆ°á»£t ngÆ°á»¡ng gá»­i an toÃ n', 'Báº¡n nÃªn xÃ³a bá»›t áº£nh rá»“i thá»­ láº¡i.');
    } else {
      setStatus(true, 'ÄÃ£ sáºµn sÃ ng gá»­i', state.parts.length === 1 ? 'áº¢nh Ä‘Ã£ sáºµn sÃ ng gá»­i.' : `ÄÃ£ chuáº©n bá»‹ ${state.parts.length} pháº§n Ä‘á»ƒ gá»­i.`);
    }
  } catch (error) {
    console.error(error);
    setStatus(true, 'Xá»­ lÃ½ áº£nh tháº¥t báº¡i', error.message || 'CÃ³ lá»—i khi nÃ©n áº£nh.');
  } finally {
    els.photoInput.disabled = false;
    els.photoInput.value = '';
    if (els.cameraInput) {
      els.cameraInput.disabled = false;
      els.cameraInput.value = '';
    }
    if (els.addPhotosBtn) els.addPhotosBtn.disabled = false;
    state.addModeNextPick = false;
  }
}

function resetFormDefaults() {
  const now = new Date();
  els.assessmentDate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  els.notes.value = '';
  if (els.landNotes) els.landNotes.value = '';
  setMapStatus('');
}

function clearImageData() {
  state.originalFiles = [];
  state.compressedFiles = [];
  state.parts = [];
  state.deviceShareLimited = false;
  rebuildPreparedParts();
  setImageHints([]);
}

function createNewCase() {
  const keepOfficerName = els.officerName.value.trim();

  document.getElementById('caseForm').reset();
  resetFormDefaults();
  els.officerName.value = keepOfficerName;
  els.caseCode.value = '';
  clearImageData();
  setStatus(true, 'ÄÃ£ táº¡o há»“ sÆ¡ má»›i', 'Báº¡n cÃ³ thá»ƒ nháº­p khÃ¡ch hÃ ng tiáº¿p theo ngay.');
}

function initFormDefaults() {
  resetFormDefaults();
  els.caseCode.value = '';
}

function wireEvents() {
  if (els.getAssetLocationBtn) {
    els.getAssetLocationBtn.addEventListener('click', fillAssetLocation);
  }

  if (els.pickLibraryBtn) {
    els.pickLibraryBtn.addEventListener('click', () => {
      state.addModeNextPick = state.compressedFiles.length > 0;
      els.photoInput.click();
    });
  }

  if (els.pickCameraBtn) {
    els.pickCameraBtn.addEventListener('click', () => {
      state.addModeNextPick = true;
      els.cameraInput.click();
    });
  }

  if (els.addPhotosBtn) {
    els.addPhotosBtn.addEventListener('click', () => {
      state.addModeNextPick = true;
      els.photoInput.click();
    });
  }

  if (els.newCaseBtn) {
    els.newCaseBtn.addEventListener('click', createNewCase);
  }

  if (els.exportPdfBtn) {
    els.exportPdfBtn.addEventListener('click', exportSummaryPdf);
  }

  [
    els.customerName,
    els.customerAddress,
    els.assetAddress,
    els.mapsLink,
    els.assessmentDate,
    els.notes,
    els.landNotes,
    els.officerName
  ]
    .filter(Boolean)
    .forEach((input) => {
    input.addEventListener('input', () => {
      if (!state.compressedFiles.length) return;
      const payload = state.compressedFiles.map((file) => ({ file, size: file.size }));
      state.autoMode = chooseAutoMode(getTotalCompressedBytes());
      state.parts = buildMailParts(splitIntoParts(payload, state.autoMode));
      updateSummary();
      renderParts();
    });
  });

  els.photoInput.addEventListener('change', (event) => {
    processSelectedFiles(event.target.files || [], state.addModeNextPick);
  });

  if (els.cameraInput) {
    els.cameraInput.addEventListener('change', (event) => {
      processSelectedFiles(event.target.files || [], true);
    });
  }
}

initFormDefaults();
wireEvents();
if (isMessengerInAppBrowser() && els.messengerBanner) {
  els.messengerBanner.classList.remove('hidden');
}
updateSummary();
renderPreview();
renderParts();

