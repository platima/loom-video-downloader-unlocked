import { set, get, remove } from "./indexed-db.js";
// Browser-compatible Loom downloader following the original strategy
console.log("🚀 Background script starting...");

// Offscreen document management for ffmpeg.wasm
let offscreenCreated = false;
let activeDownloads = 0;
let downloadCancelled = false;

// Progress reporting functions
function sendProgressToPopup(percentage, status, speed = "") {
  try {
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_PROGRESS",
      percentage: percentage,
      status: status,
      speed: speed
    }).catch(() => {
      // Ignore errors if popup is closed
    });
  } catch (error) {
    // Ignore errors if extension context is invalid
  }
}

function sendDownloadComplete(status = "Download completed!") {
  try {
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_COMPLETE",
      status: status
    }).catch(() => {
      // Ignore errors if popup is closed
    });
  } catch (error) {
    // Ignore errors if extension context is invalid
  }
}

function sendDownloadError(error) {
  try {
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_ERROR",
      error: error
    }).catch(() => {
      // Ignore errors if popup is closed
    });
  } catch (error) {
    // Ignore errors if extension context is invalid
  }
}

function sendDownloadCancelled() {
  try {
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_CANCELLED"
    }).catch(() => {
      // Ignore errors if popup is closed
    });
  } catch (error) {
    // Ignore errors if extension context is invalid
  }
}

// Create offscreen document for ffmpeg.wasm processing
async function createOffscreenDocument() {
  console.log("Checking for existing offscreen document...");
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length > 0) {
    console.log("Offscreen document already exists.");
    offscreenCreated = true;
    return;
  }

  console.log("Creating new offscreen document...");
  await new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(
        new Error("Offscreen document creation timed out after 30 seconds.")
      );
    }, 30000);

    const listener = (message) => {
      if (message.type === "OFFSCREEN_DOCUMENT_READY") {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        offscreenCreated = true;
        console.log("✅ Offscreen document is ready.");
        resolve();
      } else if (message.type === "OFFSCREEN_ERROR") {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        console.error("❌ Offscreen document failed to load:", message.error);
        reject(new Error(`Offscreen document error: ${message.error.message}`));
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification: "ffmpeg.wasm needs to run in a separate worker process.",
      });
      console.log("Offscreen document created, waiting for ready signal...");
    } catch (error) {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
      console.error("❌ Failed to create offscreen document:", error);
      reject(error);
    }
  });
}

// Close offscreen document
async function closeOffscreenDocument() {
  if (!offscreenCreated) return;

  try {
    await chrome.offscreen.closeDocument();
    offscreenCreated = false;
    console.log("✅ Offscreen document closed");
  } catch (error) {
    console.warn("⚠️ Error closing offscreen document:", error);
  }
}

// Convert blob to base64 for message passing
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(result.split(",")[1]); // Remove data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Convert base64 to blob
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Browser-compatible UUID generator
const uuidv4 = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Simple HLS parser implementation for browser
const parseM3U8 = (content) => {
  console.log("🔍 Parsing M3U8 content:", content.substring(0, 200) + "...");

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
  const result = {
    isMasterPlaylist: false,
    variants: [],
    segments: [],
    audioTracks: [],
  };

  // Check if it's a master playlist (contains stream info, not just media info)
  if (content.includes("#EXT-X-STREAM-INF")) {
    result.isMasterPlaylist = true;
    console.log("📋 Detected master playlist");

    // Parse audio tracks
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
        const line = lines[i];
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch) {
          result.audioTracks.push({ uri: uriMatch[1] });
          console.log("🎵 Found audio track:", uriMatch[1]);
        }
      }
    }

    // Parse video variants
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith("#")) {
          result.variants.push({ uri: nextLine });
        }
      }
    }
  } else {
    console.log("📋 Detected media playlist");
    // Media playlist
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXTINF")) {
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith("#")) {
          result.segments.push({ uri: nextLine });
        }
      }
    }
  }

  console.log("✅ Parsed M3U8:", {
    isMasterPlaylist: result.isMasterPlaylist,
    variantCount: result.variants.length,
    segmentCount: result.segments.length,
    audioTrackCount: result.audioTracks.length,
  });

  return result;
};

// Enhanced regex-based XML parser for DASH manifests
const parseXML = (xmlString) => {
  console.log("🔍 Parsing XML content:", xmlString.substring(0, 200) + "...");

  const adaptationSetRegex =
    /<AdaptationSet[^>]*?contentType="(audio|video)"[^>]*?>(.*?)<\/AdaptationSet>/gs;
  const matches = [...xmlString.matchAll(adaptationSetRegex)];

  const adaptationSets = matches.map((match) => {
    const contentType = match[1];
    const content = match[2];

    const representationRegex =
      /<Representation[^>]*?bandwidth="(\d+)"[^>]*?>(.*?)<\/Representation>/gs;
    const repMatches = [...content.matchAll(representationRegex)];

    const representations = repMatches.map((repMatch) => ({
      bandwidth: parseInt(repMatch[1], 10),
      innerHTML: repMatch[2],
    }));

    // Sort representations by bandwidth, descending
    representations.sort((a, b) => b.bandwidth - a.bandwidth);

    return {
      getAttribute: (attr) => (attr === "contentType" ? contentType : null),
      representations: representations,
    };
  });

  const audioAdaptationSet = adaptationSets.find(
    (s) => s.getAttribute("contentType") === "audio"
  );
  const videoAdaptationSet = adaptationSets.find(
    (s) => s.getAttribute("contentType") === "video"
  );

  console.log(
    "✅ Parsed XML - Audio sets:",
    !!audioAdaptationSet,
    "Video sets:",
    !!videoAdaptationSet
  );

  return {
    MPD: {
      Period: [
        {
          AdaptationSet: [audioAdaptationSet, videoAdaptationSet].filter(
            Boolean
          ),
        },
      ],
    },
  };
};

const GRAPHQL_QUERIES = {
  GetVideoSSR: `
        query GetVideoSSR($videoId: ID!, $password: String) {
          getVideo(id: $videoId, password: $password) {
            __typename
            ... on PrivateVideo {
              id
              status
              message
              __typename
            }
            ... on VideoPasswordMissingOrIncorrect {
              id
              message
              __typename
            }
            ... on RegularUserVideo {
              id
              __typename
              createdAt
              description
              download_enabled
              folder_id
              is_protected
              needs_password
              owner {
                display_name
                __typename
              }
              privacy
              s3_id
              name
              video_properties {
                duration
                height
                width
              }
            }
          }
        }\n`,
};

