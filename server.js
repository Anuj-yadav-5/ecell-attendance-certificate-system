const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(__dirname));

const SETTINGS_FILE = process.env.VERCEL ? path.join('/tmp', 'smtp_config.json') : path.join(__dirname, 'smtp_config.json');
const DB_FILE = process.env.VERCEL ? path.join('/tmp', 'database.json') : path.join(__dirname, 'database.json');

function getDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading database.json:', e);
    }
  }
  return {
    adminPassword: 'admin123',
    members: [],
    events: [],
    attendance: [],
    certificates: [],
    templateConfig: {
      bgImage: null,
      nameX: 600,
      nameY: 420,
      nameFontSize: 46,
      nameColor: '#1e293b',
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: 'bold',
      textAlign: 'center'
    }
  };
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving database.json:', e);
    return false;
  }
}

// 0. GET FULL SHARED DATABASE
app.get('/api/data', (req, res) => {
  const db = getDatabase();
  res.json({ success: true, data: db });
});

// 0. POST / UPDATE SHARED DATABASE
app.post('/api/data', (req, res) => {
  try {
    const current = getDatabase();
    const updated = {
      ...current,
      ...req.body
    };
    saveDatabase(updated);
    res.json({ success: true, message: 'Database synchronized.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

let memorySmtpConfig = null;

function getSavedSmtpConfig() {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      provider: process.env.SMTP_PROVIDER || 'gmail',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      senderName: process.env.SMTP_SENDER_NAME || 'E-Cell Official',
      senderEmail: process.env.SMTP_SENDER_EMAIL || process.env.SMTP_USER,
      emailSubject: process.env.SMTP_EMAIL_SUBJECT || 'Official Certificate of Participation - {eventTitle}',
      emailBody: process.env.SMTP_EMAIL_BODY || 'Dear {name},\n\nCongratulations on attending "{eventTitle}"!\n\nYour official Certificate of Participation from the Entrepreneurship Cell is attached as a PDF.\n\nCertificate ID: {certificateNumber}\n\nWarm regards,\nEntrepreneurship Cell (E-Cell)'
    };
  }
  if (memorySmtpConfig && memorySmtpConfig.user && memorySmtpConfig.pass) {
    return memorySmtpConfig;
  }
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (cfg && cfg.user) {
        memorySmtpConfig = cfg;
        return cfg;
      }
    } catch (e) {}
  }
  const db = getDatabase();
  if (db && db.smtpConfig && db.smtpConfig.user && db.smtpConfig.pass) {
    memorySmtpConfig = db.smtpConfig;
    return db.smtpConfig;
  }
  return null;
}

function saveSmtpConfig(config) {
  memorySmtpConfig = config;
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {}
  try {
    const db = getDatabase();
    db.smtpConfig = config;
    saveDatabase(db);
  } catch (e) {}
}

// Create Nodemailer Transporter
function createTransporter(config) {
  if (!config || !config.user || !config.pass) {
    throw new Error('SMTP credentials not configured. Please enter your Gmail / E-Cell email and App Password in "Email & Dispatch Settings" to send real emails to member inboxes.');
  }

  // If using Gmail / Google Workspace
  if (config.provider === 'gmail' || (config.host && config.host.includes('gmail.com'))) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.user.trim(),
        pass: config.pass.replace(/\s+/g, '').trim() // Remove spaces from 16-char Google App Password
      }
    });
  }

  // If custom SMTP (College Server / Outlook / SendGrid)
  return nodemailer.createTransport({
    host: config.host || 'smtp.gmail.com',
    port: parseInt(config.port) || 587,
    secure: parseInt(config.port) === 465,
    auth: {
      user: config.user.trim(),
      pass: config.pass.trim()
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

// 1. GET SMTP CONFIG
app.get('/api/smtp-config', (req, res) => {
  const cfg = getSavedSmtpConfig() || {
    provider: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    user: '',
    pass: '',
    senderName: 'E-Cell Official',
    senderEmail: '',
    emailSubject: 'Official Certificate of Participation - {eventTitle}',
    emailBody: 'Dear {name},\n\nCongratulations on attending "{eventTitle}"!\n\nYour official Certificate of Participation from the Entrepreneurship Cell is attached as a PDF.\n\nCertificate ID: {certificateNumber}\n\nWarm regards,\nEntrepreneurship Cell (E-Cell)'
  };
  
  const isConfigured = !!(cfg.user && cfg.pass);
  const safeConfig = { ...cfg, isConfigured, pass: cfg.pass ? '••••••••••••••••' : '' };
  res.json({ success: true, config: safeConfig, isConfigured });
});

// 2. SAVE & VERIFY SMTP
app.post('/api/smtp-config', async (req, res) => {
  try {
    const { provider, host, port, user, pass, senderName, senderEmail, emailSubject, emailBody } = req.body;
    
    const existing = getSavedSmtpConfig() || {};
    const updated = {
      provider: provider || existing.provider || 'gmail',
      host: host || existing.host || 'smtp.gmail.com',
      port: parseInt(port) || existing.port || 587,
      user: user !== undefined ? user.trim() : (existing.user || ''),
      pass: (pass && pass !== '••••••••••••••••') ? pass.trim() : (existing.pass || ''),
      senderName: senderName || existing.senderName || 'E-Cell Official',
      senderEmail: senderEmail || existing.senderEmail || user || '',
      emailSubject: emailSubject || existing.emailSubject || 'Certificate of Participation - {eventTitle}',
      emailBody: emailBody || existing.emailBody || 'Dear {name},\n\nAttached is your certificate.'
    };

    if (!updated.user || !updated.pass) {
      saveSmtpConfig(updated);
      return res.status(400).json({ 
        success: false, 
        error: 'Please provide both your Email Address and Password / App Password to enable real email sending.' 
      });
    }

    // Verify SMTP connection live
    const transporter = createTransporter(updated);
    await transporter.verify();

    saveSmtpConfig(updated);
    res.json({ 
      success: true, 
      message: `Verified successfully! Connected to ${updated.user}. Real emails will now be delivered to member inboxes.` 
    });

  } catch (error) {
    console.error('SMTP verification error:', error);
    let errorMsg = error.message;
    if (error.message.includes('Invalid login') || error.message.includes('Username and Password not accepted') || error.message.includes('535')) {
      errorMsg = 'Authentication failed. For Gmail, you must use a 16-character "Google App Password" (not your normal Gmail password). Go to myaccount.google.com/apppasswords to create one in 30 seconds.';
    }
    res.status(400).json({ success: false, error: errorMsg });
  }
});

// 3. SEND REAL CERTIFICATE EMAIL WITH PDF ATTACHMENT
app.post('/api/send-certificate-email', async (req, res) => {
  try {
    const { recipientEmail, recipientName, eventTitle, certificateNumber, pdfBase64, customDescription } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email is required.' });
    }

    const config = getSavedSmtpConfig();
    if (!config || !config.user || !config.pass) {
      return res.status(400).json({
        success: false,
        error: 'SMTP Email not configured yet. Please open "Email & Dispatch Settings" in the sidebar and enter your sender email and App Password to deliver real emails to member inboxes.'
      });
    }

    const transporter = createTransporter(config);

    // Dynamic placeholders replacement
    let subject = config.emailSubject || 'Official Certificate of Participation - {eventTitle}';
    subject = subject.replace(/\{name\}/g, recipientName || 'Member')
                     .replace(/\{eventTitle\}/g, eventTitle || 'E-Cell Event')
                     .replace(/\{certificateNumber\}/g, certificateNumber || '');

    let bodyText = customDescription || config.emailBody || `Congratulations on attending "{eventTitle}"!\n\nYour official Certificate of Participation from E-Cell ABES (Entrepreneurship Cell) is attached as a PDF.\n\nCertificate ID: {certificateNumber}`;
    bodyText = bodyText.replace(/\{name\}/g, recipientName || 'Member')
                       .replace(/\{eventTitle\}/g, eventTitle || 'E-Cell Event')
                       .replace(/\{certificateNumber\}/g, certificateNumber || '');

    // Avoid duplicate greeting if bodyText already starts with Dear
    const greetingHtml = bodyText.toLowerCase().trim().startsWith('dear ') 
      ? '' 
      : `<p style="font-size: 16px; font-weight: 700; margin-top: 0; color: #0f172a;">Dear ${recipientName || 'Member'},</p>`;

    // Formatted Clean Branded HTML Body
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        
        <!-- BRANDED HEADER -->
        <div style="background: linear-gradient(135deg, #090c15 0%, #161c2e 100%); color: #ffffff; padding: 26px 20px; text-align: center; border-bottom: 3px solid #f59e0b;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto 10px;">
            <tr>
              <td style="width: 60px; height: 60px; background: #000000; border: 2px solid #fbbf24; border-radius: 14px; padding: 4px; text-align: center; vertical-align: middle;">
                <img src="cid:ecell_logo" alt="E-Cell ABES Logo" width="52" height="52" style="display: block; margin: 0 auto; object-fit: contain;" />
              </td>
            </tr>
          </table>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #fbbf24; letter-spacing: 0.5px;">E-CELL ABES</h1>
          <p style="margin: 3px 0 0; color: #94a3b8; font-size: 12.5px; font-weight: 500;">Entrepreneurship Cell &bull; ABES Engineering College</p>
          <div style="display: inline-block; margin-top: 10px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 20px; padding: 4px 16px; font-size: 12px; color: #fde68a; font-weight: 700;">
            Official Certificate of Participation
          </div>
        </div>

        <!-- BODY CONTENT -->
        <div style="padding: 28px 24px;">
          ${greetingHtml}
          <div style="font-size: 14.5px; white-space: pre-line; color: #334155; line-height: 1.65; margin-bottom: 22px;">
            ${bodyText}
          </div>

          <!-- EVENT & CERTIFICATE INFO CARD -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
            <p style="margin: 0 0 5px; font-size: 13.5px; color: #334155;"><strong>Event / Session:</strong> <span style="color: #0f172a; font-weight: 600;">${eventTitle}</span></p>
            <p style="margin: 0; font-size: 13.5px; color: #334155;"><strong>Certificate ID:</strong> <span style="font-family: monospace; color: #d97706; font-weight: 800; font-size: 14.5px;">${certificateNumber}</span></p>
          </div>

          <!-- PDF ATTACHMENT BADGE -->
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #166534; margin-bottom: 20px;">
            📎 <strong>Official PDF Attached:</strong> Your high-resolution vector certificate has been attached to this email. You can download and share it on LinkedIn!
          </div>

          <!-- SIGNATURE -->
          <div style="margin-top: 22px; padding-top: 14px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #64748b;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">Warm regards,</p>
            <p style="margin: 2px 0 0; font-weight: 700; color: #b45309; font-size: 14px;">Team E-Cell ABES</p>
            <p style="margin: 0; font-size: 11.5px; color: #94a3b8;">Entrepreneurship Cell, ABES EC</p>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="background: #f8fafc; padding: 12px 20px; text-align: center; font-size: 11.5px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          Sent by <strong>E-Cell ABES</strong> Automated Dispatch System. This is an official automated communication.
        </div>
      </div>
    `;

    // Process Attachments (Logo + PDF)
    const attachments = [];

    // Add Embedded E-Cell Logo
    const logoPath = path.join(__dirname, 'assets', 'logo.png');
    if (fs.existsSync(logoPath)) {
      attachments.push({
        filename: 'ecell_logo.png',
        path: logoPath,
        cid: 'ecell_logo'
      });
    }

    // Process PDF attachment
    if (pdfBase64) {
      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;filename=[^;]+;base64,/, '').replace(/^data:application\/pdf;base64,/, '');
      attachments.push({
        filename: `Certificate_${(recipientName || 'Member').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        content: cleanBase64,
        encoding: 'base64',
        contentType: 'application/pdf'
      });
    }

    const sender = config.senderName 
      ? `"${config.senderName}" <${config.user}>`
      : `"E-Cell ABES" <${config.user}>`;

    const mailOptions = {
      from: sender,
      to: recipientEmail.trim(),
      subject: subject,
      text: bodyText,
      html: htmlContent,
      attachments: attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Real email successfully dispatched to ${recipientEmail}: ${info.messageId}`);

    res.json({
      success: true,
      messageId: info.messageId,
      recipient: recipientEmail,
      message: `Delivered to ${recipientEmail}`
    });

  } catch (err) {
    console.error('Email dispatch error:', err);
    let errorMsg = err.message;
    if (err.message.includes('Invalid login') || err.message.includes('535')) {
      errorMsg = 'Authentication failed. Please verify your Google App Password in "Email & Dispatch Settings".';
    }
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Fallback all routes to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`E-Cell Attendance & Certificate Server live on http://localhost:${PORT}`);
  });
}

module.exports = app;
