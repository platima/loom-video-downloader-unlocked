// History Page JavaScript

let downloadHistory = [];
let filteredHistory = [];
let currentFilters = {
  search: "",
  status: "",
  sortBy: "date_desc",
};

// DOM elements
const elements = {
  historyList: document.getElementById("historyList"),
  emptyState: document.getElementById("emptyState"),
  loadingState: document.getElementById("loadingState"),
  totalDownloads: document.getElementById("totalDownloads"),
  totalSize: document.getElementById("totalSize"),
  successRate: document.getElementById("successRate"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  sortBy: document.getElementById("sortBy"),
  clearHistory: document.getElementById("clearHistory"),
  exportHistory: document.getElementById("exportHistory"),
  refreshHistory: document.getElementById("refreshHistory"),
};

// Initialize
async function init() {
  showLoading(true);
  await loadHistory();
  setupEventListeners();
  applyFilters();
  showLoading(false);
}

// Load history from storage
async function loadHistory() {
  try {
    const result = await chrome.storage.local.get("downloadHistory");
    downloadHistory = result.downloadHistory || [];
    console.log("Loaded history:", downloadHistory.length, "items");
  } catch (error) {
    console.error("Error loading history:", error);
    downloadHistory = [];
  }
}

// Setup event listeners
function setupEventListeners() {
  // Search input
  elements.searchInput.addEventListener("input", (e) => {
    currentFilters.search = e.target.value.toLowerCase();
    applyFilters();
  });

  // Status filter
  elements.statusFilter.addEventListener("change", (e) => {
    currentFilters.status = e.target.value;
    applyFilters();
  });

  // Sort by
  elements.sortBy.addEventListener("change", (e) => {
    currentFilters.sortBy = e.target.value;
    applyFilters();
  });

  // Clear history
  elements.clearHistory.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear all download history?")) {
      await clearAllHistory();
    }
  });

  // Export history
  elements.exportHistory.addEventListener("click", exportHistoryData);

  // Refresh history
  elements.refreshHistory.addEventListener("click", async () => {
    showLoading(true);
    await loadHistory();
    applyFilters();
    showLoading(false);
  });
}

// Apply filters and sorting
function applyFilters() {
  // Filter
  filteredHistory = downloadHistory.filter((item) => {
    // Search filter
    if (currentFilters.search) {
      const searchTerm = currentFilters.search;
      const matchesSearch =
        (item.title && item.title.toLowerCase().includes(searchTerm)) ||
        (item.id && item.id.toLowerCase().includes(searchTerm)) ||
        (item.fileName && item.fileName.toLowerCase().includes(searchTerm));

      if (!matchesSearch) return false;
    }

    // Status filter
    if (currentFilters.status && item.status !== currentFilters.status) {
      return false;
    }

    return true;
  });

  // Sort
  filteredHistory.sort((a, b) => {
    switch (currentFilters.sortBy) {
      case "date_desc":
        return (b.timestamp || 0) - (a.timestamp || 0);
      case "date_asc":
        return (a.timestamp || 0) - (b.timestamp || 0);
      case "size_desc":
        return (b.fileSize || 0) - (a.fileSize || 0);
      case "size_asc":
        return (a.fileSize || 0) - (b.fileSize || 0);
      default:
        return 0;
    }
  });

  // Update UI
  updateStats();
  renderHistory();
}

// Update statistics
function updateStats() {
  const total = downloadHistory.length;
  const completed = downloadHistory.filter(
    (item) => item.status === "completed"
  ).length;
  const totalBytes = downloadHistory.reduce(
    (sum, item) => sum + (item.fileSize || 0),
    0
  );

  elements.totalDownloads.textContent = total;
  elements.totalSize.textContent = formatFileSize(totalBytes);
  elements.successRate.textContent =
    total > 0 ? Math.round((completed / total) * 100) + "%" : "0%";
}

// Render history list
function renderHistory() {
  if (filteredHistory.length === 0) {
    elements.historyList.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    return;
  }

  elements.historyList.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");

  elements.historyList.innerHTML = filteredHistory
    .map(
      (item) => `
    <div class="history-item" data-id="${item.id || ""}">
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(
          item.title || "Untitled Video"
        )}</div>
        <div class="history-item-details">
          <span>${formatDate(item.timestamp)}</span>
          <span>${formatFileSize(item.fileSize || 0)}</span>
          <span>${item.id || "No ID"}</span>
        </div>
      </div>
      <div class="history-item-actions">
        <span class="status-badge status-${item.status || "unknown"}">${
        item.status || "Unknown"
      }</span>
        ${
          item.status === "completed"
            ? `
          <button class="action-btn" onclick="redownload('${item.id}')">Re-download</button>
        `
            : ""
        }
        <button class="action-btn" onclick="removeItem('${
          item.id
        }')">Remove</button>
      </div>
    </div>
  `
    )
    .join("");
}

// Format date
function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

// Format file size
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 MB";

  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }

  return `${mb.toFixed(1)} MB`;
}

// Escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Remove item from history
window.removeItem = async function (id) {
  if (!id) return;

  downloadHistory = downloadHistory.filter((item) => item.id !== id);
  await chrome.storage.local.set({ downloadHistory });
  applyFilters();
};

// Re-download item
window.redownload = async function (id) {
  const item = downloadHistory.find((h) => h.id === id);
  if (!item || !item.url) {
    alert("Cannot re-download this item. URL not available.");
    return;
  }

  // Send message to background script to download
  chrome.runtime.sendMessage(
    {
      action: "downloadVideo",
      video: {
        url: item.url,
        title: item.title,
        id: item.id,
      },
    },
    (response) => {
      if (response && response.success) {
        alert("Download started!");
      } else {
        alert(
          "Failed to start download: " + (response?.error || "Unknown error")
        );
      }
    }
  );
};

// Clear all history
async function clearAllHistory() {
  downloadHistory = [];
  await chrome.storage.local.set({ downloadHistory });
  applyFilters();
}

// Export history data
function exportHistoryData() {
  const exportData = {
    exportDate: new Date().toISOString(),
    totalItems: downloadHistory.length,
    history: downloadHistory.map((item) => ({
      title: item.title,
      id: item.id,
      url: item.url,
      fileName: item.fileName,
      fileSize: item.fileSize,
      status: item.status,
      timestamp: item.timestamp,
      date: new Date(item.timestamp).toISOString(),
    })),
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `loom-download-history-${
    new Date().toISOString().split("T")[0]
  }.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Show/hide loading state
function showLoading(show) {
  if (show) {
    elements.loadingState.classList.remove("hidden");
    elements.historyList.classList.add("hidden");
    elements.emptyState.classList.add("hidden");
  } else {
    elements.loadingState.classList.add("hidden");
  }
}

// Listen for history updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "historyUpdated") {
    loadHistory().then(() => {
      applyFilters();
    });
  }
});

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