const APOLLO_GRAPHQL_VERSION = "0a1856c";

async function callGraphqlApi(operations, videoId, password) {
  console.log("🔍 callGraphqlApi called with:", {
    operations,
    videoId,
    password: password ? "***" : null,
  });

  const body = JSON.stringify(
    operations.map((operationName) => ({
      operationName,
      variables: {
        videoId,
        password,
      },
      query: GRAPHQL_QUERIES[operationName],
    }))
  );

  console.log("📤 GraphQL request body:", body);

  try {
    console.log("🌐 Making fetch request to Loom GraphQL...");
    const response = await fetch("https://www.loom.com/graphql", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.loom.com/",
        Origin: "https://www.loom.com",
        "x-loom-request-source": `loom_web_${APOLLO_GRAPHQL_VERSION}`,
        "apollographql-client-name": "web",
        "apollographql-client-version": APOLLO_GRAPHQL_VERSION,
      },
      body,
    });

    console.log(
      "📥 GraphQL response status:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      throw new Error(
        `GraphQL request failed: ${response.status} ${response.statusText}`
      );
    }

    const jsonResponse = await response.json();
    console.log("✅ GraphQL response data:", jsonResponse);
    return jsonResponse;
  } catch (error) {
    console.error("❌ GraphQL request error:", error);
    throw error;
  }
}

async function callUrlApi(endpoint, videoId, password) {
  console.log(`🔍 callUrlApi called with:`, {
    endpoint,
    videoId,
    password: password ? "***" : null,
  });

  try {
    const requestBody = {
      anonID: uuidv4(),
      deviceID: null,
      force_original: false,
      password: password,
    };
    console.log(`📤 ${endpoint} request body:`, requestBody);

    const response = await fetch(
      `https://www.loom.com/api/campaigns/sessions/${videoId}/${endpoint}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.loom.com/",
          Origin: "https://www.loom.com",
        },
        body: JSON.stringify(requestBody),
      }
    );

    console.log(
      `📥 ${endpoint} response status:`,
      response.status,
      response.statusText
    );

    if (response.status === 204) {
      console.log(`✅ ${endpoint} returned no content, as expected.`);
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `${endpoint} request failed: ${response.status} ${response.statusText}`
      );
    }

    const json = await response.json();
    console.log(`✅ ${endpoint} response:`, json);
    return json.url;
  } catch (error) {
    console.error(`❌ ${endpoint} request error:`, error);
    throw error;
  }
}

// Browser-compatible download function
async function downloadFile(url, fileName) {
  console.log(`📽 Starting direct download from: ${url}`);
  activeDownloads++;
  console.log(`📊 Active downloads: ${activeDownloads}`);
  
  sendProgressToPopup(10, "Starting download...");

  try {
    // First, try to download directly from the URL using Chrome's download API
    // This is the most memory-efficient approach
    try {
      sendProgressToPopup(25, "Initiating file download...");
      
      chrome.downloads.download(
        {
          url: url,
          filename: fileName,
          saveAs: true,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          console.log(
            `✅ Direct download initiated for: ${fileName} (ID: ${downloadId})`
          );
          
          // Track download progress
          const progressInterval = setInterval(() => {
            if (downloadCancelled) {
              clearInterval(progressInterval);
              return;
            }
            
            chrome.downloads.search({ id: downloadId }, (downloads) => {
              if (downloads.length > 0) {
                const download = downloads[0];
                if (download.state === 'complete') {
                  clearInterval(progressInterval);
                  sendDownloadComplete("Download completed!");
                } else if (download.state === 'interrupted') {
                  clearInterval(progressInterval);
                  sendDownloadError("Download was interrupted");
                } else if (download.totalBytes > 0) {
                  const progress = (download.bytesReceived / download.totalBytes) * 100;
                  const speed = `${(download.bytesReceived / 1024 / 1024).toFixed(1)} MB`;
                  sendProgressToPopup(Math.min(95, progress), "Downloading...", speed);
                }
              }
            });
          }, 1000);
        }
      );
      return;
    } catch (directDownloadError) {
      console.warn(
        "⚠️ Direct download failed, trying blob approach:",
        directDownloadError
      );
    }

    // Fallback: If direct download fails (e.g., CORS issues), use blob approach
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`
      );
    }

    const blob = await response.blob();
    const blobSize = blob.size;
    console.log(`📊 Blob size: ${(blobSize / 1024 / 1024).toFixed(2)} MB`);

    // For all files, use data URL approach (blob URLs not available in service workers)
    if (blobSize > 100 * 1024 * 1024) {
      console.warn(
        "⚠️ Large file detected:",
        (blobSize / 1024 / 1024).toFixed(2),
        "MB - processing may take time"
      );
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => {
        console.error("❌ FileReader error:", error);
        reject(new Error("Failed to read blob: " + error));
      };
      reader.readAsDataURL(blob);
    });

    chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      saveAs: true,
    });

    console.log(`✅ Download initiated for: ${fileName}`);
  } catch (error) {
    console.error("❌ Download failed:", error);
    throw error;
  } finally {
    activeDownloads--;
    console.log(`📊 Active downloads: ${activeDownloads}`);
  }
}

