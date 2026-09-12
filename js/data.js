/**
 * E-Cell Attendance & Certificate System
 * Universal Real-Time Data Store & Multi-Device Cloud Sync
 */

const STORAGE_KEYS = {
  MEMBERS: 'ecell_members_v3',
  EVENTS: 'ecell_events_v3',
  ATTENDANCE: 'ecell_attendance_v3',
  CERTIFICATES: 'ecell_certificates_v3',
  TEMPLATE_CONFIG: 'ecell_template_config_v3',
  ADMIN_PASSWORD: 'ecell_admin_pwd_v1',
  DELETED_LOG: 'ecell_deleted_records_v1',
  LAST_SERVER_SYNC: 'ecell_last_sync_v1'
};

const DEFAULT_TEMPLATE_CONFIG = {
  bgImage: null, // Admin uploaded image (base64)
  nameX: 600,
  nameY: 420,
  nameFontSize: 46,
  nameColor: '#1e293b',
  fontFamily: 'Poppins',
  fontWeight: 'bold',
  textAlign: 'center'
};

// Initial Seed Members if completely new device
const SEED_MEMBERS = [
  {
    name: "Anuj Yadav",
    email: "anujyadav0105@gmail.com",
    collegeDept: "CSE",
    year: "2nd Year",
    ecellDept: "Digital Infrastructure and Development",
    status: "Active",
    joinedDate: "2026-09-11",
    id: "m_1789102371358",
    memberId: "EC001",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Anuj%20Yadav"
  },
  {
    name: "Anurag",
    email: "asrivastava8957@gmail.com",
    collegeDept: "CSE",
    year: "2nd Year",
    ecellDept: "Digital Infrastructure and Development",
    status: "Active",
    joinedDate: "2026-09-11",
    id: "m_1789102413363",
    memberId: "EC002",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Anurag"
  },
  {
    name: "Abhay",
    email: "anuj425x@gmail.com",
    collegeDept: "CSE",
    year: "2nd Year",
    ecellDept: "Digital Infrastructure and Development",
    status: "Active",
    joinedDate: "2026-09-11",
    id: "m_1789102441045",
    memberId: "EC003",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Abhay"
  }
];

class ECellDataStore {
  constructor() {
    this.isSyncing = false;
    this.init();
    this.syncWithServer();
    
    // Background polling every 4 seconds to sync across browsers/devices even without Firebase
    this.pollInterval = setInterval(() => {
      this.syncWithServer();
    }, 4000);
  }

