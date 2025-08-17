// Content script for Loom Downloader - runs on Loom pages

console.log("Loom Downloader content script loaded");

// Video extraction strategies
const extractionStrategies = {
  // Strategy 1: Find video element directly
  findVideoElement: () => {
    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      if (
        video.src &&
        (video.src.includes(".mp4") || video.src.includes("blob:"))
      ) {
        return {
          url: video.src,
          method: "video_element",
        };
      }
    }
    return null;
  },

  // Strategy 2: Look for video URLs in data attributes
  findInDataAttributes: () => {
    const elements = document.querySelectorAll(
      "[data-video-url], [data-src], [data-video-src]"
    );
    for (const el of elements) {
      const url = el.dataset.videoUrl || el.dataset.src || el.dataset.videoSrc;
      if (url && (url.includes(".mp4") || url.includes("loom"))) {
        return {
          url: url,
          method: "data_attribute",
        };
      }
    }
    return null;
  },

  // Strategy 3: Search in script tags for video URLs
  findInScripts: () => {
    const scripts = document.querySelectorAll("script");
    const urlPattern = /https?:\/\/[^\s"']+\.mp4[^\s"']*/gi;

    for (const script of scripts) {
      if (script.textContent) {
        const matches = script.textContent.match(urlPattern);
        if (matches && matches.length > 0) {
          return {
            url: matches[0],
            method: "script_tag",
          };
        }
      }
    }
    return null;
  },

  // Strategy 4: Look for Loom API data in window or page
  findInWindowData: () => {
    // Check for common Loom data structures
    const possiblePaths = [
      "window.__INITIAL_DATA__",
      "window.__NEXT_DATA__",
      "window.loomData",
      "window.videoData",
    ];

    for (const path of possiblePaths) {
      try {
        const data = eval(path);
        if (data) {
          // Search for video URL in the data structure
          const videoUrl = findVideoUrlInObject(data);
          if (videoUrl) {
            return {
              url: videoUrl,
              method: "window_data",
            };
          }
        }
      } catch (e) {
        // Path doesn't exist, continue
      }
    }
    return null;
  },

  // Strategy 5: Monitor network requests
  monitorNetworkRequests: () => {
    // This would require webRequest API in background script
    // For now, we'll look for video URLs in iframes
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      try {
        if (iframe.src && iframe.src.includes("loom")) {
          // Might contain video URL
          return {
            url: iframe.src,
            method: "iframe",
            needsProcessing: true,
          };
        }
      } catch (e) {
        // Cross-origin iframe, skip
      }
    }
    return null;
  },
};

// Helper function to recursively search for video URLs in objects
function findVideoUrlInObject(obj, depth = 0) {
  if (depth > 10) return null; // Prevent infinite recursion

  if (typeof obj === "string") {
    if (
      obj.includes(".mp4") ||
      (obj.includes("loom") && obj.includes("http"))
    ) {
      return obj;
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findVideoUrlInObject(item, depth + 1);
      if (result) return result;
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const result = findVideoUrlInObject(obj[key], depth + 1);
        if (result) return result;
      }
    }
  }
  return null;
}

// Extract video information from the page
function extractVideoInfo() {
  const videoInfo = {
    title: null,
    id: null,
    duration: null,
    thumbnail: null,
    url: null,
    method: null,
  };

  // Extract title
  const titleSelectors = [
    "h1",
    '[data-testid="video-title"]',
    ".video-title",
    'meta[property="og:title"]',
  ];

  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      videoInfo.title =
        element.textContent || element.content || "Untitled Video";
      break;
    }
  }

  // Extract video ID from URL
  const urlMatch = window.location.href.match(/\/share\/([a-zA-Z0-9]+)/);
  if (urlMatch) {
    videoInfo.id = urlMatch[1];
  }

  // Extract thumbnail
  const thumbnailSelectors = [
    'meta[property="og:image"]',
    "video[poster]",
    ".video-thumbnail img",
  ];

  for (const selector of thumbnailSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      videoInfo.thumbnail = element.content || element.poster || element.src;
      break;
    }
  }

  // Try all extraction strategies
  for (const [strategyName, strategy] of Object.entries(extractionStrategies)) {
    console.log(`Trying strategy: ${strategyName}`);
    const result = strategy();
    if (result && result.url) {
      videoInfo.url = result.url;
      videoInfo.method = result.method;
      console.log(`Video found using ${result.method}: ${result.url}`);
      break;
    }
  }

  // Extract duration if video element exists
  const videoElement = document.querySelector("video");
  if (videoElement && videoElement.duration) {
    videoInfo.duration = Math.floor(videoElement.duration);
  }

  return videoInfo;
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);

  if (request.action === "getVideoInfo") {
    const videoInfo = extractVideoInfo();

    if (videoInfo.url) {
      sendResponse({
        success: true,
        data: videoInfo,
      });
    } else {
      // Try again after a delay (page might still be loading)
      setTimeout(() => {
        const retryInfo = extractVideoInfo();
        sendResponse({
          success: retryInfo.url !== null,
          data: retryInfo,
        });
      }, 2000);
      return true; // Keep message channel open for async response
    }
  }

  return true; // Keep message channel open
});

// Watch for dynamic content changes
const observer = new MutationObserver((mutations) => {
  // Check if video element was added
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (
        node.nodeName === "VIDEO" ||
        (node.querySelector && node.querySelector("video"))
      ) {
        console.log("Video element detected via mutation observer");
        // Notify popup if it's open
        chrome.runtime
          .sendMessage({
            action: "videoDetected",
            data: extractVideoInfo(),
          })
          .catch(() => {
            // Popup might not be open, ignore error
          });
      }
    }
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Also intercept fetch/XHR requests to find video URLs
const originalFetch = window.fetch;
window.fetch = function (...args) {
  return originalFetch.apply(this, args).then((response) => {
    const url = args[0];
    if (
      typeof url === "string" &&
      (url.includes(".mp4") || url.includes("video"))
    ) {
      console.log("Intercepted video fetch:", url);
      // Store for later retrieval
      window.__loomVideoUrl = url;
    }
    return response;
  });
};

// Initial check
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded, checking for video...");
    const info = extractVideoInfo();
    if (info.url) {
      console.log("Video found on page load:", info);
    }
  });
} else {
  // DOM already loaded
  const info = extractVideoInfo();
  if (info.url) {
    console.log("Video found:", info);
  }
}