async function downloadHLSSegments(segments, fileName) {
  console.log(`📽 Downloading ${segments.length} HLS segments`);
  activeDownloads++;
  console.log(`📊 Active downloads: ${activeDownloads}`);
  
  sendProgressToPopup(30, "Downloading video segments...");
  
  // Check for cancellation
  if (downloadCancelled) {
    console.log("❌ Download cancelled during HLS segment preparation");
    activeDownloads--;
    throw new Error("Download cancelled");
  }

  try {
    // Force all HLS downloads to be processed by the offscreen document
    console.log(
      "📦 HLS video detected - downloading segments directly to offscreen document for ffmpeg processing"
    );

    // Create offscreen document first
    await createOffscreenDocument();

    // Download and store segments in batches to avoid memory issues
    const BATCH_SIZE = 50;
    const requestId = uuidv4();
    const segmentsKey = `segments_${requestId}`;
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      // Check for cancellation before each batch
      if (downloadCancelled) {
        console.log("❌ Download cancelled during segment download");
        throw new Error("Download cancelled");
      }
      
      const batch = segments.slice(i, i + BATCH_SIZE);
      const segmentPromises = batch.map(async (segment, index) => {
        const segmentNumber = i + index;
        const response = await fetch(segment.uri);
        if (!response.ok) {
          throw new Error(
            `Segment ${segmentNumber + 1} download failed: ${response.status}`
          );
        }
        return {
          key: `${segmentsKey}_${segmentNumber}`,
          data: await response.arrayBuffer(),
        };
      });
      const batchData = await Promise.all(segmentPromises);
      for (const item of batchData) {
        await set(item.key, item.data);
      }
      
      // Update progress
      const progress = 30 + ((i + batch.length) / segments.length) * 40; // 30-70% for download
      sendProgressToPopup(progress, `Downloaded ${i + batch.length}/${segments.length} segments`);
      
      console.log(
        `📦 Downloaded and stored segments ${i + 1} to ${i + batch.length} of ${
          segments.length
        }`
      );
    }
    console.log(
      `✅ All ${segments.length} segments downloaded and stored in IndexedDB`
    );
    
    sendProgressToPopup(75, "Processing and merging segments...");

    // Create a promise that will be resolved when we receive the response
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(responseListener);
        reject(new Error("Offscreen processing timeout"));
      }, 300000); // 5 minutes

      // Set up listener for response
      const responseListener = (message) => {
        if (
          message.type === "MERGE_SEGMENTS_RESPONSE" &&
          message.requestId === requestId
        ) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(responseListener);
          if (message.success) {
            resolve(message);
          } else {
            reject(
              new Error(message.error?.message || "Offscreen processing failed")
            );
          }
        }
      };

      chrome.runtime.onMessage.addListener(responseListener);

      // Send message without callback to avoid the error
      chrome.runtime.sendMessage({
        type: "MERGE_SEGMENTS",
        requestId,
        segmentsKey,
        fileName,
        totalSegments: segments.length,
      });
    });

    if (response && response.success) {
      console.log("✅ Offscreen processing completed");
      const { downloadInitiated } = response;

      if (!downloadInitiated) {
        console.error("❌ Download was not initiated by offscreen document");
        throw new Error("Download failed to initiate");
      }

      console.log("✅ Download initiated by offscreen document");
    } else {
      throw new Error("Offscreen processing failed");
    }

    console.log(`✅ Merged HLS download completed: ${fileName}`);
  } catch (error) {
    console.error("❌ HLS segment download failed:", error);
    throw error;
  } finally {
    activeDownloads--;
    console.log(`📊 Active downloads: ${activeDownloads}`);
  }
}

// ffmpeg.wasm merger using offscreen document
async function mergeAudioVideo(audioBlob, videoBlob, fileName, isEmbedSplit = false) {
  console.log("🔧 Attempting ffmpeg.wasm merge via offscreen document...");
  const requestId = uuidv4(); // Define here to be accessible in finally
  const audioKey = `audio_${requestId}`;
  const videoKey = `video_${requestId}`;
  const mergedKey = `merged_${requestId}`;

  try {
    console.log(`📊 Audio blob size: ${audioBlob ? audioBlob.size : 0} bytes`);
    console.log(`📊 Video blob size: ${videoBlob ? videoBlob.size : 0} bytes`);

    // Ensure offscreen document is created
    console.log("📄 Creating offscreen document...");
    await createOffscreenDocument();
    console.log("✅ Offscreen document ready");

    console.log("💾 Storing blobs in IndexedDB...");
    if (audioBlob) await set(audioKey, audioBlob);
    if (videoBlob) await set(videoKey, videoBlob);
    console.log("✅ Blobs stored.");

    console.log("📄 Sending merge request to offscreen document...");

    // Create a promise that will be resolved when we receive the response
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(responseListener);
        reject(
          new Error("Offscreen document did not respond within 5 minutes.")
        );
      }, 300000); // 5 minutes timeout for large files and ffmpeg loading

      // Set up listener for response
      const responseListener = (message) => {
        if (
          message.type === "MERGE_RESPONSE" &&
          message.requestId === requestId
        ) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(responseListener);
          console.log("📩 Received response from offscreen document:", message);
          if (message.success) {
            resolve(message);
          } else {
            reject(
              new Error(message.error?.message || "Offscreen merge failed")
            );
          }
        }
      };

      chrome.runtime.onMessage.addListener(responseListener);

      // Send message without callback to avoid the error
      chrome.runtime.sendMessage({
        type: "MERGE_AUDIO_VIDEO",
        requestId,
        audioKey: audioBlob ? audioKey : null,
        videoKey,
        mergedKey,
        isEmbedSplit,
      });
    });

    console.log("📩 Received response from offscreen document:", response);

    if (!response || !response.success) {
      let errorMsg =
        "ffmpeg.wasm merge failed in offscreen document - no response or failure response";
      if (response && response.error) {
        if (typeof response.error === "object") {
          errorMsg = `Offscreen document error: ${response.error.name} - ${response.error.message}`;
          console.error("Full error stack:", response.error.stack);
        } else {
          errorMsg = `Offscreen document error: ${response.error}`;
        }
      }
      console.error("❌ Offscreen merge failed:", errorMsg);
      throw new Error(errorMsg);
    }

    console.log("📄 Retrieving merged blob from IndexedDB...");
    const mergedBlob = await get(mergedKey);
    if (!mergedBlob) {
      throw new Error("Merged data not found in storage.");
    }

    console.log(
      `✅ ffmpeg.wasm merge completed - Output size: ${mergedBlob.size} bytes`
    );

    // Download the merged blob directly here instead of returning it
    console.log("📥 Downloading merged file from background script...");
    const reader = new FileReader();
    reader.onload = function () {
      chrome.downloads.download({
        url: reader.result,
        filename: fileName,
        saveAs: true,
      });
    };
    reader.readAsDataURL(mergedBlob);

    return mergedBlob; // Still return for compatibility
  } catch (error) {
    console.error("❌ ffmpeg.wasm merge failed with error:", error);
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    // Clean up storage
    console.log("🧹 Cleaning up IndexedDB...");
    try {
      if (audioBlob) await remove(audioKey);
      if (videoBlob) await remove(videoKey);
      await remove(mergedKey);
    } catch (cleanupError) {
      console.warn("⚠️ Failed to clean up IndexedDB:", cleanupError);
    }
  }
}

