// Options page script for Loom Downloader

// Default settings
const defaultSettings = {
  downloadPath: "Loom",
  fileNameFormat: "title_id_date",
  videoQuality: "highest",
  autoDetect: true,
  showNotifications: true,
  closePopupAfterDownload: false,
  saveHistory: true,
  debugMode: false,
  maxRetries: 3,
  clipboardMonitoring: false,
};

// Load settings when page opens
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadHistoryStats();
  setupEventListeners();
});

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get("settings");
    const settings = result.settings || defaultSettings;

    // Apply settings to form
    document.getElementById("downloadPath").value = settings.downloadPath;
    document.getElementById("fileNameFormat").value = settings.fileNameFormat;
    document.getElementById("videoQuality").value = settings.videoQuality;
    document.getElementById("autoDetect").checked = settings.autoDetect;
    document.getElementById("showNotifications").checked =
      settings.showNotifications;
    document.getElementById("closePopupAfterDownload").checked =
      settings.closePopupAfterDownload;
    document.getElementById("saveHistory").checked = settings.saveHistory;
    document.getElementById("debugMode").checked = settings.debugMode;
    document.getElementById("maxRetries").value = settings.maxRetries;
    document.getElementById("clipboardMonitoring").checked =
      settings.clipboardMonitoring;
  } catch (error) {
    console.error("Error loading settings:", error);
    showStatus("Error loading settings", "error");
  }
}

// Save settings
async function saveSettings() {
  try {
    const settings = {
      downloadPath: document.getElementById("downloadPath").value || "Loom",
      fileNameFormat: document.getElementById("fileNameFormat").value,
      videoQuality: document.getElementById("videoQuality").value,
      autoDetect: document.getElementById("autoDetect").checked,
      showNotifications: document.getElementById("showNotifications").checked,
      closePopupAfterDownload: document.getElementById(
        "closePopupAfterDownload"
      ).checked,
      saveHistory: document.getElementById("saveHistory").checked,
      debugMode: document.getElementById("debugMode").checked,
      maxRetries: parseInt(document.getElementById("maxRetries").value) || 3,
      clipboardMonitoring: document.getElementById("clipboardMonitoring")
        .checked,
    };

    await chrome.storage.local.set({ settings });

    // Apply debug mode immediately
    if (settings.debugMode) {
      console.log("Settings saved:", settings);
    }

    // Update clipboard monitoring
    chrome.runtime.sendMessage({
      action: "updateClipboardMonitoring",
      enabled: settings.clipboardMonitoring,
    });

    showStatus("Settings saved successfully!", "success");
  } catch (error) {
    console.error("Error saving settings:", error);
    showStatus("Error saving settings", "error");
  }
}

// Reset to defaults
async function resetSettings() {
  if (confirm("Are you sure you want to reset all settings to defaults?")) {
    await chrome.storage.local.set({ settings: defaultSettings });
    await loadSettings();
    showStatus("Settings reset to defaults", "success");
  }
}

// Load download history stats
async function loadHistoryStats() {
  try {
    const result = await chrome.storage.local.get("downloadHistory");
    const history = result.downloadHistory || [];

    const totalDownloads = history.length;
    const totalSize = history.reduce((sum, item) => sum + (item.size || 0), 0);

    document.getElementById("totalDownloads").textContent = totalDownloads;
    document.getElementById("totalSize").textContent =
      formatFileSize(totalSize);

    if (totalDownloads > 0) {
      document.getElementById("historyStats").classList.remove("hidden");
    }
  } catch (error) {
    console.error("Error loading history stats:", error);
  }
}

// View download history
async function viewHistory() {
  try {
    const result = await chrome.storage.local.get("downloadHistory");
    const history = result.downloadHistory || [];

    if (history.length === 0) {
      alert("No download history found");
      return;
    }

    // Create a new tab with history
    const historyHtml = generateHistoryHTML(history);
    const blob = new Blob([historyHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
  } catch (error) {
    console.error("Error viewing history:", error);
    showStatus("Error viewing history", "error");
  }
}

// Generate HTML for history view
function generateHistoryHTML(history) {
  const rows = history
    .map(
      (item) => `
        <tr>
            <td>${item.title || "Untitled"}</td>
            <td>${item.id || "N/A"}</td>
            <td>${new Date(item.timestamp).toLocaleString()}</td>
            <td>${formatFileSize(item.size || 0)}</td>
            <td>${item.status || "Unknown"}</td>
        </tr>
    `
    )
    .join("");

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Loom Download History</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #5e35b1; color: white; }
                tr:hover { background: #f5f5f5; }
            </style>
        </head>
        <body>
            <h1>Loom Download History</h1>
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Video ID</th>
                        <th>Download Date</th>
                        <th>Size</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </body>
        </html>
    `;
}

// Clear download history
async function clearHistory() {
  if (confirm("Are you sure you want to clear all download history?")) {
    try {
      await chrome.storage.local.remove("downloadHistory");
      await loadHistoryStats();
      showStatus("History cleared", "success");
    } catch (error) {
      console.error("Error clearing history:", error);
      showStatus("Error clearing history", "error");
    }
  }
}

// Export history as CSV
async function exportHistory() {
  try {
    const result = await chrome.storage.local.get("downloadHistory");
    const history = result.downloadHistory || [];

    if (history.length === 0) {
      alert("No download history to export");
      return;
    }

    const csv = generateCSV(history);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `loom_download_history_${
        new Date().toISOString().split("T")[0]
      }.csv`,
    });

    showStatus("History exported", "success");
  } catch (error) {
    console.error("Error exporting history:", error);
    showStatus("Error exporting history", "error");
  }
}

// Generate CSV from history
function generateCSV(history) {
  const headers = ["Title", "Video ID", "Download Date", "Size (MB)", "Status"];
  const rows = history.map((item) => [
    item.title || "Untitled",
    item.id || "N/A",
    new Date(item.timestamp).toLocaleString(),
    (item.size / 1024 / 1024).toFixed(2),
    item.status || "Unknown",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  return csvContent;
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb.toFixed(2) + " MB";
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");

  setTimeout(() => {
    statusEl.classList.add("hidden");
  }, 3000);
}

// Setup event listeners
function setupEventListeners() {
  document
    .getElementById("saveSettings")
    .addEventListener("click", saveSettings);
  document
    .getElementById("resetSettings")
    .addEventListener("click", resetSettings);
  document.getElementById("viewHistory").addEventListener("click", viewHistory);
  document
    .getElementById("clearHistory")
    .addEventListener("click", clearHistory);
  document
    .getElementById("exportHistory")
    .addEventListener("click", exportHistory);

  // Auto-save on change for some settings
  const autoSaveElements = [
    "autoDetect",
    "showNotifications",
    "closePopupAfterDownload",
    "saveHistory",
    "debugMode",
    "clipboardMonitoring",
  ];

  autoSaveElements.forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      saveSettings();
    });
  });
}
