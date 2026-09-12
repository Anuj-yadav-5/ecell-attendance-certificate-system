# E-Cell ABES - Attendance & Automated Certificate Dispatch System

> **Made by Anuj Yadav**

A full-stack, enterprise-grade attendance tracking and automated vector PDF certificate dispatch portal built for the **Entrepreneurship Cell (E-Cell)**.

---

## 🌟 Key Features

1. **🎨 E-Cell Golden-Amber & Deep Midnight Theme**
   - Sleek glassmorphism UI with high-contrast Dark & Light mode toggle.
   - Branded E-Cell ABES logo integration with official aesthetic tokens.

2. **🏢 Multi-Department Architecture**
   - **College Departments:** `CSE`, `CSE-AI/MI`, `CSE-DS`, `ECE`, `ME`
   - **E-Cell Departments:** `Digital Infrastructure and Development`, `Events`, `Marketing and Sponsership`, `Visual Media and Production`

3. **📅 Sessions & Event Management**
   - Distinguish between **Internal Meetings** (attendance only) and **Webinars / Workshops** (automated certificate issuing).
   - Date & time selectors with custom descriptions and location tagging.

4. **🖌️ Per-Event Certificate Template Studio**
   - Upload separate certificate templates for individual events or use the global master template.
   - Real-time drag-and-drop preview coordinate positioning $(X, Y)$, custom fonts (`Outfit`, `Plus Jakarta Sans`, `Cinzel`, `Playfair Display`, `Great Vibes`), font size, and color picker.

5. **⚡ Individual Dynamic PDF Generation & Email Dispatch Pipeline**
   - Automated attendee name rendering directly on the vector canvas.
   - Direct SMTP delivery of high-res PDF attachments to each present attendee's real inbox (with Absent member exclusion).
   - Live real-time dispatch progress bar with status tracking.

6. **🔄 Real-Time Centralized Database Synchronization**
   - Central backend storage (`database.json`) so **all laptops, phones, and team members see the exact same shared data in real-time**.

7. **🛡️ Admin Security Gate & Custom Dialogs**
   - Protected Admin authentication screen with password security and update mechanism.
   - Clean, in-app modal confirmation dialogs for deleting records, events, members, and logging out.

---

## 🚀 Quick Start

### 1. Installation
```bash
npm install
```

### 2. Run the Server
```bash
npm start
# or
node server.js
```
Open **`http://localhost:3000`** in your browser.

---

## 📧 Email & SMTP Setup (Google App Passwords)
To deliver real PDF certificates to recipient inboxes:
1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords).
2. Generate a 16-character App Password for **E-Cell Portal**.
3. In the sidebar, navigate to **Email & Dispatch Settings**, enter your Gmail and 16-character App Password, and click **Save & Verify Connection**.

---

## 👨‍💻 Author & Credits
Made by **Anuj Yadav**