// Browser-compatible DASH segment download with audio/video merging and progressive processing
async function downloadDASHSegments(audioSegments, videoSegments, fileName, isEmbedSplit = false) {
  console.log(
    `📽 Downloading DASH segments progressively - Audio: ${audioSegments.length}, Video: ${videoSegments.length}`
  );
  activeDownloads++;
  console.log(`📊 Active downloads: ${activeDownloads}`);

  try {
    const batchSize = 5; // Increased batch size for better performance

    const downloadBatchWithCatch = async (segments, type) => {
      const segmentChunks = [];

      for (let i = 0; i < segments.length; i += batchSize) {
        const batch = segments.slice(i, i + batchSize);
        console.log(
          `📄 Processing ${type} batch ${
            Math.floor(i / batchSize) + 1
          }/${Math.ceil(segments.length / batchSize)}`
        );

        const batchPromises = batch.map(async (segment, batchIndex) => {
          const globalIndex = i + batchIndex;
          try {
            console.log(
              `📦 Downloading ${type} segment ${globalIndex + 1}/${
                segments.length
              }: ${segment.uri}`
            );
            const response = await fetch(segment.uri);
            if (!response.ok) {
              throw new Error(
                `${type} segment ${globalIndex + 1} download failed: ${
                  response.status
                }`
              );
            }
            const arrayBuffer = await response.arrayBuffer();
            return new Uint8Array(arrayBuffer);
          } catch (error) {
            console.error(
              `❌ Failed to download ${type} segment ${globalIndex + 1}:`,
              error
            );
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((result) => result !== null);
        segmentChunks.push(...validResults);

        // Enhanced memory management
        if (typeof globalThis !== "undefined" && globalThis.gc) {
          globalThis.gc();
        }

        console.log(
          `✅ ${type} batch ${Math.floor(i / batchSize) + 1} completed. ${
            validResults.length
          }/${batch.length} segments successful`
        );
      }

      return segmentChunks;
    };

    // Download audio and video segments in parallel but with batch processing
    const [audioData, videoData] = await Promise.all([
      audioSegments.length > 0
        ? downloadBatchWithCatch(audioSegments, "audio")
        : [],
      videoSegments.length > 0
        ? downloadBatchWithCatch(videoSegments, "video")
        : [],
    ]);

    const failedAudioCount = audioSegments.length - audioData.length;
    const failedVideoCount = videoSegments.length - videoData.length;

    if (failedAudioCount > 0 || failedVideoCount > 0) {
      console.warn(
        `⚠️ Download incomplete. Failed segments - Audio: ${failedAudioCount}, Video: ${failedVideoCount}`
      );
    }

    console.log(`✅ All DASH segments downloaded progressively`);

    // Create separate blobs for audio and video with better memory management
    const audioBlob =
      audioData.length > 0 ? new Blob(audioData, { type: "audio/webm" }) : null;
    const videoBlob =
      videoData.length > 0 ? new Blob(videoData, { type: "video/webm" }) : null;

    // Clear arrays to free memory
    audioData.length = 0;
    videoData.length = 0;

    if (!audioBlob && !videoBlob) {
      throw new Error("Failed to download any audio or video segments.");
    }

    // Handle video-only or audio-only cases
    if (videoBlob && !audioBlob) {
      console.log("🎥 Video-only stream detected, converting WebM to MP4.");
      await mergeAudioVideo(null, videoBlob, fileName, isEmbedSplit);
      return;
    }

    if (audioBlob && !videoBlob) {
      console.log("🎵 Audio-only stream detected, downloading directly.");
      const audioFileName = fileName.replace(".mp4", "_audio.webm");
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => {
          console.error("❌ FileReader error:", error);
          reject(new Error("Failed to read blob: " + error));
        };
        reader.readAsDataURL(audioBlob);
      });

      chrome.downloads.download({
        url: dataUrl,
        filename: audioFileName,
        saveAs: true,
      });
      return;
    }

    console.log("📄 Merging audio and video using ffmpeg.wasm...");
    console.log(
      `📊 Audio blob type: ${audioBlob.type}, size: ${audioBlob.size}`
    );
    console.log(
      `📊 Video blob type: ${videoBlob.type}, size: ${videoBlob.size}`
    );

    try {
      // Merge audio and video using ffmpeg.wasm - it will handle the download internally
      const mergedBlob = await mergeAudioVideo(audioBlob, videoBlob, fileName, isEmbedSplit);

      console.log(
        `✅ Merge returned successfully, blob size: ${mergedBlob.size}`
      );

      console.log(`✅ Merged DASH download initiated: ${fileName}`);
    } catch (mergeError) {
      console.error("❌ ffmpeg.wasm merge failed:", mergeError);
      console.log("📄 Falling back to separate audio/video downloads...");

      try {
        // Download audio and video as separate files
        const audioFileName = fileName.replace(".webm", "_audio.webm");
        const videoFileName = fileName.replace(".webm", "_video.webm");

        console.log("📥 Downloading audio file separately...");
        const audioDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
        chrome.downloads.download({
          url: audioDataUrl,
          filename: audioFileName,
          saveAs: true,
        });

        console.log("📥 Downloading video file separately...");
        const videoDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(videoBlob);
        });
        chrome.downloads.download({
          url: videoDataUrl,
          filename: videoFileName,
          saveAs: true,
        });

        console.log(
          "✅ Separate file downloads initiated due to merge failure"
        );
      } catch (fallbackError) {
        console.error(
          "❌ Fallback separate downloads also failed:",
          fallbackError
        );
        throw new Error(
          `Both merge and fallback downloads failed. Merge error: ${mergeError.message}. Fallback error: ${fallbackError.message}`
        );
      }
    }
  } catch (error) {
    console.error("❌ DASH segment download failed:", error);
    throw error;
  } finally {
    activeDownloads--;
    console.log(`📊 Active downloads: ${activeDownloads}`);
  }
}

