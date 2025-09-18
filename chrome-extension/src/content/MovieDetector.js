import {StreamingServiceDetector} from '../detectors/StreamingServiceDetector'

class MovieDetector {
  constructor() {
    this.detector = new StreamingServiceDetector();
    this.currentMovie = null;
    this.observers = new Map();
    this.detectionInterval = null;
    this.isActive = false;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      // Ensure the detector is fully initialized
      await this.detector.init();

      const currentUrl = window.location.href;
      const isStreamingSite = await this.detector.isStreamingSite(currentUrl);

      if (!isStreamingSite) {
        console.log('Movie Tracker: Site not recognized as streaming');
        this.initialized = true;
        return;
      }

      const serviceInfo = await this.detector.getServiceInfo(currentUrl);
      console.log('Movie Tracker: Streaming site detected:', serviceInfo);

      this.isActive = true;
      this.initialized = true;
      this.startDetection();
    } catch (error) {
      console.error('Movie Tracker: Initialization error:', error);
      this.initialized = true; // Set to true even on error to prevent infinite retries
    }
  }

  // Add method to check if ready
  isReady() {
    return this.initialized;
  }

  startDetection() {
    this.detectMovie(); // initial detection
    this.detectionInterval = setInterval(() => this.detectMovie(), 3000);
    this.setupObservers();
  }

  async detectMovie() {
    if (!this.isActive || !this.initialized) return;

    try {
      const context = await this.detector.detectMovieContext(window.location.href, document);

      if (context && context.title) {
        const isNewMovie =
          !this.currentMovie ||
          this.currentMovie.title !== context.title ||
          this.currentMovie.url !== context.url;

        if (isNewMovie) {
          this.currentMovie = context;
          this.onMovieDetected(context);
        } else {
          this.updateProgress(context);
        }
      } else if (this.currentMovie) {
        console.log('Movie Tracker: Movie no longer detected on page.');
        this.currentMovie = null;
      }
    } catch (err) {
      console.error('Movie Tracker: Detection error:', err);
    }
  }

  updateProgress(movie) {
    if (!this.currentMovie) return;

    const changed =
      movie.currentTime !== this.currentMovie.currentTime ||
      movie.duration !== this.currentMovie.duration;

    if (changed) {
      this.currentMovie.currentTime = movie.currentTime;
      this.currentMovie.duration = movie.duration;
      this.currentMovie.timestamp = Date.now();

      this.onProgressUpdate(this.currentMovie);
    }
  }

  setupObservers() {
    this.observers.forEach(o => o.disconnect());
    this.observers.clear();

    const observeVideoElements = () => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        video.removeEventListener('timeupdate', this.detectMovieBound);
        video.removeEventListener('durationchange', this.detectMovieBound);
        video.removeEventListener('play', this.detectMovieBound);
        video.removeEventListener('pause', this.detectMovieBound);
        video.removeEventListener('ended', this.detectMovieBound);

        video.addEventListener('timeupdate', this.detectMovieBound);
        video.addEventListener('durationchange', this.detectMovieBound);
        video.addEventListener('play', this.detectMovieBound);
        video.addEventListener('pause', this.detectMovieBound);
        video.addEventListener('ended', this.detectMovieBound);
      });
    };

    this.detectMovieBound = this.detectMovie.bind(this);
    observeVideoElements();

    const videoDomObserver = new MutationObserver((mutations) => {
      let videosChanged = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          const containsVideo = (nodes) => Array.from(nodes).some(node => node.nodeName === 'VIDEO' || node.querySelector?.('video'));
          if (containsVideo(mutation.addedNodes) || containsVideo(mutation.removedNodes)) {
            videosChanged = true;
            break;
          }
        }
      }
      if (videosChanged) {
        console.log('Movie Tracker: Video DOM changed, re-observing videos.');
        observeVideoElements();
        this.detectMovieBound();
      }
    });

    videoDomObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    this.observers.set('videoDom', videoDomObserver);

    const titleObserver = new MutationObserver(() => this.detectMovieBound());
    titleObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true
    });
    this.observers.set('title', titleObserver);
  }

  onMovieDetected(movie) {
    console.log('Movie Tracker: Movie detected:', movie);

    const overlay = document.createElement('div');
    overlay.className = 'movie-tracker-overlay visible';
    overlay.innerHTML = `
      <div class="title">${movie.title}</div>
      <div class="info">${this.formatDuration(movie.duration)} • ${movie.serviceName}</div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 5000);

    this.sendToBackground('MOVIE_DETECTED', movie);

    window.dispatchEvent(
      new CustomEvent('movieDetected', { detail: movie })
    );
  }

  onProgressUpdate(movie) {
    console.log('Movie Tracker: Progress updated:', movie);
    this.sendToBackground('PROGRESS_UPDATE', movie);

    window.dispatchEvent(
      new CustomEvent('progressUpdate', { detail: movie })
    );
  }

  formatDuration(seconds) {
    if (isNaN(seconds) || seconds === 0) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const pad = (num) => num.toString().padStart(2, '0');

    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${m}:${pad(s)}`;
  }

  sendToBackground(type, data) {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({ type, data, timestamp: Date.now() })
        .catch((e) => {
          console.error('Movie Tracker: Background send failed', e);
        });
    } else {
      console.warn('Movie Tracker: chrome.runtime.sendMessage not available');
    }
  }

  destroy() {
    this.isActive = false;
    this.initialized = false;
    if (this.detectionInterval) clearInterval(this.detectionInterval);
    this.observers.forEach((o) => o.disconnect());
    this.observers.clear();
    
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        video.removeEventListener('timeupdate', this.detectMovieBound);
        video.removeEventListener('durationchange', this.detectMovieBound);
        video.removeEventListener('play', this.detectMovieBound);
        video.removeEventListener('pause', this.detectMovieBound);
        video.removeEventListener('ended', this.detectMovieBound);
    });
    console.log('Movie Tracker: Detector destroyed');
  }
}

export default MovieDetector;