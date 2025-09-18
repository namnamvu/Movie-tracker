// src/lib/smart-movie-detector.js
class SmartMovieDetector {
    constructor() {
      this.movieIndicators = {
        // Common video-related selectors
        videoSelectors: [
          'video',
          '[class*="video"]',
          '[class*="player"]',
          '[id*="video"]',
          '[id*="player"]',
          'iframe[src*="player"]',
          'iframe[src*="embed"]'
        ],
        
        // Movie/TV show title indicators
        titleIndicators: [
          'title',
          'movie',
          'film',
          'episode',
          'series',
          'show',
          'watch',
          'stream',
          'video'
        ],
        
        // Progress/time indicators
        progressSelectors: [
          '[class*="progress"]',
          '[class*="time"]',
          '[class*="duration"]',
          '[class*="scrub"]',
          '[class*="seek"]',
          '[aria-label*="progress"]',
          '[aria-label*="time"]'
        ],
        
        // Control indicators
        controlSelectors: [
          '[class*="play"]',
          '[class*="pause"]',
          '[class*="control"]',
          '[aria-label*="play"]',
          '[aria-label*="pause"]',
          'button[title*="play"]',
          'button[title*="pause"]'
        ],
        
        // Known streaming domains
        knownStreamingSites: [
          'netflix.com',
          'hulu.com',
          'amazon.com',
          'disneyplus.com',
          'hbo.com',
          'paramount.com',
          'peacocktv.com',
          'crunchyroll.com',
          'funimation.com',
          'tubi.tv',
          'pluto.tv',
          'vudu.com',
          'movies.com',
          'fandangonow.com',
          'crackle.com',
          'imdb.com',
          'plex.tv',
          'kanopy.com',
          'hoopla.com'
        ],
        
        // Movie-related keywords in URL
        urlKeywords: [
          'watch',
          'movie',
          'film',
          'video',
          'stream',
          'play',
          'episode',
          'series',
          'show'
        ]
      };
    }
  
    // Main method to detect if current site is showing a movie
    detectMovieSite() {
      const hostname = window.location.hostname;
      const pathname = window.location.pathname.toLowerCase();
      const url = window.location.href.toLowerCase();
      
      // Check if it's a known streaming site
      if (this.isKnownStreamingSite(hostname)) {
        return this.analyzeStreamingSite();
      }
      
      // Check URL for movie-related keywords
      const urlScore = this.analyzeUrl(url, pathname);
      
      // Analyze page content
      const contentScore = this.analyzePageContent();
      
      // Combined scoring
      const totalScore = urlScore + contentScore;
      
      return {
        isMovieSite: totalScore >= 3,
        confidence: Math.min(totalScore / 5, 1),
        details: {
          urlScore,
          contentScore,
          totalScore,
          hostname
        }
      };
    }
  
    isKnownStreamingSite(hostname) {
      return this.movieIndicators.knownStreamingSites.some(site => 
        hostname.includes(site)
      );
    }
  
    analyzeStreamingSite() {
      const hasVideo = this.hasVideoElement();
      const hasControls = this.hasVideoControls();
      const hasProgress = this.hasProgressBar();
      
      return {
        isMovieSite: hasVideo || hasControls || hasProgress,
        confidence: 0.9,
        details: {
          hasVideo,
          hasControls,
          hasProgress,
          isKnownSite: true
        }
      };
    }
  
    analyzeUrl(url, pathname) {
      let score = 0;
      
      // Check for movie keywords in URL
      this.movieIndicators.urlKeywords.forEach(keyword => {
        if (url.includes(keyword)) {
          score += 1;
        }
      });
      
      // Check for video file extensions
      if (/\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v)/.test(url)) {
        score += 2;
      }
      
      // Check for streaming-like URL patterns
      if (/\/watch\/|\/video\/|\/stream\/|\/play\//.test(pathname)) {
        score += 1;
      }
      
