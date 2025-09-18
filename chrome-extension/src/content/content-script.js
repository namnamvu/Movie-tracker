// content.js
import MovieDetector from "./MovieDetector";
import './content.css';

console.log('Movie Tracker: Content script loaded');

let movieDetectorInstance = null;
let lastUrl = window.location.href;

const initializeMovieDetector = async () => {
  // Destroy existing instance if it exists
  if (movieDetectorInstance) {
    movieDetectorInstance.destroy();
    movieDetectorInstance = null;
    console.log('Movie Tracker: Previous detector destroyed.');
  }

  try {
    // Create and initialize a new detector
    movieDetectorInstance = new MovieDetector();
    
    // Wait for initialization to complete
    await movieDetectorInstance.init();
    
    // Expose globally for popup access
    window.movieDetector = {
      instance: movieDetectorInstance,
      smartDetector: {
        extractMovieInfo: () => {
          // Return current movie data or attempt detection
          if (movieDetectorInstance.currentMovie) {
            return movieDetectorInstance.currentMovie;
          }
          
          // If no current movie, try immediate detection
          const url = window.location.href;
          return movieDetectorInstance.detector.detectMovieContext(url, document);
        }
      }
    };
    
    console.log('Movie Tracker: New detector initialized and exposed globally.');
  } catch (error) {
    console.error('Movie Tracker: Failed to initialize detector:', error);
  }
};

// Initial setup on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMovieDetector);
} else {
  initializeMovieDetector();
}

// Observe URL changes for SPAs
new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('Movie Tracker: URL changed to', currentUrl);
    initializeMovieDetector();
  }
}).observe(document, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['href', 'src', 'data-url']
});