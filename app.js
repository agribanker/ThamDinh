const SAFE_LIMIT_BYTES = 17 * 1024 * 1024;
const RECOMMENDED_SPLIT_FILES = 8;

const els = {
  caseCode: document.getElementById('caseCode'),
  customerName: document.getElementById('customerName'),
  assetAddress: document.getElementById('assetAddress'),
  mapsLink: document.getElementById('mapsLink'),
  getCurrentLocationBtn: document.getElementById('getCurrentLocationBtn'),
  openMapsBtn: document.getElementById('openMapsBtn'),
  copyMapsLinkBtn: document.getElementById('copyMapsLinkBtn'),
  assessmentDate: document.getElementById('assessmentDate'),
  notes: document.getElementById('notes'),
  recipientEmail: document.getElementById('recipientEmail'),
  officerName: document.getElementById('officerName'),
  officerEmail: document.getElementById('officerEmail'),
  photoInput: document.getElementById('photoInput'),
  addPhotosBtn: document.getElementById('addPhotosBtn'),
  originalCount: document.getElementById('originalCount'),
  originalSize: document.getElementById('originalSize'),
  compressedSize: document.getElementById('compressedSize'),
  limitStatus: document.getElementById('limitStatus'),
  partCount: document.getElementById('partCount'),
  limitWarning: document.getElementById('limitWarning'),
  splitModeBtn: document.getElementById('splitModeBtn'),
  partsList: document.getElementById('partsList'),
  previewGrid: document.getElementById('previewGrid'),
  regenCodeBtn: document.getElementById('regenCodeBtn'),
  statusCard: document.getElementById('statusCard'),
  statusTitle: document.getElementById('statusTitle'),
  statusDesc: document.getElementById('statusDesc')
};

const template = document.getElementById('partTemplate');