  init() {
    if (!localStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD)) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, 'admin123');
    }
    if (!localStorage.getItem(STORAGE_KEYS.MEMBERS)) {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(SEED_MEMBERS));
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

  getDeletedLog() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_LOG) || '{"members":[],"events":[],"sessions":[],"certs":[]}');
    } catch(e) {
      return { members: [], events: [], sessions: [], certs: [] };
    }
  }

  trackDeleted(type, idOrKey) {
    const log = this.getDeletedLog();
    if (!log[type]) log[type] = [];
    if (!log[type].includes(idOrKey)) {
      log[type].push(idOrKey);
      if (log[type].length > 300) log[type].shift();
      localStorage.setItem(STORAGE_KEYS.DELETED_LOG, JSON.stringify(log));
    }
  }

  getFullDatabasePayload() {
    return {
      adminPassword: this.getAdminPassword(),
      members: this.getMembers(),
      events: this.getEvents(),
      attendance: this.getAttendance(),
      certificates: this.getCertificates(),
      templateConfig: this.getTemplateConfig(),
      updatedAt: new Date().toISOString()
    };
  }

  applyCloudUpdate(cloudData) {
    if (!cloudData || typeof cloudData !== 'object') return;

    let hasChanged = false;
    const currentMembers = JSON.stringify(this.getMembers());
    const currentEvents = JSON.stringify(this.getEvents());
    const currentAttendance = JSON.stringify(this.getAttendance());
    const currentCerts = JSON.stringify(this.getCertificates());

    if (Array.isArray(cloudData.members) && JSON.stringify(cloudData.members) !== currentMembers) {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(cloudData.members));
      hasChanged = true;
    }
    if (Array.isArray(cloudData.events) && JSON.stringify(cloudData.events) !== currentEvents) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(cloudData.events));
      hasChanged = true;
    }
    if (Array.isArray(cloudData.attendance) && JSON.stringify(cloudData.attendance) !== currentAttendance) {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(cloudData.attendance));
      hasChanged = true;
    }
    if (Array.isArray(cloudData.certificates) && JSON.stringify(cloudData.certificates) !== currentCerts) {
      localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(cloudData.certificates));
      hasChanged = true;
    }
    if (cloudData.templateConfig && typeof cloudData.templateConfig === 'object') {
      localStorage.setItem(STORAGE_KEYS.TEMPLATE_CONFIG, JSON.stringify(cloudData.templateConfig));
    }
    if (cloudData.adminPassword && cloudData.adminPassword !== 'admin123') {
      localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, cloudData.adminPassword);
    }

    if (hasChanged) {
      window.dispatchEvent(new CustomEvent('ecell_data_synced', { detail: { source: 'cloud' } }));
    }
  }

  async syncWithServer() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) {
        this.isSyncing = false;
        return;
      }
      const json = await res.json();
      if (!json.success || !json.data) {
        this.isSyncing = false;
        return;
      }

      const serverData = json.data;
      const localMembers = this.getMembers();
      const localEvents = this.getEvents();
      const localAttendance = this.getAttendance();
      const localCerts = this.getCertificates();
      const localTemplate = this.getTemplateConfig();
      const deletedLog = this.getDeletedLog();

      // 1. Merge Members (Union preserving local and server)
      const memberMap = new Map();
      if (Array.isArray(serverData.members)) {
        serverData.members.forEach(m => {
          if (m && (m.id || m.memberId) && !deletedLog.members.includes(m.id)) {
            memberMap.set(m.id || m.memberId, m);
          }
        });
      }
      localMembers.forEach(m => {
        if (m && (m.id || m.memberId) && !deletedLog.members.includes(m.id)) {
          memberMap.set(m.id || m.memberId, m);
        }
      });
      const mergedMembers = Array.from(memberMap.values());

      // 2. Merge Events
      const eventMap = new Map();
      if (Array.isArray(serverData.events)) {
        serverData.events.forEach(e => {
          if (e && e.id && !deletedLog.events.includes(e.id)) {
            eventMap.set(e.id, e);
          }
        });
      }
      localEvents.forEach(e => {
        if (e && e.id && !deletedLog.events.includes(e.id)) {
          eventMap.set(e.id, e);
        }
      });
      const mergedEvents = Array.from(eventMap.values());

      // 3. Merge Attendance Records
      const attMap = new Map();
      if (Array.isArray(serverData.attendance)) {
        serverData.attendance.forEach(r => {
          if (r && r.eventId && r.memberId) {
            const key = `${r.eventId}_${r.date}_${r.memberId}`;
            const sessionKey = `${r.eventId}_${r.date}`;
            if (!deletedLog.sessions.includes(sessionKey)) {
              attMap.set(key, r);
            }
          }
        });
      }
      localAttendance.forEach(r => {
        if (r && r.eventId && r.memberId) {
          const key = `${r.eventId}_${r.date}_${r.memberId}`;
          const sessionKey = `${r.eventId}_${r.date}`;
          if (!deletedLog.sessions.includes(sessionKey)) {
            attMap.set(key, r);
          }
        }
      });
      const mergedAttendance = Array.from(attMap.values());

      // 4. Merge Certificates
      const certMap = new Map();
      if (Array.isArray(serverData.certificates)) {
        serverData.certificates.forEach(c => {
          if (c && (c.id || c.certificateNumber) && !deletedLog.certs.includes(c.id)) {
            certMap.set(c.id || c.certificateNumber, c);
          }
        });
      }
      localCerts.forEach(c => {
        if (c && (c.id || c.certificateNumber) && !deletedLog.certs.includes(c.id)) {
          certMap.set(c.id || c.certificateNumber, c);
        }
      });
      const mergedCerts = Array.from(certMap.values());

      // 5. Merge Template Config
      const mergedTemplate = {
        ...DEFAULT_TEMPLATE_CONFIG,
        ...(serverData.templateConfig || {}),
        ...(localTemplate || {})
      };
      if (localTemplate && localTemplate.bgImage) {
        mergedTemplate.bgImage = localTemplate.bgImage;
      } else if (serverData.templateConfig && serverData.templateConfig.bgImage) {
        mergedTemplate.bgImage = serverData.templateConfig.bgImage;
      }

      // 6. Admin Password
      const mergedAdminPwd = (serverData.adminPassword && serverData.adminPassword !== 'admin123')
        ? serverData.adminPassword
        : this.getAdminPassword();

      const membersChanged = JSON.stringify(mergedMembers) !== JSON.stringify(localMembers);
      const eventsChanged = JSON.stringify(mergedEvents) !== JSON.stringify(localEvents);
      const attendanceChanged = JSON.stringify(mergedAttendance) !== JSON.stringify(localAttendance);
      const certsChanged = JSON.stringify(mergedCerts) !== JSON.stringify(localCerts);

      // Save complete merged dataset to LocalStorage
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(mergedMembers));
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(mergedEvents));
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(mergedAttendance));
      localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(mergedCerts));
      localStorage.setItem(STORAGE_KEYS.TEMPLATE_CONFIG, JSON.stringify(mergedTemplate));
      localStorage.setItem(STORAGE_KEYS.ADMIN_PASSWORD, mergedAdminPwd);

      if (membersChanged || eventsChanged || attendanceChanged || certsChanged) {
        window.dispatchEvent(new CustomEvent('ecell_data_synced', { detail: { source: 'server' } }));
      }
    } catch (e) {
      // Server offline or static mode - perfectly fine
    } finally {
      this.isSyncing = false;
    }
  }

  async pushToServer(partial = null) {
    const payload = {
      adminPassword: this.getAdminPassword(),
      members: this.getMembers(),
      events: this.getEvents(),
      attendance: this.getAttendance(),
      certificates: this.getCertificates(),
      templateConfig: this.getTemplateConfig(),
      ...(partial || {})
    };

    // 1. Push to Firebase Cloud Firestore if connected
    if (window.FirebaseSync && typeof window.FirebaseSync.pushToCloud === 'function') {
      window.FirebaseSync.pushToCloud(payload);
    }

    // 2. Push to Node.js Backend API
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Offline fallback
    }

    // 3. Notify local UI immediately
    window.dispatchEvent(new CustomEvent('ecell_data_synced', { detail: { source: 'local_action' } }));
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

  updateMember(memberId, updatedFields) {
    let members = this.getMembers();
    const idx = members.findIndex(m => m.id === memberId || m.memberId === memberId);
    if (idx !== -1) {
      members[idx] = { ...members[idx], ...updatedFields };
      this.saveMembers(members);
      return members[idx];
    }
    return null;
  }

  deleteMember(id) {
    this.trackDeleted('members', id);
    let members = this.getMembers();
    members = members.filter(m => m.id !== id && m.memberId !== id);
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

  updateEvent(eventId, updatedFields) {
    let events = this.getEvents();
    const idx = events.findIndex(e => e.id === eventId);
    if (idx !== -1) {
      events[idx] = { ...events[idx], ...updatedFields };
      this.saveEvents(events);
      return events[idx];
    }
    return null;
  }

  getEventById(id) {
    return this.getEvents().find(e => e.id === id);
  }

  deleteEvent(id) {
    this.trackDeleted('events', id);
    let events = this.getEvents();
    events = events.filter(e => e.id !== id);
    this.saveEvents(events);
  }

  // --- ATTENDANCE ---
  getAttendance() {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
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
    this.trackDeleted('sessions', `${eventId}_${date}`);
    let attendance = this.getAttendance();
    attendance = attendance.filter(r => !(r.eventId === eventId && r.date === date));
    this.saveAttendance(attendance);
  }

  deleteCertificate(certId) {
    this.trackDeleted('certs', certId);
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

window.dataStore = window.DataStore = new ECellDataStore();
