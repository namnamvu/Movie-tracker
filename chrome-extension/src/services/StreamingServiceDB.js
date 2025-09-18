// src/services/StreamingServiceDB.js
export class StreamingServiceDB {
  constructor() {
    this.dbName = 'movieTrackerDB';
    this.version = 1;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Streaming services store
        if (!db.objectStoreNames.contains('streamingServices')) {
          const serviceStore = db.createObjectStore('streamingServices', {
            keyPath: 'domain'
          });
          serviceStore.createIndex('name', 'name', { unique: false });
          serviceStore.createIndex('category', 'category', { unique: false });
          serviceStore.createIndex('addedDate', 'addedDate', { unique: false });
        }

        // User discovered services
        if (!db.objectStoreNames.contains('discoveredServices')) {
          const discoveredStore = db.createObjectStore('discoveredServices', {
            keyPath: 'domain'
          });
          discoveredStore.createIndex('firstDetected', 'firstDetected', { unique: false });
          discoveredStore.createIndex('lastSeen', 'lastSeen', { unique: false });
          discoveredStore.createIndex('movieCount', 'movieCount', { unique: false });
        }

        // Movies/content cache
        if (!db.objectStoreNames.contains('contentCache')) {
          const contentStore = db.createObjectStore('contentCache', {
            keyPath: 'id'
          });
          contentStore.createIndex('domain', 'domain', { unique: false });
          contentStore.createIndex('title', 'title', { unique: false });
          contentStore.createIndex('lastWatched', 'lastWatched', { unique: false });
        }

        // User preferences
        if (!db.objectStoreNames.contains('userPreferences')) {
          const prefStore = db.createObjectStore('userPreferences', {
            keyPath: 'key'
          });
        }
      };
    });
  }

  async ensureReady() {
    if (!this.db) {
      // If initPromise is still pending, await it
      await this.initPromise;
    }
    return this.db;
  }

  // Pre-populate with known streaming services
  async seedKnownServices() {
    await this.ensureReady();

    const knownServices = [
      {
        domain: 'netflix.com',
        name: 'Netflix',
        category: 'premium',
        patterns: ['/watch/', '/title/'],
        selectors: {
          title: '[data-uia="video-title"], .video-title, h1',
          duration: '[data-uia="video-duration"]',
          progress: '.progress-bar, .scrub-bar'
        }
      },
      {
        domain: 'hulu.com',
        name: 'Hulu',
        category: 'premium',
        patterns: ['/watch/', '/series/'],
        selectors: {
          title: '.content-pack__title, h1',
          duration: '.time-display__duration',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'amazon.com',
        name: 'Prime Video',
        category: 'premium',
        patterns: ['/gp/video/detail/', '/dp/'],
        selectors: {
          title: '[data-automation-id="title"], h1',
          duration: '.duration',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'primevideo.com',
        name: 'Prime Video',
        category: 'premium',
        patterns: ['/detail/', '/watch/'],
        selectors: {
          title: '[data-automation-id="title"], h1',
          duration: '.duration',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'disneyplus.com',
        name: 'Disney+',
        category: 'premium',
        patterns: ['/video/', '/movies/', '/series/'],
        selectors: {
          title: '.title-field, h1',
          duration: '.time-duration',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'hbomax.com',
        name: 'HBO Max',
        category: 'premium',
        patterns: ['/feature/', '/series/', '/episode/'],
        selectors: {
          title: '[data-testid="title"], h1',
          duration: '.duration-label',
          progress: '.scrubber-bar'
        }
      },
      {
        domain: 'crunchyroll.com',
        name: 'Crunchyroll',
        category: 'anime',
        patterns: ['/watch/', '/series/'],
        selectors: {
          title: '.episode-title, .series-title, h1',
          duration: '.time-total',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'funimation.com',
        name: 'Funimation',
        category: 'anime',
        patterns: ['/shows/', '/v/'],
        selectors: {
          title: '.show-headline, h1',
          duration: '.duration',
          progress: '.vjs-progress-holder'
        }
      },
      {
        // CORRECTED YOUTUBE DOMAIN
        domain: 'youtube.com',
        name: 'YouTube',
        category: 'free',
        patterns: ['/watch?v='],
        selectors: {
          title: 'h1.title, .watch-main-col h1',
          duration: '.ytp-time-duration',
          progress: '.ytp-progress-bar'
        }
      },
      {
        domain: 'tubi.tv',
        name: 'Tubi',
        category: 'free',
        patterns: ['/movies/', '/tv-shows/', '/watch/'],
        selectors: {
          title: '.watch-page-title, h1',
          duration: '.duration-text',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'pluto.tv',
        name: 'Pluto TV',
        category: 'free',
        patterns: ['/on-demand/', '/movies/', '/tv/'],
        selectors: {
          title: '.title, h1',
          duration: '.duration',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'paramount.com',
        name: 'Paramount+',
        category: 'premium',
        patterns: ['/shows/', '/movies/', '/video/'],
        selectors: {
          title: '.video-player__title, h1',
          duration: '.video-player__duration',
          progress: '.progress-bar'
        }
      },
      {
        domain: 'peacocktv.com',
        name: 'Peacock',
        category: 'freemium',
        patterns: ['/watch/', '/movies/', '/tv/'],
        selectors: {
          title: '.title, h1',
          duration: '.duration',
          progress: '.progress-bar'
        }
      }
    ];

    const transaction = this.db.transaction(['streamingServices'], 'readwrite');
    const store = transaction.objectStore('streamingServices');

    for (const service of knownServices) {
      service.addedDate = new Date();
      service.isKnown = true;

      try {
        // Use .put() which will update if exists, or add if not.
        // This ensures that if the DB already has some data, it gets updated.
        await this.promisifyRequest(store.put(service));
      } catch (error) {
        console.error(`Error seeding service ${service.name}:`, error);
      }
    }
  }

  // Add a newly discovered streaming service
  async addDiscoveredService(domain, metadata = {}) {
    await this.ensureReady();

    const service = {
      domain: domain.replace(/^www\./, ''), // Normalize domain
      name: metadata.name || this.extractServiceName(domain),
      category: metadata.category || 'unknown',
      patterns: metadata.patterns || [],
      selectors: metadata.selectors || {},
      firstDetected: new Date(),
      lastSeen: new Date(),
      movieCount: 1,
      isUserDiscovered: true,
      confidence: metadata.confidence || 0.5
    };

    const transaction = this.db.transaction(['discoveredServices'], 'readwrite');
    const store = transaction.objectStore('discoveredServices');

    try {
      // Check if already exists
      const existing = await this.promisifyRequest(store.get(service.domain));

      if (existing) {
        // Update existing
        existing.lastSeen = new Date();
        existing.movieCount = (existing.movieCount || 0) + 1;
        existing.confidence = Math.min(existing.confidence + 0.1, 1);

        if (metadata.patterns) {
          // Merge patterns, ensuring uniqueness
          existing.patterns = [...new Set([...(existing.patterns || []), ...metadata.patterns])];
        }
        if (metadata.selectors) {
           // Merge selectors, allowing new ones to overwrite old ones
           existing.selectors = { ...(existing.selectors || {}), ...metadata.selectors };
        }

        await this.promisifyRequest(store.put(existing));
        return existing;
      } else {
        // Add new
        await this.promisifyRequest(store.add(service));
        return service;
      }
    } catch (error) {
      console.error('Error adding discovered service:', error);
      throw error;
    }
  }

  // Get streaming service info for a domain
  async getServiceInfo(domain) {
    await this.ensureReady();

    const normalizedDomain = domain.replace(/^www\./, '');

    // Try known services first
    const knownTransaction = this.db.transaction(['streamingServices'], 'readonly');
    const knownStore = knownTransaction.objectStore('streamingServices');

    // Try exact match first
    let service = await this.promisifyRequest(knownStore.get(normalizedDomain));

    if (!service) {
      // Try partial match for subdomains
      const allKnown = await this.promisifyRequest(knownStore.getAll());
      service = allKnown.find(s =>
        normalizedDomain.includes(s.domain) || s.domain.includes(normalizedDomain)
      );
    }

    if (!service) {
      // Try discovered services
      const discoveredTransaction = this.db.transaction(['discoveredServices'], 'readonly');
      const discoveredStore = discoveredTransaction.objectStore('discoveredServices');

      service = await this.promisifyRequest(discoveredStore.get(normalizedDomain));

      if (!service) {
        const allDiscovered = await this.promisifyRequest(discoveredStore.getAll());
        service = allDiscovered.find(s =>
          normalizedDomain.includes(s.domain) || s.domain.includes(normalizedDomain)
        );
      }
    }

    return service;
  }

  // Fast domain lookup - returns boolean for quick detection
  async isKnownStreamingDomain(domain) {
    await this.ensureReady();

    const normalizedDomain = domain.replace(/^www\./, '');

    try {
      // Use getServiceInfo to check existence. It already handles both known and discovered.
      const service = await this.getServiceInfo(normalizedDomain);
      return !!service;
    } catch (error) {
      console.error('Error checking domain:', error);
      return false;
    }
  }

  // Get all streaming services (for management UI)
  async getAllServices() {
    await this.ensureReady();

    const [known, discovered] = await Promise.all([
      this.promisifyRequest(this.db.transaction(['streamingServices'], 'readonly').objectStore('streamingServices').getAll()),
      this.promisifyRequest(this.db.transaction(['discoveredServices'], 'readonly').objectStore('discoveredServices').getAll())
    ]);

    return {
      known,
      discovered,
      total: known.length + discovered.length
    };
  }

  // Get all domains for fast lookup
  async getAllDomains() {
    await this.ensureReady();

    const services = await this.getAllServices();
    const domains = new Set();

    services.known.forEach(service => domains.add(service.domain));
    services.discovered.forEach(service => domains.add(service.domain));

    return Array.from(domains);
  }

  // Cache movie/content data
  async cacheContent(movieData) {
    await this.ensureReady();

    const content = {
      id: `${movieData.serviceName}_${this.hashString(movieData.title)}_${Date.now()}`, // Use serviceName for ID
      domain: movieData.domain, // Use domain, not 'site'
      title: movieData.title,
      url: movieData.url,
      duration: movieData.duration,
      currentTime: movieData.currentTime,
      type: movieData.type, // Assuming type is passed
      lastWatched: new Date(),
      watchCount: 1
    };

    const transaction = this.db.transaction(['contentCache'], 'readwrite');
    const store = transaction.objectStore('contentCache');

    try {
      // Check if content already exists based on title and domain (or more unique identifier)
      // For simplicity, we add new entry for now, but a check could be added here
      await this.promisifyRequest(store.add(content));
    } catch (error) {
      // This might fail if the ID is not truly unique.
      // If 'id' is used as keyPath, and it's generated with Date.now(), it should be unique enough.
      console.log('Content already cached (or ID collision):', content.title, error);
    }
  }

  // Get recently watched content
  async getRecentContent(limit = 50) {
    await this.ensureReady();

    const transaction = this.db.transaction(['contentCache'], 'readonly');
    const store = transaction.objectStore('contentCache');
    const index = store.index('lastWatched');

    // Use openCursor for more control and to get a limited number of results in reverse order (most recent first)
    const results = [];
    const request = index.openCursor(null, 'prev'); // 'prev' for descending order

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          // Filter by lastWatched date if needed, or just take the latest `limit`
          // Example: const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          // if (cursor.value.lastWatched > thirtyDaysAgo) {
          //   results.push(cursor.value);
          // }
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Analytics - get streaming service usage stats
  async getServiceStats() {
    await this.ensureReady();

    const services = await this.getAllServices(); // Includes known and discovered
    const content = await this.promisifyRequest(
      this.db.transaction(['contentCache'], 'readonly').objectStore('contentCache').getAll()
    );

    const stats = {};

    // Initialize stats with all known/discovered services to ensure they appear even if no content watched yet
    [...services.known, ...services.discovered].forEach(s => {
      if (!stats[s.domain]) {
        stats[s.domain] = {
          domain: s.domain,
          name: s.name, // Include service name
          category: s.category, // Include category
          contentCount: 0,
          totalWatchTime: 0, // In seconds
          lastUsed: null
        };
      }
    });

    // Count content per service
    content.forEach(item => {
      if (stats[item.domain]) { // Only process if service exists in our list
        stats[item.domain].contentCount++;
        stats[item.domain].totalWatchTime += item.duration || 0;

        if (!stats[item.domain].lastUsed || item.lastWatched > stats[item.domain].lastUsed) {
          stats[item.domain].lastUsed = item.lastWatched;
        }
      }
    });

    return Object.values(stats).sort((a, b) => b.contentCount - a.contentCount);
  }

  // User preferences management
  async setUserPreference(key, value) {
    await this.ensureReady();

    const transaction = this.db.transaction(['userPreferences'], 'readwrite');
    const store = transaction.objectStore('userPreferences');

    await this.promisifyRequest(store.put({ key, value, updatedAt: new Date() }));
  }

  async getUserPreference(key, defaultValue = null) {
    await this.ensureReady();

    const transaction = this.db.transaction(['userPreferences'], 'readonly');
    const store = transaction.objectStore('userPreferences');

    const result = await this.promisifyRequest(store.get(key));
    return result ? result.value : defaultValue;
  }

  // Utility methods
  extractServiceName(domain) {
    // This is a basic extractor. For better results, you'd likely use a predefined map.
    // Example: 'www.netflix.com' -> 'netflix.com' -> 'netflix' -> 'Netflix'
    return domain
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Clean up old data
  async cleanup(daysToKeep = 90) {
    await this.ensureReady();

    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    try {
      // Clean old content cache
      const contentTransaction = this.db.transaction(['contentCache'], 'readwrite');
      const contentStore = contentTransaction.objectStore('contentCache');
      const contentIndex = contentStore.index('lastWatched');

      const request = contentIndex.openCursor(IDBKeyRange.upperBound(cutoffDate));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      await this.promisifyRequest(request); // Await the completion of the cursor iteration

      // Clean discovered services with low confidence and old dates
      const discoveredTransaction = this.db.transaction(['discoveredServices'], 'readwrite');
      const discoveredStore = discoveredTransaction.objectStore('discoveredServices');

      const allDiscovered = await this.promisifyRequest(discoveredStore.getAll());

      for (const service of allDiscovered) {
        if (service.confidence < 0.3 && service.lastSeen < cutoffDate) {
          await this.promisifyRequest(discoveredStore.delete(service.domain));
        }
      }

      console.log(`Cleanup completed: removed content older than ${daysToKeep} days`);
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // Export data for backup/analysis
  async exportData() {
    await this.ensureReady();

    const [services, content, preferences] = await Promise.all([
      this.getAllServices(),
      this.promisifyRequest(this.db.transaction(['contentCache'], 'readonly').objectStore('contentCache').getAll()),
      this.promisifyRequest(this.db.transaction(['userPreferences'], 'readonly').objectStore('userPreferences').getAll())
    ]);

    return {
      timestamp: new Date().toISOString(),
      version: this.version,
      services,
      content,
      preferences
    };
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}