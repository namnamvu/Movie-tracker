// src/detectors/StreamingServiceDetector.js
import { StreamingServiceDB } from "../services/StreamingServiceDB";

export class StreamingServiceDetector {
  constructor() {
    this.db = new StreamingServiceDB();
    this.domainCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.initialized = false;

    // Call init in constructor and handle async nature
    // The constructor itself cannot be async, so we just kick off init.
    // Consumers should await `initialized` or ensure `init` has completed.
    this.init().then(() => {
      console.log('StreamingServiceDetector fully initialized');
    }).catch(error => {
      console.error('Failed to fully initialize StreamingServiceDetector during construction:', error);
    });
  }

  async init() {
    if (this.initialized) return; // Prevent re-initialization

    try {
      await this.db.ensureReady();

      // Seed known services on first run
      const hasSeeded = await this.db.getUserPreference('hasSeededServices', false);
      if (!hasSeeded) {
        await this.db.seedKnownServices();
        await this.db.setUserPreference('hasSeededServices', true);
        console.log('Seeded known streaming services');
      }

      // Preload domains into cache for faster lookup
      await this.preloadDomainCache();
      this.initialized = true;

      console.log('StreamingServiceDetector initialized');
    } catch (error) {
      console.error('Failed to initialize StreamingServiceDetector:', error);
      // It's crucial to handle initialization failures, perhaps by setting initialized to false
      // or throwing an error to indicate an unready state.
      throw error; // Re-throw to propagate the error
    }
  }

  async preloadDomainCache() {
    try {
      const domains = await this.db.getAllDomains();
      const now = Date.now();

      domains.forEach(domain => {
        this.domainCache.set(domain, {
          isStreaming: true,
          timestamp: now
        });
      });

      console.log(`Preloaded ${domains.length} streaming domains into cache`);
    } catch (error) {
      console.error('Failed to preload domain cache:', error);
    }
  }

  // Fast domain detection using cache + fallback to DB
  async isStreamingSite(url) {
    if (!this.initialized) {
      // Ensure initialization is complete before proceeding
      await this.init();
    }

    try {
      const domain = this.extractDomain(url);
      const now = Date.now();

      // Check cache first
      const cached = this.domainCache.get(domain);
      if (cached && (now - cached.timestamp) < this.cacheExpiry) {
        return cached.isStreaming;
      }

      // Check database
      const isStreaming = await this.db.isKnownStreamingDomain(domain);

      // Update cache
      this.domainCache.set(domain, {
        isStreaming,
        timestamp: now
      });

      return isStreaming;
    } catch (error) {
      console.error('Error checking if streaming site:', error);
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
      console.error('Error getting service info:', error);
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
      currentTime: 0, // Initialize
      duration: 0 // Initialize
    };

    // Check URL patterns
    if (service.patterns && service.patterns.length > 0) {
      const hasMatchingPattern = service.patterns.some(pattern =>
        url.includes(pattern)
      );

      if (hasMatchingPattern) {
        movieInfo.isMoviePage = true;
        movieInfo.confidence += 0.4;
      }
    }

    // Check for video elements and get current time/duration
    const videoElements = context.querySelectorAll('video');
    if (videoElements.length > 0) {
      const mainVideo = videoElements[0]; // Assuming the first video element is the main one
      if (mainVideo) {
        movieInfo.confidence += 0.3;
        movieInfo.isMoviePage = true;
        movieInfo.currentTime = mainVideo.currentTime || 0;
        movieInfo.duration = mainVideo.duration && !isNaN(mainVideo.duration) && mainVideo.duration !== Infinity ? mainVideo.duration : 0; // Handle NaN or Infinity duration
      }
    }

    // Check for title using service-specific selectors
    if (service.selectors && service.selectors.title) {
      const titleElement = context.querySelector(service.selectors.title);
      if (titleElement && titleElement.textContent.trim()) {
        movieInfo.title = titleElement.textContent.trim();
        movieInfo.confidence += 0.2;
        movieInfo.isMoviePage = true;
      }
    }

    // Generic title fallback
    if (!movieInfo.title) {
      const genericTitleSelectors = [
        'h1',
        '[data-testid*="title"]',
        '.title',
        '.video-title',
        '.movie-title',
        '.show-title'
      ];

      for (const selector of genericTitleSelectors) {
        const element = context.querySelector(selector);
        if (element && element.textContent.trim()) {
          movieInfo.title = element.textContent.trim();
          movieInfo.confidence += 0.1;
          movieInfo.isMoviePage = true; // A title strongly suggests it's a content page
          break;
        }
      }
    }

    // Check for duration/progress indicators (if not already from video element)
    if (!movieInfo.duration && service.selectors && service.selectors.duration) {
      const durationElement = context.querySelector(service.selectors.duration);
      if (durationElement) {
        // Attempt to parse duration from text if it's in a specific format (e.g., "HH:MM:SS" or "MM:SS")
        const durationText = durationElement.textContent.trim();
        const parts = durationText.split(':').map(Number);
        let durationInSeconds = 0;
        if (parts.length === 3) { // HH:MM:SS
          durationInSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) { // MM:SS
          durationInSeconds = parts[0] * 60 + parts[1];
        } else if (!isNaN(Number(durationText))) { // Just a number (e.g., minutes)
          durationInSeconds = Number(durationText) * 60; // Assume minutes if only a number
        }

        if (durationInSeconds > 0) {
          movieInfo.duration = durationInSeconds;
          movieInfo.confidence += 0.1;
          movieInfo.isMoviePage = true; // Duration also suggests a content page
        }
      }
    }

    // Return movieInfo only if confidence is sufficient and it's identified as a movie page
    return movieInfo.confidence > 0.3 && movieInfo.isMoviePage ? movieInfo : null;
  }

