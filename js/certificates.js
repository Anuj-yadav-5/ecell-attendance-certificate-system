/**
 * E-Cell Certificate Rendering & PDF Engine
 * Overlays Member Name directly onto the Admin's uploaded Certificate Template
 * Supports high-res canvas rendering, PDF base64 generation, and direct downloading
 */

class ECellCertificateEngine {
  constructor() {
    this.canvasWidth = 1200;
    this.canvasHeight = 850;
    this.loadedImages = new Map();
  }

  /**
   * Render certificate to canvas
   * Overlays Member Name onto the template image
   */
  async renderToCanvas(canvas, options = {}) {
    const config = options.templateConfig || (options.eventId ? window.DataStore.getEventTemplateConfig(options.eventId) : window.DataStore.getTemplateConfig());

    const {
      name = 'Rahul Sharma',
      memberId = 'EC001',
      eventTitle = 'E-Cell Webinar / Event',
      customBg = (options.customBg !== undefined ? options.customBg : config.bgImage),
      nameX = (options.nameX !== undefined ? options.nameX : (config.nameX !== undefined ? config.nameX : 600)),
      nameY = (options.nameY !== undefined ? options.nameY : (config.nameY !== undefined ? config.nameY : 420)),
      nameFontSize = (options.nameFontSize !== undefined ? options.nameFontSize : (config.nameFontSize || 48)),
      nameColor = (options.nameColor !== undefined ? options.nameColor : (config.nameColor || '#1e293b')),
      fontFamily = (options.fontFamily !== undefined ? options.fontFamily : (config.fontFamily || 'Plus Jakarta Sans')),
      fontWeight = (options.fontWeight !== undefined ? options.fontWeight : (config.fontWeight || 'bold')),
      textAlign = (options.textAlign !== undefined ? options.textAlign : (config.textAlign || 'center'))
    } = options;

    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // 1. Draw Template Background
    if (customBg) {
      const img = await this.loadImage(customBg);
      if (img) {
        ctx.drawImage(img, 0, 0, this.canvasWidth, this.canvasHeight);
      } else {
        this.drawBlankTemplate(ctx);
      }
    } else {
      this.drawBlankTemplate(ctx);
    }

    // 2. Draw Dynamic Member Name
    ctx.save();
    ctx.fillStyle = nameColor;
    ctx.font = `${fontWeight} ${nameFontSize}px "${fontFamily}", "Outfit", sans-serif`;
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), nameX, nameY);

    // Visual placement crosshair/guide if in edit mode
    if (options.showGuide) {
      ctx.strokeStyle = 'rgba(79, 70, 229, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(nameX - 150, nameY);
      ctx.lineTo(nameX + 150, nameY);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(nameX, nameY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#4f46e5';
      ctx.fill();
    }
    ctx.restore();
  }

  drawBlankTemplate(ctx) {
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, w - 60, h - 60);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OFFICIAL CERTIFICATE OF PARTICIPATION', w / 2, 90);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('[ Upload your official E-Cell Certificate Template in Certificate Template Tab ]', w / 2, 130);

    ctx.fillStyle = '#64748b';
    ctx.font = '15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('This certificate is proudly awarded to', w / 2, 350);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('for active participation in the Entrepreneurship Cell workshop & session.', w / 2, 500);
  }

  loadImage(src) {
    return new Promise((resolve) => {
      if (this.loadedImages.has(src)) {
        resolve(this.loadedImages.get(src));
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.loadedImages.set(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /**
   * Generate PDF Base64 string for email attachment
   */
  generatePdfBase64(canvas) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      console.error('jsPDF not loaded');
      return null;
    }

    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1200, 850]
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, 1200, 850);
    return pdf.output('datauristring');
  }

  async exportToPdf(canvas, fileName = 'Certificate.pdf') {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      console.error('jsPDF not loaded');
      return false;
    }

    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1200, 850]
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, 1200, 850);
    pdf.save(fileName);
    return true;
  }
}

window.CertificateEngine = new ECellCertificateEngine();
