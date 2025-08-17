// Simple worker for ffmpeg.wasm
// This is a minimal worker that just imports and exposes the ffmpeg core

importScripts("./lib/ffmpeg-core.js");

// The ffmpeg core will be available as a global after importing
self.onmessage = function (e) {
  // Forward messages to the ffmpeg core
  if (self.FFmpeg) {
    self.FFmpeg.onmessage(e);
  }
};