async function downloadLoomVideo(url, password) {
  // Reset cancellation flag
  downloadCancelled = false;
  
  sendProgressToPopup(5, "Extracting video information...");
  
  const videoIdMatch = url.match(/\/(?:share|embed)\/([a-f0-9]{32})/);
  if (!videoIdMatch) {
    console.error("Could not extract video ID from URL.");
    const error = "Could not extract video ID from URL.";
    sendDownloadError(error);
    throw new Error(error);
  }
  const videoId = videoIdMatch[1];
  const isEmbedUrl = url.includes("/embed/");
  console.log(`🎬 Starting download for: ${url}`);
  console.log(`🆔 Video ID: ${videoId}`);
  console.log(`🔗 Is embed URL: ${isEmbedUrl}`);

  const [metadataResponse] = await callGraphqlApi(
    ["GetVideoSSR"],
    videoId,
    password
  );
  const metadata = metadataResponse.data.getVideo;

  if (metadata.__typename === "VideoPasswordMissingOrIncorrect") {
    const error =
      "This video is password-protected. Please provide the correct password.";
    console.error("🔒", error);
    sendDownloadError(error);
    throw new Error(error);
  }

  console.log("🔍 Video Title:", metadata.name);
  sendProgressToPopup(15, "Getting download URLs...");

  const rawUrl = await callUrlApi("raw-url", videoId, password);

  let transcodedUrl = null;
  try {
    transcodedUrl = await callUrlApi("transcoded-url", videoId, password);
  } catch (error) {
    console.warn("⚠️ transcoded-url failed, will use raw-url:", error.message);
  }

  let downloadUrl = rawUrl || transcodedUrl;

  if (!downloadUrl) {
    const error = "Could not retrieve download URL.";
    console.error("❌", error);
    sendDownloadError(error);
    throw new Error(error);
  }

  console.log("🔗 Download URL:", downloadUrl);
  console.log("🔍 URL includes .m3u8?", downloadUrl.includes(".m3u8"));
  console.log("🔍 URL includes .mpd?", downloadUrl.includes(".mpd"));
  console.log("🔍 URL type detection:", {
    isM3U8: downloadUrl.includes(".m3u8"),
    isMPD: downloadUrl.includes(".mpd"),
    rawUrl: downloadUrl,
  });

  const fileName = `${metadata.name
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase()}.mp4`;

  if (downloadUrl.includes(".m3u8")) {
    console.log("📺 HLS stream detected. Processing manifest...");

    // Handle -split.m3u8 URLs
    if (downloadUrl.includes("-split.m3u8")) {
      downloadUrl = downloadUrl.replace("-split.m3u8", ".m3u8");
      console.log("📄 Updated Download URL:", downloadUrl);
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch HLS manifest: ${response.statusText}`);
    }

    const m3u8Content = await response.text();
    console.log("📋 M3U8 Manifest Content:", m3u8Content);
    const m3u8 = parseM3U8(m3u8Content);

    let audioSegments = [];
    let videoSegments = [];
    
    if (m3u8.isMasterPlaylist) {
      console.log("🎯 Master playlist detected.");
      const masterUrl = new URL(downloadUrl);
      const query = masterUrl.search;

      // Download audio segments first
      for (const audioTrack of m3u8.audioTracks) {
        const audioPlaylistUrl = new URL(audioTrack.uri, downloadUrl);
        audioPlaylistUrl.search = query;
        const audioPlaylistUrlHref = audioPlaylistUrl.href;

        console.log(`🎵 Fetching audio playlist from: ${audioPlaylistUrlHref}`);
        const audioPlaylistResponse = await fetch(audioPlaylistUrlHref);
        const audioPlaylistContent = await audioPlaylistResponse.text();

        console.log(
          `📋 Audio playlist content for ${audioPlaylistUrlHref}:`,
          audioPlaylistContent.substring(0, 300) + "..."
        );
        const audioPlaylist = parseM3U8(audioPlaylistContent);

        if (audioPlaylist.segments && audioPlaylist.segments.length > 0) {
          console.log(
            `✅ Found ${audioPlaylist.segments.length} audio segments in ${audioTrack.uri}`
          );
          const base_url = audioPlaylistUrlHref.substring(
            0,
            audioPlaylistUrlHref.lastIndexOf("/") + 1
          );

          for (const segment of audioPlaylist.segments) {
            const segmentUrl = new URL(segment.uri, base_url);
            segmentUrl.search = query;
            audioSegments.push({ uri: segmentUrl.href });
          }
        }
      }

      // Download video segments
      for (const variant of m3u8.variants) {
        const playlistUrl = new URL(variant.uri, downloadUrl);
        playlistUrl.search = query;
        const playlistUrlHref = playlistUrl.href;

        console.log(`📥 Fetching video playlist from: ${playlistUrlHref}`);
        const mediaPlaylistResponse = await fetch(playlistUrlHref);
        const mediaPlaylistContent = await mediaPlaylistResponse.text();

        console.log(
          `📋 Video playlist content for ${playlistUrlHref}:`,
          mediaPlaylistContent.substring(0, 300) + "..."
        );
        const mediaPlaylist = parseM3U8(mediaPlaylistContent);

        if (mediaPlaylist.segments && mediaPlaylist.segments.length > 0) {
          console.log(
            `✅ Found ${mediaPlaylist.segments.length} video segments in ${variant.uri}`
          );
          const base_url = playlistUrlHref.substring(
            0,
            playlistUrlHref.lastIndexOf("/") + 1
          );

          for (const segment of mediaPlaylist.segments) {
            const segmentUrl = new URL(segment.uri, base_url);
            segmentUrl.search = query;
            videoSegments.push({ uri: segmentUrl.href });
          }
        }
      }
    } else {
      console.log("📋 Media playlist detected.");
      if (m3u8.segments && m3u8.segments.length > 0) {
        const playlistUrlObject = new URL(downloadUrl);
        const query = playlistUrlObject.search;
        const base_url = downloadUrl.substring(
          0,
          downloadUrl.lastIndexOf("/") + 1
        );

        // For single media playlist, treat as video segments
        for (const segment of m3u8.segments) {
          const segmentUrl = new URL(segment.uri, base_url);
          segmentUrl.search = query;
          videoSegments.push({ uri: segmentUrl.href });
        }
      }
    }

    console.log(`🔍 Debug: audio segments:`, audioSegments.length);
    console.log(`🔍 Debug: video segments:`, videoSegments.length);

    if (audioSegments.length === 0 && videoSegments.length === 0) {
      console.error(
        "❌ No audio or video segments found in HLS manifest."
      );
      console.error("🔍 Debug info:", {
        m3u8Content: m3u8Content.substring(0, 500),
        parsedM3U8: m3u8,
        downloadUrl: downloadUrl,
      });
      throw new Error("No segments found in HLS manifest.");
    }

    // If we have both audio and video, use DASH-style processing for merging
    if (audioSegments.length > 0 && videoSegments.length > 0) {
      console.log(`📦 Found ${audioSegments.length} audio + ${videoSegments.length} video HLS segments - processing as separate streams`);
      await downloadDASHSegments(audioSegments, videoSegments, fileName, isEmbedUrl);
    } else if (videoSegments.length > 0) {
      // Video only - use existing HLS processing
      console.log(`📦 Found ${videoSegments.length} video-only segments`);
      await downloadHLSSegments(videoSegments, fileName);
    } else if (audioSegments.length > 0) {
      // Audio only - use existing HLS processing  
      console.log(`📦 Found ${audioSegments.length} audio-only segments`);
      await downloadHLSSegments(audioSegments, fileName.replace('.webm', '_audio.webm'));
    }
  } else if (downloadUrl.includes(".mpd")) {
    console.log("📺 DASH stream detected. Processing manifest...");

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch DASH manifest: ${response.statusText}`);
    }

    const mpdContent = await response.text();
    console.log("📋 MPD Manifest Content:", mpdContent);

    const manifest = parseXML(mpdContent);
    console.log("✅ Parsed MPD object:", manifest);

    const periods = manifest.MPD.Period;
    const masterUrl = new URL(downloadUrl);
    const query = masterUrl.search;
    const base_url = downloadUrl.substring(0, downloadUrl.lastIndexOf("/") + 1);

    const audioAdaptationSet = periods[0].AdaptationSet.find(
      (aset) => aset && aset.getAttribute("contentType") === "audio"
    );
    const videoAdaptationSet = periods[0].AdaptationSet.find(
      (aset) => aset && aset.getAttribute("contentType") === "video"
    );

    if (!videoAdaptationSet || !videoAdaptationSet.representations.length) {
      throw new Error(
        "Could not find video adaptation set or representations in DASH manifest"
      );
    }

    // Choose the best representation (highest bandwidth)
    const videoRepresentation = videoAdaptationSet.representations[0];
    const audioRepresentation =
      audioAdaptationSet && audioAdaptationSet.representations?.[0];

    const audioSegments = [];
    const videoSegments = [];

    console.log("🔍 Extracting DASH segments from representations...");

    // Helper function to extract segments
    const extractSegments = (representation, baseUrl, query) => {
      const segments = [];
      if (!representation || !representation.innerHTML) return segments;

      const segmentTemplateRegex =
        /<SegmentTemplate[^>]*initialization="([^"]+)"[^>]*media="([^"]+)"(?:[^>]*startNumber="(\d+)")?/;
      const templateMatch = segmentTemplateRegex.exec(representation.innerHTML);

      if (templateMatch) {
        const initialization = templateMatch[1];
        const media = templateMatch[2];
        const startNumber = templateMatch[3]
          ? parseInt(templateMatch[3], 10)
          : 1;

        const initUrl = new URL(initialization, baseUrl);
        initUrl.search = query;
        segments.push({ uri: initUrl.href });

        const segmentTimelineRegex =
          /<SegmentTimeline[^>]*>(.*?)<\/SegmentTimeline>/s;
        const timelineMatch =
          representation.innerHTML.match(segmentTimelineRegex);

        if (timelineMatch) {
          const timelineContent = timelineMatch[1];
          const sTagRegex = /<S\s*([^>]*)\/>/g;
          const sTagMatches = [...timelineContent.matchAll(sTagRegex)];

          let segmentIndex = startNumber;
          for (const sMatch of sTagMatches) {
            const attrs = sMatch[1] || "";
            const rMatch = attrs.match(/r="(\d+)"/);
            const repeatCount = rMatch ? parseInt(rMatch[1], 10) : 0;

            let segmentUrl = new URL(
              media.replace(/\$Number\$/, segmentIndex),
              baseUrl
            );
            segmentUrl.search = query;
            segments.push({ uri: segmentUrl.href });
            segmentIndex++;

            for (let i = 0; i < repeatCount; i++) {
              segmentUrl = new URL(
                media.replace(/\$Number\$/, segmentIndex),
                baseUrl
              );
              segmentUrl.search = query;
              segments.push({ uri: segmentUrl.href });
              segmentIndex++;
            }
          }
        }
      } else {
        const segmentRegex = /<SegmentURL[^>]*media="([^"]+)"/g;
        let match;
        while ((match = segmentRegex.exec(representation.innerHTML)) !== null) {
          const segmentUrl = new URL(match[1], baseUrl);
          segmentUrl.search = query;
          segments.push({ uri: segmentUrl.href });
        }
      }
      return segments;
    };

    // Extract audio and video segments
    if (audioRepresentation) {
      audioSegments.push(
        ...extractSegments(audioRepresentation, base_url, query)
      );
      console.log(`🎵 Found ${audioSegments.length} audio segments`);
    }
    if (videoRepresentation) {
      videoSegments.push(
        ...extractSegments(videoRepresentation, base_url, query)
      );
      console.log(`🎬 Found ${videoSegments.length} video segments`);
    }

    console.log(`🔍 Debug DASH results:`, {
      audioSegmentsFound: audioSegments.length,
      videoSegmentsFound: videoSegments.length,
      audioAdaptationSetExists: !!audioAdaptationSet,
      videoAdaptationSetExists: !!videoAdaptationSet,
    });

    if (videoSegments.length > 0) {
      console.log(
        `📦 Processing ${audioSegments.length} audio + ${videoSegments.length} video DASH segments`
      );
      await downloadDASHSegments(audioSegments, videoSegments, fileName, isEmbedUrl);
    } else {
      console.error(
        "❌ No DASH segments found, falling back to direct download..."
      );
      console.error(
        "🔍 This explains the 5.7kb file - we're downloading the manifest instead of segments"
      );
      await downloadFile(downloadUrl, fileName);
    }
  } else {
    console.log("🔍 Direct file download");
    await downloadFile(downloadUrl, fileName);
  }

  console.log("✅ Download process completed successfully!");
  
  // Send completion message to update progress bar to 100%
  sendDownloadComplete("Download completed successfully!");
}

