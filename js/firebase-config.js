/**
 * E-Cell Attendance & Certificate System
 * Firebase Firestore Cloud Database Configuration & Real-Time Sync
 */

const FIREBASE_CONFIG_STORAGE_KEY = 'ecell_firebase_config_v1';

class FirebaseSyncManager {
  constructor() {
    this.isInitialized = false;
    this.db = null;
    this.unsubscribeListener = null;
    this.status = 'local'; // 'connected', 'syncing', 'error', 'local'
    this.lastSyncTime = null;
    this.init();
  }

  getSavedConfig() {
    try {
      const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return null;
  }

  saveConfig(config) {
    if (!config) {
      localStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
    } else {
      localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
    // Re-initialize with new config
    this.init();
  }

  async init() {
    let config = this.getSavedConfig();
    
    // Check if Firebase SDK is loaded
    if (typeof firebase === 'undefined') {
      console.info('Firebase SDK not available. Using central server / local sync.');
      this.status = 'local';
      this.updateStatusBadge();
      return;
    }

    // If not in localStorage, check if server/Vercel has environment variables set
    if (!config || !config.apiKey || config.apiKey.includes('placeholder')) {
      try {
        const res = await fetch('/api/firebase-config', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.isConfigured && data.config) {
            config = data.config;
            localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
          }
        }
      } catch (e) {}
    }

    if (!config || !config.apiKey || config.apiKey.includes('placeholder')) {
      this.status = 'local';
      this.updateStatusBadge();
      return;
    }

    try {
      if (firebase.apps && firebase.apps.length > 0) {
        this.db = firebase.firestore();
      } else {
        firebase.initializeApp(config);
        this.db = firebase.firestore();
      }

      this.isInitialized = true;
      this.status = 'connected';
      this.updateStatusBadge();
      this.listenToCloudUpdates();
      console.log('🔥 Firebase Cloud Database connected successfully!');
    } catch (err) {
      console.error('Firebase initialization error:', err);
      this.status = 'error';
      this.updateStatusBadge();
    }
  }

  updateStatusBadge() {
    const badge = document.getElementById('cloudSyncStatusBadge');
    const text = document.getElementById('cloudSyncStatusText');
    if (!badge || !text) return;

    badge.className = 'cloud-sync-badge';
    if (this.status === 'connected') {
      badge.classList.add('status-connected');
      text.textContent = 'Cloud Synced (Real-Time)';
      badge.title = 'Connected to Firebase Firestore. Changes synchronize instantly across all devices.';
    } else if (this.status === 'syncing') {
      badge.classList.add('status-syncing');
      text.textContent = 'Syncing...';
      badge.title = 'Synchronizing with cloud database...';
    } else if (this.status === 'error') {
      badge.classList.add('status-error');
      text.textContent = 'Sync Issue';
      badge.title = 'Could not reach cloud database. Check internet or Firebase config.';
    } else {
      badge.classList.add('status-local');
      text.textContent = 'Server / Local DB';
      badge.title = 'Running on Server/Local DB. Click to connect Free Firebase Cloud Database for instant multi-device sync.';
    }
  }

  listenToCloudUpdates() {
    if (!this.db) return;
    if (this.unsubscribeListener) {
      this.unsubscribeListener();
    }

    try {
      const docRef = this.db.collection('ecell_attendance_portal').doc('shared_database');
      
      this.unsubscribeListener = docRef.onSnapshot((doc) => {
        if (doc.exists) {
          const cloudData = doc.data();
          if (cloudData) {
            this.status = 'connected';
            this.lastSyncTime = new Date();
            this.updateStatusBadge();

            // Dispatch cloud data to DataStore
            if (window.dataStore && typeof window.dataStore.applyCloudUpdate === 'function') {
              window.dataStore.applyCloudUpdate(cloudData);
            }
          }
        } else {
          // Document does not exist yet on cloud, seed it with initial data!
          console.log('Seeding initial database to Firebase Cloud...');
          this.seedInitialData();
        }
      }, (error) => {
        console.warn('Firestore real-time listener error:', error);
        this.status = 'error';
        this.updateStatusBadge();
      });
    } catch (e) {
      console.warn('Failed to attach Firestore listener:', e);
    }
  }

  async seedInitialData() {
    if (!this.db) return;
    try {
      const initialPayload = window.dataStore ? window.dataStore.getFullDatabasePayload() : null;
      if (initialPayload) {
        await this.pushToCloud(initialPayload);
      }
    } catch(e) {
      console.warn('Failed to seed cloud DB:', e);
    }
  }

  async pushToCloud(payload) {
    if (!this.db || !this.isInitialized) return false;
    try {
      this.status = 'syncing';
      this.updateStatusBadge();

      const docRef = this.db.collection('ecell_attendance_portal').doc('shared_database');
      await docRef.set({
        ...payload,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      this.status = 'connected';
      this.lastSyncTime = new Date();
      this.updateStatusBadge();
      return true;
    } catch (err) {
      console.error('Failed to write to Firebase Cloud DB:', err);
      this.status = 'error';
      this.updateStatusBadge();
      return false;
    }
  }
}

window.FirebaseSync = new FirebaseSyncManager();
