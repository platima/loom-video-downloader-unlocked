// popup-enhanced.js

document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup script loaded and DOM ready");

  const statusDiv = document.getElementById("status");
  const videoInfoDiv = document.getElementById("videoInfo");
  const downloadBtn = document.getElementById("downloadBtn");
  const passwordSection = document.getElementById("passwordSection");
  const passwordInput = document.getElementById("passwordInput");
  const helpBtn = document.getElementById("helpBtn");
  const helpTextDisplay = document.getElementById("helpTextDisplay");
  const mainContent = document.getElementById("mainContent");
  const embedDetected = document.getElementById("embedDetected");
  const qualitySection = document.getElementById("qualitySection");
  const qualitySelect = document.getElementById("qualitySelect");
  const progressContainer = document.getElementById("progress");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const progressSpeed = document.getElementById("progressSpeed");
  const cancelBtn = document.getElementById("cancelBtn");
  console.log("🔍 Cancel button element found:", cancelBtn);

  let currentVideoInfo = null;
  let downloadInProgress = false;

  function showStatus(message, type = "info") {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    console.log(`Status [${type}]: ${message}`);
  }

  function showProgress(percentage, status, speed = "") {
    console.log(`📊 Progress: ${percentage}% - ${status}`);
    
    downloadInProgress = true;
    
    // Store download state
    chrome.storage.local.set({
      downloadInProgress: true,
      downloadPercentage: percentage,
      downloadStatus: status,
      downloadSpeed: speed
    });
    
    // Show progress container
    progressContainer.classList.remove("hidden");
    
    // Enable cancel button when showing progress
    cancelBtn.disabled = false;
    
    // Update progress bar
    progressFill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
    
    // Update progress text
    progressText.textContent = `${Math.round(percentage)}%`;
    
    // Update speed info
    progressSpeed.textContent = speed;
    
    // Update status
    showStatus(status, percentage >= 100 ? "success" : "loading");
  }

  function hideProgress() {
    console.log("📲 Hiding progress");
    downloadInProgress = false;
    
    // Clear download state from storage
    chrome.storage.local.remove(["downloadInProgress", "downloadPercentage", "downloadStatus", "downloadSpeed"]);
    
    // Disable cancel button when hiding progress
    cancelBtn.disabled = true;
    
    progressContainer.classList.add("hidden");
    progressFill.style.width = "0%";
    progressText.textContent = "0%";
    progressSpeed.textContent = "";
  }

  function displayVideoInfo(videoInfo) {
    console.log("🎬 displayVideoInfo called with:", videoInfo);
    console.log("🎬 videoInfoDiv element:", videoInfoDiv);
    console.log("🎬 Current videoInfo structure:", {
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      duration: videoInfo.duration,
      owner: videoInfo.owner,
      width: videoInfo.width,
      height: videoInfo.height,
      description: videoInfo.description
    });
    
    currentVideoInfo = videoInfo;

    // Update thumbnail
    const thumbnailImg = document.getElementById("videoThumbnail");
    const thumbnailPlaceholder = document.getElementById("thumbnailPlaceholder");
    
    console.log("🎬 Thumbnail elements:", { thumbnailImg, thumbnailPlaceholder });
    
    if (videoInfo.thumbnail) {
      thumbnailImg.src = videoInfo.thumbnail;
      thumbnailImg.onload = () => {
        thumbnailImg.classList.remove("hidden");
        thumbnailPlaceholder.style.display = "none";
      };
      thumbnailImg.onerror = () => {
        thumbnailImg.classList.add("hidden");
        thumbnailPlaceholder.style.display = "flex";
      };
    } else {
      thumbnailImg.classList.add("hidden");
      thumbnailPlaceholder.style.display = "flex";
    }

    // Update duration badge on thumbnail
    const durationBadge = document.getElementById("durationBadge");
    if (videoInfo.duration) {
      const minutes = Math.floor(videoInfo.duration / 60);
      const seconds = Math.floor(videoInfo.duration % 60);
      durationBadge.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      durationBadge.textContent = "";
    }

    // Update video details
    const videoTitle = document.getElementById("videoTitle");
    const videoOwner = document.getElementById("videoOwner");
    const videoResolution = document.getElementById("videoResolution");
    const videoDuration = document.getElementById("videoDuration");
    const videoDescription = document.getElementById("videoDescription");
    
    console.log("🎬 Video detail elements:", { 
      videoTitle, videoOwner, videoResolution, videoDuration, videoDescription 
    });

    videoTitle.textContent = videoInfo.title || "Untitled Video";

    // Display owner in metadata
    if (videoInfo.owner) {
      videoOwner.textContent = videoInfo.owner;
    } else {
      videoOwner.textContent = "";
    }

    // Display resolution in metadata
    if (videoInfo.width && videoInfo.height) {
      videoResolution.textContent = `${videoInfo.width}x${videoInfo.height}`;
    } else {
      videoResolution.textContent = "";
    }

    // Display duration in metadata
    if (videoInfo.duration) {
      const minutes = Math.floor(videoInfo.duration / 60);
      const seconds = Math.floor(videoInfo.duration % 60);
      videoDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      videoDuration.textContent = "";
    }

    // Display description with automatic truncation (handled by CSS -webkit-line-clamp: 3)
    if (videoInfo.description) {
      videoDescription.textContent = videoInfo.description;
      videoDescription.title = videoInfo.description; // Full text on hover
    } else {
      videoDescription.textContent = "";
    }

    console.log("🎬 Making videoInfoDiv visible...");
    videoInfoDiv.classList.remove("hidden");
    videoInfoDiv.style.display = "block";

    downloadBtn.disabled = false;
    cancelBtn.disabled = true;
    showStatus("Video info extracted. Ready to download.", "success");
  }

  async function checkCurrentTabForVideo() {
    // Don't run video detection if download is in progress
    if (downloadInProgress) {
      console.log("⚠️ Download in progress, skipping video detection");
      return;
    }
    
    console.log("🔍 Checking current tab for Loom video...");
    
    // Auto-detect Loom URL from current tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      console.log("📋 Current tab:", tabs[0]?.url);
      if (
        tabs[0] &&
        tabs[0].url &&
        /loom\.com\/(share|embed)\//.test(tabs[0].url)
      ) {
        console.log("✅ Loom URL detected, auto-processing:", tabs[0].url);
        showStatus(
          "Loom video detected. Automatically extracting info...",
          "loading"
        );
        
        // Automatically process the detected video
        try {
          // First, try to get thumbnail from the page's video element
          console.log("🔍 First checking for video elements on the page to get thumbnail...");
          const embedResponse = await chrome.runtime.sendMessage({ action: "findLoomEmbed" });
          console.log("📥 findLoomEmbed response for direct URL:", embedResponse);
          console.log("🖼️ Thumbnail found:", embedResponse?.embedInfo?.thumbnail);
          
          console.log("📤 Sending extractVideoInfo message to background with URL:", tabs[0].url);
          const message = {
            action: "extractVideoInfo",
            url: tabs[0].url,
            password: null,
          };
          console.log("📤 Message being sent:", message);
          const response = await chrome.runtime.sendMessage(message);

          console.log("📥 Received response from background:", response);
          console.log("🔍 Response type:", typeof response);
          console.log("🔍 Response success:", response?.success);
          console.log("🔍 Response error:", response?.error);
          console.log("🔍 Response videoInfo:", response?.videoInfo);

          if (response && response.success && response.videoInfo) {
            console.log("✅ Video info extracted successfully:", response.videoInfo);
            
            // Merge thumbnail from DOM if available
            const thumbnailFromDOM = embedResponse?.embedInfo?.thumbnail;
            const thumbnailFromAPI = response.videoInfo.thumbnail;
            
            console.log("🔍 Merging thumbnails:");
            console.log("  - From DOM:", thumbnailFromDOM);
            console.log("  - From API:", thumbnailFromAPI);
            
            const enrichedVideoInfo = {
              ...response.videoInfo,
              thumbnail: thumbnailFromDOM || thumbnailFromAPI
            };
            console.log("🖼️ Final enriched video info:", JSON.stringify(enrichedVideoInfo, null, 2));
            
            displayVideoInfo(enrichedVideoInfo);
            passwordSection.classList.add("hidden");
          } else {
            console.error("❌ Failed to extract video info:", response?.error);
            console.error("❌ Full response object:", JSON.stringify(response, null, 2));
            const errorMessage = response?.error || "Failed to extract video info.";
            showStatus(errorMessage, "error");
            if (errorMessage.includes("password-protected")) {
              passwordSection.classList.remove("hidden");
              passwordInput.focus();
              showStatus(
                "This video is password-protected. Please provide the password.",
                "error"
              );
            }
          }
        } catch (error) {
          console.error("❌ Error in auto-processing:", error);
          showStatus(`Error: ${error.message}`, "error");
        }
      } else {
        // Check for Loom embed on third-party sites
        showStatus("Checking for Loom embeds...", "loading");
        await checkForLoomEmbeds();
      }
    });
  }

  async function handleDownload() {
    console.log("⬇️ handleDownload called");

    if (!currentVideoInfo) {
      console.error("❌ No video info available for download");
      showStatus(
        "No video information available. Please navigate to a Loom video page first.",
        "error"
      );
      return;
    }

    const password = passwordInput ? passwordInput.value : null;
    const url = currentVideoInfo?.url || currentVideoInfo?.pageUrl;
    const selectedQualityIndex = qualitySelect.value;

    console.log("📤 Starting download with:", {
      url,
      password: password ? "***" : null,
      selectedQualityIndex,
    });

    showStatus("Initiating download...", "loading");
    downloadBtn.disabled = true;
    cancelBtn.disabled = false;

    try {
      console.log("📤 Sending downloadVideo message to background");
      const response = await chrome.runtime.sendMessage({
        action: "downloadVideo",
        url: url,
        password: password,
        videoInfo: currentVideoInfo,
        selectedQualityIndex: selectedQualityIndex,
      });

      console.log("📥 Received download response from background:", response);

      if (response && response.success) {
        console.log("✅ Download started successfully");
        showStatus(
          response.message || "Download started successfully!",
          "success"
        );
      } else {
        console.error("❌ Download failed:", response?.error);
        showStatus(
          response?.error || "An unknown error occurred during download.",
          "error"
        );
      }
    } catch (error) {
      console.error("❌ Error in handleDownload:", error);
      showStatus(`Download Error: ${error.message}`, "error");
    } finally {
      // Don't automatically re-enable the button - let the progress tracking handle it
      console.log("🔄 Download request completed, waiting for progress updates");
    }
  }

  async function handleCancelDownload() {
    console.log("❌ User requested download cancellation");
    
    try {
      // Use a promise wrapper for better error handling
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "cancelDownload" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.success) {
        console.log("✅ Cancel request sent to background");
        showStatus("Cancelling download...", "warning");
        // Don't hide progress here - let the background script send DOWNLOAD_CANCELLED message
      } else {
        console.error("❌ Failed to cancel download:", response?.message || "No response");
        showStatus(response?.message || "No active download to cancel", "warning");
        // If there's nothing to cancel, disable the cancel button
        cancelBtn.disabled = true;
      }
    } catch (error) {
      console.error("❌ Error cancelling download:", error);
      showStatus("Error communicating with background script", "error");
      // If we can't communicate with background, assume no download and disable cancel button
      cancelBtn.disabled = true;
    }
  }

  // Check for Loom embeds on the current page
  async function checkForLoomEmbeds() {
    console.log("🔍 Checking for Loom embeds on current page...");

    try {
      const message = { action: "findLoomEmbed" };
      console.log("📤 Sending findLoomEmbed message:", message);
      const response = await chrome.runtime.sendMessage(message);

      console.log("📥 findLoomEmbed response:", response);
      console.log("🔍 findLoomEmbed response type:", typeof response);
      console.log("🔍 findLoomEmbed response success:", response?.success);

      if (response && response.success && response.embedInfo) {
        console.log("✅ Loom embed found:", response.embedInfo);

        // Show the embed detected section
        embedDetected.classList.remove("hidden");

        // Update the embed text with more specific info
        const embedText = document.querySelector(".embed-text");
        if (response.embedInfo.elementType === "video") {
          embedText.textContent = "Loom video element detected on this page!";
        } else {
          embedText.textContent = "Loom embed detected on this page!";
        }

        // Try to get video info for the embed
        const shareUrl = `https://www.loom.com/share/${response.embedInfo.videoId}`;

        try {
          const videoInfoResponse = await chrome.runtime.sendMessage({
            action: "extractVideoInfo",
            url: shareUrl,
            password: null,
          });

          if (videoInfoResponse && videoInfoResponse.success) {
            console.log(
              "✅ Video info extracted for embed:",
              videoInfoResponse.videoInfo
            );
            // Merge thumbnail from DOM with video info from API
            const enrichedVideoInfo = {
              ...videoInfoResponse.videoInfo,
              thumbnail: response.embedInfo.thumbnail || videoInfoResponse.videoInfo.thumbnail
            };
            console.log("🖼️ Enriched video info with thumbnail:", enrichedVideoInfo);
            displayVideoInfo(enrichedVideoInfo);
            showStatus("Ready to download embedded video", "success");
          } else {
            showStatus("Loom embed detected! Ready to download.", "success");
            // Still enable the download button even if we can't get video info
            downloadBtn.disabled = false;
          }
        } catch (videoInfoError) {
          console.error(
            "❌ Error getting video info for embed:",
            videoInfoError
          );
          showStatus("Loom embed detected! Ready to download.", "success");
          // Still enable the download button even if we can't get video info
          downloadBtn.disabled = false;
        }
      } else {
        console.log("❌ No Loom embed found on page");
        embedDetected.classList.add("hidden");
        showStatus("Navigate to a Loom video page to begin.", "info");
      }
    } catch (error) {
      console.error("❌ Error checking for Loom embeds:", error);
      embedDetected.classList.add("hidden");
      showStatus("Navigate to a Loom video page to begin.", "info");
    }
  }

  // Event Listeners
  downloadBtn.addEventListener("click", handleDownload);
  cancelBtn.addEventListener("click", (event) => {
    console.log("🖱️ Cancel button clicked!");
    console.log("🖱️ Cancel button disabled state:", cancelBtn.disabled);
    console.log("🖱️ Download in progress:", downloadInProgress);
    if (!cancelBtn.disabled) {
      handleCancelDownload();
    } else {
      console.log("⚠️ Cancel button is disabled, ignoring click");
    }
  });
  
  let helpTimeout;
  helpBtn.addEventListener("click", () => {
    // Clear any existing timeout
    if (helpTimeout) {
      clearTimeout(helpTimeout);
    }

    // Show help text
    helpTextDisplay.classList.remove("hidden");
    
    // Hide help text after 5 seconds
    helpTimeout = setTimeout(() => {
      helpTextDisplay.classList.add("hidden");
    }, 5000);
  });

  // Initialize button states on popup load
  async function initializeButtonStates() {
    try {
      // Check if there's a download in progress using promise wrapper
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "checkDownloadStatus" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.success && response.inProgress) {
        // Download is active, enable cancel button
        cancelBtn.disabled = false;
        downloadBtn.disabled = true;
        showStatus("Download in progress...", "loading");
      } else {
        // No download active, disable cancel button
        cancelBtn.disabled = true;
      }
    } catch (error) {
      console.log("Could not check download status:", error);
      cancelBtn.disabled = true;
    }
  }

  // Initialize on DOM load
  initializeButtonStates();

  function checkDownloadState() {
    chrome.storage.local.get(["downloadInProgress", "downloadPercentage", "downloadStatus", "downloadSpeed"], (data) => {
      console.log("🔍 Checking stored download state:", data);
      if (data.downloadInProgress) {
        console.log("📥 Restoring download progress display");
        // Verify download is actually still in progress by asking background script
        try {
          chrome.runtime.sendMessage({ action: "checkDownloadStatus" }, (response) => {
            if (chrome.runtime.lastError) {
              // If we can't reach background script, assume no download and clear state
              console.log("🧹 Cannot check download status, clearing state:", chrome.runtime.lastError);
              hideProgress();
              checkCurrentTabForVideo();
              return;
            }
            
            if (response && response.inProgress) {
              showProgress(
                data.downloadPercentage || 0,
                data.downloadStatus || "Downloading...",
                data.downloadSpeed || ""
              );
            } else {
              // Download is no longer active, clear stale state and show video detection
              console.log("🧹 Clearing stale download state");
              hideProgress();
              checkCurrentTabForVideo();
            }
          });
        } catch (error) {
          // If we can't reach background script, assume no download and clear state
          console.log("🧹 Cannot check download status, clearing state:", error);
          hideProgress();
          checkCurrentTabForVideo();
        }
      } else {
        // No download in progress, run video detection
        checkCurrentTabForVideo();
      }
    });
  }

  // Start the app by checking download state, then video detection if needed
  checkDownloadState();

  // Listen for progress updates from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📩 Popup received message:", message);
    
    switch (message.type) {
      case "DOWNLOAD_PROGRESS":
        showProgress(
          message.percentage,
          message.status,
          message.speed || ""
        );
        break;
      case "DOWNLOAD_COMPLETE":
        downloadInProgress = false;
        showProgress(100, message.status || "Download completed!");
        downloadBtn.disabled = false;
        cancelBtn.disabled = true;
        setTimeout(() => {
          hideProgress();
          // Reset to initial state by checking for video again
          setTimeout(() => {
            checkCurrentTabForVideo();
          }, 500); // Small delay to ensure progress is hidden first
        }, 3000); // Hide after 3 seconds
        break;
      case "DOWNLOAD_ERROR":
        hideProgress();
        showStatus(message.error || "Download failed", "error");
        // Reset to initial state after showing error briefly
        setTimeout(() => {
          checkCurrentTabForVideo();
        }, 3000);
        break;
      case "DOWNLOAD_CANCELLED":
        console.log("✅ Download cancelled, resetting UI");
        downloadInProgress = false;
        hideProgress();
        showStatus("Download cancelled", "warning");
        downloadBtn.disabled = false;
        cancelBtn.disabled = true;
        // Reset to initial state after showing cancellation message briefly
        setTimeout(() => {
          checkCurrentTabForVideo();
        }, 2000);
        break;
    }
  });
});