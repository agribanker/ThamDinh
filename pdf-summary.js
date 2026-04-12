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
    if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps)/i.test(value)) {
      return `https://${value}`;
    }
    return value;
  }

  function buildQrImageUrl(text) {
    if (!text) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&format=png&margin=8&data=${encodeURIComponent(text)}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Không đọc được ảnh: ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function buildPhotoThumbs(files) {
    const maxThumbs = Math.min(files.length, 24);
    const result = [];
    for (let i = 0; i < maxThumbs; i += 1) {
      const file = files[i];
      try {
        const url = await fileToDataUrl(file);
        result.push({
          index: i + 1,
          name: file.name,
          sizeText: formatMb(file.size),
          url
        });
      } catch {
        result.push({
          index: i + 1,
          name: file.name,
          sizeText: formatMb(file.size),
          url: ''
        });
      }
    }
    return result;
  }

  async function buildPdfSummaryHtml(payload) {
    const form = payload?.form || {};
    const files = payload?.files || [];
    const totalBytes = Number(payload?.totalBytes || 0);

    const mapLink = normalizeMapLink(form.mapsLink || '');
    const qrImageUrl = buildQrImageUrl(mapLink);

    const tableRows = files
      .map(
        (file, idx) =>
          `<tr><td>${idx + 1}</td><td>${escapeHtml(file.name)}</td><td>${formatMb(file.size)}</td></tr>`
      )
      .join('');

    const thumbs = await buildPhotoThumbs(files);
    const photoBlocks = thumbs
      .map((item) => {
        const imgTag = item.url
          ? `<img src="${item.url}" alt="${escapeHtml(item.name)}" />`
          : `<div class="thumb-missing">Không đọc được ảnh</div>`;
        return `<article class="photo-item">
  <div class="photo-frame">${imgTag}</div>
  <div class="photo-caption">${item.index}. ${escapeHtml(item.name)}</div>
  <div class="photo-size">${item.sizeText}</div>
</article>`;
      })
      .join('');

    const extraText =
      files.length > thumbs.length ? `<p class="muted">+ ${files.length - thumbs.length} ảnh còn lại ở bảng danh sách.</p>` : '';

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
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 14px; }
    .full { grid-column: 1 / -1; }
    .label { font-weight: 700; }
    h2 { margin: 0 0 8px; font-size: 20px; color: #173f36; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { border: 1px solid #d8d8d8; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f5f3f3; }
    .photos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .photo-item { border: 1px solid #dddddd; border-radius: 10px; overflow: hidden; background: #fff; }
    .photo-frame { aspect-ratio: 4 / 3; background: #f4f4f4; display: grid; place-items: center; }
    .photo-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb-missing { font-size: 12px; color: #666; padding: 8px; text-align: center; }
    .photo-caption { font-size: 11px; padding: 6px 6px 0; word-break: break-word; }
    .photo-size { font-size: 11px; color: #666; padding: 2px 6px 8px; }
    .muted { color: #666; font-size: 12px; margin-top: 6px; }
    .map-wrap { display: grid; grid-template-columns: 130px 1fr; gap: 12px; align-items: center; }
    .qr-box { width: 120px; height: 120px; border: 1px solid #d8d8d8; border-radius: 10px; overflow: hidden; background: #fff; display: grid; place-items: center; }
    .qr-box img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .qr-empty { color: #777; font-size: 11px; text-align: center; padding: 6px; }
    .map-link { font-size: 12px; word-break: break-all; color: #222; }
    @media print {
      .page-break { break-before: page; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Biên bản tóm tắt hồ sơ thẩm định</h1>
    <div class="sub">Mã hồ sơ: ${escapeHtml(form.caseCode || '')}</div>

    <section class="block">
      <div class="grid">
        <div><span class="label">Khách hàng:</span> ${escapeHtml(form.customerName || '')}</div>
        <div><span class="label">Ngày thẩm định:</span> ${escapeHtml(toDisplayDate(form.assessmentDate) || '')}</div>
        <div><span class="label">Địa chỉ tài sản:</span> ${escapeHtml(form.assetAddress || '')}</div>
        <div><span class="label">CBTD:</span> ${escapeHtml(form.officerName || '')}</div>
        <div><span class="label">Email người nhận:</span> ${escapeHtml(form.recipientEmail || '')}</div>
        <div><span class="label">Email CBTD:</span> ${escapeHtml(form.officerEmail || '')}</div>
        <div class="full"><span class="label">Link map:</span> ${escapeHtml(mapLink || '')}</div>
        <div class="full"><span class="label">Ghi chú:</span> ${escapeHtml(form.notes || '')}</div>
      </div>
    </section>

    <section class="block">
      <h2>QR vị trí tài sản</h2>
      <div class="map-wrap">
        <div class="qr-box">
          ${
            qrImageUrl
              ? `<img src="${qrImageUrl}" alt="QR vị trí tài sản" />`
              : `<div class="qr-empty">Chưa có link map</div>`
          }
        </div>
        <div>
          <div class="label">Nội dung QR</div>
          <div class="map-link">${escapeHtml(mapLink || 'Chưa có link vị trí')}</div>
          <p class="muted">QR lấy trực tiếp từ ô Link Google Maps, hỗ trợ cả link rút gọn từ Google Maps/Zalo.</p>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>Ảnh đính kèm (${files.length} ảnh, ${formatMb(totalBytes)})</h2>
      <div class="photos">${photoBlocks}</div>
      ${extraText}
    </section>

    <section class="block page-break">
      <h2>Danh sách ảnh chi tiết</h2>
      <table>
        <thead><tr><th>#</th><th>Tên ảnh</th><th>Dung lượng</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
  }

  global.PdfSummary = {
    buildPdfSummaryHtml
  };
})(window);
