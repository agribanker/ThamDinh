const SAFE_LIMIT_BYTES = 17 * 1024 * 1024;
const STABLE_MAX_FILES_PER_PART = 6;
const STABLE_MAX_BYTES_PER_PART = 10 * 1024 * 1024;

const els = {
  caseCode: document.getElementById('caseCode'),
  customerName: document.getElementById('customerName'),
  assetAddress: document.getElementById('assetAddress'),
  mapsLink: document.getElementById('mapsLink'),
  getAssetLocationBtn: document.getElementById('getAssetLocationBtn'),
  assessmentDate: document.getElementById('assessmentDate'),
  notes: document.getElementById('notes'),
  recipientEmail: document.getElementById('recipientEmail'),
  officerName: document.getElementById('officerName'),
  officerEmail: document.getElementById('officerEmail'),
  photoInput: document.getElementById('photoInput'),
  cameraInput: document.getElementById('cameraInput'),
  pickLibraryBtn: document.getElementById('pickLibraryBtn'),
  pickCameraBtn: document.getElementById('pickCameraBtn'),
  addPhotosBtn: document.getElementById('addPhotosBtn'),
  originalCount: document.getElementById('originalCount'),
  originalSize: document.getElementById('originalSize'),
  compressedSize: document.getElementById('compressedSize'),
  limitStatus: document.getElementById('limitStatus'),
  partCount: document.getElementById('partCount'),
  limitWarning: document.getElementById('limitWarning'),
  modeStableBtn: document.getElementById('modeStableBtn'),
  modeCompactBtn: document.getElementById('modeCompactBtn'),
  partsList: document.getElementById('partsList'),
  previewGrid: document.getElementById('previewGrid'),
  regenCodeBtn: document.getElementById('regenCodeBtn'),
  statusCard: document.getElementById('statusCard'),
  statusTitle: document.getElementById('statusTitle'),
  statusDesc: document.getElementById('statusDesc'),
  newCaseBtn: document.getElementById('newCaseBtn'),
  clearAllBtn: document.getElementById('clearAllBtn')
};

const template = document.getElementById('partTemplate');

const state = {
  originalFiles: [],
  compressedFiles: [],
  parts: [],
  currentCaseCode: '',
  previewUrls: [],
  addModeNextPick: false,
  sendMode: 'compact',
  compressPreset: 'balanced'
};

function stripAccents(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
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

function getTagFromOfficerName(name) {
  const clean = stripAccents(name);
  if (!clean) return 'USER';
  const words = clean.split(' ').filter(Boolean);
  const last = words[words.length - 1] || clean;
  return last.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'USER';
}

function generateCaseCode() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const userTag = getTagFromOfficerName(els.officerName.value);
  const randomPart = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `TD-${datePart}-${userTag}-${timePart}${randomPart}`;
}

function setCaseCode() {
  state.currentCaseCode = generateCaseCode();
  els.caseCode.value = state.currentCaseCode;
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

function collectFormData() {
  return {
    caseCode: els.caseCode.value.trim(),
    customerName: els.customerName.value.trim(),
    assetAddress: els.assetAddress.value.trim(),
    mapsLink: els.mapsLink.value.trim(),
    assessmentDate: els.assessmentDate.value,
    notes: els.notes.value.trim(),
    recipientEmail: els.recipientEmail.value.trim(),
    officerName: els.officerName.value.trim(),
    officerEmail: els.officerEmail.value.trim()
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
      reject(new Error(`Không đọc được ảnh: ${file.name}`));
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
    throw new Error('Trình duyệt không hỗ trợ canvas.');
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
          reject(new Error('Nén ảnh thất bại.'));
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
  if (state.compressPreset === 'high') {
    return {
      maxEdge: 2200,
      quality: 0.86,
      targetBytes: 2.2 * 1024 * 1024,
      minEdge: 1400,
      minQuality: 0.68
    };
  }
  if (state.compressPreset === 'strong') {
    return {
      maxEdge: 1500,
      quality: 0.7,
      targetBytes: 0.9 * 1024 * 1024,
      minEdge: 1000,
      minQuality: 0.5
    };
  }

  return {
    maxEdge: 1920,
    quality: 0.8,
    targetBytes: 1.4 * 1024 * 1024,
    minEdge: 1080,
    minQuality: 0.58
  };
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
    if (candidate.size < bestBlob.size) {
      bestBlob = candidate;
    }
  }

  return bestBlob;
}

function blobToFile(blob, originalName, index) {
  const base = originalName.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}_compressed_${String(index + 1).padStart(2, '0')}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
}

