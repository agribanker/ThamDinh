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
  exportWordBtn: document.getElementById('exportWordBtn'),
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
    .replace(/d/g, 'd')
    .replace(/Ð/g, 'D');
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

  els.imageHints.innerHTML = messages.map((msg) => `• ${escapeHtml(msg)}`).join('<br>');
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
    hints.push(`Có ${duplicatedByNameSize} ?nh trùng tên + dung lu?ng, nên ki?m tra và xóa b?t.`);
  }

  let duplicatedBySignature = 0;
  signatureMap.forEach((arr) => {
    if (arr.length > 1) duplicatedBySignature += arr.length - 1;
  });
  if (duplicatedBySignature > 0) {
    hints.push(`Có ${duplicatedBySignature} ?nh có n?i dung r?t gi?ng nhau (hash g?n trùng).`);
  }

  if (tinyFiles.length > 0) {
    hints.push(`Có ${tinyFiles.length} ?nh dung lu?ng r?t nh? (<100KB), nên ki?m tra ?nh m?/thi?u chi ti?t.`);
  }

  if (suspiciousSmallLargeDims.length > 0) {
    hints.push(`Có ${suspiciousSmallLargeDims.length} ?nh d? phân gi?i l?n nhung dung lu?ng quá th?p, nên xem l?i ch?t lu?ng.`);
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
      reject(new Error(`Không d?c du?c ?nh: ${file.name}`));
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
    throw new Error('Trình duy?t không h? tr? canvas.');
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
          reject(new Error('Nén ?nh th?t b?i.'));
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
    const subject = `[Th?m d?nh] ${form.caseCode} - ${form.customerName || 'Khach hang'} - P${indexLabel} - CBTD: ${
      form.officerName || 'CBTD'
    }`;

    const body = [
      `Mã khách hàng: ${form.caseCode}`,
      '',
      `Khách hàng: ${form.customerName || ''}`,
      `Ð?a ch? khách hàng: ${form.customerAddress || ''}`,
      `Ð?a ch? TSÐB: ${form.assetAddress || ''}`,
      `Link map: ${form.mapsLink || ''}`,
      `Ngày th?m d?nh: ${formatDateForDisplay(form.assessmentDate) || ''}`,
      '',
      `CBTD: ${form.officerName || ''}`,
      '',
      `Ph?n: ${indexLabel}`,
      `S? ?nh: ${part.items.length}`,
      '',
      `Ghi chú: ${form.notes || 'Hình ?nh hi?n tr?ng tài s?n b?o d?m'}`
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
    els.limitStatus.textContent = 'Chua có ?nh';
    setWarning('');
    return;
  }

  if (compressedBytes > SAFE_LIMIT_BYTES) {
    els.limitStatus.textContent = `Vu?t ngu?ng, dã chia ${state.parts.length} ph?n`;
    setWarning('Dung lu?ng vu?t ngu?ng g?i an toàn. Hãy xóa b?t ?nh r?i th? l?i.');
    return;
  }

  if (state.autoMode === 'stable' && state.parts.length > 1) {
    els.limitStatus.textContent = `Ðã chia ${state.parts.length} ph?n (?n d?nh)`;
    if (compressedBytes >= NEAR_LIMIT_BYTES) {
      setWarning('G?n ngu?ng g?i an toàn, h? th?ng t? tách nh? d? g?i d? hon.');
    } else {
      setWarning('Thi?t b? gi?i h?n chia s? nhi?u ?nh m?t l?n, h? th?ng dã tách nh? d? m? mail ?n d?nh hon.');
    }
    return;
  }

  els.limitStatus.textContent = state.parts.length > 1 ? `Ðã chia ${state.parts.length} ph?n` : 'Ðã s?n sàng g?i 1 ph?n';
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
  deleteBtn.textContent = 'Xóa';
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
    empty.textContent = 'Chua có ?nh d? chu?n b? ph?n g?i.';
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

    title.textContent = `Ph?n ${part.index}/${part.totalParts}`;
    meta.textContent = `${part.files.length} ?nh • ${formatBytes(part.size)}`;
    badge.textContent = part.oversize ? 'C?n ki?m tra' : 'S?n sàng';
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
  setStatus(true, 'Ðã xóa 1 ?nh', 'Ðã c?p nh?t l?i dung lu?ng và ph?n g?i.');
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
  setWarning('Thi?t b? gi?i h?n s? ?nh/l?n chia s?. H? th?ng dã t? chia nh? d? m? mail ?n d?nh hon.');
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
    setStatus(true, 'Ðã sao chép n?i dung mail', 'B?n có th? dán vào ?ng d?ng mail n?u không chia s? file tr?c ti?p du?c.');
  } catch (error) {
    setStatus(true, 'Không sao chép du?c', error.message || 'Trình duy?t không cho phép sao chép.');
  }
}

