(function pdfSummaryModule(global) {
  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatMb(bytes) {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  }

  function toDisplayDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = String(dateStr).split('-');
    if (!year || !month || !day) return String(dateStr);
    return `${day}/${month}/${year}`;
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

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không chuyển được blob sang data URL.'));
      reader.readAsDataURL(blob);
    });
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

  async function fileToPdfDataUrl(file) {
    const image = await readFileAsImage(file);
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    const maxEdge = 1280;
    const scale = width > 0 && height > 0 ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas not supported.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    if (typeof image.close === 'function') image.close();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (output) => {
          if (!output) {
            reject(new Error('Không nén được ảnh PDF.'));
            return;
          }
          resolve(output);
        },
        'image/jpeg',
        0.72
      );
    });

    return blobToDataUrl(blob);
  }
  async function fetchQrDataUrl(text) {
    if (!text) return '';
    const candidates = [buildQrUrlMain(text), buildQrUrlFallback(text)];

    for (const url of candidates) {
      try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (!blob || blob.size === 0) continue;
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) return dataUrl;
      } catch {
        // try next
      }
    }
    return '';
  }

  async function buildPhotoThumbs(files) {
    const maxThumbs = Math.min(files.length, 24);
    const output = [];
    for (let i = 0; i < maxThumbs; i += 1) {
      const file = files[i];
      try {
        output.push({
          index: i + 1,
          name: file.name,
          sizeText: formatMb(file.size),
          url: await fileToPdfDataUrl(file)
        });
      } catch {
        output.push({
          index: i + 1,
          name: file.name,
          sizeText: formatMb(file.size),
          url: ''
        });
      }
    }
    return output;
  }

  async function buildPdfSummaryHtml(payload) {
    const form = payload?.form || {};
    const files = payload?.files || [];
    const mapLink = normalizeMapLink(form.mapsLink || '');
    const qrDataUrl = await fetchQrDataUrl(mapLink);
    const thumbs = await buildPhotoThumbs(files);

    const photoBlocks = thumbs
      .map((item) => {
        const media = item.url
          ? `<img src="${item.url}" alt="Ảnh ${item.index}" />`
          : `<div class="thumb-missing">Không đọc được ảnh</div>`;
        return `<article class="photo-item"><div class="photo-frame">${media}</div></article>`;
      })
      .join('');

    const extraText = files.length > thumbs.length ? `<p class="muted">+ ${files.length - thumbs.length} ảnh còn lại.</p>` : '';

    return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Tom tat ho so ${escapeHtml(form.caseCode || '')}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Arial, sans-serif; color: #1f1f1f; margin: 0; }
    .wrap { padding: 8px 0; }
    h1 { margin: 0; color: #a71d3f; font-size: 28px; }
    .sub { margin-top: 4px; color: #5f5f5f; font-size: 14px; }
    .block { margin-top: 14px; border: 1px solid #e3e3e3; border-radius: 12px; padding: 12px; }
    .info-wrap { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .field-list { margin: 0; padding: 0; list-style: none; font-size: 14px; flex: 1; min-width: 0; }
    .field-list li { margin: 0 0 6px; }
    .label { font-weight: 700; }
    .map-link { font-size: 12px; word-break: break-all; color: #222; }
    .qr-side { flex: 0 0 128px; display: grid; justify-items: end; }
    .qr-box { width: 128px; height: 128px; border: 1px solid #d8d8d8; border-radius: 10px; overflow: hidden; background: #fff; display: grid; place-items: center; }
    .qr-box img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .qr-empty { color: #777; font-size: 11px; text-align: center; padding: 6px; }
    h2 { margin: 0 0 8px; font-size: 20px; color: #173f36; }
    .photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .photo-item { border: 1px solid #dddddd; border-radius: 10px; overflow: hidden; background: #fff; }
    .photo-frame { aspect-ratio: 4 / 3; background: #f4f4f4; display: grid; place-items: center; }
    .photo-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb-missing { font-size: 12px; color: #666; padding: 8px; text-align: center; }
    .muted { color: #666; font-size: 12px; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Hình ảnh thực tế</h1>
    <div class="sub">Mã khách hàng: ${escapeHtml(form.caseCode || '')}</div>

    <section class="block">
      <div class="info-wrap">
        <ul class="field-list">
          <li><span class="label">Khách hàng:</span> ${escapeHtml(form.customerName || '')}</li>
          <li><span class="label">Địa chỉ khách hàng:</span> ${escapeHtml(form.customerAddress || '')}</li>
          <li><span class="label">Địa chỉ tài sản:</span> ${escapeHtml(form.assetAddress || '')}</li>
          <li><span class="label">Ngày thẩm định:</span> ${escapeHtml(toDisplayDate(form.assessmentDate) || '')}</li>
          <li><span class="label">CBTD:</span> ${escapeHtml(form.officerName || '')}</li>
          <li><span class="label">Link map:</span> <span class="map-link">${escapeHtml(mapLink || '')}</span></li>
          <li><span class="label">Ghi chú:</span> ${escapeHtml(form.notes || '')}</li>
        </ul>
        <div class="qr-side">
          <div class="qr-box">
            ${
              qrDataUrl
                ? `<img src="${qrDataUrl}" alt="QR vị trí tài sản" />`
                : `<div class="qr-empty">Chưa có link map</div>`
            }
          </div>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>Ảnh đính kèm (${files.length} ảnh)</h2>
      <div class="photos">${photoBlocks}</div>
      ${extraText}
    </section>

  </div>
</body>
</html>`;
  }

  global.PdfSummary = { buildPdfSummaryHtml };
})(window);

