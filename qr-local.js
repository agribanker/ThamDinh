(function qrLocalModule(global) {
  const LOGO_SRC = './logo_agribank_1.png';

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không tải được logo QR.'));
      image.src = src;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không chuyển được QR sang data URL.'));
      reader.readAsDataURL(blob);
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Không tạo được QR.'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function createQr(text) {
    if (typeof global.qrcode !== 'function') {
      throw new Error('Thiếu thư viện QR local.');
    }

    const qr = global.qrcode(0, 'H');
    qr.addData(String(text || ''));
    qr.make();
    return qr;
  }

  async function buildQrCanvas(text, options = {}) {
    const size = options.size || 320;
    const margin = options.margin || 18;
    const qr = createQr(text);
    const count = qr.getModuleCount();
    const moduleSize = Math.floor((size - margin * 2) / count);
    const qrSize = moduleSize * count;
    const offset = Math.floor((size - qrSize) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas QR.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#111111';

    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize);
        }
      }
    }

    try {
      const logo = await loadImage(options.logoSrc || LOGO_SRC);
      const logoBox = Math.round(size * 0.2);
      const pad = Math.round(size * 0.025);
      const radius = Math.round(size * 0.025);
      const boxX = Math.round((size - logoBox) / 2);
      const boxY = Math.round((size - logoBox) / 2);

      ctx.fillStyle = '#ffffff';
      drawRoundedRect(ctx, boxX - pad, boxY - pad, logoBox + pad * 2, logoBox + pad * 2, radius);
      ctx.fill();
      ctx.drawImage(logo, boxX, boxY, logoBox, logoBox);
    } catch {
      // Nếu logo lỗi, vẫn trả QR nội bộ không logo.
    }

    return canvas;
  }

  async function buildQrBlob(text, options = {}) {
    const canvas = await buildQrCanvas(text, options);
    return canvasToBlob(canvas);
  }

  async function buildQrDataUrl(text, options = {}) {
    const blob = await buildQrBlob(text, options);
    return blobToDataUrl(blob);
  }

  global.QrLocal = { buildQrBlob, buildQrDataUrl };
})(window);
