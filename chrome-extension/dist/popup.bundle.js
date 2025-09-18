(() => {
  // src/popup/popup.js
  var logMessages = [];
  function addLog(message) {
    logMessages.push((/* @__PURE__ */ new Date()).toLocaleTimeString() + ": " + message);
    if (logMessages.length > 50) logMessages.shift();
    const logElement = document.getElementById("log");
    if (logElement) {
      logElement.textContent = logMessages.join("\n");
    }
  }
  function handleTrackingChoice(action, movieData) {
    addLog(`Tracking choice: ${action} for movie: ${movieData ? movieData.title : "N/A"}`);
    hideWidget();
  }
  function showWidget(movieData) {
    const widgetContainer = document.getElementById("movie-tracker-widget-container");
    const widgetMovieTitleEl = document.getElementById("widgetMovieTitle");
    if (widgetContainer && widgetMovieTitleEl) {
      if (movieData && movieData.title) {
        widgetMovieTitleEl.textContent = `Movie Detected: ${movieData.title}`;
      } else {
        widgetMovieTitleEl.textContent = "Movie Detected!";
      }
      widgetContainer.style.display = "block";
      addLog("Showing movie detection widget.");
    }
  }
  function hideWidget() {
    const widgetContainer = document.getElementById("movie-tracker-widget-container");
    if (widgetContainer) {
      widgetContainer.style.display = "none";
      addLog("Hiding movie detection widget.");
    }
  }
  function updateStatus(detected, movieData) {
    const statusEl = document.getElementById("status");
    const movieInfoEl = document.getElementById("movieInfo");
    const movieTitleEl = document.getElementById("movieTitle");
    const movieDetailsEl = document.getElementById("movieDetails");
    if (!statusEl) return;
    if (detected && movieData) {
      statusEl.className = "status detected";
      statusEl.textContent = "Movie detected!";
      if (movieTitleEl) {
        movieTitleEl.textContent = movieData.title || "Unknown Title";
      }
      if (movieDetailsEl) {
        movieDetailsEl.innerHTML = `
                <strong>Service:</strong> ${movieData.serviceName || movieData.domain || "Unknown"}<br>
                <strong>Confidence:</strong> ${((movieData.confidence || 0) * 100).toFixed(0)}%<br>
                <strong>Duration:</strong> ${formatDuration(movieData.duration)}<br>
                <strong>Has Video:</strong> ${movieData.currentTime !== void 0 ? "Yes" : "No"}
            `;
      }
      if (movieInfoEl) {
        movieInfoEl.style.display = "block";
      }
      addLog(`Movie detected: ${movieData.title}`);
      lastDetectedMovieData = movieData;
      showWidget(movieData);
    } else {
      statusEl.className = "status not-detected";
      statusEl.textContent = "No movie detected on this page";
      if (movieInfoEl) {
        movieInfoEl.style.display = "none";
      }
      lastDetectedMovieData = null;
      hideWidget();
      addLog("No movie detected.");
    }
  }
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds === 0) return "N/A";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    const pad = (num) => num.toString().padStart(2, "0");
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${m}:${pad(s)}`;
  }
  var lastDetectedMovieData = null;
  function testCurrentPage() {
    addLog("Testing current page...");
    if (!chrome || !chrome.tabs || !chrome.scripting) {
      addLog("Chrome APIs not available. Make sure this is running as a Chrome Extension popup.");
      updateStatus(false, null);
      return;
    }
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          addLog("Error querying tabs: " + chrome.runtime.lastError.message);
          updateStatus(false, null);
          return;
        }
        if (!tabs || tabs.length === 0) {
          addLog("No active tab found.");
          updateStatus(false, null);
          return;
        }
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            if (window.movieDetector && window.movieDetector.instance) {
              const detector = window.movieDetector.instance;
              if (!detector.isReady()) {
                return { error: "Detector not ready yet" };
              }
              if (detector.currentMovie) {
                return { movie: detector.currentMovie, source: "current" };
              }
              try {
                const movieData = detector.detector.detectMovieContext(window.location.href, document);
                return { movie: movieData, source: "detection" };
              } catch (error) {
                return { error: "Detection failed: " + error.message };
              }
            }
            return { error: "MovieDetector not found or not initialized" };
          }
        }, async (results) => {
          if (chrome.runtime.lastError) {
            addLog("Error executing script: " + chrome.runtime.lastError.message);
            updateStatus(false, null);
            return;
          }
          if (results && results[0]) {
            const result = results[0].result;
            if (result.error) {
              addLog("Detection error: " + result.error);
              if (result.error.includes("not ready")) {
                setTimeout(() => testCurrentPage(), 1e3);
                return;
              }
              updateStatus(false, null);
              return;
            }
            if (result.movie && typeof result.movie.then === "function") {
              addLog("Detection returned promise, trying alternative approach...");
              updateStatus(false, null);
              return;
            }
            const movieData = result.movie;
            lastDetectedMovieData = movieData;
            if (movieData && movieData.title) {
              addLog(`Movie found via ${result.source}: ${movieData.title}`);
              updateStatus(true, movieData);
            } else {
              addLog("No movie data returned");
              updateStatus(false, null);
            }
          } else {
            addLog("No results returned from content script");
            updateStatus(false, null);
          }
        });
      });
    } catch (error) {
      addLog("Exception during API call: " + error.message);
      updateStatus(false, null);
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    addLog("Popup DOM loaded.");
    const testButton = document.getElementById("testButton");
    if (testButton) {
      testButton.addEventListener("click", testCurrentPage);
    }
    const widgetContainer = document.getElementById("movie-tracker-widget-container");
    if (widgetContainer) {
      widgetContainer.addEventListener("click", (event) => {
        const target = event.target;
        if (target.classList.contains("widget-btn")) {
          const action = target.dataset.action;
          if (action && lastDetectedMovieData) {
            handleTrackingChoice(action, lastDetectedMovieData);
          }
        } else if (target.classList.contains("widget-close")) {
          hideWidget();
        }
      });
    } else {
      addLog("Warning: Widget container not found.");
    }
    setTimeout(testCurrentPage, 100);
  });
})();
//# sourceMappingURL=popup.bundle.js.map