// Test function to verify offscreen document communication
async function testOffscreenDocument() {
  console.log("🧪 Testing offscreen document communication...");

  try {
    await createOffscreenDocument();

    // Send a simple ping
    const testId = Math.random().toString(36).substring(7);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Offscreen document test timed out"));
      }, 5000);

      const listener = (message) => {
        if (message.type === "PONG" && message.testId === testId) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          console.log("✅ Offscreen document test passed!");
          resolve(true);
        }
      };

      chrome.runtime.onMessage.addListener(listener);

      chrome.runtime.sendMessage({
        type: "PING",
        testId: testId,
      });
    });
  } catch (error) {
    console.error("❌ Offscreen document test failed:", error);
    throw error;
  }
}

// Function to find Loom iframe on third-party sites
async function findLoomEmbed() {
  console.log("🔍 Searching for Loom embed on current page");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      console.error("No active tab found");
      return null;
    }

    if (!tab.id) {
      console.error("Tab has no ID");
      return null;
    }

    console.log("🔍 Executing script on tab:", tab.id, tab.url);

    // Execute script to find Loom iframe
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // This runs in the context of the webpage
        const iframe = document.querySelector(
          'iframe[src*="loom.com/embed"], iframe[src*="loom.com/share"]'
        );
        if (iframe) {
          const src = iframe.src;
          // Extract video ID from iframe src
          const videoIdMatch = src.match(/(?:embed|share)\/([a-f0-9]{32})/);
          return {
            iframeSrc: src,
            videoId: videoIdMatch ? videoIdMatch[1] : null,
            pageUrl: window.location.href,
            pageTitle: document.title,
          };
        }

        // Look for video elements with poster attribute
        const videos = document.querySelectorAll('video[poster]');
        for (const video of videos) {
          const poster = video.poster;
          const src = video.src || '';
          
          // Check if it's a Loom video
          if (poster.includes('loom.com') || src.includes('loom.com')) {
            // Extract video ID from poster or src
            const videoIdMatch = (poster + src).match(/([a-f0-9]{32})/);
            
            return {
              videoId: videoIdMatch ? videoIdMatch[1] : null,
              pageUrl: window.location.href,
              pageTitle: document.title,
              elementType: "video",
              element: video.className || video.id || "video-element",
              thumbnail: poster,
            };
          }
        }

        // Also check for video elements with data-loom-video-id
        const videoElement = document.querySelector(
          "video[data-loom-video-id]"
        );
        if (videoElement) {
          const videoId = videoElement.getAttribute("data-loom-video-id");
          return {
            videoId: videoId,
            pageUrl: window.location.href,
            pageTitle: document.title,
            elementType: "video",
            element:
              videoElement.id || videoElement.className || "video-element",
            thumbnail: videoElement.poster || null,
          };
        }

        // Check for any Loom video elements (including thumbnails in src/poster)
        const loomVideos = document.querySelectorAll('video');
        for (const video of loomVideos) {
          const src = video.src || video.getAttribute('data-src') || '';
          const poster = video.poster || '';
          
          // Check if this is a Loom video by examining src or poster for Loom patterns
          if (src.includes('loom.com') || poster.includes('loom.com') || video.className.includes('Loom') || video.id.includes('Loom')) {
            // Try to extract video ID from src, poster, or page URL
            let videoId = null;
            
            // First try src
            let videoIdMatch = src.match(/([a-f0-9]{32})/);
            if (videoIdMatch) {
              videoId = videoIdMatch[1];
            } else {
              // Try poster
              videoIdMatch = poster.match(/([a-f0-9]{32})/);
              if (videoIdMatch) {
                videoId = videoIdMatch[1];
              } else {
                // Try page URL as fallback
                videoIdMatch = window.location.href.match(/([a-f0-9]{32})/);
                if (videoIdMatch) {
                  videoId = videoIdMatch[1];
                }
              }
            }
            
            // Look for better thumbnail sources if poster is a placeholder
            let thumbnail = poster;
            
            if (!thumbnail || thumbnail.includes('data:image/gif;base64') || thumbnail.length < 50) {
              // Try to find thumbnail in various places
              const thumbnailSelectors = [
                'meta[property="og:image"]',
                'meta[name="twitter:image"]',
                'img[src*="thumbnails"]',
                'img[src*="' + videoId + '"]'
              ];
              
              for (const selector of thumbnailSelectors) {
                const element = document.querySelector(selector);
                if (element && (element.content || element.src)) {
                  const foundThumbnail = element.content || element.src;
                  if (foundThumbnail && !foundThumbnail.includes('data:image/gif;base64')) {
                    thumbnail = foundThumbnail;
                    console.log('🖼️ Found better thumbnail via', selector + ':', thumbnail);
                    break;
                  }
                }
              }
            }
            
            console.log('🎬 Found Loom video element:', {
              src, poster, thumbnail, videoId, 
              element: video.className || video.id || 'video'
            });
            
            return {
              videoId: videoId,
              pageUrl: window.location.href,
              pageTitle: document.title,
              elementType: "video",
              element: video.id || video.className || "loom-video-element",
              thumbnail: thumbnail || null,
            };
          }
        }

        return null;
      },
    });

    console.log("📥 Script execution results:", results);

    if (results && results[0] && results[0].result) {
      console.log("✅ Found Loom embed:", results[0].result);
      return results[0].result;
    }

    console.log("❌ No Loom embed found on page");
    return null;
  } catch (error) {
    console.error("❌ Error finding Loom embed:", error);
    // Check if this is a script injection error
    if (error.message && error.message.includes("Cannot access")) {
      console.error("❌ Cannot access tab - likely permission issue");
    } else if (
      error.message &&
      error.message.includes("Tabs cannot be edited")
    ) {
      console.error(
        "❌ Tab cannot be edited - likely chrome:// page or similar"
      );
    } else if (error.message && error.message.includes("No tab with id")) {
      console.error("❌ Tab no longer exists");
    }
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("📧 Background received message:", request);

  // These are fire-and-forget messages from the offscreen document or self.
  // We don't send a response, so we don't return true.
  const fireAndForgetTypes = [
    "MERGE_AUDIO_VIDEO",
    "MERGE_SEGMENTS",
    "MERGE_SEGMENTS_RESPONSE",
    "MERGE_RESPONSE",
    "OFFSCREEN_DOCUMENT_READY",
    "OFFSCREEN_ERROR",
  ];

  if (fireAndForgetTypes.includes(request.type)) {
    handleRequest(request, sender, null); // Pass null for sendResponse to indicate no response needed
    return false; // No async response needed for fire-and-forget
  }

  // All other actions are async and require a response - NO ACTIVATION CHECK NEEDED
  if (request.action) {
    console.log("📧 Processing action:", request.action);
    handleRequest(request, sender, sendResponse);
    return true; // Indicates async response
  } else {
    // For messages without action, handle them as fire-and-forget
    console.log("📄 Handling message without action:", request.type || "unknown");
    handleRequest(request, sender, null);
    return false; // No async response needed
  }
});

