// Background service worker for Movie Tracker extension
let movieDatabase = {}; // This will hold active movies being tracked in tabs

// Initialize movieDatabase from storage when the service worker starts
chrome.storage.local.get(null, (data) => {
  // Filter out outdated entries if needed, or just load all
  movieDatabase = data || {};
  console.log('Background: Loaded existing movie data:', Object.keys(movieDatabase).length, 'movies');
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: Received message:', message);

  switch (message.type) {
    case 'MOVIE_DETECTED':
      handleMovieDetected(message.data, sender.tab);
      break;
    case 'PROGRESS_UPDATE':
      handleProgressUpdate(message.data, sender.tab);
      break;
    default:
      console.log('Background: Unknown message type:', message.type);
  }

  // Return true to indicate we'll respond asynchronously (though we don't send a response here)
  return true;
});

function handleMovieDetected(movieData, tab) {
  // Use serviceName and title for a more accurate key
  const key = `${movieData.serviceName}_${movieData.title}_${tab.id}`; // Add tab.id for uniqueness across tabs

  // Store movie data, ensuring all necessary properties are present
  movieDatabase[key] = {
    ...movieData,
    tabId: tab.id,
    firstDetected: movieData.firstDetected || Date.now(), // Use original if present, else now
    lastUpdated: Date.now()
  };

  // Save to Chrome storage
  chrome.storage.local.set({ [key]: movieDatabase[key] }).catch(e => {
    console.error('Background: Error saving movie to storage:', e);
  });

  console.log('Background: Movie stored:', movieData.title, 'on', movieData.serviceName);

  // Update badge to show active tracking
  chrome.action.setBadgeText({
    text: '●', // You might want to show a count, or a more dynamic indicator
    tabId: tab.id
  });

  chrome.action.setBadgeBackgroundColor({
    color: '#4CAF50', // Green for active
    tabId: tab.id
  });
}

function handleProgressUpdate(movieData, tab) {
  // Use the same key generation logic as MOVIE_DETECTED
  const key = `${movieData.serviceName}_${movieData.title}_${tab.id}`;

  if (movieDatabase[key]) {
    movieDatabase[key] = {
      ...movieDatabase[key],
      ...movieData, // Update all relevant fields from the latest movieData
      lastUpdated: Date.now()
    };

    // Save to Chrome storage
    chrome.storage.local.set({ [key]: movieDatabase[key] }).catch(e => {
      console.error('Background: Error saving progress to storage:', e);
    });

    console.log('Background: Progress updated:', movieData.title, {
      currentTime: movieData.currentTime,
      duration: movieData.duration
    });
  }
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Clear badge for closed tab
  chrome.action.setBadgeText({
    text: '',
    tabId: tabId
  });

  // Remove from in-memory cache
  Object.keys(movieDatabase).forEach(key => {
    if (movieDatabase[key].tabId === tabId) {
      delete movieDatabase[key];
    }
  });

  console.log(`Background: Cleaned up data for closed tab: ${tabId}`);
});

// Optional: Clear badge when a tab becomes inactive (switched away)
// chrome.tabs.onActivated.addListener((activeInfo) => {
//   // Iterate through all tabs and set badges appropriately
//   chrome.tabs.query({}, (tabs) => {
//     tabs.forEach(tab => {
//       const isCurrentTab = tab.id === activeInfo.tabId;
//       const hasActiveMovie = Object.values(movieDatabase).some(movie => movie.tabId === tab.id);

//       if (hasActiveMovie && isCurrentTab) {
//         chrome.action.setBadgeText({ text: '●', tabId: tab.id });
//         chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: tab.id });
//       } else {
//         chrome.action.setBadgeText({ text: '', tabId: tab.id });
//       }
//     });
//   });
// });