function splitIntoParts(items, limit, mode) {
  const parts = [];
  let current = [];
  let currentSize = 0;

  items.forEach((item) => {
    const partLimit = mode === 'stable' ? Math.min(limit, STABLE_MAX_BYTES_PER_PART) : limit;
    const maxFiles = mode === 'stable' ? STABLE_MAX_FILES_PER_PART : Number.POSITIVE_INFINITY;

    if (item.size > partLimit) {
      if (current.length) {
        parts.push({ items: current, size: currentSize });
        current = [];
        currentSize = 0;
      }
      parts.push({ items: [item], size: item.size, oversize: true });
      return;
    }

    const willExceedSize = currentSize + item.size > partLimit;
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

  if (current.length) {
    parts.push({ items: current, size: currentSize });
  }

  return parts;
}

function buildMailParts(parts) {
  const totalParts = parts.length;
  const form = collectFormData();

  return parts.map((part, partIndex) => {
    const indexLabel = `${partIndex + 1}/${totalParts}`;
    const subject = `[Thẩm định] ${form.caseCode} - ${form.customerName || 'Khach hang'} - P${indexLabel} - CBTD: ${
      form.officerName || 'CBTD'
    }`;

    const body = [
      `Mã hồ sơ: ${form.caseCode}`,
      '',
      `Email người nhận: ${form.recipientEmail || ''}`,
      '',
      `Khách hàng: ${form.customerName || ''}`,
      `Địa chỉ TSĐB: ${form.assetAddress || ''}`,
      `Link map: ${form.mapsLink || ''}`,
      `Ngày thẩm định: ${formatDateForDisplay(form.assessmentDate) || ''}`,
      '',
      `CBTD: ${form.officerName || ''}`,
      `Email CBTD: ${form.officerEmail || ''}`,
      '',
      `Phần: ${indexLabel}`,
      `Số ảnh: ${part.items.length}`,
      '',
      `Ghi chú: ${form.notes || 'Hình ảnh hiện trạng tài sản bảo đảm'}`
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

function updateModeButtons() {
  if (!els.modeStableBtn || !els.modeCompactBtn) return;
  els.modeStableBtn.classList.toggle('active-mode', state.sendMode === 'stable');
  els.modeCompactBtn.classList.toggle('active-mode', state.sendMode === 'compact');
}

function rebuildPreparedParts() {
  const payload = state.compressedFiles.map((file) => ({ file, size: file.size }));
  state.parts = buildMailParts(splitIntoParts(payload, SAFE_LIMIT_BYTES, state.sendMode));
  renderPreview();
  updateSummary();
  updateModeButtons();
  renderParts();
}

function updateSummary() {
  const originalBytes = state.originalFiles.reduce((sum, file) => sum + file.size, 0);
  const compressedBytes = state.compressedFiles.reduce((sum, file) => sum + file.size, 0);

  els.originalCount.textContent = String(state.originalFiles.length);
  els.originalSize.textContent = formatBytes(originalBytes);
  els.compressedSize.textContent = formatBytes(compressedBytes);
  els.partCount.textContent = String(state.parts.length);

  if (!state.compressedFiles.length) {
    els.limitStatus.textContent = 'Chưa có ảnh';
    setWarning('');
    return;
  }

  if (compressedBytes > SAFE_LIMIT_BYTES) {
    els.limitStatus.textContent = `Vượt ngưỡng, đã chia ${state.parts.length} phần`;
    setWarning('Dung lượng vượt ngưỡng gửi an toàn. Vui lòng gửi lần lượt từng phần qua ứng dụng mail trên điện thoại.');
    return;
  }

  if (state.sendMode === 'stable' && state.parts.length > 1) {
    els.limitStatus.textContent = `Đã chia ${state.parts.length} phần (ổn định)`;
    setWarning('Chế độ ổn định: chia nhỏ ảnh để mở mail dễ hơn.');
    return;
  }

  els.limitStatus.textContent = state.parts.length > 1 ? `Đã chia ${state.parts.length} phần` : 'Đã sẵn sàng gửi 1 phần';
  setWarning(state.sendMode === 'compact' ? 'Chế độ gọn: gom tối đa theo ngưỡng 17MB để giảm số mail.' : '');
}

function moveImage(from, to) {
  if (from === to || from < 0 || to < 0 || from >= state.compressedFiles.length || to >= state.compressedFiles.length) {
    return;
  }

  const [movedCompressed] = state.compressedFiles.splice(from, 1);
  state.compressedFiles.splice(to, 0, movedCompressed);

  if (from < state.originalFiles.length && to < state.originalFiles.length) {
    const [movedOriginal] = state.originalFiles.splice(from, 1);
    state.originalFiles.splice(to, 0, movedOriginal);
  }

  rebuildPreparedParts();
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
  meta.innerHTML = `<strong>${escapeHtml(shortenFileName(file.name))}</strong><br>${formatBytes(file.size)}`;

  const sortRow = document.createElement('div');
  sortRow.className = 'preview-sort';
  sortRow.innerHTML = `
    <button type="button" class="sort-btn" aria-label="Đưa lên đầu">⤒</button>
    <button type="button" class="sort-btn" aria-label="Lên">↑</button>
    <button type="button" class="sort-btn" aria-label="Xuống">↓</button>
    <button type="button" class="sort-btn" aria-label="Xuống cuối">⤓</button>
  `;

  const [topBtn, upBtn, downBtn, bottomBtn] = sortRow.querySelectorAll('button');
  topBtn.addEventListener('click', () => moveImage(index, 0));
  upBtn.addEventListener('click', () => moveImage(index, Math.max(0, index - 1)));
  downBtn.addEventListener('click', () => moveImage(index, Math.min(state.compressedFiles.length - 1, index + 1)));
  bottomBtn.addEventListener('click', () => moveImage(index, state.compressedFiles.length - 1));

  wrapper.appendChild(media);
  wrapper.appendChild(meta);
  wrapper.appendChild(sortRow);
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
    empty.textContent = 'Chưa có ảnh để chuẩn bị phần gửi.';
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
    const downloadBtn = card.querySelector('.download-btn');

    title.textContent = `Phần ${part.index}/${part.totalParts}`;
    meta.textContent = `${part.files.length} ảnh • ${formatBytes(part.size)}`;
    badge.textContent = part.oversize ? 'Cần kiểm tra' : 'Sẵn sàng';
    preview.textContent = `${part.subject}\n\n${part.body}`;

    shareBtn.addEventListener('click', () => sharePart(part));
    copyBtn.addEventListener('click', () => copyPartText(part));
    downloadBtn.addEventListener('click', () => downloadPart(part));

    els.partsList.appendChild(card);
  });
}

function removeImageAt(index) {
  if (index < 0 || index >= state.compressedFiles.length) return;

  state.compressedFiles.splice(index, 1);
  if (index < state.originalFiles.length) {
    state.originalFiles.splice(index, 1);
  }

  rebuildPreparedParts();
  setStatus(true, 'Đã xóa 1 ảnh', 'Đã cập nhật lại dung lượng và phần gửi.');
}

function canShareFiles(files) {
  if (!navigator.share || !navigator.canShare) return false;
  return navigator.canShare({ files });
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
    setStatus(true, 'Đã copy subject + body', 'Bạn có thể dán vào ứng dụng mail nếu không chia sẻ file trực tiếp được.');
  } catch (error) {
    setStatus(true, 'Không copy được', error.message || 'Trình duyệt không cho phép copy.');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTextFile(filename, text) {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}

function downloadPart(part) {
  const stamp = `${part.index}-of-${part.totalParts}`;
  const base = `${state.currentCaseCode || 'TD_PART'}_P${stamp}`;

  part.files.forEach((file, idx) => {
    const clone = new File([file], `${base}_${String(idx + 1).padStart(2, '0')}.jpg`, {
      type: file.type,
      lastModified: Date.now()
    });
    downloadBlob(clone, clone.name);
  });

  downloadTextFile(`${base}_subject_body.txt`, `${part.subject}\n\n${part.body}`);
  setStatus(true, 'Đã tạo bộ tải dự phòng', 'Nếu chia sẻ trực tiếp lỗi, hãy gửi thủ công bằng ảnh đã tải + nội dung đã copy.');
}

function buildShareConfirmMessage(part) {
  return `Bạn sắp mở mail để gửi Phần ${part.index}/${part.totalParts}\n${part.files.length} ảnh - ${formatBytes(part.size)}\n\nTiếp tục?`;
}

async function sharePart(part) {
  const ok = window.confirm(buildShareConfirmMessage(part));
  if (!ok) return;

  const files = part.files.map((file, idx) =>
    new File([file], file.name || `photo_${idx + 1}.jpg`, {
      type: file.type || 'image/jpeg',
      lastModified: Date.now()
    })
  );

  const shareData = {
    title: part.subject,
    text: `${part.subject}\n\n${part.body}`,
    files
  };

  if (canShareFiles(files)) {
    try {
      await navigator.share(shareData);
      setStatus(true, `Đã mở chia sẻ phần ${part.index}/${part.totalParts}`, 'Chọn Gmail/Outlook/Mail rồi bấm gửi trong ứng dụng mail.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus(true, 'Đã hủy chia sẻ', 'Bạn vừa đóng bảng chia sẻ.');
        return;
      }
    }
  }

  if (state.sendMode === 'compact' && files.length > STABLE_MAX_FILES_PER_PART) {
    state.sendMode = 'stable';
    rebuildPreparedParts();
    setStatus(true, 'Đã chuyển sang chế độ ổn định', 'Thiết bị đang khó mở mail khi nhiều ảnh. Hệ thống đã tách nhỏ để gửi lại.');
    return;
  }

  await copyPartText(part);
  setStatus(true, 'Thiết bị không chia sẻ file trực tiếp được', 'Đã copy nội dung. Tiếp theo bấm Tải dự phòng để gửi thủ công.');
}

function getCurrentPosition(options = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Thiết bị không hỗ trợ định vị.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function buildGoogleMapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

async function fillAssetLocation() {
  try {
    setStatus(true, 'Đang lấy vị trí tài sản...', 'Vui lòng chờ vài giây để GPS định vị.');
    const pos = await getCurrentPosition();
    const lat = Number(pos.coords.latitude).toFixed(6);
    const lng = Number(pos.coords.longitude).toFixed(6);
    const url = buildGoogleMapsLink(lat, lng);

    const hadValue = Boolean(els.mapsLink.value.trim());
    els.mapsLink.value = url;
    await copyText(url);

    setStatus(true, hadValue ? 'Đã cập nhật vị trí mới' : 'Đã lấy vị trí tài sản', 'Link Google Maps đã được điền và sao chép.');
  } catch {
    setStatus(true, 'Không lấy được vị trí', 'Không lấy được vị trí. Hãy mở bằng Chrome hoặc dán link Google Maps thủ công.');
  }
}

async function processSelectedFiles(fileList, append = false) {
  if (!fileList.length) return;

  setStatus(true, 'Đang xử lý ảnh...', 'Đang nén ảnh và chuẩn bị phần gửi.');
  els.photoInput.disabled = true;
  if (els.cameraInput) els.cameraInput.disabled = true;
  if (els.addPhotosBtn) els.addPhotosBtn.disabled = true;

  try {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!incoming.length) {
      setStatus(true, 'Không có ảnh hợp lệ', 'Vui lòng chọn lại ảnh từ thư viện hoặc camera.');
      return;
    }

    const compressed = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const file = incoming[i];
      setStatus(true, 'Đang nén ảnh...', `Đang xử lý ${i + 1}/${incoming.length}: ${shortenFileName(file.name)}`);
      const blob = await compressImage(file);
      compressed.push(blobToFile(blob, file.name, i));
    }

    if (append) {
      state.originalFiles = [...state.originalFiles, ...incoming];
      state.compressedFiles = [...state.compressedFiles, ...compressed];
    } else {
      state.originalFiles = incoming.slice();
      state.compressedFiles = compressed;
      state.sendMode = 'compact';
    }

    rebuildPreparedParts();
    const statusMsg = state.parts.length === 1 ? 'Ảnh đã sẵn sàng gửi.' : `Đã chuẩn bị ${state.parts.length} phần để gửi.`;
    setStatus(true, 'Đã sẵn sàng gửi', statusMsg);
  } catch (error) {
    console.error(error);
    setStatus(true, 'Xử lý ảnh thất bại', error.message || 'Có lỗi khi nén ảnh.');
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
  els.notes.value = 'Hình ảnh hiện trạng tài sản bảo đảm';
}

function clearImageData() {
  state.originalFiles = [];
  state.compressedFiles = [];
  state.parts = [];
  state.sendMode = 'compact';
  rebuildPreparedParts();
}

function createNewCase() {
  const keepOfficerName = els.officerName.value.trim();
  const keepOfficerEmail = els.officerEmail.value.trim();
  const keepRecipient = els.recipientEmail.value.trim();

  document.getElementById('caseForm').reset();
  resetFormDefaults();
  els.officerName.value = keepOfficerName;
  els.officerEmail.value = keepOfficerEmail;
  els.recipientEmail.value = keepRecipient;
  els.mapsLink.value = '';
  setCaseCode();
  clearImageData();
  setStatus(true, 'Đã tạo hồ sơ mới', 'Bạn có thể nhập khách hàng tiếp theo ngay.');
}

function clearAll() {
  document.getElementById('caseForm').reset();
  resetFormDefaults();
  setCaseCode();
  clearImageData();
  setStatus(true, 'Đã xóa toàn bộ', 'Dữ liệu hồ sơ và ảnh đã được làm trống.');
}

function syncGeneratedCode() {
  setCaseCode();
}

function initFormDefaults() {
  resetFormDefaults();
  setCaseCode();
}

function wireEvents() {
  els.regenCodeBtn.addEventListener('click', syncGeneratedCode);
  els.officerName.addEventListener('input', syncGeneratedCode);

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

  if (els.modeStableBtn) {
    els.modeStableBtn.addEventListener('click', () => {
      state.sendMode = 'stable';
      rebuildPreparedParts();
    });
  }

  if (els.modeCompactBtn) {
    els.modeCompactBtn.addEventListener('click', () => {
      state.sendMode = 'compact';
      rebuildPreparedParts();
    });
  }

  if (els.newCaseBtn) {
    els.newCaseBtn.addEventListener('click', createNewCase);
  }

  if (els.clearAllBtn) {
    els.clearAllBtn.addEventListener('click', () => {
      const ok = window.confirm('Bạn muốn xóa toàn bộ hồ sơ và ảnh hiện tại?');
      if (ok) clearAll();
    });
  }

  document.querySelectorAll('input[name="compressPreset"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.compressPreset = input.value;
      if (state.compressedFiles.length) {
        setStatus(true, 'Đã đổi chế độ nén', 'Chế độ mới áp dụng cho lần chọn/chụp ảnh tiếp theo.');
      }
    });
  });

  [
    els.customerName,
    els.assetAddress,
    els.mapsLink,
    els.assessmentDate,
    els.notes,
    els.recipientEmail,
    els.officerName,
    els.officerEmail
  ].forEach((input) => {
    input.addEventListener('input', () => {
      if (!state.compressedFiles.length) return;
      const payload = state.compressedFiles.map((file) => ({ file, size: file.size }));
      state.parts = buildMailParts(splitIntoParts(payload, SAFE_LIMIT_BYTES, state.sendMode));
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
updateSummary();
updateModeButtons();
renderPreview();
renderParts();
