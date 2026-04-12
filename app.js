const SAFE_LIMIT_BYTES = 17 * 1024 * 1024;
const PREVIEW_LIMIT = 8;

const els = {
  caseCode: document.getElementById('caseCode'),
  customerName: document.getElementById('customerName'),
  assetAddress: document.getElementById('assetAddress'),
  mapsLink: document.getElementById('mapsLink'),
  assessmentDate: document.getElementById('assessmentDate'),
  notes: document.getElementById('notes'),
  recipientEmail: document.getElementById('recipientEmail'),
  officerName: document.getElementById('officerName'),
  officerEmail: document.getElementById('officerEmail'),
  photoInput: document.getElementById('photoInput'),
  originalCount: document.getElementById('originalCount'),
  originalSize: document.getElementById('originalSize'),
  compressedSize: document.getElementById('compressedSize'),
  limitStatus: document.getElementById('limitStatus'),
  partCount: document.getElementById('partCount'),
  limitWarning: document.getElementById('limitWarning'),
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

function makePreviewItem(file, sizeLabel) {
  const wrapper = document.createElement('article');
  wrapper.className = 'preview-item';

  const img = document.createElement('img');
  img.alt = file.name;
  img.loading = 'lazy';
  const previewUrl = URL.createObjectURL(file);
  state.previewUrls.push(previewUrl);
  img.src = previewUrl;

  const meta = document.createElement('div');
  meta.className = 'preview-meta';
  meta.innerHTML = `<strong>${escapeHtml(shortenFileName(file.name))}</strong><br>${sizeLabel}`;

  wrapper.appendChild(img);
  wrapper.appendChild(meta);
  return wrapper;
}

function shortenFileName(name) {
  if (name.length <= 24) return name;
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  return `${name.slice(0, 18)}...${ext}`;
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readFileAsImage(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
      return fallbackReadFileAsImage(file);
    });
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

async function fileToCompressedBlob(file) {
  const image = await readFileAsImage(file);
  const maxEdges = [2000, 1800, 1600, 1400, 1200];
  const qualities = [0.8, 0.78, 0.75, 0.72, 0.68];

  for (let i = 0; i < maxEdges.length; i += 1) {
    const maxEdge = maxEdges[i];
    const quality = qualities[i];
    const blob = await renderCompressedBlob(image, maxEdge, quality);
    if (blob.size <= SAFE_LIMIT_BYTES / 2 || i === maxEdges.length - 1) {
      return blob;
    }
  }

  return renderCompressedBlob(image, 1200, 0.68);
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

function blobToFile(blob, originalName, index) {
  const base = originalName.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}_compressed_${String(index + 1).padStart(2, '0')}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
}

function splitIntoParts(items, limit) {
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

    if (currentSize + item.size > limit && current.length) {
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
      preview: body,
      oversize: Boolean(part.oversize)
    };
  });
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

function updateSummary() {
  const originalBytes = state.originalFiles.reduce((sum, file) => sum + file.size, 0);
  const compressedBytes = state.compressedFiles.reduce((sum, file) => sum + file.size, 0);

  els.originalCount.textContent = String(state.originalFiles.length);
  els.originalSize.textContent = formatBytes(originalBytes);
  els.compressedSize.textContent = formatBytes(compressedBytes);
  els.partCount.textContent = String(state.parts.length);

  if (!state.originalFiles.length) {
    els.limitStatus.textContent = 'Chưa có ảnh';
    setWarning('');
    return;
  }

  if (compressedBytes <= SAFE_LIMIT_BYTES) {
    els.limitStatus.textContent = 'Đã sẵn sàng gửi 1 phần';
    setWarning('');
    return;
  }

  els.limitStatus.textContent = `Vượt ngưỡng, đã chia ${state.parts.length} phần`;
  setWarning(
    'Dung lượng vượt ngưỡng gửi an toàn. Hệ thống đã chia thành nhiều phần để gửi lần lượt. Vui lòng gửi lần lượt từng phần qua ứng dụng mail trên điện thoại.'
  );
}