      return score;
    }
  
    analyzePageContent() {
      let score = 0;
      
      // Check for video elements
      if (this.hasVideoElement()) {
        score += 2;
      }
      
      // Check for video controls
      if (this.hasVideoControls()) {
        score += 1;
      }
      
      // Check for progress bar
      if (this.hasProgressBar()) {
        score += 1;
      }
      
      // Check page title for movie indicators
      if (this.hasMovieTitle()) {
        score += 1;
      }
      
      // Check for fullscreen capability
      if (this.hasFullscreenCapability()) {
        score += 1;
      }
      
      return score;
    }
  
    hasVideoElement() {
      return this.movieIndicators.videoSelectors.some(selector => 
        document.querySelector(selector) !== null
      );
    }
  
    hasVideoControls() {
      return this.movieIndicators.controlSelectors.some(selector => 
        document.querySelector(selector) !== null
      );
    }
  
    hasProgressBar() {
      return this.movieIndicators.progressSelectors.some(selector => 
        document.querySelector(selector) !== null
      );
    }
  
    hasMovieTitle() {
      const title = document.title.toLowerCase();
      return this.movieIndicators.titleIndicators.some(indicator => 
        title.includes(indicator)
      );
    }
  
    hasFullscreenCapability() {
      const video = document.querySelector('video');
      return video && (
        video.requestFullscreen ||
        video.webkitRequestFullscreen ||
        video.mozRequestFullScreen ||
        video.msRequestFullscreen
      );
    }
  
    // Extract movie information from any site
    extractMovieInfo() {
      const detection = this.detectMovieSite();
      
      if (!detection.isMovieSite) {
        return null;
      }
  
      const title = this.extractTitle();
      const videoElement = this.findVideoElement();
      const duration = this.extractDuration();
      const currentTime = this.extractCurrentTime();
      
      return {
        title,
        url: window.location.href,
        site: window.location.hostname,
        videoElement,
        duration,
        currentTime,
        confidence: detection.confidence,
        timestamp: Date.now()
      };
    }
  
    extractTitle() {
      // Try multiple methods to extract title
      const selectors = [
        'h1',
        '[class*="title"]',
        '[id*="title"]',
        '.video-title',
        '.movie-title',
        '.episode-title',
        'title'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return this.cleanTitle(element.textContent.trim());
        }
      }
      
      // Fallback to document title
      return this.cleanTitle(document.title);
    }
  
    cleanTitle(title) {
      return title
        .replace(/^(Watch\s+|Stream\s+|Play\s+)/i, '')
        .replace(/\s+\|\s+.*$/, '')
        .replace(/\s+- Season \d+.*$/, '')
        .replace(/\s+\(\d{4}\)$/, '')
        .replace(/\s+- Episode \d+.*$/, '')
        .trim();
    }
  
    findVideoElement() {
      return document.querySelector('video') || 
             document.querySelector('iframe[src*="player"]') ||
             document.querySelector('[class*="video-player"]');
    }
  
    extractDuration() {
      const video = document.querySelector('video');
      if (video && video.duration) {
        return video.duration;
      }
      
      // Try to find duration in text
      const durationElements = document.querySelectorAll('[class*="duration"], [class*="time-total"]');
      for (const element of durationElements) {
        const text = element.textContent;
        const timeMatch = text.match(/(\d+):(\d+)/);
        if (timeMatch) {
          return parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
        }
      }
      
      return null;
    }
  
    extractCurrentTime() {
      const video = document.querySelector('video');
      if (video && video.currentTime) {
        return video.currentTime;
      }
      
      // Try to find current time in text
      const currentTimeElements = document.querySelectorAll('[class*="current-time"], [class*="time-current"]');
      for (const element of currentTimeElements) {
        const text = element.textContent;
        const timeMatch = text.match(/(\d+):(\d+)/);
        if (timeMatch) {
          return parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
        }
      }
      
      return null;
    }
  }
  
  export default SmartMovieDetector;