function handleRequest(request, sender, sendResponse) {
  switch (request.action) {
    case "extractVideoInfo":
      console.log("🎬 Processing extractVideoInfo request");
      const videoIdMatch = request.url.match(
        /\/(?:share|embed)\/([a-f0-9]{32})/
      );
      if (!videoIdMatch) {
        console.error("❌ Could not extract video ID from URL:", request.url);
        sendResponse({
          success: false,
          error: "Could not extract video ID from URL.",
        });
        return;
      }
      const videoId = videoIdMatch[1];
      console.log("✅ Extracted video ID:", videoId);

      callGraphqlApi(["GetVideoSSR"], videoId, request.password)
        .then((response) => {
          console.log("📋 Processing GraphQL response for extractVideoInfo");
          console.log("🔍 Full GraphQL response:", JSON.stringify(response, null, 2));
          const metadata = response[0].data.getVideo;
          console.log("📊 Raw metadata object:", JSON.stringify(metadata, null, 2));
          if (metadata.__typename === "VideoPasswordMissingOrIncorrect") {
            console.warn("🔒 Video is password protected");
            sendResponse({
              success: false,
              error:
                "This video is password-protected. Please provide the correct password.",
            });
          } else if (metadata.status === "error") {
            console.error("❌ Video processing error:", metadata.message);
            sendResponse({
              success: false,
              error: `Video processing error: ${metadata.message}`,
            });
          } else {
            const videoInfo = {
              title: metadata.name,
              owner: metadata.owner.display_name,
              duration: metadata.video_properties.duration,
              width: metadata.video_properties.width,
              height: metadata.video_properties.height,
              description: metadata.description,
              url: request.url,
            };
            console.log("✅ Video info extracted successfully:", metadata.name);
            console.log("📦 Final videoInfo object being returned:", JSON.stringify(videoInfo, null, 2));
            sendResponse({
              success: true,
              videoInfo: videoInfo,
            });
          }
        })
        .catch((error) => {
          console.error("❌ Error in extractVideoInfo:", error);
          sendResponse({ success: false, error: error.message });
        });
      break;
    case "loomEmbedDetected":
      console.log("🎬 Loom embed detected on page:", request.videoInfo);
      // This is just a notification, but we should still send a response if requested
      if (sendResponse) {
        sendResponse({ success: true, message: "Embed detected" });
      }
      break;
    case "testOffscreen":
      console.log("🧪 Processing testOffscreen request");
      testOffscreenDocument()
        .then(() => {
          sendResponse({ success: true, message: "Offscreen test passed!" });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      break;
    case "downloadVideo":
      console.log("⬇️ Processing downloadVideo request");
      downloadLoomVideo(request.url, request.password)
        .then(() => {
          console.log("✅ Download completed successfully");
          if (sendResponse) {
            sendResponse({
              success: true,
              message: "Download started successfully!",
            });
          }
        })
        .catch((error) => {
          console.error("❌ Error in downloadVideo:", error);
          sendDownloadError(error.message);
          if (sendResponse) {
            sendResponse({ success: false, error: error.message });
          }
        });
      break;
    case "cancelDownload":
      console.log("❌ Processing cancelDownload request");
      downloadCancelled = true;
      sendDownloadCancelled();
      if (sendResponse) {
        sendResponse({ success: true, message: "Download cancelled" });
      }
      break;
    case "checkDownloadStatus":
      console.log("📊 Processing checkDownloadStatus request");
      if (sendResponse) {
        sendResponse({ 
          success: true, 
          inProgress: activeDownloads > 0 && !downloadCancelled 
        });
      }
      break;
    case "findLoomEmbed":
      console.log("🔍 Processing findLoomEmbed request");
      findLoomEmbed()
        .then((embedInfo) => {
          console.log("📋 findLoomEmbed result:", embedInfo);
          if (embedInfo) {
            // Convert the embed info to a video URL that can be processed
            let videoUrl;
            if (embedInfo.iframeSrc) {
              // For iframe embeds, convert to share URL
              videoUrl = `https://www.loom.com/share/${embedInfo.videoId}`;
            } else if (embedInfo.videoId) {
              // For video elements, create share URL
              videoUrl = `https://www.loom.com/share/${embedInfo.videoId}`;
            }

            console.log("✅ Sending success response for findLoomEmbed");
            sendResponse({
              success: true,
              embedInfo: embedInfo,
              videoUrl: videoUrl,
            });
          } else {
            console.log("❌ No embed found, sending failure response");
            sendResponse({
              success: false,
              error: "No Loom embed found on this page.",
            });
          }
        })
        .catch((error) => {
          console.error("❌ Error in findLoomEmbed promise:", error);
          try {
            sendResponse({
              success: false,
              error: error.message || "Unknown error occurred",
            });
          } catch (responseError) {
            console.error("❌ Failed to send error response:", responseError);
          }
        });
      break;
    default:
      // Handle fire-and-forget messages here
      switch (request.type) {
        case "MERGE_AUDIO_VIDEO":
          console.log(
            "📄 Ignoring MERGE_AUDIO_VIDEO message in background script"
          );
          break;
        case "MERGE_SEGMENTS":
          console.log(
            "📄 Ignoring MERGE_SEGMENTS message in background script"
          );
          break;
        case "MERGE_SEGMENTS_RESPONSE":
          console.log(
            "📄 Ignoring MERGE_SEGMENTS_RESPONSE message in background script"
          );
          break;
        case "MERGE_RESPONSE":
          console.log(
            "📄 Ignoring MERGE_RESPONSE message in background script"
          );
          // Don't send response for fire-and-forget messages
          break;
        case "OFFSCREEN_DOCUMENT_READY":
          console.log("✅ Offscreen document is ready.");
          break;
        case "OFFSCREEN_ERROR":
          console.log("❌ Offscreen document error received.");
          break;
        default:
          if (request.action) {
            console.warn("❓ Unknown action received:", request.action);
            if (sendResponse) {
              sendResponse({
                success: false,
                error: `Unknown action: ${request.action}`,
              });
            }
          } else {
            console.warn("⚠️ Unhandled message:", request);
            if (sendResponse) {
              sendResponse({
                success: false,
                error: "Unhandled message type",
              });
            }
          }
      }
  }
}

// Listen for download changes to prevent service worker suspension
chrome.downloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    console.log(`📥 Download completed: ${downloadDelta.id}`);
  }

  if (downloadDelta.state && downloadDelta.state.current === "interrupted") {
    console.log(`❌ Download interrupted: ${downloadDelta.id}`);
  }

  // Keep service worker alive while downloads are active
  if (activeDownloads > 0) {
    console.log(
      `⏳ Keeping service worker alive - ${activeDownloads} active downloads`
    );
  }
});

// Clean up offscreen document when extension shuts down
chrome.runtime.onSuspend.addListener(() => {
  console.log("🧹 Extension suspending, cleaning up offscreen document...");
  closeOffscreenDocument().catch(console.error);
});

console.log("✅ Background script loaded successfully");