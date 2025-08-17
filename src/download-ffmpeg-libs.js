const fs = require("fs");
const https = require("https");
const path = require("path");

// Create lib directory if it doesn't exist
const libDir = path.join(__dirname, "lib");
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

// FFmpeg core version
const CORE_VERSION = "0.12.6";

// Files to download
const files = [
  {
    url: `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`,
    path: path.join(libDir, "ffmpeg-core.js"),
  },
  {
    url: `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.wasm`,
    path: path.join(libDir, "ffmpeg-core.wasm"),
  },
];

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);

    const file = fs.createWriteStream(filePath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log(`✓ Downloaded ${path.basename(filePath)}`);
          resolve();
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        downloadFile(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    });

    request.on("error", (err) => {
      fs.unlink(filePath, () => {}); // Delete file on error
      reject(err);
    });

    file.on("error", (err) => {
      fs.unlink(filePath, () => {}); // Delete file on error
      reject(err);
    });
  });
}

async function downloadAll() {
  try {
    console.log("Downloading FFmpeg core files...");

    for (const file of files) {
      await downloadFile(file.url, file.path);
    }

    console.log("✓ All FFmpeg core files downloaded successfully!");
  } catch (error) {
    console.error("✗ Error downloading files:", error.message);
    process.exit(1);
  }
}

downloadAll();
