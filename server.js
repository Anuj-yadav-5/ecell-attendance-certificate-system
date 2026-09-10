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

app.use(express.static(__dirname));

const SETTINGS_FILE = path.join(__dirname, 'smtp_config.json');
const DB_FILE = path.join(__dirname, 'database.json');

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

function getSavedSmtpConfig() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveSmtpConfig(config) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), 'utf8');
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
    let subject = config.emailSubject || 'Certificate of Participation - {eventTitle}';
    subject = subject.replace(/\{name\}/g, recipientName || 'Member')
                     .replace(/\{eventTitle\}/g, eventTitle || 'E-Cell Event')
                     .replace(/\{certificateNumber\}/g, certificateNumber || '');

    let bodyText = customDescription || config.emailBody || `Dear {name},\n\nCongratulations on attending "{eventTitle}". Your official certificate is attached.`;
    bodyText = bodyText.replace(/\{name\}/g, recipientName || 'Member')
                       .replace(/\{eventTitle\}/g, eventTitle || 'E-Cell Event')
                       .replace(/\{certificateNumber\}/g, certificateNumber || '');

    // Formatted Clean HTML Body
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff;">
        <div style="background: #4f46e5; color: #ffffff; padding: 24px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 700;">Entrepreneurship Cell (E-Cell)</h2>
          <p style="margin: 4px 0 0; opacity: 0.9; font-size: 13.5px;">Official Certificate of Participation</p>
        </div>
        <div style="padding: 26px 24px;">
          <p style="font-size: 16px; font-weight: 700; margin-top: 0; color: #0f172a;">Dear ${recipientName || 'Member'},</p>
          <div style="font-size: 14.5px; white-space: pre-line; color: #334155; margin-bottom: 22px;">
            ${bodyText}
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 6px; padding: 14px 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 4px; font-size: 13.5px;"><strong>Event / Workshop:</strong> ${eventTitle}</p>
            <p style="margin: 0; font-size: 13.5px;"><strong>Certificate ID:</strong> <span style="font-family: monospace; color: #4f46e5; font-weight: bold;">${certificateNumber}</span></p>
          </div>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; font-size: 13.5px; color: #166534; margin-bottom: 16px;">
            📎 <strong>PDF Certificate Attached:</strong> Your high-resolution certificate has been attached to this email. You can download and share it on LinkedIn!
          </div>
        </div>
        <div style="background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          Sent by Entrepreneurship Cell (E-Cell) Portal. This is an official automated dispatch.
        </div>
      </div>
    `;

    // Process PDF attachment
    const attachments = [];
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
      : config.user;

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

app.listen(PORT, () => {
  console.log(`E-Cell Attendance & Certificate Server live on http://localhost:${PORT}`);
});
