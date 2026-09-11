/**
 * E-Cell Attendance & Certificate System
 * Real Email Dispatcher to All Present Members
 */

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

const App = {
  currentView: 'dashboard',
  selectedEventId: null,
  selectedEcellDept: 'All',
  selectedStudioEventId: 'global',
  pendingEventTemplateBg: null,
  attendanceSelections: new Map(), // memberId -> 'Present' | 'Absent'
  isEmailConfigured: false,

  init() {
    this.setupAdminSecurity();
    this.setupNavigation();
    this.setupThemeToggle();
    this.checkEmailConfigurationStatus();
    this.renderDashboard();
    this.setupAttendanceWizard();
    this.setupCertificateStudio();
    this.setupMembersModule();
    this.setupEventsModule();
    this.setupHistoryModule();
    this.setupVerificationModule();
    this.setupEmailSettingsModule();
    this.setupModals();

    window.addEventListener('ecell_data_synced', () => {
      this.renderDashboard();
      this.renderMembersTable();
      this.renderEventsList();
      this.renderHistoryTable();
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  async checkEmailConfigurationStatus() {
    try {
      const res = await fetch('/api/smtp-config');
      const data = await res.json();
      
      const cached = localStorage.getItem('ecell_smtp_config_v1');
      let cachedConfig = null;
      if (cached) {
        try { cachedConfig = JSON.parse(cached); } catch(e) {}
      }

      if (data.isConfigured) {
        this.isEmailConfigured = true;
      } else if (cachedConfig && cachedConfig.user && cachedConfig.pass) {
        // Auto-restore server connection from local cache if serverless instance cold-started
        this.isEmailConfigured = true;
        fetch('/api/smtp-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cachedConfig)
        }).catch(() => {});
      } else {
        this.isEmailConfigured = false;
      }

      const warningBanner = document.getElementById('dashboardEmailWarningBanner');
      if (warningBanner) {
        warningBanner.style.display = this.isEmailConfigured ? 'none' : 'block';
      }

      const statusBadge = document.getElementById('emailConfigStatusBadge');
      const activeEmail = (data.config && data.config.user) || (cachedConfig && cachedConfig.user) || '';
      if (statusBadge) {
        if (this.isEmailConfigured && activeEmail) {
          statusBadge.innerHTML = `<span class="badge badge-status-present">✓ Real Email Active (${activeEmail})</span>`;
        } else {
          statusBadge.innerHTML = `<span class="badge badge-webinar">⚠️ Sender Not Configured</span>`;
        }
      }
    } catch (e) {
      this.isEmailConfigured = false;
    }
  },

  setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-view]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view');
        this.navigateTo(targetView);
      });
    });

    const toggleBtn = document.getElementById('mobileMenuToggleBtn');
    const backdrop = document.getElementById('sidebarBackdrop');
    const sidebar = document.querySelector('.app-sidebar');

    const toggleSidebar = () => {
      if (sidebar) sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active');
    };

    const closeSidebar = () => {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    };

    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
  },

  navigateTo(viewName) {
    this.currentView = viewName;
    
    // Auto-close mobile sidebar drawer on navigation
    const sidebar = document.querySelector('.app-sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');

    document.querySelectorAll('.page-view').forEach(view => {
      view.classList.remove('active');
    });

    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-view') === viewName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    const titleEl = document.getElementById('topbarPageTitle');
    if (titleEl) {
      const titles = {
        dashboard: 'Executive Dashboard',
        attendance: 'Take Attendance & Dispatch Certificates',
        studio: 'Certificate Template & Name Placement',
        members: 'Member Directory',
        events: 'Events & Meetings Manager',
        history: 'Attendance & Certificate Logs',
        emailSettings: 'Email Dispatch & Sender Setup',
        verify: 'Public Certificate Verification'
      };
      titleEl.textContent = titles[viewName] || 'E-Cell ABES';
    }

    this.checkEmailConfigurationStatus();

    if (viewName === 'dashboard') this.renderDashboard();
    if (viewName === 'attendance') this.initAttendanceStep1();
    if (viewName === 'studio') {
      this.populateStudioEventSelector();
      this.syncStudioControlsWithConfig();
      this.renderStudioPreview();
    }
    if (viewName === 'members') this.renderMembersTable();
    if (viewName === 'events') this.renderEventsList();
    if (viewName === 'history') this.renderHistoryTable();
    if (viewName === 'emailSettings') this.loadEmailSettings();

    if (window.lucide) window.lucide.createIcons();
  },

  setupThemeToggle() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        this.showToast(`Switched to ${newTheme} mode`, 'info');
      });
    }
  },

  // --- 1. DASHBOARD ---
  renderDashboard() {
    const members = window.DataStore.getMembers();
    const events = window.DataStore.getEvents();
    const attendance = window.DataStore.getAttendance();
    const certs = window.DataStore.getCertificates();

    document.getElementById('statTotalMembers').textContent = members.length;
    document.getElementById('statTotalEvents').textContent = events.length;

    const presentCount = attendance.filter(a => a.status === 'Present').length;
    const rate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
    document.getElementById('statAttendanceRate').textContent = attendance.length > 0 ? `${rate}%` : '0%';
    document.getElementById('statCertificatesIssued').textContent = certs.length;

    const recentFeed = document.getElementById('recentActivityFeed');
    if (recentFeed) {
      if (attendance.length === 0) {
        recentFeed.innerHTML = `
          <div style="text-align:center; padding: 36px 12px; color:var(--text-muted);">
            <p style="font-size:14px; font-weight:600;">No Event Attendance Recorded Yet</p>
            <p style="font-size:12px; color:var(--text-dim); margin-top:3px;">Create an event and mark attendance to see presence breakdowns.</p>
            <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="App.navigateTo('attendance')">
              <i data-lucide="check-square"></i> Take Attendance
            </button>
          </div>
        `;
      } else {
        // Group attendance records by session (eventId + date)
        const eventMap = new Map();
        attendance.forEach(r => {
          const key = `${r.eventId}_${r.date}`;
          if (!eventMap.has(key)) {
            eventMap.set(key, {
              key,
              eventId: r.eventId,
              eventTitle: r.eventTitle,
              eventType: r.eventType,
              date: r.date,
              presentMembers: [],
              absentMembers: []
            });
          }
          const group = eventMap.get(key);
          if (r.status === 'Present') {
            group.presentMembers.push(r);
          } else {
            group.absentMembers.push(r);
          }
        });

        const sortedSessions = Array.from(eventMap.values()).sort((a, b) => b.date.localeCompare(a.date));

        recentFeed.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${sortedSessions.map(s => {
              const total = s.presentMembers.length + s.absentMembers.length;
              const isMeeting = s.eventType === 'meeting';
              return `
                <div class="card" style="margin-bottom:0; padding:14px 16px; cursor:pointer; transition:all 0.2s ease; border:1px solid var(--border-color); background:var(--bg-input);" onclick="App.showEventAttendanceDetails('${s.key}')" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border-color)'">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span class="badge ${isMeeting ? 'badge-meeting' : 'badge-webinar'}" style="font-size:11px;">
                          ${isMeeting ? 'Meeting' : 'Webinar'}
                        </span>
                        <h4 style="font-size:14.5px; font-weight:700; margin:0; color:var(--text-main);">${s.eventTitle}</h4>
                      </div>
                      <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                        <span><i data-lucide="calendar" style="width:12px;height:12px;vertical-align:middle;"></i> ${s.date}</span>
                        <span style="margin-left:12px;"><i data-lucide="users" style="width:12px;height:12px;vertical-align:middle;"></i> ${total} Total Members Recorded</span>
                      </p>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span class="badge badge-status-present" style="font-size:12px; padding:5px 12px; font-weight:700;">
                        ✓ ${s.presentMembers.length} Present
                      </span>
                      <span class="badge badge-status-absent" style="font-size:12px; padding:5px 12px; font-weight:700;">
                        ✕ ${s.absentMembers.length} Absent
                      </span>
                      <button class="btn btn-sm btn-secondary" style="font-size:11.5px;" onclick="event.stopPropagation(); App.showEventAttendanceDetails('${s.key}')">
                        <i data-lucide="eye"></i> View List
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    }

    if (window.lucide) window.lucide.createIcons();
  },

  showEventAttendanceDetails(sessionKey) {
    const attendance = window.DataStore.getAttendance();
    const records = attendance.filter(r => `${r.eventId}_${r.date}` === sessionKey);
    if (records.length === 0) return;

    const first = records[0];
    const presentList = records.filter(r => r.status === 'Present');
    const absentList = records.filter(r => r.status === 'Absent');

    const modal = document.getElementById('eventAttendanceDetailModal');
    const headerEl = document.getElementById('eventDetailModalHeader');
    const bodyEl = document.getElementById('eventDetailModalBody');
    if (!modal || !headerEl || !bodyEl) return;

    headerEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="badge ${first.eventType === 'meeting' ? 'badge-meeting' : 'badge-webinar'}">
          ${first.eventType === 'meeting' ? 'Meeting' : 'Webinar'}
        </span>
        <h3 class="card-title" style="font-size:16px;">${first.eventTitle}</h3>
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin-top:2px;">Session Date: <strong>${first.date}</strong></p>
    `;

    bodyEl.innerHTML = `
      <!-- Summary Counts -->
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:18px;">
        <div style="background:var(--bg-input); padding:10px; border-radius:var(--radius-md); text-align:center; border:1px solid var(--border-color);">
          <div style="font-size:22px; font-weight:800;">${records.length}</div>
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Total Recorded</div>
        </div>
        <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); padding:10px; border-radius:var(--radius-md); text-align:center;">
          <div style="font-size:22px; font-weight:800; color:var(--success);">${presentList.length}</div>
          <div style="font-size:11px; color:var(--success); text-transform:uppercase; font-weight:700;">Present</div>
        </div>
        <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:10px; border-radius:var(--radius-md); text-align:center;">
          <div style="font-size:22px; font-weight:800; color:var(--danger);">${absentList.length}</div>
          <div style="font-size:11px; color:var(--danger); text-transform:uppercase; font-weight:700;">Absent</div>
        </div>
      </div>

      <!-- Present List -->
      <div style="margin-bottom:18px;">
        <h4 style="font-size:13.5px; font-weight:700; color:var(--success); display:flex; align-items:center; gap:6px; margin-bottom:8px;">
          <span>✓ Present Members (${presentList.length})</span>
        </h4>
        ${presentList.length === 0 ? '<p style="font-size:12px; color:var(--text-dim); padding:8px 0;">No members marked present.</p>' : `
          <div style="max-height:180px; overflow-y:auto; border:1px solid var(--border-color); border-radius:var(--radius-md);">
            <table class="data-table" style="margin:0;">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>E-Cell Dept</th>
                  <th>College Dept</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                ${presentList.map(m => `
                  <tr>
                    <td><strong>${m.memberName}</strong> <span style="font-size:11px; color:var(--text-dim);">(${m.memberId})</span></td>
                    <td><span class="badge badge-dept" style="font-size:10.5px;">${m.ecellDept}</span></td>
                    <td><span class="badge badge-college" style="font-size:10.5px;">${m.collegeDept}</span></td>
                    <td style="font-size:11.5px; color:var(--text-muted);">${m.email}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Absent List -->
      <div style="margin-bottom:16px;">
        <h4 style="font-size:13.5px; font-weight:700; color:var(--danger); display:flex; align-items:center; gap:6px; margin-bottom:8px;">
          <span>✕ Absent Members (${absentList.length})</span>
        </h4>
        ${absentList.length === 0 ? '<p style="font-size:12px; color:var(--text-dim); padding:8px 0;">No members marked absent.</p>' : `
          <div style="max-height:180px; overflow-y:auto; border:1px solid var(--border-color); border-radius:var(--radius-md);">
            <table class="data-table" style="margin:0;">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>E-Cell Dept</th>
                  <th>College Dept</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                ${absentList.map(m => `
                  <tr>
                    <td><strong>${m.memberName}</strong> <span style="font-size:11px; color:var(--text-dim);">(${m.memberId})</span></td>
                    <td><span class="badge badge-dept" style="font-size:10.5px;">${m.ecellDept}</span></td>
                    <td><span class="badge badge-college" style="font-size:10.5px;">${m.collegeDept}</span></td>
                    <td style="font-size:11.5px; color:var(--text-muted);">${m.email}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px; padding-top:10px; border-top:1px solid var(--border-color);">
        <button class="btn btn-secondary modal-close-btn" onclick="App.closeAllModals()">Close</button>
      </div>
    `;

    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
  },

  // --- 2. ATTENDANCE WIZARD ---
  setupAttendanceWizard() {
    this.currentWizardStep = 1;

    document.getElementById('wizardNextToStep2')?.addEventListener('click', () => {
      const events = window.DataStore.getEvents();
      if (events.length === 0) {
        this.showToast('Please create an event first.', 'error');
        document.getElementById('addEventModal')?.classList.add('active');
        return;
      }
      if (!this.selectedEventId) {
        this.showToast('Please select an event first.', 'error');
        return;
      }
      this.goToWizardStep(2);
    });

    document.getElementById('wizardBackToStep1')?.addEventListener('click', () => this.goToWizardStep(1));
    document.getElementById('wizardNextToStep3')?.addEventListener('click', () => {
      const members = window.DataStore.getMembers();
      if (members.length === 0) {
        this.showToast('No members found. Please add members first.', 'error');
        document.getElementById('addMemberModal')?.classList.add('active');
        return;
      }
      this.goToWizardStep(3);
    });
    document.getElementById('wizardBackToStep2')?.addEventListener('click', () => this.goToWizardStep(2));

    const chips = document.querySelectorAll('.dept-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedEcellDept = chip.getAttribute('data-dept');
      });
    });

    document.getElementById('btnSelectAllMembers')?.addEventListener('click', () => {
      const filteredMembers = this.getFilteredMembersForAttendance();
      filteredMembers.forEach(m => this.attendanceSelections.set(m.id, 'Present'));
      this.renderAttendanceMembersList();
    });

    document.getElementById('btnDeselectAllMembers')?.addEventListener('click', () => {
      const filteredMembers = this.getFilteredMembersForAttendance();
      filteredMembers.forEach(m => this.attendanceSelections.set(m.id, 'Absent'));
      this.renderAttendanceMembersList();
    });

    document.getElementById('attendanceMemberSearch')?.addEventListener('input', (e) => {
      this.renderAttendanceMembersList(e.target.value.trim());
    });

    document.getElementById('btnSubmitAttendance')?.addEventListener('click', () => {
      this.executeAttendanceSubmission();
    });
  },

  goToWizardStep(stepNumber) {
    this.currentWizardStep = stepNumber;

    for (let i = 1; i <= 3; i++) {
      const stepEl = document.getElementById(`stepIndicator${i}`);
      const contentEl = document.getElementById(`wizardStepContent${i}`);
      if (stepEl && contentEl) {
        if (i === stepNumber) {
          stepEl.classList.add('active');
          stepEl.classList.remove('completed');
          contentEl.style.display = 'block';
        } else if (i < stepNumber) {
          stepEl.classList.remove('active');
          stepEl.classList.add('completed');
          contentEl.style.display = 'none';
        } else {
          stepEl.classList.remove('active', 'completed');
          contentEl.style.display = 'none';
        }
      }
    }

    if (stepNumber === 1) this.initAttendanceStep1();
    if (stepNumber === 2) this.initAttendanceStep2();
    if (stepNumber === 3) this.initAttendanceStep3();
    if (window.lucide) window.lucide.createIcons();
  },

  initAttendanceStep1() {
    const events = window.DataStore.getEvents();
    const attendance = window.DataStore.getAttendance();
    const container = document.getElementById('eventsSelectorGrid');
    const nextBtn = document.getElementById('wizardNextToStep2');
    if (!container) return;

    if (events.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:36px 16px; background:var(--bg-input); border:1px dashed var(--border-color); border-radius:var(--radius-md);">
          <p style="font-weight:600; font-size:14px; margin-bottom:6px;">No Events Found</p>
          <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:14px;">Create an internal meeting or webinar event to take attendance.</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('addEventModal').classList.add('active');">
            <i data-lucide="plus"></i> Create Event / Meeting
          </button>
        </div>
      `;
      this.selectedEventId = null;
      if (nextBtn) nextBtn.disabled = true;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const markedEventIds = new Set(attendance.map(a => a.eventId));
    const pendingEvents = events.filter(e => !markedEventIds.has(e.id));
    const completedEvents = events.filter(e => markedEventIds.has(e.id));

    // If all events already have attendance marked
    if (pendingEvents.length === 0) {
      this.selectedEventId = null;
      if (nextBtn) nextBtn.disabled = true;

      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:32px 18px; background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-md);">
          <div style="width:50px; height:50px; border-radius:50%; background:rgba(16, 185, 129, 0.15); color:var(--success); display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
            <i data-lucide="check-circle" style="width:26px; height:26px;"></i>
          </div>
          <h3 style="font-size:16px; font-weight:700; margin-bottom:6px; color:var(--text-main);">All Events Marked for Attendance</h3>
          <p style="font-size:13px; color:var(--text-muted); max-width:520px; margin:0 auto 16px; line-height:1.5;">
            All ${events.length} scheduled event(s) have attendance recorded and safely stored in the <strong>Attendance &amp; Certificate Logs</strong>.
          </p>
          <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="App.navigateTo('history');">
              <i data-lucide="clipboard-list"></i> View Logs &amp; Records
            </button>
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('addEventModal').classList.add('active');">
              <i data-lucide="plus"></i> Create New Event
            </button>
          </div>
        </div>

        ${completedEvents.length > 0 ? `
          <div style="grid-column: 1 / -1; margin-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h4 style="font-size:13.5px; font-weight:700; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
                <i data-lucide="check-check" style="width:16px; height:16px; color:var(--success);"></i>
                Completed Event Records (${completedEvents.length})
              </h4>
              <button class="btn btn-sm btn-secondary" style="font-size:11.5px;" onclick="App.navigateTo('history');">
                <i data-lucide="external-link"></i> Full Logs
              </button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
              ${completedEvents.map(evt => {
                const isMeeting = evt.type === 'meeting';
                const evtRecords = attendance.filter(a => a.eventId === evt.id);
                const presentCount = evtRecords.filter(a => a.status === 'Present').length;
                return `
                  <div class="card" style="margin-bottom:0; padding:14px; border:1px solid var(--border-color); background:var(--bg-card); opacity:0.95;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                      <span class="badge ${isMeeting ? 'badge-meeting' : 'badge-webinar'}">
                        ${isMeeting ? 'Meeting' : 'Webinar'}
                      </span>
                      <span class="badge badge-status-present" style="font-size:11px;">✓ ${presentCount} Present</span>
                    </div>
                    <h4 style="font-size:14.5px; font-weight:700; margin-top:8px;">${evt.title}</h4>
                    <p style="font-size:12px; color:var(--text-dim); margin-top:4px;">Date: ${evt.date}</p>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px solid var(--border-color);">
                      <button class="btn btn-sm btn-secondary" style="font-size:11px; padding:4px 8px;" onclick="App.showEventAttendanceDetails('${evt.id}_${evt.date}')">
                        <i data-lucide="eye" style="width:12px; height:12px;"></i> View Records
                      </button>
                      <button class="btn btn-sm btn-outline" style="font-size:11px; padding:4px 8px; border:1px solid var(--border-color);" onclick="App.selectEventForAttendance('${evt.id}', true)">
                        <i data-lucide="refresh-cw" style="width:11px; height:11px;"></i> Re-take
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      `;

      if (window.lucide) window.lucide.createIcons();
      return;
    }

    if (nextBtn) nextBtn.disabled = false;

    if (!this.selectedEventId || !pendingEvents.some(e => e.id === this.selectedEventId)) {
      this.selectedEventId = pendingEvents[0].id;
    }

    container.innerHTML = `
      ${pendingEvents.map(evt => {
        const isSelected = this.selectedEventId === evt.id;
        const isMeeting = evt.type === 'meeting';
        return `
          <div class="event-select-card ${isSelected ? 'selected' : ''}" data-event-id="${evt.id}" onclick="App.selectEventForAttendance('${evt.id}')">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <span class="badge ${isMeeting ? 'badge-meeting' : 'badge-webinar'}">
                ${isMeeting ? 'Meeting (No Cert)' : 'Webinar (Issues Certificate)'}
              </span>
              <span style="font-size:12px; color:var(--text-dim);">${evt.date}</span>
            </div>
            <h3 style="font-size:15px; font-weight:700; margin-top:8px;">${evt.title}</h3>
            <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">
              <span><i data-lucide="clock" style="width:12px;height:12px;vertical-align:middle;"></i> ${evt.time || 'TBD'}</span>
              <span style="margin-left:12px;"><i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:middle;"></i> ${evt.location || 'Campus'}</span>
            </div>
          </div>
        `;
      }).join('')}

      ${completedEvents.length > 0 ? `
        <div style="grid-column: 1 / -1; margin-top:16px; padding-top:14px; border-top:1px solid var(--border-color);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span style="font-size:12px; color:var(--text-dim);">
              <i data-lucide="check-circle" style="width:12px; height:12px; color:var(--success); vertical-align:middle;"></i>
              ${completedEvents.length} event(s) already recorded &amp; saved in logs.
            </span>
            <button class="btn btn-sm btn-secondary" style="font-size:11px;" onclick="App.navigateTo('history');">
              <i data-lucide="clipboard-list"></i> View History Logs &rarr;
            </button>
          </div>
        </div>
      ` : ''}
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  selectEventForAttendance(evtId, allowCompleted = false) {
    this.selectedEventId = evtId;
    if (allowCompleted) {
      this.goToWizardStep(2);
    } else {
      this.initAttendanceStep1();
    }
  },

  initAttendanceStep2() {
    const event = window.DataStore.getEventById(this.selectedEventId);
    const titleEl = document.getElementById('selectedEventSummaryTitle');
    if (titleEl && event) {
      titleEl.innerHTML = `Selected Event: <strong style="color:var(--primary);">${event.title}</strong> (${event.type === 'meeting' ? 'Meeting' : 'Webinar / Workshop'})`;
    }
  },

  initAttendanceStep3() {
    const event = window.DataStore.getEventById(this.selectedEventId);
    const banner = document.getElementById('attendanceActionNotice');
    if (banner && event) {
      if (event.type === 'meeting') {
        banner.innerHTML = `
          <div style="background:rgba(56, 189, 248, 0.1); border:1px solid rgba(56, 189, 248, 0.3); padding:10px 14px; border-radius:var(--radius-md); font-size:13px;">
            <strong>Meeting Mode:</strong> Saves attendance to database. No certificate generated.
          </div>
        `;
      } else {
        banner.innerHTML = `
          <div style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.3); padding:10px 14px; border-radius:var(--radius-md); font-size:13px;">
            <strong>Webinar Mode:</strong> Marking attendance will <strong>generate PDF certificates with member names and email them directly</strong> to all present members.
          </div>
        `;
      }
    }

    const members = this.getFilteredMembersForAttendance();
    members.forEach(m => {
      if (!this.attendanceSelections.has(m.id)) {
        this.attendanceSelections.set(m.id, 'Present');
      }
    });

    this.renderAttendanceMembersList();
  },

  getFilteredMembersForAttendance(searchQuery = '') {
    const members = window.DataStore.getMembers();
    return members.filter(m => {
      const matchDept = (this.selectedEcellDept === 'All') || (m.ecellDept.toLowerCase().includes(this.selectedEcellDept.toLowerCase()));
      const matchSearch = !searchQuery ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.memberId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.collegeDept.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDept && matchSearch;
    });
  },

  renderAttendanceMembersList(searchQuery = '') {
    const members = this.getFilteredMembersForAttendance(searchQuery);
    const tableBody = document.getElementById('attendanceMembersTableBody');
    const countBadge = document.getElementById('presentCountBadge');

    if (!tableBody) return;

    if (members.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:28px 14px; color:var(--text-muted);">
            <p>No members found in "${this.selectedEcellDept}" department.</p>
            <button class="btn btn-sm btn-primary" style="margin-top:8px;" onclick="document.getElementById('addMemberModal').classList.add('active');">
              Add Member
            </button>
          </td>
        </tr>
      `;
      if (countBadge) countBadge.textContent = '0 Present';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    let presentCount = 0;

    tableBody.innerHTML = members.map(m => {
      const status = this.attendanceSelections.get(m.id) || 'Absent';
      const isPresent = status === 'Present';
      if (isPresent) presentCount++;

      return `
        <tr>
          <td>
            <input type="checkbox" style="width:16px;height:16px;cursor:pointer;" ${isPresent ? 'checked' : ''} onchange="App.toggleMemberAttendance('${m.id}')" />
          </td>
          <td>
            <div class="member-cell">
              <div>
                <strong>${m.name}</strong>
                <p style="font-size:11.5px; color:var(--text-muted);">${m.email}</p>
              </div>
            </div>
          </td>
          <td><span style="font-weight:700; color:var(--primary); font-family:monospace;">${m.memberId}</span></td>
          <td><span class="badge badge-dept">${m.ecellDept}</span></td>
          <td><span class="badge badge-college">${m.collegeDept} (${m.year})</span></td>
          <td>
            <button class="attendance-toggle-btn ${isPresent ? 'present' : ''}" onclick="App.toggleMemberAttendance('${m.id}')">
              ${isPresent ? '✓ Present' : '✕ Absent'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (countBadge) {
      countBadge.textContent = `${presentCount} / ${members.length} Present`;
    }

    if (window.lucide) window.lucide.createIcons();
  },

  toggleMemberAttendance(memberId) {
    const current = this.attendanceSelections.get(memberId) || 'Absent';
    const next = current === 'Present' ? 'Absent' : 'Present';
    this.attendanceSelections.set(memberId, next);
    this.renderAttendanceMembersList();
  },

  executeAttendanceSubmission() {
    const event = window.DataStore.getEventById(this.selectedEventId);
    if (!event) return;

    const filteredMembers = this.getFilteredMembersForAttendance();
    const presentIds = [];
    const absentIds = [];

    filteredMembers.forEach(m => {
      const status = this.attendanceSelections.get(m.id);
      if (status === 'Present') {
        presentIds.push(m.id);
      } else {
        absentIds.push(m.id);
      }
    });

    if (presentIds.length === 0 && absentIds.length === 0) {
      this.showToast('No members to mark attendance for.', 'error');
      return;
    }

    // Save attendance batch to store & server
    window.DataStore.recordAttendanceBatch(event.id, presentIds, absentIds);

    // Reset wizard selection so completed event is removed from Take Attendance step 1
    this.selectedEventId = null;
    this.attendanceSelections.clear();

    if (window.confetti) {
      window.confetti({ particleCount: 70, spread: 50 });
    }

    // Immediately refresh views
    this.renderDashboard();
    this.renderEventsList();

    if (event.type === 'meeting') {
      this.showToast(`Attendance saved for ${presentIds.length} present members!`, 'success');
      this.showMeetingSummaryModal(event, presentIds.length, absentIds.length);
    } else {
      this.showToast(`Attendance saved. Sending PDF certificates via email...`, 'success');
      this.launchCertificateEmailPipeline(event, presentIds);
    }
  },

  showMeetingSummaryModal(event, presentCount, absentCount) {
    const modal = document.getElementById('attendanceSummaryModal');
    const content = document.getElementById('attendanceSummaryContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <div style="text-align:center; padding:10px 0 16px;">
        <h3 style="font-size:18px; font-weight:700;">Meeting Attendance Saved</h3>
        <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">"${event.title}"</p>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
        <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:12px; text-align:center;">
          <h4 style="font-size:22px; font-weight:800; color:var(--success);">${presentCount}</h4>
          <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Present</span>
        </div>
        <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:12px; text-align:center;">
          <h4 style="font-size:22px; font-weight:800; color:var(--danger);">${absentCount}</h4>
          <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Absent</span>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="App.closeAllModals(); App.navigateTo('history');"><i data-lucide="clipboard-list"></i> View Logs &amp; Records</button>
        <button class="btn btn-primary btn-sm" onclick="App.closeAllModals(); App.navigateTo('dashboard');">Done</button>
      </div>
    `;

    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
  },

  // --- REAL EMAIL DISPATCH TO ALL ATTENDING MEMBERS ---
  async launchCertificateEmailPipeline(event, presentMemberIds) {
    const modal = document.getElementById('pipelineModal');
    const content = document.getElementById('pipelineContent');
    if (!modal || !content) return;

    modal.classList.add('active');

    const members = window.DataStore.getMembers();
    const targetMembers = members.filter(m => presentMemberIds.includes(m.id) || presentMemberIds.includes(m.memberId));

    content.innerHTML = `
      <div style="text-align:center; margin-bottom:14px;">
        <span class="badge badge-webinar" style="margin-bottom:6px;">Real Email Dispatch Pipeline</span>
        <h3 style="font-size:18px; font-weight:700;">Sending PDF Certificates to ${targetMembers.length} Attendees</h3>
        <p style="font-size:12.5px; color:var(--text-muted);">${event.title}</p>
      </div>

      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="pipelineProgressFill"></div>
      </div>

      <div id="pipelineStatusText" style="font-size:12px; color:var(--primary); text-align:center; margin-bottom:12px;">
        Generating certificates and sending to member emails...
      </div>

      <div id="pipelineLogList" style="max-height:180px; overflow-y:auto; background:var(--bg-input); border-radius:var(--radius-md); padding:10px; font-family:monospace; font-size:11.5px; line-height:1.6; border:1px solid var(--border-color); margin-bottom:16px;">
        <div>[START] Dispatching to ${targetMembers.length} members...</div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-secondary btn-sm" id="btnPipelineClose" disabled onclick="App.closeAllModals(); App.navigateTo('history');"><i data-lucide="clipboard-list"></i> View Logs &amp; Records</button>
        <button class="btn btn-primary btn-sm" id="btnPipelineDone" disabled onclick="App.closeAllModals(); App.navigateTo('dashboard');">Done</button>
      </div>
    `;

    const progressFill = document.getElementById('pipelineProgressFill');
    const statusText = document.getElementById('pipelineStatusText');
    const logList = document.getElementById('pipelineLogList');
    const closeBtn = document.getElementById('btnPipelineClose');
    const doneBtn = document.getElementById('btnPipelineDone');

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1200;
    tempCanvas.height = 850;

    // Load the certificate template configured specifically for this event
    const eventTemplateConfig = window.DataStore.getEventTemplateConfig(event.id);

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targetMembers.length; i++) {
      const mem = targetMembers[i];
      const certRecord = window.DataStore.issueCertificate({
        memberId: mem.memberId,
        memberName: mem.name,
        email: mem.email,
        collegeDept: mem.collegeDept,
        ecellDept: mem.ecellDept,
        eventId: event.id,
        eventTitle: event.title
      });

      statusText.textContent = `[${i + 1}/${targetMembers.length}] Generating certificate and emailing to ${mem.name} (${mem.email})...`;

      // 1. Render certificate on canvas with ONLY this member's name onto the event's template
      await window.CertificateEngine.renderToCanvas(tempCanvas, {
        name: mem.name,
        memberId: mem.memberId,
        eventTitle: event.title,
        templateConfig: eventTemplateConfig,
        showGuide: false
      });

      // 2. Generate PDF Base64 string for this individual member's certificate
      const pdfBase64 = window.CertificateEngine.generatePdfBase64(tempCanvas);

      // 3. Dispatch Real Email via Backend API to this individual member
      try {
        const response = await fetch('/api/send-certificate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: mem.email,
            recipientName: mem.name,
            eventTitle: event.title,
            certificateNumber: certRecord.certificateNumber,
            pdfBase64: pdfBase64,
            customDescription: `Dear ${mem.name},\n\nCongratulations on attending "${event.title}".\n\nYour official certificate of participation from the Entrepreneurship Cell is attached as a PDF.\n\nCertificate ID: ${certRecord.certificateNumber}`
          })
        });

        const result = await response.json();

        if (result.success) {
          successCount++;
          logList.innerHTML += `<div style="color:var(--success);">✓ Delivered to ${mem.email} (${mem.name})</div>`;
        } else {
          failedCount++;
          logList.innerHTML += `<div style="color:var(--danger);">✕ Error (${mem.email}): ${result.error}</div>`;
        }
      } catch (err) {
        failedCount++;
        logList.innerHTML += `<div style="color:var(--danger);">✕ Failed (${mem.email}): ${err.message}</div>`;
      }

      const pct = Math.round(((i + 1) / targetMembers.length) * 100);
      progressFill.style.width = `${pct}%`;
      logList.scrollTop = logList.scrollHeight;
    }

    if (failedCount === 0) {
      statusText.innerHTML = `<span style="color:var(--success); font-weight:bold;">✓ Success! All ${successCount} emails delivered to member inboxes with PDF certificates.</span>`;
    } else {
      statusText.innerHTML = `<span>Completed: ${successCount} sent, ${failedCount} failed. Check "Email & SMTP Setup" to verify your credentials.</span>`;
    }
    
    logList.scrollTop = logList.scrollHeight;
    if (closeBtn) closeBtn.removeAttribute('disabled');
    if (doneBtn) doneBtn.removeAttribute('disabled');
    this.renderDashboard();
    this.renderEventsList();
    this.renderHistoryTable();
    if (window.lucide) window.lucide.createIcons();
    if (window.confetti && successCount > 0) window.confetti({ particleCount: 100, spread: 70 });
  },

  // --- 3. CERTIFICATE STUDIO: ADMIN TEMPLATE UPLOADER & NAME POSITIONING ---
  setupCertificateStudio() {
    const canvas = document.getElementById('certificateCanvas');
    if (!canvas) return;

    const fileInput = document.getElementById('adminTemplateFileInput');
    const eventSelector = document.getElementById('studioEventSelector');

    eventSelector?.addEventListener('change', (e) => {
      this.selectedStudioEventId = e.target.value;
      this.syncStudioControlsWithConfig();
      this.renderStudioPreview();
      this.showToast(`Switched template view`, 'info');
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const config = window.DataStore.getEventTemplateConfig(this.selectedStudioEventId);
        config.bgImage = ev.target.result;
        window.DataStore.saveEventTemplateConfig(this.selectedStudioEventId, config);

        this.syncStudioControlsWithConfig();
        this.renderStudioPreview();
        this.showToast('Certificate template uploaded for this event!', 'success');
      };
      reader.readAsDataURL(file);
    });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const clickX = Math.round((e.clientX - rect.left) * scaleX);
      const clickY = Math.round((e.clientY - rect.top) * scaleY);

      const config = window.DataStore.getEventTemplateConfig(this.selectedStudioEventId);
      config.nameX = clickX;
      config.nameY = clickY;
      window.DataStore.saveEventTemplateConfig(this.selectedStudioEventId, config);

      document.getElementById('sliderNameX').value = clickX;
      document.getElementById('sliderNameY').value = clickY;

      this.renderStudioPreview();
      this.showToast(`Name position set to X:${clickX}, Y:${clickY}`, 'info');
    });

    const bindSlider = (id, key, parseFn = parseInt) => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        const config = window.DataStore.getEventTemplateConfig(this.selectedStudioEventId);
        config[key] = parseFn(e.target.value);
        window.DataStore.saveEventTemplateConfig(this.selectedStudioEventId, config);
        this.renderStudioPreview();
      });
    };

    bindSlider('sliderNameX', 'nameX');
    bindSlider('sliderNameY', 'nameY');
    bindSlider('sliderNameFontSize', 'nameFontSize');
    bindSlider('colorNameText', 'nameColor', v => v);
    bindSlider('selectFontFamily', 'fontFamily', v => v);
    bindSlider('selectFontWeight', 'fontWeight', v => v);

    document.getElementById('sampleRecipientName')?.addEventListener('input', () => this.renderStudioPreview());

    document.getElementById('btnDownloadCertPdf')?.addEventListener('click', async () => {
      const name = document.getElementById('sampleRecipientName')?.value || 'Sample_Member';
      this.showToast('Downloading certificate PDF...', 'info');
      await window.CertificateEngine.exportToPdf(canvas, `Certificate_${name.replace(/\s+/g, '_')}.pdf`);
      this.showToast('Certificate downloaded!', 'success');
    });
  },

  populateStudioEventSelector() {
    const selector = document.getElementById('studioEventSelector');
    if (!selector) return;

    const events = window.DataStore.getEvents();
    let html = `<option value="global">★ Default Master Template (All Events)</option>`;

    events.forEach(e => {
      const isCustom = !!e.certificateTemplate?.bgImage;
      const typeLabel = e.type === 'webinar_event' ? 'Webinar' : 'Meeting';
      html += `<option value="${e.id}">[${typeLabel}] ${e.title} (${e.date}) ${isCustom ? '• (Custom Template)' : ''}</option>`;
    });

    selector.innerHTML = html;
    selector.value = this.selectedStudioEventId || 'global';
  },

  syncStudioControlsWithConfig() {
    const config = window.DataStore.getEventTemplateConfig(this.selectedStudioEventId);
    const badge = document.getElementById('templateStatusBadge');

    if (badge) {
      if (config.bgImage) {
        if (this.selectedStudioEventId === 'global') {
          badge.innerHTML = `<span class="badge badge-status-present">✓ Master Template Loaded</span>`;
        } else {
          badge.innerHTML = `<span class="badge badge-status-present">✓ Event Template Loaded</span>`;
        }
      } else {
        badge.innerHTML = `<span class="badge badge-dept">Default Canvas</span>`;
      }
    }

    if (document.getElementById('sliderNameX')) document.getElementById('sliderNameX').value = config.nameX || 600;
    if (document.getElementById('sliderNameY')) document.getElementById('sliderNameY').value = config.nameY || 420;
    if (document.getElementById('sliderNameFontSize')) document.getElementById('sliderNameFontSize').value = config.nameFontSize || 46;
    if (document.getElementById('colorNameText')) document.getElementById('colorNameText').value = config.nameColor || '#1e293b';
    if (document.getElementById('selectFontFamily')) document.getElementById('selectFontFamily').value = config.fontFamily || 'Plus Jakarta Sans';
    if (document.getElementById('selectFontWeight')) document.getElementById('selectFontWeight').value = config.fontWeight || 'bold';
  },

  openStudioForEvent(eventId) {
    this.selectedStudioEventId = eventId;
    this.navigateTo('studio');
    this.populateStudioEventSelector();
    const selector = document.getElementById('studioEventSelector');
    if (selector) selector.value = eventId;
    this.syncStudioControlsWithConfig();
    this.renderStudioPreview();
  },

  async renderStudioPreview() {
    const canvas = document.getElementById('certificateCanvas');
    if (!canvas) return;

    const config = window.DataStore.getEventTemplateConfig(this.selectedStudioEventId);
    const name = document.getElementById('sampleRecipientName')?.value || 'Rahul Sharma';

    const options = {
      name,
      templateConfig: config,
      showGuide: true
    };

    await window.CertificateEngine.renderToCanvas(canvas, options);
  },

  // --- 4. MEMBERS DIRECTORY ---
  setupMembersModule() {
    document.getElementById('memberSearchInput')?.addEventListener('input', (e) => {
      this.renderMembersTable(e.target.value.trim());
    });

    document.getElementById('memberDeptFilter')?.addEventListener('change', () => {
      this.renderMembersTable();
    });

    document.getElementById('btnSaveNewMember')?.addEventListener('click', () => {
      this.saveNewMember();
    });

    document.getElementById('btnExportMembersCsv')?.addEventListener('click', () => {
      this.exportMembersCsv();
    });
  },

  renderMembersTable(searchQuery = '') {
    const members = window.DataStore.getMembers();
    const deptFilter = document.getElementById('memberDeptFilter')?.value || 'All';
    const tbody = document.getElementById('membersTableBody');
    if (!tbody) return;

    if (members.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:32px 14px; color:var(--text-muted);">
            <p style="font-weight:600; font-size:14px; margin-bottom:4px;">No Members Added Yet</p>
            <p style="font-size:12.5px; color:var(--text-dim); margin-bottom:12px;">Fill in member details to populate your directory.</p>
            <button class="btn btn-sm btn-primary" onclick="document.getElementById('addMemberModal').classList.add('active');">
              <i data-lucide="plus"></i> Add New Member
            </button>
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const filtered = members.filter(m => {
      const matchDept = (deptFilter === 'All') || (m.ecellDept === deptFilter);
      const matchSearch = !searchQuery ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.memberId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.collegeDept.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDept && matchSearch;
    });

    tbody.innerHTML = filtered.map(m => `
      <tr>
        <td><strong style="font-family:monospace; color:var(--primary);">${m.memberId}</strong></td>
        <td>
          <strong>${m.name}</strong>
          <p style="font-size:11.5px; color:var(--text-muted);">${m.email}</p>
        </td>
        <td><span class="badge badge-dept">${m.ecellDept}</span></td>
        <td><span class="badge badge-college">${m.collegeDept} (${m.year})</span></td>
        <td><span class="badge badge-status-present">${m.status || 'Active'}</span></td>
        <td>
          <button class="btn-icon" title="Delete" onclick="App.deleteMember('${m.id}')" style="color:var(--danger); width:30px; height:30px;">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
          </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  },

  saveNewMember() {
    const name = document.getElementById('newMemberName')?.value.trim();
    const email = document.getElementById('newMemberEmail')?.value.trim();
    const collegeDept = document.getElementById('newMemberCollegeDept')?.value;
    const year = document.getElementById('newMemberYear')?.value;
    const ecellDept = document.getElementById('newMemberEcellDept')?.value;

    if (!name || !email) {
      this.showToast('Please enter member name and email.', 'error');
      return;
    }

    window.DataStore.addMember({
      name,
      email,
      collegeDept,
      year,
      ecellDept,
      status: 'Active',
      joinedDate: new Date().toISOString().split('T')[0]
    });

    document.getElementById('newMemberName').value = '';
    document.getElementById('newMemberEmail').value = '';

    this.showToast(`Member ${name} added!`, 'success');
    this.closeAllModals();
    this.renderMembersTable();
    this.renderDashboard();
  },

  deleteMember(id) {
    const members = window.DataStore.getMembers();
    const m = members.find(x => x.id === id || x.memberId === id);
    const name = m ? m.name : 'this member';

    this.showCustomConfirm({
      title: 'Delete Member Profile?',
      message: `Are you sure you want to remove <strong>${name}</strong> from the member directory?`,
      icon: 'user-x',
      iconColor: 'var(--danger)',
      iconBg: 'rgba(239, 68, 68, 0.12)',
      confirmText: 'Delete Member',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteMember(id);
        this.showToast('Member deleted', 'info');
        this.renderMembersTable();
        this.renderDashboard();
      }
    });
  },

  exportMembersCsv() {
    const members = window.DataStore.getMembers();
    if (members.length === 0) {
      this.showToast('No members to export.', 'error');
      return;
    }
    let csv = 'Member ID,Name,Email,College Department,Year,E-Cell Department\n';
    members.forEach(m => {
      csv += `"${m.memberId}","${m.name}","${m.email}","${m.collegeDept}","${m.year}","${m.ecellDept}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `E-Cell_Members.csv`;
    a.click();
    this.showToast('Exported CSV!', 'success');
  },

  // --- 5. EVENTS & MEETINGS ---
  setupEventsModule() {
    document.getElementById('btnSaveNewEvent')?.addEventListener('click', () => {
      this.saveNewEvent();
    });

    const eventTypeSelect = document.getElementById('newEventType');
    const templateGroup = document.getElementById('eventTemplateUploadGroup');
    const templateFileInput = document.getElementById('newEventTemplateFile');
    const previewNote = document.getElementById('newEventTemplatePreview');

    eventTypeSelect?.addEventListener('change', (e) => {
      if (templateGroup) {
        templateGroup.style.display = e.target.value === 'webinar_event' ? 'block' : 'none';
      }
    });

    templateFileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.pendingEventTemplateBg = ev.target.result;
          if (previewNote) previewNote.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    document.querySelectorAll('.event-type-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.event-type-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderEventsList(btn.getAttribute('data-filter'));
      });
    });
  },

  renderEventsList(filter = 'All') {
    const events = window.DataStore.getEvents();
    const attendance = window.DataStore.getAttendance();
    const container = document.getElementById('eventsListContainer');
    if (!container) return;

    if (events.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:36px 14px;">
          <p style="font-weight:600; font-size:15px; margin-bottom:4px;">No Events or Meetings Found</p>
          <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:14px;">Create meetings or webinar events using the form.</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('addEventModal').classList.add('active');">
            <i data-lucide="plus"></i> Create New Event
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const markedEventIds = new Set(attendance.map(a => a.eventId));

    const filtered = events.filter(e => {
      if (filter === 'meeting') return e.type === 'meeting';
      if (filter === 'webinar') return e.type === 'webinar_event';
      if (filter === 'pending') return !markedEventIds.has(e.id);
      if (filter === 'completed') return markedEventIds.has(e.id);
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:30px 14px; color:var(--text-muted);">
          <p style="font-weight:600; font-size:14px;">No events matching filter "${filter}"</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(evt => {
      const isMeeting = evt.type === 'meeting';
      const hasCustomCert = !!evt.certificateTemplate?.bgImage;
      const isCompleted = markedEventIds.has(evt.id);
      const evtAttendance = attendance.filter(a => a.eventId === evt.id);
      const presentCount = evtAttendance.filter(a => a.status === 'Present').length;

      return `
        <div class="card" style="margin-bottom:14px; padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap;">
                <span class="badge ${isMeeting ? 'badge-meeting' : 'badge-webinar'}">
                  ${isMeeting ? 'Meeting (No Cert)' : 'Webinar (Issues Certificate)'}
                </span>
                ${isCompleted ? `
                  <span class="badge badge-status-present" style="font-size:11px;">
                    ✓ Attendance Logged (${presentCount} Present / ${evtAttendance.length} Total)
                  </span>
                ` : `
                  <span class="badge" style="font-size:11px; background:rgba(234, 179, 8, 0.15); color:var(--warning); border:1px solid rgba(234, 179, 8, 0.3);">
                    ⏳ Pending Attendance
                  </span>
                `}
                ${!isMeeting && hasCustomCert ? '<span class="badge badge-status-present" style="font-size:11px;">✓ Custom Template</span>' : ''}
                <span style="font-size:12px; color:var(--text-dim);">${evt.date}</span>
              </div>
              <h3 style="font-size:15px; font-weight:700;">${evt.title}</h3>
              <p style="font-size:12.5px; color:var(--text-muted); margin-top:2px;">${evt.description || ''}</p>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              ${!isMeeting ? `
                <button class="btn btn-sm btn-secondary" onclick="App.openStudioForEvent('${evt.id}')" title="Upload/Customize certificate template for this event">
                  <i data-lucide="palette"></i> Template
                </button>
              ` : ''}
              ${isCompleted ? `
                <button class="btn btn-sm btn-secondary" onclick="App.showEventAttendanceDetails('${evt.id}_${evt.date}')" title="View attendance records in log">
                  <i data-lucide="clipboard-list"></i> View Records
                </button>
                <button class="btn btn-sm btn-outline" style="font-size:11.5px; border:1px solid var(--border-color);" onclick="App.startAttendanceForEvent('${evt.id}')" title="Re-take or update attendance">
                  <i data-lucide="refresh-cw" style="width:12px; height:12px;"></i> Re-take
                </button>
              ` : `
                <button class="btn btn-sm btn-primary" onclick="App.startAttendanceForEvent('${evt.id}')">
                  <i data-lucide="check-square"></i> Mark Attendance
                </button>
              `}
              <button class="btn-icon" title="Delete" onclick="App.deleteEvent('${evt.id}')" style="color:var(--danger); width:32px; height:32px;">
                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
              </button>
            </div>
          </div>
          <div style="display:flex; gap:16px; font-size:12px; color:var(--text-dim); margin-top:10px; padding-top:8px; border-top:1px solid var(--border-color);">
            <span><i data-lucide="clock" style="width:12px;height:12px;vertical-align:middle;"></i> ${evt.time || 'TBD'}</span>
            <span><i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:middle;"></i> ${evt.location || 'Campus'}</span>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  },

  deleteEvent(id) {
    const events = window.DataStore.getEvents();
    const evt = events.find(e => e.id === id);
    const title = evt ? evt.title : 'this event';

    this.showCustomConfirm({
      title: 'Delete Event / Meeting?',
      message: `Are you sure you want to delete <strong>"${title}"</strong>? This will also remove any event-specific certificate settings.`,
      icon: 'trash-2',
      iconColor: 'var(--danger)',
      iconBg: 'rgba(239, 68, 68, 0.12)',
      confirmText: 'Delete Event',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteEvent(id);
        this.showToast('Event removed', 'info');
        this.renderEventsList();
        this.renderDashboard();
      }
    });
  },

  startAttendanceForEvent(eventId) {
    this.selectedEventId = eventId;
    this.navigateTo('attendance');
    this.goToWizardStep(2);
  },

  saveNewEvent() {
    const title = document.getElementById('newEventTitle')?.value.trim();
    const type = document.getElementById('newEventType')?.value;
    const date = document.getElementById('newEventDate')?.value;
    const time = document.getElementById('newEventTime')?.value;
    const location = document.getElementById('newEventLocation')?.value.trim();
    const desc = document.getElementById('newEventDesc')?.value.trim();

    if (!title || !date) {
      this.showToast('Please fill in title and date.', 'error');
      return;
    }

    const newEvt = {
      title,
      type,
      date,
      time: time || '17:00',
      location: location || 'Campus',
      certificateRequired: type === 'webinar_event',
      description: desc || '',
      status: 'Active'
    };

    if (this.pendingEventTemplateBg) {
      newEvt.certificateTemplate = {
        ...window.DataStore.getTemplateConfig(),
        bgImage: this.pendingEventTemplateBg
      };
    }

    window.DataStore.addEvent(newEvt);

    document.getElementById('newEventTitle').value = '';
    document.getElementById('newEventDesc').value = '';
    const fileInput = document.getElementById('newEventTemplateFile');
    if (fileInput) fileInput.value = '';
    const previewNote = document.getElementById('newEventTemplatePreview');
    if (previewNote) previewNote.style.display = 'none';
    this.pendingEventTemplateBg = null;

    this.showToast('Event created!', 'success');
    this.closeAllModals();
    this.renderEventsList();
    this.renderDashboard();
  },

  // --- 6. HISTORY ---
  setupHistoryModule() {
    document.getElementById('historyTabAttendance')?.addEventListener('click', () => {
      document.getElementById('historyTabAttendance').classList.add('active');
      document.getElementById('historyTabCerts').classList.remove('active');
      document.getElementById('historyAttendanceSection').style.display = 'block';
      document.getElementById('historyCertsSection').style.display = 'none';
      this.renderHistoryTable();
    });

    document.getElementById('historyTabCerts')?.addEventListener('click', () => {
      document.getElementById('historyTabCerts').classList.add('active');
      document.getElementById('historyTabAttendance').classList.remove('active');
      document.getElementById('historyAttendanceSection').style.display = 'none';
      document.getElementById('historyCertsSection').style.display = 'block';
      this.renderCertificatesLogTable();
    });
  },

  renderHistoryTable() {
    const records = window.DataStore.getAttendance();
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No attendance records logged yet.</td></tr>`;
      return;
    }

    // Group records by eventId and date
    const eventMap = new Map();
    records.forEach(r => {
      const key = `${r.eventId}_${r.date}`;
      if (!eventMap.has(key)) {
        eventMap.set(key, {
          eventId: r.eventId,
          eventTitle: r.eventTitle,
          eventType: r.eventType,
          date: r.date,
          present: 0,
          absent: 0,
          total: 0
        });
      }
      const ev = eventMap.get(key);
      ev.total++;
      if (r.status === 'Present') ev.present++;
      else ev.absent++;
    });

    // Sort by date descending
    const sorted = Array.from(eventMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    tbody.innerHTML = sorted.map(ev => `
      <tr>
        <td>
          <div style="font-weight:600;">${ev.eventTitle}</div>
          <span class="badge ${ev.eventType === 'meeting' ? 'badge-meeting' : 'badge-webinar'}" style="font-size:10.5px;">
            ${ev.eventType === 'meeting' ? 'Meeting' : 'Webinar'}
          </span>
        </td>
        <td><strong>${ev.date}</strong></td>
        <td><span style="font-weight:700; font-size:15px;">${ev.total}</span></td>
        <td>
          <span class="badge badge-status-present" style="font-size:13px; padding:4px 12px;">
            ${ev.present} Present
          </span>
        </td>
        <td>
          <span class="badge badge-status-absent" style="font-size:13px; padding:4px 12px;">
            ${ev.absent} Absent
          </span>
        </td>
        <td style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:6px;">
            <button class="btn btn-sm btn-secondary" style="font-size:11.5px; padding:4px 8px;" title="View attendee details" onclick="App.showEventAttendanceDetails('${ev.eventId}_${ev.date}')">
              <i data-lucide="eye" style="width:12px; height:12px;"></i> View
            </button>
            <button class="btn btn-sm btn-danger" style="font-size:11.5px; padding:4px 8px;" title="Delete this attendance session" onclick="App.deleteEventAttendanceSession('${ev.eventId}', '${ev.date}', '${ev.eventTitle.replace(/'/g, "\\'")}')">
              <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  },

  deleteEventAttendanceSession(eventId, date, eventTitle) {
    this.showCustomConfirm({
      title: 'Delete Attendance Session?',
      message: `Are you sure you want to delete attendance records for <strong>"${eventTitle}"</strong> on <strong>${date}</strong>?<br><span style="font-size:12px; color:var(--danger); margin-top:8px; display:inline-block; line-height:1.4;">⚠️ This will permanently remove this session log from history.</span>`,
      icon: 'trash-2',
      iconColor: 'var(--danger)',
      iconBg: 'rgba(239, 68, 68, 0.12)',
      confirmText: 'Delete Session',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteAttendanceSession(eventId, date);
        this.renderHistoryTable();
        this.renderDashboard();
        this.showToast(`Attendance log for "${eventTitle}" deleted successfully.`, 'info');
      }
    });
  },

  renderCertificatesLogTable() {
    const certs = window.DataStore.getCertificates();
    const tbody = document.getElementById('certsLogTableBody');
    if (!tbody) return;

    if (certs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No certificates issued yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = certs.map(c => `
      <tr>
        <td><strong style="font-family:monospace; color:var(--accent-gold);">${c.certificateNumber}</strong></td>
        <td>
          <strong>${c.memberName}</strong>
          <p style="font-size:11.5px; color:var(--text-muted);">${c.email}</p>
        </td>
        <td>${c.eventTitle}</td>
        <td>${c.issueDate}</td>
        <td><span class="badge badge-status-present">✓ Emailed to Member</span></td>
        <td style="text-align:center;">
          <button class="btn-icon" style="width:30px; height:30px; color:var(--danger);" title="Delete certificate log" onclick="App.deleteCertificateLog('${c.id}')">
            <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
          </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  },

  deleteCertificateLog(certId) {
    this.showCustomConfirm({
      title: 'Delete Certificate Log?',
      message: 'Are you sure you want to delete this issued certificate record from the audit log?',
      icon: 'trash-2',
      iconColor: 'var(--danger)',
      iconBg: 'rgba(239, 68, 68, 0.12)',
      confirmText: 'Delete Record',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteCertificate(certId);
        this.renderCertificatesLogTable();
        this.renderDashboard();
        this.showToast('Certificate log removed.', 'info');
      }
    });
  },

  // --- 7. EMAIL & SMTP SETTINGS MODULE ---
  setupEmailSettingsModule() {
    this.loadEmailSettings();

    document.getElementById('smtpProvider')?.addEventListener('change', (e) => {
      const customBox = document.getElementById('customSmtpFields');
      if (customBox) {
        customBox.style.display = e.target.value === 'custom' ? 'block' : 'none';
      }
    });

    document.getElementById('btnSaveEmailSettings')?.addEventListener('click', () => {
      this.saveEmailSettings();
    });

    document.getElementById('btnTestEmailConnection')?.addEventListener('click', () => {
      this.testEmailConnection();
    });
  },

  async loadEmailSettings() {
    const cached = localStorage.getItem('ecell_smtp_config_v1');
    let localConfig = null;
    if (cached) {
      try { localConfig = JSON.parse(cached); } catch(e) {}
    }

    try {
      const res = await fetch('/api/smtp-config');
      const data = await res.json();
      const c = (data.success && data.config && data.config.user) ? data.config : (localConfig || {});

      if (c) {
        if (document.getElementById('smtpProvider') && c.provider) document.getElementById('smtpProvider').value = c.provider;
        if (document.getElementById('smtpHost') && c.host) document.getElementById('smtpHost').value = c.host;
        if (document.getElementById('smtpPort') && c.port) document.getElementById('smtpPort').value = c.port;
        if (document.getElementById('smtpUser') && c.user) document.getElementById('smtpUser').value = c.user;
        if (document.getElementById('smtpPass') && localConfig && localConfig.pass) document.getElementById('smtpPass').value = localConfig.pass;
        if (document.getElementById('smtpSenderName') && c.senderName) document.getElementById('smtpSenderName').value = c.senderName;
        if (document.getElementById('smtpEmailSubject') && c.emailSubject) document.getElementById('smtpEmailSubject').value = c.emailSubject;
        if (document.getElementById('smtpEmailBody') && c.emailBody) document.getElementById('smtpEmailBody').value = c.emailBody;
        
        const customBox = document.getElementById('customSmtpFields');
        if (customBox) {
          customBox.style.display = (c.provider === 'custom') ? 'block' : 'none';
        }
      }
    } catch (e) {
      if (localConfig) {
        if (document.getElementById('smtpUser')) document.getElementById('smtpUser').value = localConfig.user || '';
        if (document.getElementById('smtpPass')) document.getElementById('smtpPass').value = localConfig.pass || '';
      }
    }
  },

  async saveEmailSettings() {
    const user = document.getElementById('smtpUser')?.value.trim();
    const pass = document.getElementById('smtpPass')?.value.trim();

    if (!user || !pass) {
      this.showToast('Please enter your Sender Email and 16-character Google App Password.', 'error');
      return;
    }

    const config = {
      provider: document.getElementById('smtpProvider')?.value || 'gmail',
      host: document.getElementById('smtpHost')?.value.trim() || 'smtp.gmail.com',
      port: document.getElementById('smtpPort')?.value.trim() || 587,
      user: user,
      pass: pass,
      senderName: document.getElementById('smtpSenderName')?.value.trim() || 'E-Cell Official',
      senderEmail: user,
      emailSubject: document.getElementById('smtpEmailSubject')?.value.trim(),
      emailBody: document.getElementById('smtpEmailBody')?.value.trim()
    };

    this.showToast('Verifying connection with mail server...', 'info');

    try {
      const res = await fetch('/api/smtp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        // Save permanently to local storage and sync to state
        localStorage.setItem('ecell_smtp_config_v1', JSON.stringify(config));
        this.showToast(data.message || 'Connected successfully! Real emails ready to send.', 'success');
        this.checkEmailConfigurationStatus();
      } else {
        this.showToast(`Error: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  async testEmailConnection() {
    const testEmail = prompt('Enter your personal email address to receive a live test certificate:', document.getElementById('smtpUser')?.value || '');
    if (!testEmail) return;

    this.showToast(`Sending live test certificate to ${testEmail}...`, 'info');

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1200;
    tempCanvas.height = 850;

    await window.CertificateEngine.renderToCanvas(tempCanvas, {
      name: 'Test Member',
      eventTitle: 'E-Cell Live Test Session'
    });

    const pdfBase64 = window.CertificateEngine.generatePdfBase64(tempCanvas);

    try {
      const res = await fetch('/api/send-certificate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: testEmail,
          recipientName: 'Test Member',
          eventTitle: 'E-Cell Live Test Session',
          certificateNumber: 'EC-TEST-001',
          pdfBase64: pdfBase64,
          customDescription: 'This is a test certificate email from your E-Cell Portal.'
        })
      });

      const data = await res.json();
      if (data.success) {
        this.showToast(`✓ Live test email delivered to ${testEmail}! Check your inbox.`, 'success');
      } else {
        this.showToast(`Failed: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  // --- 8. VERIFICATION ---
  setupVerificationModule() {
    const input = document.getElementById('verifySearchInput');
    const btn = document.getElementById('btnRunVerification');
    const resultBox = document.getElementById('verificationResultContainer');

    const executeVerify = () => {
      const q = input?.value.trim();
      if (!q) {
        this.showToast('Please enter a Certificate ID or Member ID', 'error');
        return;
      }

      const match = window.DataStore.verifyCertificate(q);
      if (!resultBox) return;

      if (match) {
        resultBox.innerHTML = `
          <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:16px; margin-top:16px;">
            <h4 style="color:var(--success); font-weight:700; font-size:15px; margin-bottom:8px;">✓ Authentic Certificate Verified</h4>
            <div style="font-size:13px; line-height:1.6;">
              <p><strong>Recipient:</strong> ${match.memberName} (${match.memberId})</p>
              <p><strong>Event:</strong> ${match.eventTitle}</p>
              <p><strong>Issued on:</strong> ${match.issueDate}</p>
              <p><strong>Certificate ID:</strong> ${match.certificateNumber}</p>
            </div>
          </div>
        `;
      } else {
        resultBox.innerHTML = `
          <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:16px; margin-top:16px; text-align:center;">
            <h4 style="color:var(--danger); font-size:14px; font-weight:700;">No Certificate Found for "${q}"</h4>
          </div>
        `;
      }
    };

    btn?.addEventListener('click', executeVerify);
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') executeVerify();
    });
  },

  // --- MODALS ---
  setupModals() {
    document.getElementById('btnOpenAddMemberModal')?.addEventListener('click', () => {
      document.getElementById('addMemberModal')?.classList.add('active');
    });

    document.getElementById('btnOpenAddEventModal')?.addEventListener('click', () => {
      document.getElementById('addEventModal')?.classList.add('active');
    });

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeAllModals();
      });
    });
  },

  // --- ADMIN SECURITY & AUTHENTICATION GATE ---
  setupAdminSecurity() {
    this.checkAdminAuthentication();

    // Toggle password visibility in login card
    const toggleBtn = document.getElementById('togglePasswordVisibilityBtn');
    const pwdInput = document.getElementById('adminPasswordInput');
    if (toggleBtn && pwdInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = pwdInput.type === 'password';
        pwdInput.type = isPassword ? 'text' : 'password';
        toggleBtn.innerHTML = isPassword ? '<i data-lucide="eye-off" style="width:16px;height:16px;"></i>' : '<i data-lucide="eye" style="width:16px;height:16px;"></i>';
        if (window.lucide) window.lucide.createIcons();
      });
    }

    // Change Password Modal Handler
    document.getElementById('btnSaveNewPassword')?.addEventListener('click', () => {
      this.handleAdminPasswordChange();
    });
  },

  checkAdminAuthentication() {
    const authScreen = document.getElementById('adminAuthScreen');
    const mainApp = document.getElementById('mainAppLayout');
    const isAuthenticated = sessionStorage.getItem('ecell_admin_auth') === 'true';

    if (isAuthenticated) {
      if (authScreen) authScreen.style.display = 'none';
      if (mainApp) mainApp.style.display = 'flex';
    } else {
      if (authScreen) authScreen.style.display = 'flex';
      if (mainApp) mainApp.style.display = 'none';
      setTimeout(() => document.getElementById('adminPasswordInput')?.focus(), 150);
    }
  },

  handleAdminLogin() {
    const pwdInput = document.getElementById('adminPasswordInput');
    const errorMsg = document.getElementById('loginErrorMsg');
    const enteredPassword = pwdInput?.value.trim();
    const correctPassword = window.DataStore.getAdminPassword();

    if (enteredPassword === correctPassword) {
      sessionStorage.setItem('ecell_admin_auth', 'true');
      if (errorMsg) errorMsg.style.display = 'none';
      
      const authScreen = document.getElementById('adminAuthScreen');
      const mainApp = document.getElementById('mainAppLayout');
      if (authScreen) authScreen.style.display = 'none';
      if (mainApp) mainApp.style.display = 'flex';

      this.renderDashboard();
      this.showToast('Welcome to E-Cell ABES Admin Portal!', 'success');
      if (window.confetti) window.confetti({ particleCount: 50, spread: 60 });
    } else {
      if (errorMsg) {
        errorMsg.textContent = '✕ Incorrect password. Please try again.';
        errorMsg.style.display = 'block';
      }
      if (pwdInput) {
        pwdInput.style.borderColor = 'var(--danger)';
        pwdInput.focus();
        pwdInput.select();
      }
    }
  },

  handleAdminLogout() {
    this.showCustomConfirm({
      title: 'Log Out of Admin Portal?',
      message: 'Are you sure you want to log out? You will need to enter your admin password again to access the portal.',
      icon: 'log-out',
      iconColor: 'var(--accent-gold)',
      iconBg: 'rgba(245, 158, 11, 0.12)',
      confirmText: 'Log Out',
      confirmClass: 'btn-primary',
      onConfirm: () => {
        sessionStorage.removeItem('ecell_admin_auth');
        const authScreen = document.getElementById('adminAuthScreen');
        const mainApp = document.getElementById('mainAppLayout');
        if (authScreen) authScreen.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
        
        const pwdInput = document.getElementById('adminPasswordInput');
        if (pwdInput) {
          pwdInput.value = '';
          pwdInput.focus();
        }
        const errorMsg = document.getElementById('loginErrorMsg');
        if (errorMsg) errorMsg.style.display = 'none';
        
        this.showToast('Logged out of Admin Portal.', 'info');
      }
    });
  },

  openChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (!modal) return;
    
    const currentInput = document.getElementById('currentAdminPwd');
    const newInput = document.getElementById('newAdminPwd');
    const confirmInput = document.getElementById('confirmNewAdminPwd');
    const feedback = document.getElementById('changePwdFeedback');

    if (currentInput) currentInput.value = '';
    if (newInput) newInput.value = '';
    if (confirmInput) confirmInput.value = '';
    if (feedback) feedback.style.display = 'none';

    modal.classList.add('active');
    setTimeout(() => currentInput?.focus(), 150);
  },

  handleAdminPasswordChange() {
    const currentInput = document.getElementById('currentAdminPwd');
    const newInput = document.getElementById('newAdminPwd');
    const confirmInput = document.getElementById('confirmNewAdminPwd');
    const feedback = document.getElementById('changePwdFeedback');

    const currentVal = currentInput?.value.trim() || '';
    const newVal = newInput?.value.trim() || '';
    const confirmVal = confirmInput?.value.trim() || '';
    const currentActual = window.DataStore.getAdminPassword();

    const showError = (msg) => {
      if (feedback) {
        feedback.innerHTML = `<span style="color:var(--danger); font-weight:700;">✕ ${msg}</span>`;
        feedback.style.background = 'rgba(239,68,68,0.12)';
        feedback.style.border = '1px solid rgba(239,68,68,0.3)';
        feedback.style.display = 'block';
      }
      this.showToast(msg, 'error');
    };

    if (currentVal !== currentActual) {
      showError('Current password does not match.');
      currentInput?.focus();
      return;
    }

    if (!newVal || newVal.length < 4) {
      showError('New password must be at least 4 characters long.');
      newInput?.focus();
      return;
    }

    if (newVal !== confirmVal) {
      showError('New passwords do not match.');
      confirmInput?.focus();
      return;
    }

    window.DataStore.setAdminPassword(newVal);

    if (feedback) feedback.style.display = 'none';
    if (currentInput) currentInput.value = '';
    if (newInput) newInput.value = '';
    if (confirmInput) confirmInput.value = '';

    this.closeAllModals();
    this.showToast('Admin password updated successfully!', 'success');
  },

  showCustomConfirm({
    title = 'Are you sure?',
    message = 'Please confirm this action.',
    icon = 'alert-triangle',
    iconColor = 'var(--danger)',
    iconBg = 'rgba(239, 68, 68, 0.12)',
    confirmText = 'Confirm',
    confirmClass = 'btn-danger',
    onConfirm = () => {}
  } = {}) {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) return;

    const titleEl = document.getElementById('confirmDialogTitle');
    const msgEl = document.getElementById('confirmDialogMessage');
    const iconWrapper = document.getElementById('confirmDialogIconWrapper');
    const iconEl = document.getElementById('confirmDialogIcon');
    const btn = document.getElementById('confirmDialogBtn');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (iconWrapper) {
      iconWrapper.style.background = iconBg;
      iconWrapper.style.color = iconColor;
    }
    if (iconEl) {
      iconEl.setAttribute('data-lucide', icon);
    }
    if (btn) {
      btn.textContent = confirmText;
      btn.className = `btn ${confirmClass}`;
      btn.onclick = () => {
        this.closeAllModals();
        onConfirm();
      };
    }

    if (window.lucide) window.lucide.createIcons();
    modal.classList.add('active');
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.remove('active');
    });
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }
};
