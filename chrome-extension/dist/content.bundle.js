(() => {
  // src/services/StreamingServiceDB.js
  var StreamingServiceDB = class {
    constructor() {
      this.dbName = "movieTrackerDB";
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
          if (!db.objectStoreNames.contains("streamingServices")) {
            const serviceStore = db.createObjectStore("streamingServices", {
              keyPath: "domain"
            });
            serviceStore.createIndex("name", "name", { unique: false });
            serviceStore.createIndex("category", "category", { unique: false });
            serviceStore.createIndex("addedDate", "addedDate", { unique: false });
          }
          if (!db.objectStoreNames.contains("discoveredServices")) {
            const discoveredStore = db.createObjectStore("discoveredServices", {
              keyPath: "domain"
            });
            discoveredStore.createIndex("firstDetected", "firstDetected", { unique: false });
            discoveredStore.createIndex("lastSeen", "lastSeen", { unique: false });
            discoveredStore.createIndex("movieCount", "movieCount", { unique: false });
          }
          if (!db.objectStoreNames.contains("contentCache")) {
            const contentStore = db.createObjectStore("contentCache", {
              keyPath: "id"
            });
            contentStore.createIndex("domain", "domain", { unique: false });
            contentStore.createIndex("title", "title", { unique: false });
            contentStore.createIndex("lastWatched", "lastWatched", { unique: false });
          }
          if (!db.objectStoreNames.contains("userPreferences")) {
            const prefStore = db.createObjectStore("userPreferences", {
              keyPath: "key"
            });
          }
        };
      });
    }
    async ensureReady() {
      if (!this.db) {
        await this.initPromise;
      }
      return this.db;
    }
    // Pre-populate with known streaming services
    async seedKnownServices() {
      await this.ensureReady();
      const knownServices = [
        {
          domain: "netflix.com",
          name: "Netflix",
          category: "premium",
          patterns: ["/watch/", "/title/"],
          selectors: {
            title: '[data-uia="video-title"], .video-title, h1',
            duration: '[data-uia="video-duration"]',
            progress: ".progress-bar, .scrub-bar"
          }
        },
        {
          domain: "hulu.com",
          name: "Hulu",
          category: "premium",
          patterns: ["/watch/", "/series/"],
          selectors: {
            title: ".content-pack__title, h1",
            duration: ".time-display__duration",
            progress: ".progress-bar"
          }
        },
        {
          domain: "amazon.com",
          name: "Prime Video",
          category: "premium",
          patterns: ["/gp/video/detail/", "/dp/"],
          selectors: {
            title: '[data-automation-id="title"], h1',
            duration: ".duration",
            progress: ".progress-bar"
          }
        },
        {
          domain: "primevideo.com",
          name: "Prime Video",
          category: "premium",
          patterns: ["/detail/", "/watch/"],
          selectors: {
            title: '[data-automation-id="title"], h1',
            duration: ".duration",
            progress: ".progress-bar"
          }
        },
        {
          domain: "disneyplus.com",
          name: "Disney+",
          category: "premium",
          patterns: ["/video/", "/movies/", "/series/"],
          selectors: {
            title: ".title-field, h1",
            duration: ".time-duration",
            progress: ".progress-bar"
          }
        },
        {
          domain: "hbomax.com",
          name: "HBO Max",
          category: "premium",
          patterns: ["/feature/", "/series/", "/episode/"],
          selectors: {
            title: '[data-testid="title"], h1',
            duration: ".duration-label",
            progress: ".scrubber-bar"
          }
        },
        {
          domain: "crunchyroll.com",
          name: "Crunchyroll",
          category: "anime",
          patterns: ["/watch/", "/series/"],
          selectors: {
            title: ".episode-title, .series-title, h1",
            duration: ".time-total",
            progress: ".progress-bar"
          }
        },
        {
          domain: "funimation.com",
          name: "Funimation",
          category: "anime",
          patterns: ["/shows/", "/v/"],
          selectors: {
            title: ".show-headline, h1",
            duration: ".duration",
            progress: ".vjs-progress-holder"
          }
        },
        {
          // CORRECTED YOUTUBE DOMAIN
          domain: "youtube.com",
          name: "YouTube",
          category: "free",
          patterns: ["/watch?v="],
          selectors: {
            title: "h1.title, .watch-main-col h1",
            duration: ".ytp-time-duration",
            progress: ".ytp-progress-bar"
          }
        },
        {
          domain: "tubi.tv",
          name: "Tubi",
          category: "free",
          patterns: ["/movies/", "/tv-shows/", "/watch/"],
          selectors: {
            title: ".watch-page-title, h1",
            duration: ".duration-text",
            progress: ".progress-bar"
          }
        },
        {
          domain: "pluto.tv",
          name: "Pluto TV",
          category: "free",
          patterns: ["/on-demand/", "/movies/", "/tv/"],
          selectors: {
            title: ".title, h1",
            duration: ".duration",
            progress: ".progress-bar"
          }
        },
        {
          domain: "paramount.com",
          name: "Paramount+",
          category: "premium",
          patterns: ["/shows/", "/movies/", "/video/"],
          selectors: {
            title: ".video-player__title, h1",
            duration: ".video-player__duration",
            progress: ".progress-bar"
          }
        },
        {
          domain: "peacocktv.com",
          name: "Peacock",
          category: "freemium",
          patterns: ["/watch/", "/movies/", "/tv/"],
          selectors: {
            title: ".title, h1",
            duration: ".duration",
            progress: ".progress-bar"
          }
        }
      ];
      const transaction = this.db.transaction(["streamingServices"], "readwrite");
      const store = transaction.objectStore("streamingServices");
      for (const service of knownServices) {
        service.addedDate = /* @__PURE__ */ new Date();
        service.isKnown = true;
        try {
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
        domain: domain.replace(/^www\./, ""),
        // Normalize domain
        name: metadata.name || this.extractServiceName(domain),
        category: metadata.category || "unknown",
        patterns: metadata.patterns || [],
        selectors: metadata.selectors || {},
        firstDetected: /* @__PURE__ */ new Date(),
        lastSeen: /* @__PURE__ */ new Date(),
        movieCount: 1,
        isUserDiscovered: true,
        confidence: metadata.confidence || 0.5
      };
      const transaction = this.db.transaction(["discoveredServices"], "readwrite");
      const store = transaction.objectStore("discoveredServices");
      try {
        const existing = await this.promisifyRequest(store.get(service.domain));
        if (existing) {
          existing.lastSeen = /* @__PURE__ */ new Date();
          existing.movieCount = (existing.movieCount || 0) + 1;
          existing.confidence = Math.min(existing.confidence + 0.1, 1);
          if (metadata.patterns) {
            existing.patterns = [.../* @__PURE__ */ new Set([...existing.patterns || [], ...metadata.patterns])];
          }
          if (metadata.selectors) {
            existing.selectors = { ...existing.selectors || {}, ...metadata.selectors };
          }
          await this.promisifyRequest(store.put(existing));
          return existing;
        } else {
          await this.promisifyRequest(store.add(service));
          return service;
        }
      } catch (error) {
        console.error("Error adding discovered service:", error);
        throw error;
      }
    }
    // Get streaming service info for a domain
    async getServiceInfo(domain) {
      await this.ensureReady();
      const normalizedDomain = domain.replace(/^www\./, "");
      const knownTransaction = this.db.transaction(["streamingServices"], "readonly");
      const knownStore = knownTransaction.objectStore("streamingServices");
      let service = await this.promisifyRequest(knownStore.get(normalizedDomain));
      if (!service) {
        const allKnown = await this.promisifyRequest(knownStore.getAll());
        service = allKnown.find(
          (s) => normalizedDomain.includes(s.domain) || s.domain.includes(normalizedDomain)
        );
      }
      if (!service) {
        const discoveredTransaction = this.db.transaction(["discoveredServices"], "readonly");
        const discoveredStore = discoveredTransaction.objectStore("discoveredServices");
        service = await this.promisifyRequest(discoveredStore.get(normalizedDomain));
        if (!service) {
          const allDiscovered = await this.promisifyRequest(discoveredStore.getAll());
          service = allDiscovered.find(
            (s) => normalizedDomain.includes(s.domain) || s.domain.includes(normalizedDomain)
          );
        }
      }
      return service;
    }
    // Fast domain lookup - returns boolean for quick detection
    async isKnownStreamingDomain(domain) {
      await this.ensureReady();
      const normalizedDomain = domain.replace(/^www\./, "");
      try {
        const service = await this.getServiceInfo(normalizedDomain);
        return !!service;
      } catch (error) {
        console.error("Error checking domain:", error);
        return false;
      }
    }
    // Get all streaming services (for management UI)
    async getAllServices() {
      await this.ensureReady();
      const [known, discovered] = await Promise.all([
        this.promisifyRequest(this.db.transaction(["streamingServices"], "readonly").objectStore("streamingServices").getAll()),
        this.promisifyRequest(this.db.transaction(["discoveredServices"], "readonly").objectStore("discoveredServices").getAll())
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
      const domains = /* @__PURE__ */ new Set();
      services.known.forEach((service) => domains.add(service.domain));
      services.discovered.forEach((service) => domains.add(service.domain));
      return Array.from(domains);
    }
    // Cache movie/content data
    async cacheContent(movieData) {
      await this.ensureReady();
      const content = {
        id: `${movieData.serviceName}_${this.hashString(movieData.title)}_${Date.now()}`,
        // Use serviceName for ID
        domain: movieData.domain,
        // Use domain, not 'site'
        title: movieData.title,
        url: movieData.url,
        duration: movieData.duration,
        currentTime: movieData.currentTime,
        type: movieData.type,
        // Assuming type is passed
        lastWatched: /* @__PURE__ */ new Date(),
        watchCount: 1
      };
      const transaction = this.db.transaction(["contentCache"], "readwrite");
      const store = transaction.objectStore("contentCache");
      try {
        await this.promisifyRequest(store.add(content));
      } catch (error) {
        console.log("Content already cached (or ID collision):", content.title, error);
      }
    }
    // Get recently watched content
    async getRecentContent(limit = 50) {
      await this.ensureReady();
      const transaction = this.db.transaction(["contentCache"], "readonly");
      const store = transaction.objectStore("contentCache");
      const index = store.index("lastWatched");
      const results = [];
      const request = index.openCursor(null, "prev");
      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && results.length < limit) {
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
      const services = await this.getAllServices();
      const content = await this.promisifyRequest(
        this.db.transaction(["contentCache"], "readonly").objectStore("contentCache").getAll()
      );
      const stats = {};
      [...services.known, ...services.discovered].forEach((s) => {
        if (!stats[s.domain]) {
          stats[s.domain] = {
            domain: s.domain,
            name: s.name,
            // Include service name
            category: s.category,
            // Include category
            contentCount: 0,
            totalWatchTime: 0,
            // In seconds
            lastUsed: null
          };
        }
      });
      content.forEach((item) => {
        if (stats[item.domain]) {
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
      const transaction = this.db.transaction(["userPreferences"], "readwrite");
      const store = transaction.objectStore("userPreferences");
      await this.promisifyRequest(store.put({ key, value, updatedAt: /* @__PURE__ */ new Date() }));
    }
    async getUserPreference(key, defaultValue = null) {
      await this.ensureReady();
      const transaction = this.db.transaction(["userPreferences"], "readonly");
      const store = transaction.objectStore("userPreferences");
      const result = await this.promisifyRequest(store.get(key));
      return result ? result.value : defaultValue;
    }
    // Utility methods
    extractServiceName(domain) {
      return domain.replace(/^www\./, "").split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    }
    hashString(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
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
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1e3);
      try {
        const contentTransaction = this.db.transaction(["contentCache"], "readwrite");
        const contentStore = contentTransaction.objectStore("contentCache");
        const contentIndex = contentStore.index("lastWatched");
        const request = contentIndex.openCursor(IDBKeyRange.upperBound(cutoffDate));
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        await this.promisifyRequest(request);
        const discoveredTransaction = this.db.transaction(["discoveredServices"], "readwrite");
        const discoveredStore = discoveredTransaction.objectStore("discoveredServices");
        const allDiscovered = await this.promisifyRequest(discoveredStore.getAll());
        for (const service of allDiscovered) {
          if (service.confidence < 0.3 && service.lastSeen < cutoffDate) {
            await this.promisifyRequest(discoveredStore.delete(service.domain));
          }
        }
        console.log(`Cleanup completed: removed content older than ${daysToKeep} days`);
      } catch (error) {
        console.error("Cleanup failed:", error);
      }
    }
    // Export data for backup/analysis
    async exportData() {
      await this.ensureReady();
      const [services, content, preferences] = await Promise.all([
        this.getAllServices(),
        this.promisifyRequest(this.db.transaction(["contentCache"], "readonly").objectStore("contentCache").getAll()),
        this.promisifyRequest(this.db.transaction(["userPreferences"], "readonly").objectStore("userPreferences").getAll())
      ]);
      return {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
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
  };

  // src/detectors/StreamingServiceDetector.js
  var StreamingServiceDetector = class {
    constructor() {
      this.db = new StreamingServiceDB();
      this.domainCache = /* @__PURE__ */ new Map();
      this.cacheExpiry = 5 * 60 * 1e3;
      this.initialized = false;
      this.init().then(() => {
        console.log("StreamingServiceDetector fully initialized");
      }).catch((error) => {
        console.error("Failed to fully initialize StreamingServiceDetector during construction:", error);
      });
    }
    async init() {
      if (this.initialized) return;
      try {
        await this.db.ensureReady();
        const hasSeeded = await this.db.getUserPreference("hasSeededServices", false);
        if (!hasSeeded) {
          await this.db.seedKnownServices();
          await this.db.setUserPreference("hasSeededServices", true);
          console.log("Seeded known streaming services");
        }
        await this.preloadDomainCache();
        this.initialized = true;
        console.log("StreamingServiceDetector initialized");
      } catch (error) {
        console.error("Failed to initialize StreamingServiceDetector:", error);
        throw error;
      }
    }
    async preloadDomainCache() {
      try {
        const domains = await this.db.getAllDomains();
        const now = Date.now();
        domains.forEach((domain) => {
          this.domainCache.set(domain, {
            isStreaming: true,
            timestamp: now
          });
        });
        console.log(`Preloaded ${domains.length} streaming domains into cache`);
      } catch (error) {
        console.error("Failed to preload domain cache:", error);
      }
    }
    // Fast domain detection using cache + fallback to DB
    async isStreamingSite(url) {
      if (!this.initialized) {
        await this.init();
      }
      try {
        const domain = this.extractDomain(url);
        const now = Date.now();
        const cached = this.domainCache.get(domain);
        if (cached && now - cached.timestamp < this.cacheExpiry) {
          return cached.isStreaming;
        }
        const isStreaming = await this.db.isKnownStreamingDomain(domain);
        this.domainCache.set(domain, {
          isStreaming,
          timestamp: now
        });
        return isStreaming;
      } catch (error) {
        console.error("Error checking if streaming site:", error);
        return false;
      }
    }
    // Get detailed service information
    async getServiceInfo(url) {
      if (!this.initialized) {
        await this.init();
      }
      try {
        const domain = this.extractDomain(url);
        return await this.db.getServiceInfo(domain);
      } catch (error) {
        console.error("Error getting service info:", error);
        return null;
      }
    }
    // Detect if current page is likely a movie/video page
    async detectMovieContext(url, documentContext = null) {
      if (!this.initialized) {
        await this.init();
      }
      const service = await this.getServiceInfo(url);
      if (!service) return null;
      const context = documentContext || document;
      const movieInfo = {
        url,
        domain: service.domain,
        serviceName: service.name,
        category: service.category,
        isMoviePage: false,
        confidence: 0,
        currentTime: 0,
        // Initialize
        duration: 0
        // Initialize
      };
      if (service.patterns && service.patterns.length > 0) {
        const hasMatchingPattern = service.patterns.some(
          (pattern) => url.includes(pattern)
        );
        if (hasMatchingPattern) {
          movieInfo.isMoviePage = true;
          movieInfo.confidence += 0.4;
        }
      }
      const videoElements = context.querySelectorAll("video");
      if (videoElements.length > 0) {
        const mainVideo = videoElements[0];
        if (mainVideo) {
          movieInfo.confidence += 0.3;
          movieInfo.isMoviePage = true;
          movieInfo.currentTime = mainVideo.currentTime || 0;
          movieInfo.duration = mainVideo.duration && !isNaN(mainVideo.duration) && mainVideo.duration !== Infinity ? mainVideo.duration : 0;
        }
      }
      if (service.selectors && service.selectors.title) {
        const titleElement = context.querySelector(service.selectors.title);
        if (titleElement && titleElement.textContent.trim()) {
          movieInfo.title = titleElement.textContent.trim();
          movieInfo.confidence += 0.2;
          movieInfo.isMoviePage = true;
        }
      }
      if (!movieInfo.title) {
        const genericTitleSelectors = [
          "h1",
          '[data-testid*="title"]',
          ".title",
          ".video-title",
          ".movie-title",
          ".show-title"
        ];
        for (const selector of genericTitleSelectors) {
          const element = context.querySelector(selector);
          if (element && element.textContent.trim()) {
            movieInfo.title = element.textContent.trim();
            movieInfo.confidence += 0.1;
            movieInfo.isMoviePage = true;
            break;
          }
        }
      }
      if (!movieInfo.duration && service.selectors && service.selectors.duration) {
        const durationElement = context.querySelector(service.selectors.duration);
        if (durationElement) {
          const durationText = durationElement.textContent.trim();
          const parts = durationText.split(":").map(Number);
          let durationInSeconds = 0;
          if (parts.length === 3) {
            durationInSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          } else if (parts.length === 2) {
            durationInSeconds = parts[0] * 60 + parts[1];
          } else if (!isNaN(Number(durationText))) {
            durationInSeconds = Number(durationText) * 60;
          }
          if (durationInSeconds > 0) {
            movieInfo.duration = durationInSeconds;
            movieInfo.confidence += 0.1;
            movieInfo.isMoviePage = true;
          }
        }
      }
      return movieInfo.confidence > 0.3 && movieInfo.isMoviePage ? movieInfo : null;
    }
    // Add a new streaming service discovered by user interaction
    async addUserDiscoveredService(url, metadata = {}) {
      if (!this.initialized) {
        await this.init();
      }
      try {
        const domain = this.extractDomain(url);
        const patterns = this.analyzeUrlPatterns(url);
        const selectors = this.analyzePageSelectors();
        const serviceMetadata = {
          ...metadata,
          patterns: [...metadata.patterns || [], ...patterns],
          selectors: { ...metadata.selectors || {}, ...selectors },
          confidence: 0.7
          // User-discovered has higher initial confidence
        };
        const service = await this.db.addDiscoveredService(domain, serviceMetadata);
        this.domainCache.set(domain, {
          isStreaming: true,
          timestamp: Date.now()
        });
        console.log("Added user-discovered streaming service:", service);
        return service;
      } catch (error) {
        console.error("Error adding user-discovered service:", error);
        throw error;
      }
    }
    // Analyze URL to extract potential patterns
    analyzeUrlPatterns(url) {
      const patterns = [];
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const commonPatterns = [
          "/watch/",
          "/video/",
          "/movie/",
          "/series/",
          "/show/",
          "/episode/",
          "/stream/",
          "/play/"
        ];
        commonPatterns.forEach((pattern) => {
          if (pathname.includes(pattern)) {
            patterns.push(pattern);
          }
        });
        if (pathname.match(/\/v\/\w+/)) {
          patterns.push("/v/");
        }
        if (urlObj.search.includes("v=")) {
          patterns.push("/watch?v=");
        }
      } catch (error) {
        console.error("Error analyzing URL patterns:", error);
      }
      return patterns;
    }
    // Analyze page to find potential selectors
    analyzePageSelectors() {
      const selectors = {};
      const titleCandidates = [
        "h1",
        '[data-testid*="title"]',
        ".title",
        ".video-title",
        ".movie-title",
        ".show-title"
        // Added for completeness
      ];
      for (const selector of titleCandidates) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 3) {
          selectors.title = selector;
          break;
        }
      }
      const videos = document.querySelectorAll("video");
      if (videos.length > 0) {
        selectors.video = "video";
      }
      const durationCandidates = [
        ".duration",
        ".time-total",
        ".video-duration",
        '[data-testid*="duration"]',
        ".current-time + .separator + .total-time"
        // Common pattern for "0:00 / 1:23:45"
      ];
      for (const selector of durationCandidates) {
        const element = document.querySelector(selector);
        if (element && element.textContent.match(/\d+:\d+/)) {
          selectors.duration = selector;
          break;
        }
      }
      return selectors;
    }
    // Extract domain from URL
    extractDomain(url) {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, "");
      } catch (error) {
        console.error("Invalid URL:", url);
        return "";
      }
    }
    // Get statistics about discovered services
    async getDiscoveryStats() {
      if (!this.initialized) {
        await this.init();
      }
      try {
        const allServices = await this.db.getAllServices();
        const stats = await this.db.getServiceStats();
        const knownServices = allServices.filter((s) => s.isKnownService);
        const discoveredServices = allServices.filter((s) => !s.isKnownService);
        return {
          totalServices: allServices.length,
          knownServices: knownServices.length,
          discoveredServices: discoveredServices.length,
          mostUsedServices: stats.slice(0, 10),
          // Assuming stats is an array of service objects
          cacheSize: this.domainCache.size
        };
      } catch (error) {
        console.error("Error getting discovery stats:", error);
        return null;
      }
    }
    // Clean up cache and old data
    async cleanup() {
      try {
        const now = Date.now();
        for (const [domain, data] of this.domainCache.entries()) {
          if (now - data.timestamp > this.cacheExpiry) {
            this.domainCache.delete(domain);
          }
        }
        await this.db.cleanup();
        console.log("StreamingServiceDetector cleanup completed");
      } catch (error) {
        console.error("Cleanup failed:", error);
      }
    }
    // Export service data for analysis
    async exportServices() {
      try {
        return await this.db.exportData();
      } catch (error) {
        console.error("Export failed:", error);
        return null;
      }
    }
  };

  // src/content/MovieDetector.js
  var MovieDetector = class {
    constructor() {
      this.detector = new StreamingServiceDetector();
      this.currentMovie = null;
      this.observers = /* @__PURE__ */ new Map();
      this.detectionInterval = null;
      this.isActive = false;
      this.initialized = false;
    }
    async init() {
      if (this.initialized) return;
      try {
        await this.detector.init();
        const currentUrl = window.location.href;
        const isStreamingSite = await this.detector.isStreamingSite(currentUrl);
        if (!isStreamingSite) {
          console.log("Movie Tracker: Site not recognized as streaming");
          this.initialized = true;
          return;
        }
        const serviceInfo = await this.detector.getServiceInfo(currentUrl);
        console.log("Movie Tracker: Streaming site detected:", serviceInfo);
        this.isActive = true;
        this.initialized = true;
        this.startDetection();
      } catch (error) {
        console.error("Movie Tracker: Initialization error:", error);
        this.initialized = true;
      }
    }
    // Add method to check if ready
    isReady() {
      return this.initialized;
    }
    startDetection() {
      this.detectMovie();
      this.detectionInterval = setInterval(() => this.detectMovie(), 3e3);
      this.setupObservers();
    }
    async detectMovie() {
      if (!this.isActive || !this.initialized) return;
      try {
        const context = await this.detector.detectMovieContext(window.location.href, document);
        if (context && context.title) {
          const isNewMovie = !this.currentMovie || this.currentMovie.title !== context.title || this.currentMovie.url !== context.url;
          if (isNewMovie) {
            this.currentMovie = context;
            this.onMovieDetected(context);
          } else {
            this.updateProgress(context);
          }
        } else if (this.currentMovie) {
          console.log("Movie Tracker: Movie no longer detected on page.");
          this.currentMovie = null;
        }
      } catch (err) {
        console.error("Movie Tracker: Detection error:", err);
      }
    }
    updateProgress(movie) {
      if (!this.currentMovie) return;
      const changed = movie.currentTime !== this.currentMovie.currentTime || movie.duration !== this.currentMovie.duration;
      if (changed) {
        this.currentMovie.currentTime = movie.currentTime;
        this.currentMovie.duration = movie.duration;
        this.currentMovie.timestamp = Date.now();
        this.onProgressUpdate(this.currentMovie);
      }
    }
    setupObservers() {
      this.observers.forEach((o) => o.disconnect());
      this.observers.clear();
      const observeVideoElements = () => {
        const videos = document.querySelectorAll("video");
        videos.forEach((video) => {
          video.removeEventListener("timeupdate", this.detectMovieBound);
          video.removeEventListener("durationchange", this.detectMovieBound);
          video.removeEventListener("play", this.detectMovieBound);
          video.removeEventListener("pause", this.detectMovieBound);
          video.removeEventListener("ended", this.detectMovieBound);
          video.addEventListener("timeupdate", this.detectMovieBound);
          video.addEventListener("durationchange", this.detectMovieBound);
          video.addEventListener("play", this.detectMovieBound);
          video.addEventListener("pause", this.detectMovieBound);
          video.addEventListener("ended", this.detectMovieBound);
        });
      };
      this.detectMovieBound = this.detectMovie.bind(this);
      observeVideoElements();
      const videoDomObserver = new MutationObserver((mutations) => {
        let videosChanged = false;
        for (const mutation of mutations) {
          if (mutation.type === "childList" && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
            const containsVideo = (nodes) => Array.from(nodes).some((node) => node.nodeName === "VIDEO" || node.querySelector?.("video"));
            if (containsVideo(mutation.addedNodes) || containsVideo(mutation.removedNodes)) {
              videosChanged = true;
              break;
            }
          }
        }
        if (videosChanged) {
          console.log("Movie Tracker: Video DOM changed, re-observing videos.");
          observeVideoElements();
          this.detectMovieBound();
        }
      });
      videoDomObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.observers.set("videoDom", videoDomObserver);
      const titleObserver = new MutationObserver(() => this.detectMovieBound());
      titleObserver.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true
      });
      this.observers.set("title", titleObserver);
    }
    onMovieDetected(movie) {
      console.log("Movie Tracker: Movie detected:", movie);
      const overlay = document.createElement("div");
      overlay.className = "movie-tracker-overlay visible";
      overlay.innerHTML = `
      <div class="title">${movie.title}</div>
      <div class="info">${this.formatDuration(movie.duration)} \u2022 ${movie.serviceName}</div>
    `;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 5e3);
      this.sendToBackground("MOVIE_DETECTED", movie);
      window.dispatchEvent(
        new CustomEvent("movieDetected", { detail: movie })
      );
    }
    onProgressUpdate(movie) {
      console.log("Movie Tracker: Progress updated:", movie);
      this.sendToBackground("PROGRESS_UPDATE", movie);
      window.dispatchEvent(
        new CustomEvent("progressUpdate", { detail: movie })
      );
    }
    formatDuration(seconds) {
      if (isNaN(seconds) || seconds === 0) return "N/A";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor(seconds % 3600 / 60);
      const s = Math.floor(seconds % 60);
      const pad = (num) => num.toString().padStart(2, "0");
      if (h > 0) {
        return `${h}:${pad(m)}:${pad(s)}`;
      }
      return `${m}:${pad(s)}`;
    }
    sendToBackground(type, data) {
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type, data, timestamp: Date.now() }).catch((e) => {
          console.error("Movie Tracker: Background send failed", e);
        });
      } else {
        console.warn("Movie Tracker: chrome.runtime.sendMessage not available");
      }
    }
    destroy() {
      this.isActive = false;
      this.initialized = false;
      if (this.detectionInterval) clearInterval(this.detectionInterval);
      this.observers.forEach((o) => o.disconnect());
      this.observers.clear();
      const videos = document.querySelectorAll("video");
      videos.forEach((video) => {
        video.removeEventListener("timeupdate", this.detectMovieBound);
        video.removeEventListener("durationchange", this.detectMovieBound);
        video.removeEventListener("play", this.detectMovieBound);
        video.removeEventListener("pause", this.detectMovieBound);
        video.removeEventListener("ended", this.detectMovieBound);
      });
      console.log("Movie Tracker: Detector destroyed");
    }
  };
  var MovieDetector_default = MovieDetector;

  // src/content/content-script.js
  console.log("Movie Tracker: Content script loaded");
  var movieDetectorInstance = null;
  var lastUrl = window.location.href;
  var initializeMovieDetector = async () => {
    if (movieDetectorInstance) {
      movieDetectorInstance.destroy();
      movieDetectorInstance = null;
      console.log("Movie Tracker: Previous detector destroyed.");
    }
    try {
      movieDetectorInstance = new MovieDetector_default();
      await movieDetectorInstance.init();
      window.movieDetector = {
        instance: movieDetectorInstance,
        smartDetector: {
          extractMovieInfo: () => {
            if (movieDetectorInstance.currentMovie) {
              return movieDetectorInstance.currentMovie;
            }
            const url = window.location.href;
            return movieDetectorInstance.detector.detectMovieContext(url, document);
          }
        }
      };
      console.log("Movie Tracker: New detector initialized and exposed globally.");
    } catch (error) {
      console.error("Movie Tracker: Failed to initialize detector:", error);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMovieDetector);
  } else {
    initializeMovieDetector();
  }
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log("Movie Tracker: URL changed to", currentUrl);
      initializeMovieDetector();
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href", "src", "data-url"]
  });
})();
//# sourceMappingURL=content.bundle.js.map
