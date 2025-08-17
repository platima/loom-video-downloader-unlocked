// Content script for Loom video downloader
// Prevent multiple executions
if (window.loomDownloaderContentLoaded) {
  console.log("Loom downloader content script already loaded, skipping...");
} else {
  window.loomDownloaderContentLoaded = true;
  console.log("Loom downloader content script loaded");

  // Function to extract video information from the current page
  function extractVideoInfo() {
    const url = window.location.href;
    let videoInfo = null;

    // Check if this is a Loom share URL (direct loom.com page)
    if (url.includes("loom.com/share/")) {
      const videoId = url.match(/loom\.com\/share\/([a-f0-9]{32})/)?.[1];
      if (videoId) {
        const title =
          document.title.replace(" - Loom", "").trim() ||
          `Loom Video ${videoId}`;
        videoInfo = {
          id: videoId,
          title: title,
          url: url,
          isLoomVideo: true,
          source: "direct",
        };
      }
    }

    // Check for Loom embeds on any website
    if (!videoInfo) {
      videoInfo = findLoomEmbeds();
    }

    return videoInfo;
  }

  // Function to find Loom embeds on any website
  function findLoomEmbeds() {
    const loomEmbeds = [];

    // Look for Loom iframes FIRST (highest priority for embeds)
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      const src = iframe.src;
      if (src && src.includes("loom.com/embed/")) {
        const videoId = src.match(/loom\.com\/embed\/([a-f0-9]{32})/)?.[1];
        if (videoId) {
          loomEmbeds.push({
            id: videoId,
            title:
              iframe.title ||
              iframe.getAttribute("aria-label") ||
              `Loom Video ${videoId}`,
            url: `https://www.loom.com/share/${videoId}`,
            embedSrc: src,
            element: iframe,
            isLoomVideo: true,
            source: "embed",
          });
        }
      }
    });

    // If we found an iframe embed, return it immediately (prioritize proper embeds)
    if (loomEmbeds.length > 0) {
      console.log(`Found ${loomEmbeds.length} Loom iframe embeds (prioritized):`, loomEmbeds);
      return loomEmbeds[0];
    }

    // Look for Loom video elements with data-loom-video-id only if no iframe found
    const videoElements = document.querySelectorAll(
      "video[data-loom-video-id]"
    );
    videoElements.forEach((video) => {
      const videoId = video.getAttribute("data-loom-video-id");
      if (videoId && videoId.length === 32) {
        // Only accept 32-character IDs for video elements
        loomEmbeds.push({
          id: videoId,
          title:
            video.getAttribute("title") ||
            video.getAttribute("aria-label") ||
            `Loom Video ${videoId}`,
          url: `https://www.loom.com/share/${videoId}`,
          element: video,
          isLoomVideo: true,
          source: "video-element",
        });
      }
    });

    // Look for other Loom video elements by class or ID
    const loomVideoElements = document.querySelectorAll(
      'video[id*="Loom"], video[class*="loom"], video[class*="Loom"]'
    );
    loomVideoElements.forEach((video) => {
      const src = video.src || video.getAttribute("src");
      if (src && src.includes("loom.com")) {
        const videoId = src.match(/([a-f0-9]{32})/)?.[1];
        if (videoId) {
          // Check if we already found this video
          const existingEmbed = loomEmbeds.find((embed) => embed.id === videoId);
          if (!existingEmbed) {
            loomEmbeds.push({
              id: videoId,
              title:
                video.getAttribute("title") ||
                video.getAttribute("aria-label") ||
                `Loom Video ${videoId}`,
              url: `https://www.loom.com/share/${videoId}`,
              element: video,
              isLoomVideo: true,
              source: "video-src",
            });
          }
        }
      }
    });

    // Look for Loom links in the page
    const links = document.querySelectorAll('a[href*="loom.com/share/"]');
    links.forEach((link) => {
      const href = link.href;
      const videoId = href.match(/loom\.com\/share\/([a-f0-9]{32})/)?.[1];
      if (videoId) {
        // Check if we already found this video in an embed
        const existingEmbed = loomEmbeds.find((embed) => embed.id === videoId);
        if (!existingEmbed) {
          loomEmbeds.push({
            id: videoId,
            title:
              link.textContent.trim() ||
              link.getAttribute("aria-label") ||
              `Loom Video ${videoId}`,
            url: href,
            element: link,
            isLoomVideo: true,
            source: "link",
          });
        }
      }
    });

    // Look for Loom embeds in script tags or data attributes
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => {
      const content = script.textContent || script.innerHTML;
      if (content.includes("loom.com")) {
        const matches = content.match(
          /loom\.com\/(?:embed|share)\/([a-f0-9]{32})/g
        );
        if (matches) {
          matches.forEach((match) => {
            const videoId = match.match(/([a-f0-9]{32})/)?.[1];
            if (videoId) {
              // Check if we already found this video
              const existingEmbed = loomEmbeds.find(
                (embed) => embed.id === videoId
              );
              if (!existingEmbed) {
                loomEmbeds.push({
                  id: videoId,
                  title: `Loom Video ${videoId}`,
                  url: `https://www.loom.com/share/${videoId}`,
                  isLoomVideo: true,
                  source: "script",
                });
              }
            }
          });
        }
      }
    });

    console.log(`Found ${loomEmbeds.length} Loom embeds on page:`, loomEmbeds);

    // Return the first found embed, or null if none found
    return loomEmbeds.length > 0 ? loomEmbeds[0] : null;
  }

  // Function to get all Loom embeds (for popup use)
  function getAllLoomEmbeds() {
    const url = window.location.href;
    const allEmbeds = [];

    // Check if this is a direct Loom page
    if (url.includes("loom.com/share/")) {
      const videoId = url.match(/loom\.com\/share\/([a-f0-9]{32})/)?.[1];
      if (videoId) {
        const title =
          document.title.replace(" - Loom", "").trim() ||
          `Loom Video ${videoId}`;
        allEmbeds.push({
          id: videoId,
          title: title,
          url: url,
          isLoomVideo: true,
          source: "direct",
        });
      }
    }

    // Find all embeds using the existing function logic
    const loomEmbeds = [];

    // Look for Loom iframes FIRST (highest priority for embeds)
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      const src = iframe.src;
      if (src && src.includes("loom.com/embed/")) {
        const videoId = src.match(/loom\.com\/embed\/([a-f0-9]{32})/)?.[1];
        if (videoId) {
          loomEmbeds.push({
            id: videoId,
            title:
              iframe.title ||
              iframe.getAttribute("aria-label") ||
              `Loom Video ${videoId}`,
            url: `https://www.loom.com/share/${videoId}`,
            embedSrc: src,
            element: iframe,
            isLoomVideo: true,
            source: "embed",
          });
        }
      }
    });

    // Look for Loom video elements with data-loom-video-id only if not already found
    const videoElements = document.querySelectorAll(
      "video[data-loom-video-id]"
    );
    videoElements.forEach((video) => {
      const videoId = video.getAttribute("data-loom-video-id");
      if (videoId && videoId.length === 32) {
        // Only accept 32-character IDs for video elements
        // Check if we already found this video
        const existingEmbed = loomEmbeds.find((embed) => embed.id === videoId);
        if (!existingEmbed) {
          loomEmbeds.push({
            id: videoId,
            title:
              video.getAttribute("title") ||
              video.getAttribute("aria-label") ||
              `Loom Video ${videoId}`,
            url: `https://www.loom.com/share/${videoId}`,
            element: video,
            isLoomVideo: true,
            source: "video-element",
          });
        }
      }
    });

    // Look for other Loom video elements by class or ID in getAllLoomEmbeds too
    const loomVideoElements = document.querySelectorAll(
      'video[id*="Loom"], video[class*="loom"], video[class*="Loom"]'
    );
    loomVideoElements.forEach((video) => {
      const src = video.src || video.getAttribute("src");
      if (src && src.includes("loom.com")) {
        const videoId = src.match(/([a-f0-9]{32})/)?.[1];
        if (videoId) {
          // Check if we already found this video
          const existingEmbed = loomEmbeds.find((embed) => embed.id === videoId);
          if (!existingEmbed) {
            loomEmbeds.push({
              id: videoId,
              title:
                video.getAttribute("title") ||
                video.getAttribute("aria-label") ||
                `Loom Video ${videoId}`,
              url: `https://www.loom.com/share/${videoId}`,
              element: video,
              isLoomVideo: true,
              source: "video-src",
            });
          }
        }
      }
    });

    // Look for Loom links in the page
    const links = document.querySelectorAll('a[href*="loom.com/share/"]');
    links.forEach((link) => {
      const href = link.href;
      const videoId = href.match(/loom\.com\/share\/([a-f0-9]{32})/)?.[1];
      if (videoId) {
        // Check if we already found this video in an embed
        const existingEmbed = loomEmbeds.find((embed) => embed.id === videoId);
        if (!existingEmbed) {
          loomEmbeds.push({
            id: videoId,
            title:
              link.textContent.trim() ||
              link.getAttribute("aria-label") ||
              `Loom Video ${videoId}`,
            url: href,
            element: link,
            isLoomVideo: true,
            source: "link",
          });
        }
      }
    });

    // Look for Loom embeds in script tags or data attributes
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => {
      const content = script.textContent || script.innerHTML;
      if (content.includes("loom.com")) {
        const matches = content.match(
          /loom\.com\/(?:embed|share)\/([a-f0-9]{32})/g
        );
        if (matches) {
          matches.forEach((match) => {
            const videoId = match.match(/([a-f0-9]{32})/)?.[1];
            if (videoId) {
              // Check if we already found this video
              const existingEmbed = loomEmbeds.find(
                (embed) => embed.id === videoId
              );
              if (!existingEmbed) {
                loomEmbeds.push({
                  id: videoId,
                  title: `Loom Video ${videoId}`,
                  url: `https://www.loom.com/share/${videoId}`,
                  isLoomVideo: true,
                  source: "script",
                });
              }
            }
          });
        }
      }
    });

    allEmbeds.push(...loomEmbeds);

    return allEmbeds;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getVideoInfo") {
      const videoInfo = extractVideoInfo();
      sendResponse({ success: true, videoInfo });
    } else if (request.action === "getAllLoomEmbeds") {
      const allEmbeds = getAllLoomEmbeds();
      sendResponse({ success: true, embeds: allEmbeds });
    }
  });

  // Function to periodically check for new Loom embeds (for dynamic content)
  function checkForNewEmbeds() {
    const videoInfo = extractVideoInfo();
    if (videoInfo) {
      console.log("Loom video detected:", videoInfo);

      // Optionally notify the background script about new embeds
      try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            action: "loomEmbedDetected",
            videoInfo: videoInfo,
          }).catch((err) => {
            // Ignore errors if background script isn't listening
            console.log("Background script not available:", err);
          });
        }
      } catch (err) {
        // Extension context invalidated, ignore
        console.log("Extension context invalidated:", err);
      }
    }
  }

  // Auto-detect when page loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(checkForNewEmbeds, 1000);
    });
  } else {
    setTimeout(checkForNewEmbeds, 1000);
  }

  // Also check for dynamically loaded content
  let lastEmbedCheck = Date.now();
  const observer = new MutationObserver(() => {
    // Throttle checks to avoid performance issues
    const now = Date.now();
    if (now - lastEmbedCheck > 2000) {
      lastEmbedCheck = now;
      setTimeout(checkForNewEmbeds, 500);
    }
  });

  // Start observing changes to the DOM
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Clean up observer when page unloads
  window.addEventListener("beforeunload", () => {
    observer.disconnect();
  });
} // End of guard condition