  // Add a new streaming service discovered by user interaction
  async addUserDiscoveredService(url, metadata = {}) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const domain = this.extractDomain(url);

      // Analyze current page for patterns
      const patterns = this.analyzeUrlPatterns(url);
      const selectors = this.analyzePageSelectors();

      const serviceMetadata = {
        ...metadata,
        patterns: [...(metadata.patterns || []), ...patterns],
        selectors: { ...(metadata.selectors || {}), ...selectors },
        confidence: 0.7 // User-discovered has higher initial confidence
      };

      const service = await this.db.addDiscoveredService(domain, serviceMetadata);

      // Update cache
      this.domainCache.set(domain, {
        isStreaming: true,
        timestamp: Date.now()
      });

      console.log('Added user-discovered streaming service:', service);
      return service;
    } catch (error) {
      console.error('Error adding user-discovered service:', error);
      throw error;
    }
  }

  // Analyze URL to extract potential patterns
  analyzeUrlPatterns(url) {
    const patterns = [];
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Common video page patterns
      const commonPatterns = [
        '/watch/',
        '/video/',
        '/movie/',
        '/series/',
        '/show/',
        '/episode/',
        '/stream/',
        '/play/'
      ];

      commonPatterns.forEach(pattern => {
        if (pathname.includes(pattern)) {
          patterns.push(pattern);
        }
      });

      // Extract dynamic patterns (like /v/[id] or /watch?v=)
      if (pathname.match(/\/v\/\w+/)) {
        patterns.push('/v/');
      }

      if (urlObj.search.includes('v=')) {
        patterns.push('/watch?v=');
      }
    } catch (error) {
      console.error('Error analyzing URL patterns:', error);
    }
    return patterns;
  }

  // Analyze page to find potential selectors
  analyzePageSelectors() {
    const selectors = {};

    // Find title selectors
    const titleCandidates = [
      'h1',
      '[data-testid*="title"]',
      '.title',
      '.video-title',
      '.movie-title',
      '.show-title' // Added for completeness
    ];

    for (const selector of titleCandidates) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 3) { // Ensure a meaningful title
        selectors.title = selector;
        break;
      }
    }

    // Find video elements (selector can be 'video' itself)
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      selectors.video = 'video';
    }

    // Find duration selectors
    const durationCandidates = [
      '.duration',
      '.time-total',
      '.video-duration',
      '[data-testid*="duration"]',
      '.current-time + .separator + .total-time' // Common pattern for "0:00 / 1:23:45"
    ];

    for (const selector of durationCandidates) {
      const element = document.querySelector(selector);
      if (element && element.textContent.match(/\d+:\d+/)) { // Match common time formats
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
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      console.error('Invalid URL:', url);
      return '';
    }
  }

  // Get statistics about discovered services
  async getDiscoveryStats() {
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Assuming db.getAllServices() and db.getServiceStats() exist and return expected data
      // Note: The original code assumes a `total` property on `services` which isn't standard
      // for an array. Adjusting to `services.length`.
      const allServices = await this.db.getAllServices(); // Assuming this returns an array
      const stats = await this.db.getServiceStats(); // Assuming this returns array for mostUsedServices

      const knownServices = allServices.filter(s => s.isKnownService); // Assuming a property to differentiate
      const discoveredServices = allServices.filter(s => !s.isKnownService);

      return {
        totalServices: allServices.length,
        knownServices: knownServices.length,
        discoveredServices: discoveredServices.length,
        mostUsedServices: stats.slice(0, 10), // Assuming stats is an array of service objects
        cacheSize: this.domainCache.size
      };
    } catch (error) {
      console.error('Error getting discovery stats:', error);
      return null;
    }
  }

  // Clean up cache and old data
  async cleanup() {
    try {
      // Clear expired cache entries
      const now = Date.now();
      for (const [domain, data] of this.domainCache.entries()) {
        if (now - data.timestamp > this.cacheExpiry) {
          this.domainCache.delete(domain);
        }
      }

      // Clean up database (assuming this.db.cleanup() exists)
      await this.db.cleanup();

      console.log('StreamingServiceDetector cleanup completed');
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // Export service data for analysis
  async exportServices() {
    try {
      return await this.db.exportData();
    } catch (error) {
      console.error('Export failed:', error);
      return null;
    }
  }
}