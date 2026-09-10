/**
 * E-Cell Attendance & Certificate System
 * Data Store & Central Server Sync Management
 */

const STORAGE_KEYS = {
  MEMBERS: 'ecell_members_v3',
  EVENTS: 'ecell_events_v3',
  ATTENDANCE: 'ecell_attendance_v3',
  CERTIFICATES: 'ecell_certificates_v3',
  TEMPLATE_CONFIG: 'ecell_template_config_v3',
  ADMIN_PASSWORD: 'ecell_admin_pwd_v1'
};

const DEFAULT_TEMPLATE_CONFIG = {
  bgImage: null, // Admin uploaded image (base64)
  nameX: 600,
  nameY: 420,
  nameFontSize: 46,
  nameColor: '#1e293b',
  fontFamily: 'Plus Jakarta Sans',
  fontWeight: 'bold',
  textAlign: 'center'
};

class ECellDataStore {
  constructor() {
    this.init();
    this.syncWithServer();
  }

  init() {
    if (!localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD)) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, 'admin123');
    }
    if (!localStorage.getItem(STORAGE_KEYS.MEMBERS)) {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EVENTS)) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ATTENDANCE)) {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CERTIFICATES)) {
      localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TEMPLATE_CONFIG)) {
      localStorage.setItem(STORAGE_KEYS.TEMPLATE_CONFIG, JSON.stringify(DEFAULT_TEMPLATE_CONFIG));
    }
  }

  async syncWithServer() {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;

      const serverData = json.data;
      const localMembers = this.getMembers();
      const localEvents = this.getEvents();
      const localAttendance = this.getAttendance();
      const localCerts = this.getCertificates();

      const serverHasData = (serverData.members && serverData.members.length > 0) ||
                            (serverData.events && serverData.events.length > 0) ||
                            (serverData.attendance && serverData.attendance.length > 0) ||
                            (serverData.certificates && serverData.certificates.length > 0);

      const localHasData = localMembers.length > 0 || localEvents.length > 0 || localAttendance.length > 0 || localCerts.length > 0;

      // If server is fresh/empty but local has data, upload local data to server
      if (!serverHasData && localHasData) {
        await this.pushToServer();
        return;
      }

      // Otherwise, update local storage with server data
      if (serverData.adminPassword) {
        localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, serverData.adminPassword);
      }
      if (Array.isArray(serverData.members)) {
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(serverData.members));
      }
      if (Array.isArray(serverData.events)) {
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(serverData.events));
      }
      if (Array.isArray(serverData.attendance)) {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(serverData.attendance));
      }
      if (Array.isArray(serverData.certificates)) {
        localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(serverData.certificates));
      }
      if (serverData.templateConfig) {
        localStorage.setItem(STORAGE_KEYS.TEMPLATE_CONFIG, JSON.stringify(serverData.templateConfig));
      }

      window.dispatchEvent(new CustomEvent('ecell_data_synced'));
    } catch (e) {
      console.warn('Server sync skipped/offline:', e);
    }
  }

  async pushToServer(partial = null) {
    try {
      const payload = partial || {
        adminPassword: this.getAdminPassword(),
        members: this.getMembers(),
        events: this.getEvents(),
        attendance: this.getAttendance(),
        certificates: this.getCertificates(),
        templateConfig: this.getTemplateConfig()
      };

      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Failed to push update to server:', e);
    }
  }

  getAdminPassword() {
    return localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD) || 'admin123';
  }

  setAdminPassword(newPassword) {
    localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, newPassword);
    this.pushToServer({ adminPassword: newPassword });
  }

  getTemplateConfig() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPLATE_CONFIG) || JSON.stringify(DEFAULT_TEMPLATE_CONFIG));
  }

  saveTemplateConfig(config) {
    localStorage.setItem(STORAGE_KEYS.TEMPLATE_CONFIG, JSON.stringify(config));
    this.pushToServer({ templateConfig: config });
  }

  getEventTemplateConfig(eventId) {
    if (!eventId || eventId === 'global') {
      return this.getTemplateConfig();
    }
    const event = this.getEventById(eventId);
    if (event && event.certificateTemplate) {
      return { ...DEFAULT_TEMPLATE_CONFIG, ...event.certificateTemplate };
    }
    return this.getTemplateConfig();
  }

  saveEventTemplateConfig(eventId, config) {
    if (!eventId || eventId === 'global') {
      this.saveTemplateConfig(config);
      return;
    }
    const events = this.getEvents();
    const idx = events.findIndex(e => e.id === eventId);
    if (idx !== -1) {
      events[idx].certificateTemplate = config;
      this.saveEvents(events);
    }
  }

  // --- MEMBERS ---
  getMembers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMBERS) || '[]');
  }

  saveMembers(members) {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
    this.pushToServer({ members });
  }

  addMember(member) {
    const members = this.getMembers();
    if (!member.id) member.id = 'm_' + Date.now();
    if (!member.memberId) {
      const nextNum = members.length + 1;
      member.memberId = `EC${String(nextNum).padStart(3, '0')}`;
    }
    if (!member.avatar) {
      member.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(member.name)}`;
    }
    members.push(member);
    this.saveMembers(members);
    return member;
  }

  deleteMember(id) {
    let members = this.getMembers();
    members = members.filter(m => m.id !== id);
    this.saveMembers(members);
  }

  // --- EVENTS ---
  getEvents() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENTS) || '[]');
  }

  saveEvents(events) {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    this.pushToServer({ events });
  }

  addEvent(event) {
    const events = this.getEvents();
    if (!event.id) event.id = 'evt_' + Date.now();
    events.unshift(event);
    this.saveEvents(events);
    return event;
  }

  getEventById(id) {
    return this.getEvents().find(e => e.id === id);
  }

  deleteEvent(id) {
    let events = this.getEvents();
    events = events.filter(e => e.id !== id);
    this.saveEvents(events);
  }

  // --- ATTENDANCE ---
  getAttendance() {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
    // Automatic deduplication: keep single newest record per (eventId + date + memberId)
    const seen = new Set();
    const clean = [];
    raw.forEach(r => {
      const key = `${r.eventId}_${r.date}_${r.memberId}`;
      if (!seen.has(key)) {
        seen.add(key);
        clean.push(r);
      }
    });
    return clean;
  }

  saveAttendance(attendance) {
    // Ensure only deduplicated records are saved
    const seen = new Set();
    const clean = [];
    (attendance || []).forEach(r => {
      const key = `${r.eventId}_${r.date}_${r.memberId}`;
      if (!seen.has(key)) {
        seen.add(key);
        clean.push(r);
      }
    });

    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(clean));
    this.pushToServer({ attendance: clean });
  }

  recordAttendanceBatch(eventId, presentMemberIds, absentMemberIds = []) {
    let allAttendance = this.getAttendance();
    const event = this.getEventById(eventId);
    const members = this.getMembers();
    const now = new Date();
    const dateStr = (event && event.date) ? event.date : now.toISOString().split('T')[0];
    const timestampStr = now.toISOString();

    // Remove any existing records for this event session and target members
    const targetMemberSet = new Set();
    [...presentMemberIds, ...absentMemberIds].forEach(id => {
      const mem = members.find(m => m.id === id || m.memberId === id);
      if (mem) targetMemberSet.add(mem.memberId);
    });

    allAttendance = allAttendance.filter(r => !(r.eventId === eventId && r.date === dateStr && targetMemberSet.has(r.memberId)));

    const newRecords = [];
    const processedMembers = new Set();

    presentMemberIds.forEach(mId => {
      const mem = members.find(m => m.id === mId || m.memberId === mId);
      if (mem && !processedMembers.has(mem.memberId)) {
        processedMembers.add(mem.memberId);
        newRecords.push({
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          eventId: event ? event.id : eventId,
          eventTitle: event ? event.title : 'E-Cell Session',
          eventType: event ? event.type : 'meeting',
          memberId: mem.memberId,
          memberName: mem.name,
          collegeDept: mem.collegeDept,
          ecellDept: mem.ecellDept,
          email: mem.email,
          status: 'Present',
          date: dateStr,
          timestamp: timestampStr
        });
      }
    });

    absentMemberIds.forEach(mId => {
      const mem = members.find(m => m.id === mId || m.memberId === mId);
      if (mem && !processedMembers.has(mem.memberId)) {
        processedMembers.add(mem.memberId);
        newRecords.push({
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          eventId: event ? event.id : eventId,
          eventTitle: event ? event.title : 'E-Cell Session',
          eventType: event ? event.type : 'meeting',
          memberId: mem.memberId,
          memberName: mem.name,
          collegeDept: mem.collegeDept,
          ecellDept: mem.ecellDept,
          email: mem.email,
          status: 'Absent',
          date: dateStr,
          timestamp: timestampStr
        });
      }
    });

    const updated = [...newRecords, ...allAttendance];
    this.saveAttendance(updated);
    return newRecords;
  }

  // --- CERTIFICATES ---
  getCertificates() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CERTIFICATES) || '[]');
  }

  saveCertificates(certs) {
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(certs));
    this.pushToServer({ certificates: certs });
  }

  issueCertificate(record) {
    const certs = this.getCertificates();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const cert = {
      id: 'cert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      certificateNumber: `EC-${new Date().getFullYear()}-${randomNum}`,
      verificationCode: `VER-${randomNum}-EC`,
      memberId: record.memberId,
      memberName: record.memberName,
      email: record.email,
      collegeDept: record.collegeDept,
      ecellDept: record.ecellDept,
      eventId: record.eventId,
      eventTitle: record.eventTitle,
      issueDate: new Date().toISOString().split('T')[0],
      emailStatus: 'Delivered',
      sentAt: new Date().toISOString(),
      ...record
    };

    certs.unshift(cert);
    this.saveCertificates(certs);
    return cert;
  }

  verifyCertificate(query) {
    if (!query) return null;
    const cleanQuery = query.trim().toUpperCase();
    const certs = this.getCertificates();
    return certs.find(c =>
      (c.certificateNumber && c.certificateNumber.toUpperCase() === cleanQuery) ||
      (c.verificationCode && c.verificationCode.toUpperCase() === cleanQuery) ||
      (c.memberId && c.memberId.toUpperCase() === cleanQuery) ||
      c.id === query
    );
  }

  deleteAttendanceSession(eventId, date) {
    let attendance = this.getAttendance();
    attendance = attendance.filter(r => !(r.eventId === eventId && r.date === date));
    this.saveAttendance(attendance);
  }

  deleteCertificate(certId) {
    let certs = this.getCertificates();
    certs = certs.filter(c => c.id !== certId);
    this.saveCertificates(certs);
  }

  clearAllData() {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify([]));
    this.pushToServer();
  }
}

window.DataStore = new ECellDataStore();
