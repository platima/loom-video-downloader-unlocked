# Loom Downloader Chrome Extension

This is a Chrome extension to download videos from Loom.

## Features

- Download Loom videos.
- Detects video information automatically.

## Installation

1.  Clone this repository or download the source code.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode".
4.  Click "Load unpacked" and select the directory where you cloned/downloaded the files.

## Creating a New Release

To create a new release with obfuscated code, follow these steps:

1.  Make sure you have Node.js and npm installed.
2.  Install the required dependencies by running `npm install`.
3.  Run the build script: `node build.js`.
4.  The protected extension will be available in the `release/loom-downloader-protected.zip` file.

## How to Use

1.  Navigate to a Loom video page.
2.  Click the extension icon in the Chrome toolbar.
3.  The popup will show the video information.
4.  Click the "Download Video" button to start the download.