function renderPreview() {
  state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls = [];
  els.previewGrid.innerHTML = '';
  const previews = state.compressedFiles.slice(0, PREVIEW_LIMIT);

  previews.forEach((file) => {
    const item = makePreviewItem(file, formatBytes(file.size));
    els.previewGrid.appendChild(item);
  });

  if (state.compressedFiles.length > PREVIEW_LIMIT) {
    const more = document.createElement('div');
    more.className = 'preview-item';
    more.style.display = 'grid';
    more.style.placeItems = 'center';
    more.style.minHeight = '140px';
    more.innerHTML = `<div class="preview-meta">+ ${state.compressedFiles.length - PREVIEW_LIMIT} ảnh nữa</div>`;
    els.previewGrid.appendChild(more);
  }
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

    if (!canShareFiles()) {
      shareBtn.textContent = 'Mở chia sẻ';
    }

    els.partsList.appendChild(card);
  });
}

function canShareFiles() {
  return Boolean(navigator.share && navigator.canShare);
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
    setStatus(true, 'Đã copy subject + body', 'Có thể dán vào ứng dụng mail nếu không dùng chia sẻ file trực tiếp.');
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
  setStatus(
    true,
    'Đã tạo bộ tải dự phòng',
    'Nếu máy không hỗ trợ chia sẻ file trực tiếp, hãy tải ảnh phần này và copy subject/body để gửi thủ công.'
  );
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
    text: `${part.subject}\n\n${part.body}`
  };

  if (canShareFiles() && navigator.canShare({ files })) {
    shareData.files = files;
    try {
      await navigator.share(shareData);
      setStatus(true, `Đã mở chia sẻ phần ${part.index}/${part.totalParts}`, 'Người dùng tự chọn Gmail, Outlook hoặc Mail và bấm gửi.');
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setStatus(true, 'Đã hủy chia sẻ', 'Người dùng vừa đóng bảng chia sẻ.');
        return;
      }
      setStatus(true, 'Chia sẻ file không khả dụng', 'Đang chuyển sang chế độ dự phòng.');
    }
  }

  await copyPartText(part);
  setStatus(
    true,
    'Đã copy nội dung phần gửi',
    'Nếu máy không hỗ trợ chia sẻ file trực tiếp, hãy dùng nút Tải dự phòng để tải ảnh và file nội dung.'
  );
}

async function processSelectedFiles(fileList) {
  if (!fileList.length) {
    state.originalFiles = [];
    state.compressedFiles = [];
    state.parts = [];
    renderPreview();
    renderParts();
    updateSummary();
    return;
  }

  setStatus(true, 'Đang xử lý ảnh...', 'Đang nén ảnh và chuẩn bị phần gửi.');
  els.photoInput.disabled = true;

  try {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    state.originalFiles = files;

    const compressed = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setStatus(
        true,
        'Đang nén ảnh...',
        `Đang xử lý ${i + 1}/${files.length}: ${shortenFileName(file.name)}`
      );
      const blob = await fileToCompressedBlob(file);
      compressed.push(blobToFile(blob, file.name, i));
    }

    state.compressedFiles = compressed;
    const payload = compressed.map((file) => ({ file, size: file.size }));
    state.parts = buildMailParts(splitIntoParts(payload, SAFE_LIMIT_BYTES));

    renderPreview();
    updateSummary();
    renderParts();

    if (state.parts.length) {
      setStatus(
        true,
        'Đã sẵn sàng gửi',
        state.parts.length === 1
          ? 'Ảnh sau nén nằm trong ngưỡng an toàn. Có thể bấm gửi phần 1.'
          : `Dung lượng vượt ngưỡng gửi an toàn. Hệ thống đã chia thành ${state.parts.length} phần để gửi lần lượt.`
      );
    } else {
      setStatus(false);
    }
  } catch (error) {
    console.error(error);
    setStatus(true, 'Xử lý ảnh thất bại', error.message || 'Có lỗi khi nén ảnh.');
  } finally {
    els.photoInput.disabled = false;
    els.photoInput.value = '';
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

  els.officerName.addEventListener('input', () => {
    syncGeneratedCode();
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
      if (input === els.officerName) {
        syncGeneratedCode();
      }
      if (state.parts.length) {
        state.parts = buildMailParts(
          splitIntoParts(
            state.compressedFiles.map((file) => ({ file, size: file.size })),
            SAFE_LIMIT_BYTES
          )
        );
        renderParts();
      }
    });
  });

  els.photoInput.addEventListener('change', (event) => {
    processSelectedFiles(event.target.files || []);
  });
}

initFormDefaults();
wireEvents();
updateSummary();
renderPreview();
renderParts();