async function exportSummaryPdf() {
  if (!state.compressedFiles.length) {
    setStatus(true, 'Chua có ?nh d? xu?t PDF', 'Vui lòng ch?n ?nh tru?c khi xu?t biên b?n tóm t?t.');
    return;
  }

  const form = collectFormData();
  if (!window.PdfSummary?.buildPdfSummaryHtml) {
    setStatus(true, 'Thi?u module PDF', 'Không tìm th?y file pdf-summary.js.');
    return;
  }

  setStatus(true, 'Ðang chu?n b? PDF...', 'Ðang nhúng ?nh và d?ng b? c?c PDF.');
  const html = await window.PdfSummary.buildPdfSummaryHtml({
    form,
    files: state.compressedFiles,
    totalBytes: getTotalCompressedBytes()
  });
  const win = window.open('', '_blank');
  if (!win) {
    setStatus(true, 'Trình duy?t ch?n popup', 'Hãy b?t popup d? xu?t PDF.');
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();

  const waitForImages = async () => {
    const started = Date.now();
    while (Date.now() - started < 8000) {
      const images = Array.from(win.document.images || []);
      const pending = images.some((img) => !img.complete);
      if (!pending) return;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  };

  await waitForImages();
  win.print();
  setStatus(true, 'Ðã m? ch? d? in PDF', 'Ch?n “Save as PDF” d? t?i biên b?n.');
}

async function exportSummaryWord() {
  if (!state.compressedFiles.length) {
    setStatus(true, 'Chua có ?nh d? xu?t Word', 'Vui lòng ch?n ?nh tru?c khi xu?t biên b?n tóm t?t.');
    return;
  }

  const form = collectFormData();
  if (!window.PdfSummary?.buildWordSummaryDocxBlob) {
    setStatus(true, 'Thi?u module Word', 'Không tìm th?y hàm xu?t Word trong file pdf-summary.js.');
    return;
  }

  setStatus(true, 'Ðang chu?n b? Word...', 'Ðang d?ng file .docx. Vui lòng ch? giây lát...');

  try {
    const docxBlob = await window.PdfSummary.buildWordSummaryDocxBlob({
      form,
      files: state.compressedFiles,
      totalBytes: getTotalCompressedBytes()
    });

    const filename = `Tom_tat_ho_so_${getDateStamp()}_${toCompactCustomerName(form.customerName || '')}.docx`;
    const wordFile = new File([docxBlob], filename, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [wordFile] })) {
      await navigator.share({
        title: filename,
        text: 'Biên b?n tóm t?t th?m d?nh',
        files: [wordFile]
      });
      setStatus(true, 'Ðã m? chia s? file Word', 'Vui lòng ch?n ?ng d?ng (Zalo, Mail, Files...) d? luu file .docx.');
      return;
    }

    const objectUrl = URL.createObjectURL(docxBlob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
    setStatus(true, 'Ðã t?i file Word', 'Vui lòng ki?m tra thu m?c t?i xu?ng (Downloads) c?a máy.');
  } catch (error) {
    if (error?.name === 'AbortError') {
      setStatus(true, 'Ðã h?y', 'B?n v?a dóng b?ng chia s?.');
      return;
    }
    setStatus(true, 'Xu?t Word th?t b?i', error?.message || 'Không t?o du?c file Word. Th? dùng trình duy?t Chrome/Safari.');
  }
}
function buildShareConfirmMessage(part) {
  return `B?n s?p m? mail d? g?i ph?n ${part.index}/${part.totalParts}\n${part.files.length} ?nh - ${formatBytes(part.size)}\n\nTi?p t?c / H?y`;
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
        'Thi?t b? không m? mail v?i nhi?u ?nh cùng lúc',
        'Ðã t? chia nh? ph?n g?i theo ch? d? ?n d?nh. B?n b?m g?i l?i t?ng ph?n.'
      );
      return;
    }
  }

  if (canShareFiles(files)) {
    try {
      await navigator.share(shareData);
      setStatus(true, `Ðã m? chia s? ph?n ${part.index}/${part.totalParts}`, 'Ch?n Gmail/Outlook/Mail r?i b?m g?i trong ?ng d?ng mail.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus(true, 'Ðã h?y chia s?', 'B?n v?a dóng b?ng chia s?.');
        return;
      }
      if (files.length > 1) {
        const wasSplit = forceSplitForDeviceShare();
        if (wasSplit) {
          setStatus(
            true,
            'Thi?t b? t? ch?i chia s? nhi?u ?nh cùng lúc',
            'Ðã t? chia nh? ?nh d? g?i ?n d?nh hon. B?n b?m g?i l?i t?ng ph?n.'
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
        'Thi?t b? gi?i h?n s? file dính kèm',
        'Ðã chia nh? ?nh d? g?i ?n d?nh hon. B?n b?m g?i l?i t?ng ph?n.'
      );
      return;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share(textOnlyData);
      setStatus(
        true,
        'Ðã m? ?ng d?ng chia s?',
        'Thi?t b? không h? tr? dính kèm file tr?c ti?p t? web. Hãy dính kèm ?nh th? công trong ?ng d?ng mail.'
      );
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus(true, 'Ðã h?y chia s?', 'B?n v?a dóng b?ng chia s?.');
        return;
      }
    }
  }

  const recipient = collectFormData().recipientEmail;
  if (recipient) {
    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(part.subject)}&body=${encodeURIComponent(part.body)}`;
    window.location.href = mailto;
    setStatus(true, 'Ðã m? ?ng d?ng mail', 'N?u không t? dính kèm ?nh, hãy thêm ?nh th? công trong ?ng d?ng mail.');
    return;
  }

  await copyPartText(part);
  setStatus(true, 'Thi?t b? không chia s? file tr?c ti?p du?c', 'Ðã sao chép n?i dung, b?n có th? dán vào mail và dính kèm ?nh th? công.');
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
    setStatus(true, 'Ðang l?y v? trí tài s?n...', 'H? th?ng dang d?nh v?, vui lòng ch?.');
    return;
  }

  state.isLocatingAsset = true;
  if (els.getAssetLocationBtn) els.getAssetLocationBtn.disabled = true;

  try {
    setMapStatus('Ðang ch? c?p quy?n v? trí và d?nh v? GPS...');
    setStatus(true, 'Ðang l?y v? trí tài s?n...', 'Vui lòng ch? vài giây d? GPS d?nh v?.');
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

    setMapStatus(hadValue ? 'Ðã c?p nh?t v? trí m?i' : 'Ðã l?y v? trí thành công', 'success');
    setStatus(true, 'Ðã c?p nh?t link map', 'Link v? trí dã du?c di?n vào ô Google Maps.');
  } catch (error) {
    let msg = 'Không l?y du?c v? trí. Hãy m? b?ng Chrome ho?c dán link Google Maps th? công.';
    if (error?.code === 1) {
      msg = 'B?n v?a t? ch?i quy?n v? trí. Hãy cho phép quy?n v? trí r?i b?m l?i.';
    } else if (error?.code === 2) {
      msg = 'Không xác d?nh du?c v? trí hi?n t?i. Hãy ki?m tra GPS/Internet r?i th? l?i.';
    } else if (error?.code === 3) {
      msg = 'L?y v? trí b? quá th?i gian ch?. Hãy th? l?i ? noi sóng GPS t?t hon.';
    }
    setMapStatus(msg, 'error');
    setStatus(true, 'Không l?y du?c v? trí', msg);
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

  setStatus(true, 'Ðang x? lý ?nh...', 'Ðang nén ?nh và chu?n b? ph?n g?i.');
  els.photoInput.disabled = true;
  if (els.cameraInput) els.cameraInput.disabled = true;
  if (els.addPhotosBtn) els.addPhotosBtn.disabled = true;

  try {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!incoming.length) {
      setStatus(true, 'Không có ?nh h?p l?', 'Vui lòng ch?n l?i ?nh t? thu vi?n ho?c camera.');
      return;
    }

    const compressed = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const file = incoming[i];
      setStatus(true, 'Ðang nén ?nh...', `Ðang x? lý ${i + 1}/${incoming.length}: ${shortenFileName(file.name)}`);
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
      setStatus(true, '?nh vu?t ngu?ng g?i an toàn', 'B?n nên xóa b?t ?nh r?i th? l?i.');
    } else {
      setStatus(true, 'Ðã s?n sàng g?i', state.parts.length === 1 ? '?nh dã s?n sàng g?i.' : `Ðã chu?n b? ${state.parts.length} ph?n d? g?i.`);
    }
  } catch (error) {
    console.error(error);
    setStatus(true, 'X? lý ?nh th?t b?i', error.message || 'Có l?i khi nén ?nh.');
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
  els.notes.value = 'Hình ?nh hi?n tr?ng tài s?n b?o d?m';
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
  setStatus(true, 'Ðã t?o h? so m?i', 'B?n có th? nh?p khách hàng ti?p theo ngay.');
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

  if (els.exportWordBtn) {
    els.exportWordBtn.addEventListener('click', exportSummaryWord);
  }

  [
    els.customerName,
    els.customerAddress,
    els.assetAddress,
    els.mapsLink,
    els.assessmentDate,
    els.notes,
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

