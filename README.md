<img align="right" src="https://visitor-badge.laobi.icu/badge?page_id=platima.loomdownloader" height="20" />

# Loom Video Downloader (Browser Extension)

Easily download videos hosted by loom.com in one click with this Loom video downloader browser extension.

- Download loom videos from your account where the DL button was removed
- Download loom videos embedded on other web pages

## 🔗 Links

- ❓ Check FAQs: [Q&A Discussions](https://github.com/platima/loom-video-downloader-unlocked/discussions/categories/q-a)
- 🐛 Report Bugs: [Issues](https://github.com/platima/loom-video-downloader-unlocked/issues)
- 🆕 Request Features: [Feature Requests](https://github.com/platima/loom-video-downloader-unlocked/issues)

## Table of Contents
- [Features](#features)
- [Installation Instructions](#installation-instructions)
- [How to Use](#how-to-use)

## Features

- One-click download from any video page
- 100% privacy-friendly — no tracking or data collection
- Auto-detect videos on the page
- Smart Page Scan
- Embedded Video Support
- Full HD Downloads
- Lightning fast downloads (no re-encoding)
- Original quality preserved (up to 4K)
- No registration or personal data required
- No watermarks or branding added
- Zero Ads
- Regular Updates
- Thumbnail Preview
- Minimal Permissions
- Download Progress Bar
- **Completely Free** - No licensing required

## Installation Instructions

### How to install

1. ⭐ "Star" this repository to support the project
2. Download the latest version (`.zip`) from the [Releases](https://github.com/platima/loom-video-downloader-unlocked/releases) page
3. Extract the `.zip` file on your computer
4. Open Chrome and go to `chrome://extensions/`
5. Enable "Developer mode" by clicking the toggle switch on the top right
6. Click "Load unpacked" and select the extracted extension folder (the FOLDER, not the .zip file)
7. Pin the extension to Chrome by clicking the puzzle icon in the toolbar, then click the pin icon next to "Loom Video Downloader"

### How to Use

1. Navigate to any page with a Loom video
2. Click the extension icon in your browser toolbar
3. The extension will automatically detect the video and show details
4. Click the "Download" button to save the video

> **Tip**: If auto-discovery isn't working, try clicking PLAY on the Loom video first, then click the extension icon.

## ⚠️ Important Disclaimer

**This extension is intended for downloading Loom videos that you have legitimate access to or own.** Please ensure you have proper permissions before downloading any content:

- ✅ **Your own videos** - Videos you created or uploaded
- ✅ **Publicly shared videos** - Videos explicitly shared with you or made public
- ✅ **Educational/work content** - Videos shared within your organization with download permissions
- ✅ **Videos with explicit permission** - Content where the creator has given you download rights

**❌ Do NOT download:**
- Videos you don't have permission to access
- Copyrighted content without authorization
- Private videos from other users without explicit consent
- Content that violates Loom's Terms of Service

**Users are solely responsible for ensuring they have the right to download and store any content.** The developers of this extension are not responsible for any misuse or copyright violations.

## Browser Compatibility

- ✅ Chrome (Recommended)
- ✅ Microsoft Edge
- ✅ Other Chromium-based browsers

## Troubleshooting

- **Video not detected**: Make sure you're on a page with a Loom video and try refreshing
- **Download fails**: Check that you have sufficient disk space and download permissions
- **Extension not working**: Try disabling and re-enabling the extension

<details>
  <summary>Permissions Justifications</summary>
  
### Single purpose description  
This extension allows users to download Loom videos directly from the Loom website to their local computer with a single click, making it easy to save and access videos offline.

### downloads justification  
The "downloads" permission is required to save Loom videos from the web directly to the user's computer. Without this, the extension would not be able to transfer video files to the user's local storage.

### activeTab justification  
The "activeTab" permission is necessary to interact with the Loom website that the user is currently viewing. It enables the extension to detect and download videos only when the user activates the extension on an appropriate tab.

### storage justification  
The "storage" permission is used to save user preferences and extension settings locally. This ensures a smooth and personalized user experience each time the extension is used.

### notifications justification  
The "notifications" permission is used to inform users when a video download has started, completed, or if there is an error during the process. This keeps users updated about the status of their downloads.

### contextMenus justification  
The "contextMenus" permission allows the extension to add options to the right-click menu, making it more convenient for users to download Loom videos directly from the context menu without having to use the main extension popup.

### clipboardRead justification  
The "clipboardRead" permission may be used to allow users to quickly paste Loom video URLs from their clipboard into the extension for downloading, streamlining the user workflow.

### tabs justification  
The "tabs" permission is required to access information about the user's open tabs, such as the current URL, to ensure the extension only operates on Loom video pages and manages downloads efficiently.

### scripting justification  
The "scripting" permission allows the extension to execute scripts on Loom pages to detect video elements and facilitate the download functionality.

### offscreen justification  
The "offscreen" permission is used to process video files in the background, ensuring that downloads can be completed smoothly without interrupting the user's browsing experience.

### cookies justification  
The "cookies" permission may be required to access authentication cookies for Loom, ensuring the extension can download videos that may require the user to be logged in.

### webNavigation justification  
The "webNavigation" permission helps the extension monitor navigation to Loom video pages, enabling it to offer download functionality only when appropriate.

### Host permission justification
Host permissions are requested for loom.com and its subdomains to enable the extension to detect and download Loom videos directly from the Loom website. No other hosts are accessed.

### Remote code justification  
No, this extension does not use remote code. All code is packaged within the extension and does not execute any external scripts or resources.

</details>