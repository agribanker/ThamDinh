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

    async function fetchWithTimeout(url, timeoutMs = 4500) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    for (const url of candidates) {
      try {
        const res = await fetchWithTimeout(url);
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

  async function buildWordSummaryDoc(payload) {
    const html = await buildPdfSummaryHtml(payload);
    return html.replace(
      '<html lang="vi">',
      '<html lang="vi" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    );
  }

  function xmlEscape(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function textToBytes(text) {
    return new TextEncoder().encode(text);
  }

  function dataUrlToBytes(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'bin';
    return { mime, ext, bytes };
  }

  function getExtFromFile(file) {
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    if (file.type === 'image/gif') return 'gif';
    return 'jpg';
  }

  async function getImageSizeEmu(file, maxWidthEmu = 2500000, maxHeightEmu = 1800000) {
    try {
      const image = await readFileAsImage(file);
      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      if (typeof image.close === 'function') image.close();
      const widthEmu = Math.max(1, Math.round(width * 9525));
      const heightEmu = Math.max(1, Math.round(height * 9525));
      const scale = Math.min(maxWidthEmu / widthEmu, maxHeightEmu / heightEmu, 1);
      return {
        cx: Math.max(1, Math.round(widthEmu * scale)),
        cy: Math.max(1, Math.round(heightEmu * scale))
      };
    } catch {
      return { cx: maxWidthEmu, cy: Math.round((maxWidthEmu * 3) / 4) };
    }
  }

  function imageRunXml(rId, cx, cy, docPrId, name) {
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="${xmlEscape(
      name
    )}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${xmlEscape(
      name
    )}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  function makeCrc32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  }

  const CRC32_TABLE = makeCrc32Table();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concatUint8Arrays(chunks) {
    const total = chunks.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((part) => {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  }

  function writeLe16(buf, offset, value) {
    buf[offset] = value & 0xff;
    buf[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeLe32(buf, offset, value) {
    buf[offset] = value & 0xff;
    buf[offset + 1] = (value >>> 8) & 0xff;
    buf[offset + 2] = (value >>> 16) & 0xff;
    buf[offset + 3] = (value >>> 24) & 0xff;
  }

  function createZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = textToBytes(entry.name);
      const dataBytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
      const entryCrc = crc32(dataBytes);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      writeLe32(localHeader, 0, 0x04034b50);
      writeLe16(localHeader, 4, 20);
      writeLe16(localHeader, 6, 0);
      writeLe16(localHeader, 8, 0);
      writeLe16(localHeader, 10, 0);
      writeLe16(localHeader, 12, 0);
      writeLe32(localHeader, 14, entryCrc);
      writeLe32(localHeader, 18, dataBytes.length);
      writeLe32(localHeader, 22, dataBytes.length);
      writeLe16(localHeader, 26, nameBytes.length);
      writeLe16(localHeader, 28, 0);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, dataBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      writeLe32(centralHeader, 0, 0x02014b50);
      writeLe16(centralHeader, 4, 20);
      writeLe16(centralHeader, 6, 20);
      writeLe16(centralHeader, 8, 0);
      writeLe16(centralHeader, 10, 0);
      writeLe16(centralHeader, 12, 0);
      writeLe16(centralHeader, 14, 0);
      writeLe32(centralHeader, 16, entryCrc);
      writeLe32(centralHeader, 20, dataBytes.length);
      writeLe32(centralHeader, 24, dataBytes.length);
      writeLe16(centralHeader, 28, nameBytes.length);
      writeLe16(centralHeader, 30, 0);
      writeLe16(centralHeader, 32, 0);
      writeLe16(centralHeader, 34, 0);
      writeLe16(centralHeader, 36, 0);
      writeLe32(centralHeader, 38, 0);
      writeLe32(centralHeader, 42, offset);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);

      offset += localHeader.length + dataBytes.length;
    });

    const centralDir = concatUint8Arrays(centralParts);
    const localDir = concatUint8Arrays(localParts);
    const end = new Uint8Array(22);
    writeLe32(end, 0, 0x06054b50);
    writeLe16(end, 4, 0);
    writeLe16(end, 6, 0);
    writeLe16(end, 8, entries.length);
    writeLe16(end, 10, entries.length);
    writeLe32(end, 12, centralDir.length);
    writeLe32(end, 16, localDir.length);
    writeLe16(end, 20, 0);

    return concatUint8Arrays([localDir, centralDir, end]);
  }

  async function buildWordSummaryDocxBlob(payload) {
    const form = payload?.form || {};
    const files = payload?.files || [];
    const mapLink = normalizeMapLink(form.mapsLink || '');

    const lines = [
      ['Khách hàng', form.customerName || ''],
      ['Địa chỉ khách hàng', form.customerAddress || ''],
      ['Địa chỉ tài sản', form.assetAddress || ''],
      ['Ngày thẩm định', toDisplayDate(form.assessmentDate) || ''],
      ['CBTD', form.officerName || ''],
      ['Link map', mapLink || ''],
      ['Ghi chú', form.notes || '']
    ];
    const leftCellXml = lines
      .map(
        ([k, v]) =>
          `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xmlEscape(`${k}: `)}</w:t></w:r><w:r><w:t xml:space="preserve">${xmlEscape(v)}</w:t></w:r></w:p>`
      )
      .join('');
    const rightCellXml = `<w:p><w:r><w:t>${xmlEscape(mapLink || 'Chưa có link map')}</w:t></w:r></w:p>`;

    const photoNames = files.slice(0, 24);
    const photoXml = photoNames
      .map((file, idx) => `<w:p><w:r><w:t>${xmlEscape(`${idx + 1}. ${file.name || `Ảnh ${idx + 1}`}`)}</w:t></w:r></w:p>`)
      .join('');

    const extraCount = files.length > 24 ? files.length - 24 : 0;
    const extraText = extraCount > 0 ? `<w:p><w:r><w:t>${xmlEscape(`+ ${extraCount} ảnh còn lại.`)}</w:t></w:r></w:p>` : '';

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="A71D3F"/></w:rPr><w:t>Hình ảnh thực tế</w:t></w:r></w:p>
    <w:p><w:r><w:t>${xmlEscape(`Mã khách hàng: ${form.caseCode || ''}`)}</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="D9D9D9"/><w:left w:val="single" w:sz="8" w:space="0" w:color="D9D9D9"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="D9D9D9"/><w:right w:val="single" w:sz="8" w:space="0" w:color="D9D9D9"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="EFEFEF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="EFEFEF"/></w:tblBorders></w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="7600" w:type="dxa"/></w:tcPr>${leftCellXml}</w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${rightCellXml}</w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="173F36"/></w:rPr><w:t>${xmlEscape(`Ảnh đính kèm (${files.length} ảnh)`)}</w:t></w:r></w:p>
    ${photoXml}
    ${extraText}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

    const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
</Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="webp" ContentType="image/webp"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
</Types>`;

    const nowIso = new Date().toISOString();
    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Tóm tắt hồ sơ thẩm định</dc:title>
  <dc:creator>App thẩm định</dc:creator>
  <cp:lastModifiedBy>App thẩm định</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`;

    const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>App thẩm định</Application>
</Properties>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

    const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:compat/>
</w:settings>`;

    const webSettingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`;

    const fontTableXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Calibri">
    <w:panose1 w:val="020F0502020204030204"/>
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
</w:fonts>`;

    const entries = [
      { name: '[Content_Types].xml', bytes: textToBytes(contentTypesXml) },
      { name: '_rels/.rels', bytes: textToBytes(relsXml) },
      { name: 'docProps/core.xml', bytes: textToBytes(coreXml) },
      { name: 'docProps/app.xml', bytes: textToBytes(appXml) },
      { name: 'word/document.xml', bytes: textToBytes(documentXml) },
      { name: 'word/_rels/document.xml.rels', bytes: textToBytes(docRelsXml) },
      { name: 'word/styles.xml', bytes: textToBytes(stylesXml) },
      { name: 'word/settings.xml', bytes: textToBytes(settingsXml) },
      { name: 'word/webSettings.xml', bytes: textToBytes(webSettingsXml) },
      { name: 'word/fontTable.xml', bytes: textToBytes(fontTableXml) }
    ];

    const zipBytes = createZip(entries);
    return new Blob([zipBytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }

  global.PdfSummary = { buildPdfSummaryHtml, buildWordSummaryDoc, buildWordSummaryDocxBlob };
})(window);