const state = {
  originalFiles: [],
  compressedFiles: [],
  parts: [],
  splitByCountMode: false,
  addModeNextPick: false,
  currentCaseCode: '',
  previewUrls: []
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

async function compressImage(file) {
  const image = await readFileAsImage(file);
  let maxEdge = 1920;
  let quality = 0.8;
  let bestBlob = await renderCompressedBlob(image, maxEdge, quality);

  for (let i = 0; i < 6; i += 1) {
    if (bestBlob.size <= 1.4 * 1024 * 1024) {
      break;
    }

    if (i % 2 === 0) {
      maxEdge = Math.max(1080, Math.round(maxEdge * 0.9));
    } else {
      quality = Math.max(0.58, Number((quality - 0.06).toFixed(2)));
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

function splitIntoParts(items, limit, maxFilesPerPart = Number.POSITIVE_INFINITY) {
  const parts = [];
  let current = [];
  let currentSize = 0;

  items.forEach((item) => {
    if (item.size > limit) {
      if (current.length) {
        parts.push({ items: current, size: currentSize });
        current = [];
        currentSize = 0;
      }
      parts.push({ items: [item], size: item.size, oversize: true });
      return;
    }

    const willExceedSize = currentSize + item.size > limit;
    const willExceedCount = current.length >= maxFilesPerPart;

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

function updateSplitModeButton() {
  if (!els.splitModeBtn) return;

  if (!state.compressedFiles.length) {
    els.splitModeBtn.classList.add('hidden');
    return;
  }

  els.splitModeBtn.classList.remove('hidden');
  els.splitModeBtn.textContent = state.splitByCountMode
    ? 'Đang tách nhỏ theo số ảnh - Bấm để gộp lại theo ngưỡng 17MB'
    : `Đang gộp theo ngưỡng 17MB - Bấm để tách nhỏ theo ${RECOMMENDED_SPLIT_FILES} ảnh/phần`;
}

function rebuildPreparedParts() {
  const payload = state.compressedFiles.map((file) => ({ file, size: file.size }));
  const maxFiles = state.splitByCountMode ? RECOMMENDED_SPLIT_FILES : Number.POSITIVE_INFINITY;
  state.parts = buildMailParts(splitIntoParts(payload, SAFE_LIMIT_BYTES, maxFiles));
  renderPreview();
  updateSummary();
  updateSplitModeButton();
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
    setWarning(
      'Dung lượng vượt ngưỡng gửi an toàn. Hệ thống đã chia thành nhiều phần để gửi lần lượt. Vui lòng gửi lần lượt từng phần qua ứng dụng mail trên điện thoại.'
    );
    return;
  }

  if (state.splitByCountMode && state.parts.length > 1) {
    els.limitStatus.textContent = `Đã tách ${state.parts.length} phần để gửi ổn định`;
    setWarning('Bạn đang bật chế độ tách theo số ảnh để tăng độ ổn định khi mở Gmail/Outlook trên Android.');
    return;
  }

  els.limitStatus.textContent = 'Đã sẵn sàng gửi 1 phần';
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

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'preview-delete';
  del.textContent = 'Xóa';
  del.addEventListener('click', () => removeImageAt(index));

  media.appendChild(img);
  media.appendChild(del);

  const meta = document.createElement('div');
  meta.className = 'preview-meta';
  meta.innerHTML = `<strong>${escapeHtml(shortenFileName(file.name))}</strong><br>${formatBytes(file.size)}`;

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

async function sharePart(part) {
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

  if (!state.splitByCountMode && files.length > RECOMMENDED_SPLIT_FILES) {
    state.splitByCountMode = true;
    rebuildPreparedParts();
    setStatus(
      true,
      'Đã tự chuyển sang tách nhỏ theo số ảnh',
      `Thiết bị không chia sẻ tốt khi quá nhiều ảnh 1 lần. Hệ thống đã tách theo ${RECOMMENDED_SPLIT_FILES} ảnh/phần để bạn gửi lại.`
    );
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

async function fillCurrentLocationToMapsLink({ alsoOpen = false, alsoCopy = true } = {}) {
  try {
    setStatus(true, 'Đang lấy vị trí hiện tại...', 'Vui lòng chờ vài giây để GPS định vị.');
    const pos = await getCurrentPosition();
    const lat = Number(pos.coords.latitude).toFixed(6);
    const lng = Number(pos.coords.longitude).toFixed(6);
    const url = buildGoogleMapsLink(lat, lng);

    els.mapsLink.value = url;

    if (alsoCopy) {
      await copyText(url);
      setStatus(true, 'Đã lấy vị trí hiện tại', 'Đã điền và sao chép link vị trí vào clipboard.');
    } else {
      setStatus(true, 'Đã lấy vị trí hiện tại', 'Đã điền link vị trí vào ô Google Maps.');
    }

    if (alsoOpen) {
      window.open(url, '_blank', 'noopener');
    }
  } catch (error) {
    setStatus(true, 'Không lấy được vị trí', error.message || 'Vui lòng bật GPS và cấp quyền vị trí cho trình duyệt.');
  }
}

async function handleOpenMaps() {
  const value = els.mapsLink.value.trim();
  if (value) {
    window.open(value, '_blank', 'noopener');
    return;
  }

  await fillCurrentLocationToMapsLink({ alsoOpen: true, alsoCopy: true });
}

async function handleCopyMapsLink() {
  const value = els.mapsLink.value.trim();
  if (!value) {
    setStatus(true, 'Chưa có link map', 'Vui lòng lấy vị trí hiện tại hoặc nhập link trước khi sao chép.');
    return;
  }

  try {
    await copyText(value);
    setStatus(true, 'Đã sao chép link map', 'Link Google Maps đã được sao chép.');
  } catch (error) {
    setStatus(true, 'Không sao chép được', error.message || 'Trình duyệt không cho phép sao chép.');
  }
}

async function processSelectedFiles(fileList, append = false) {
  if (!fileList.length) {
    return;
  }

  setStatus(true, 'Đang xử lý ảnh...', 'Đang nén ảnh và chuẩn bị phần gửi.');
  els.photoInput.disabled = true;
  if (els.addPhotosBtn) els.addPhotosBtn.disabled = true;

  try {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!incoming.length) {
      setStatus(true, 'Không có ảnh hợp lệ', 'Vui lòng chọn lại ảnh từ thư viện.');
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
      state.splitByCountMode = false;
    }

    rebuildPreparedParts();

    const statusMsg =
      state.parts.length === 1
        ? 'Ảnh đã sẵn sàng gửi.'
        : `Đã chuẩn bị ${state.parts.length} phần để gửi.`;
    setStatus(true, 'Đã sẵn sàng gửi', statusMsg);
  } catch (error) {
    console.error(error);
    setStatus(true, 'Xử lý ảnh thất bại', error.message || 'Có lỗi khi nén ảnh.');
  } finally {
    els.photoInput.disabled = false;
    els.photoInput.value = '';
    if (els.addPhotosBtn) els.addPhotosBtn.disabled = false;
    state.addModeNextPick = false;
  }
}

function syncGeneratedCode() {
  setCaseCode();
}

function initFormDefaults() {
  const now = new Date();
  els.assessmentDate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  els.notes.value = 'Hình ảnh hiện trạng tài sản bảo đảm';
  syncGeneratedCode();
}

function wireEvents() {
  els.regenCodeBtn.addEventListener('click', syncGeneratedCode);
  els.officerName.addEventListener('input', syncGeneratedCode);

  if (els.getCurrentLocationBtn) {
    els.getCurrentLocationBtn.addEventListener('click', () => {
      fillCurrentLocationToMapsLink({ alsoOpen: false, alsoCopy: true });
    });
  }

  if (els.openMapsBtn) {
    els.openMapsBtn.addEventListener('click', handleOpenMaps);
  }

  if (els.copyMapsLinkBtn) {
    els.copyMapsLinkBtn.addEventListener('click', handleCopyMapsLink);
  }

  if (els.addPhotosBtn) {
    els.addPhotosBtn.addEventListener('click', () => {
      state.addModeNextPick = true;
      els.photoInput.click();
    });
  }

  if (els.splitModeBtn) {
    els.splitModeBtn.addEventListener('click', () => {
      state.splitByCountMode = !state.splitByCountMode;
      rebuildPreparedParts();
    });
  }

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
      const maxFiles = state.splitByCountMode ? RECOMMENDED_SPLIT_FILES : Number.POSITIVE_INFINITY;
      state.parts = buildMailParts(splitIntoParts(payload, SAFE_LIMIT_BYTES, maxFiles));
      updateSummary();
      renderParts();
    });
  });

  els.photoInput.addEventListener('change', (event) => {
    processSelectedFiles(event.target.files || [], state.addModeNextPick);
  });
}

initFormDefaults();
wireEvents();
updateSummary();
updateSplitModeButton();
renderPreview();
renderParts();
