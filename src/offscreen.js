// Enhanced Offscreen script for ffmpeg.wasm processing with WORKERFS mount support
console.log("🚀 Offscreen script starting...");

import { set, get, remove } from "./indexed-db.js";

async function initializeOffscreen() {
  try {
    // Dynamically import FFmpeg to catch potential loading errors
    const { FFmpeg } = await import("/libs/ffmpeg/ffmpeg/dist/esm/index.js");
    console.log("✅ FFmpeg module loaded successfully.");

    // Initialize FFmpeg instance
    const ffmpeg = new FFmpeg();
    let ffmpegLoaded = false;

    ffmpeg.on("log", ({ message }) => {
      console.log(`[ffmpeg] ${message}`);
    });

    // Function to load ffmpeg.wasm
    async function loadFFmpeg() {
      if (ffmpegLoaded) {
        console.log("✅ ffmpeg.wasm already loaded.");
        return;
      }
      console.log("⏳ Loading ffmpeg.wasm...");
      try {
        await ffmpeg.load({
          coreURL: "/libs/ffmpeg/core/dist/esm/ffmpeg-core.js",
        });
        ffmpegLoaded = true;
        console.log("✅ ffmpeg.wasm loaded successfully.");
      } catch (error) {
        console.error("❌ Failed to load ffmpeg.wasm:", error);
        throw error;
      }
    }

    // Helper function to chunk large files for download
    async function chunkedDownload(blob, fileName) {
      console.log(
        `📥 Starting download for ${fileName}, size: ${(
          blob.size /
          1024 /
          1024
        ).toFixed(2)} MB`
      );
      const CHUNK_SIZE = 1.5 * 1024 * 1024 * 1024; // 1.5GB chunks to be safe

      if (blob.size <= CHUNK_SIZE) {
        console.log(
          "📥 File size under chunk limit, performing direct download..."
        );
        // Direct download for files under chunk size
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          console.log("🧹 Blob URL cleaned up");
        }, 1000);

        return true;
      }

      // For larger files, we need to chunk them
      console.log(
        `📦 File size ${(blob.size / 1024 / 1024 / 1024).toFixed(
          2
        )}GB exceeds limit, chunking...`
      );

      const chunks = [];
      let offset = 0;
      let chunkIndex = 0;

      while (offset < blob.size) {
        const chunk = blob.slice(offset, offset + CHUNK_SIZE);
        const chunkFileName = `${fileName}.part${chunkIndex
          .toString()
          .padStart(3, "0")}`;

        console.log(
          `📦 Downloading chunk ${chunkIndex + 1}, size: ${(
            chunk.size /
            1024 /
            1024
          ).toFixed(2)} MB`
        );

        const chunkUrl = URL.createObjectURL(chunk);
        const a = document.createElement("a");
        a.href = chunkUrl;
        a.download = chunkFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          URL.revokeObjectURL(chunkUrl);
        }, 1000);

        chunks.push(chunkFileName);
        offset += CHUNK_SIZE;
        chunkIndex++;

        // Add a small delay between chunks to avoid overwhelming the browser
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Create a manifest file with chunk information
      const manifest = {
        originalFileName: fileName,
        totalSize: blob.size,
        chunkSize: CHUNK_SIZE,
        chunks: chunks,
        reassemblyInstructions:
          "Use 'cat file.part* > file' on Unix or 'copy /b file.part* file' on Windows",
      };

      console.log("📄 Creating manifest file for chunks...");
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
        type: "application/json",
      });
      const manifestUrl = URL.createObjectURL(manifestBlob);
      const a = document.createElement("a");
      a.href = manifestUrl;
      a.download = `${fileName}.manifest.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(manifestUrl);
      }, 1000);

      console.log(
        `✅ Chunked download complete: ${chunks.length} chunks created`
      );
      return true;
    }

    // Function to perform the merge operation with WORKERFS mount
    async function runMerge(request) {
      console.log("🔄 Starting merge process with WORKERFS mount...");

      // Ensure ffmpeg is loaded before proceeding
      await loadFFmpeg();

      console.log("💾 Retrieving blobs from IndexedDB...");
      const { audioKey, videoKey, mergedKey } = request;
      const audioBlob = audioKey ? await get(audioKey) : null;
      const videoBlob = await get(videoKey);

      if (!videoBlob) {
        throw new Error("Video data not found in storage.");
      }

      const isVideoOnly = !audioBlob;
      if (isVideoOnly) {
        console.log("🎥 Video-only conversion detected");
      }

      if (audioBlob) {
        console.log(
          `📊 Audio blob size: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`
        );
      }
      console.log(
        `📊 Video blob size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`
      );

      try {
        // Create directory FIRST - this is critical
        console.log("📁 Creating /mounted directory...");
        await ffmpeg.createDir("/mounted");
        console.log("✅ Directory /mounted created successfully");

        // Convert blobs to Files for mounting
        console.log("📄 Converting blobs to File objects...");
        const files = [];
        
        if (audioBlob) {
          const audioFile = new File([audioBlob], "audio.webm", {
            type: audioBlob.type || "audio/webm",
          });
          files.push(audioFile);
          console.log("✅ Audio file object created - audio.webm");
        }
        
        const videoFile = new File([videoBlob], "video.webm", {
          type: videoBlob.type || "video/webm",
        });
        files.push(videoFile);
        console.log("✅ Video file object created - video.webm");

        // Mount files using WORKERFS
        console.log(`🔗 Mounting ${files.length} files with WORKERFS to /mounted...`);
        await ffmpeg.mount("WORKERFS", { files }, "/mounted");
        console.log("✅ Files mounted successfully to /mounted");

        console.log("🏃‍♂️ Executing ffmpeg command for direct MP4 output...");
        
        let ffmpegCommand;
        if (isVideoOnly) {
          // Video-only conversion: VP9 WebM to MP4 container
          ffmpegCommand = [
            "-i",
            "/mounted/video.webm",
            "-c:v",
            "copy", // Keep VP9 codec, just change container
            "-avoid_negative_ts",
            "make_zero",
            "-y",
            "output.mp4",
          ];
          console.log("🎥 Using video-only conversion command");
        } else {
          // Audio + Video merge
          ffmpegCommand = [
            "-i",
            "/mounted/video.webm",
            "-i",
            "/mounted/audio.webm",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            "-y",
            "output.mp4",
          ];
          console.log("🎬 Using audio+video merge command");
        }
        
        await ffmpeg.exec(ffmpegCommand);

        console.log("📖 Reading result from ffmpeg memory...");
        const mergedData = await ffmpeg.readFile("output.mp4");
        const mergedBlob = new Blob([mergedData], { type: "video/mp4" });

        console.log("💾 Storing merged blob in IndexedDB...");
        await set(mergedKey, mergedBlob);

        // Cleanup
        console.log("🧹 Starting cleanup...");
        await ffmpeg.unmount("/mounted");
        console.log("✅ Unmounted /mounted");
        await ffmpeg.deleteDir("/mounted");
        console.log("✅ Deleted /mounted directory");
        await ffmpeg.deleteFile("output.mp4");
        console.log("✅ Deleted output.mp4");

        console.log(
          "✅ Merge process completed successfully with direct MP4 output."
        );
      } catch (error) {
        console.error("❌ Error in runMerge:", error);
        // Cleanup on error
        try {
          await ffmpeg.unmount("/mounted").catch(() => {});
          await ffmpeg.deleteDir("/mounted").catch(() => {});
          await ffmpeg.deleteFile("output.mp4").catch(() => {});
        } catch (cleanupError) {
          console.warn("⚠️ Cleanup error:", cleanupError);
        }
        throw error;
      }
    }

    // Stream HLS segments using WORKERFS mount
    async function mergeSegmentsStream(request) {
      console.log("🔄 Starting HLS segments merge with WORKERFS mount...");

      chrome.runtime.sendMessage({
        type: "DEBUG_MESSAGE",
        message:
          "🔄 OFFSCREEN: Starting HLS segments merge with WORKERFS mount",
      });

      const { requestId, segmentsKey, fileName, totalSegments } = request;

      await loadFFmpeg();

      try {
        // Create directory FIRST
        console.log("📁 Creating /segments directory...");
        await ffmpeg.createDir("/segments");
        console.log("✅ Directory /segments created successfully");

        // Load segments in batches and create files for mounting
        const BATCH_SIZE = 100; // Process 100 segments at a time
        const tempFiles = [];

        console.log(
          `📦 Processing ${totalSegments} segments in batches of ${BATCH_SIZE}...`
        );

        for (
          let batchStart = 0;
          batchStart < totalSegments;
          batchStart += BATCH_SIZE
        ) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSegments);
          const batchFiles = [];

          console.log(
            `🔄 Processing batch: segments ${batchStart} to ${batchEnd - 1}`
          );

          // Load segments for this batch
          for (let i = batchStart; i < batchEnd; i++) {
            const segmentKey = `${segmentsKey}_${i}`;
            const segmentData = await get(segmentKey);

            if (segmentData) {
              const segmentFile = new File(
                [segmentData],
                `segment_${i.toString().padStart(4, "0")}.ts`,
                { type: "video/mp2t" }
              );
              batchFiles.push(segmentFile);

              // Clean up IndexedDB as we go
              await remove(segmentKey);
              console.log(`✅ Loaded and removed segment ${i} from IndexedDB`);
            } else {
              console.warn(`⚠️ Segment ${i} not found`);
            }
          }

          if (batchFiles.length === 0) continue;

          // Create batch directory
          const batchDir = `/batch_${batchStart}`;
          console.log(`📁 Creating ${batchDir} directory...`);
          await ffmpeg.createDir(batchDir);

          // Mount this batch
          console.log(
            `🔗 Mounting ${batchFiles.length} files to ${batchDir}...`
          );
          await ffmpeg.mount("WORKERFS", { files: batchFiles }, batchDir);

          // Create concat list for this batch
          let batchList = "";
          for (const file of batchFiles) {
            batchList += `file '${batchDir}/${file.name}'\n`;
          }
          const batchListPath = `/batch_${batchStart}_list.txt`;
          await ffmpeg.writeFile(batchListPath, batchList);

          // Concatenate this batch
          const batchOutputPath = `/temp_batch_${batchStart}.ts`;
          console.log(`🏃‍♂️ Concatenating batch ${batchStart}...`);
          await ffmpeg.exec([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            batchListPath,
            "-c",
            "copy",
            "-y",
            batchOutputPath,
          ]);

          tempFiles.push(batchOutputPath);

          // Cleanup batch
          await ffmpeg.unmount(batchDir);
          await ffmpeg.deleteDir(batchDir);
          await ffmpeg.deleteFile(batchListPath);
          console.log(`✅ Batch ${batchStart} processed and cleaned up`);
        }

        if (tempFiles.length === 0) {
          throw new Error("No valid segments found for merging");
        }

        // Now concatenate all batch files
        console.log(
          `📦 Concatenating ${tempFiles.length} batch files into final output...`
        );

        if (tempFiles.length === 1) {
          // If only one batch, just convert it to MP4
          await ffmpeg.exec([
            "-i",
            tempFiles[0],
            "-c",
            "copy",
            "-movflags",
            "faststart",
            "-y",
            "output.mp4",
          ]);
        } else {
          // Multiple batches - create final concat list
          let finalList = "";
          for (const tempFile of tempFiles) {
            finalList += `file '${tempFile}'\n`;
          }
          await ffmpeg.writeFile("/final_list.txt", finalList);

          await ffmpeg.exec([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            "/final_list.txt",
            "-c",
            "copy",
            "-movflags",
            "faststart",
            "-y",
            "output.mp4",
          ]);

          await ffmpeg.deleteFile("/final_list.txt");
        }

        // Read the output
        console.log("📖 Reading final output file...");
        const finalData = await ffmpeg.readFile("output.mp4");
        const finalBlob = new Blob([finalData], { type: "video/mp4" });

        console.log(
          `✅ Final MP4 size: ${(finalBlob.size / 1024 / 1024).toFixed(2)} MB`
        );

        // Cleanup temp files
        for (const tempFile of tempFiles) {
          await ffmpeg.deleteFile(tempFile);
        }
        await ffmpeg.deleteFile("output.mp4");
        await ffmpeg.deleteDir("/segments");

        // Handle download with chunking support
        const outputFileName = fileName.replace(/\.(webm|mkv|avi)$/i, ".mp4");
        const downloadSuccess = await chunkedDownload(
          finalBlob,
          outputFileName
        );

        chrome.runtime.sendMessage({
          type: "MERGE_SEGMENTS_RESPONSE",
          success: true,
          requestId: requestId,
          downloadInitiated: downloadSuccess,
        });
      } catch (error) {
        console.error("❌ Error in mergeSegmentsStream:", error);
        // Cleanup on error
        try {
          await ffmpeg.deleteDir("/segments").catch(() => {});
        } catch (cleanupError) {
          console.warn("⚠️ Cleanup error:", cleanupError);
        }

        chrome.runtime.sendMessage({
          type: "MERGE_SEGMENTS_RESPONSE",
          success: false,
          requestId: request.requestId,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        });
      }
    }

    // Merge separate audio and video segments using WORKERFS mount
    async function mergeSeparateAVSegments(request) {
      console.log(
        "🔄 Starting separate A/V segments merge with WORKERFS mount..."
      );

      chrome.runtime.sendMessage({
        type: "DEBUG_MESSAGE",
        message:
          "🔄 OFFSCREEN: Starting separate A/V segments merge with WORKERFS mount",
      });

      const {
        requestId,
        segmentsKey,
        fileName,
        totalSegments,
        videoCount,
        audioCount,
      } = request;

      console.log(
        `📊 Processing ${totalSegments} segments: ${videoCount} video, ${audioCount} audio`
      );

      await loadFFmpeg();

      try {
        // Create directory FIRST
        console.log("📁 Creating /av_segments directory...");
        await ffmpeg.createDir("/av_segments");
        console.log("✅ Directory /av_segments created successfully");

        // Load segments and prepare for mounting
        const BATCH_SIZE = 50;
        const videoFiles = [];
        const audioFiles = [];

        console.log(`📦 Loading segments in batches of ${BATCH_SIZE}...`);

        for (let i = 0; i < totalSegments; i += BATCH_SIZE) {
          const batchEnd = Math.min(i + BATCH_SIZE, totalSegments);

          console.log(`🔄 Processing batch: segments ${i} to ${batchEnd - 1}`);

          for (let j = i; j < batchEnd; j++) {
            const segmentKey = `${segmentsKey}_${j}`;
            const segmentData = await get(segmentKey);

            if (segmentData) {
              if (j < videoCount) {
                const videoFile = new File(
                  [segmentData],
                  `video_${j.toString().padStart(4, "0")}.ts`,
                  { type: "video/mp2t" }
                );
                videoFiles.push(videoFile);
                console.log(`📹 Created video file ${j}`);
              } else {
                const audioIndex = j - videoCount;
                const audioFile = new File(
                  [segmentData],
                  `audio_${audioIndex.toString().padStart(4, "0")}.ts`,
                  { type: "audio/mp2t" }
                );
                audioFiles.push(audioFile);
                console.log(`🎵 Created audio file ${audioIndex}`);
              }

              await remove(segmentKey);
            }
          }
        }

        console.log(
          `📊 Total files: ${videoFiles.length} video, ${audioFiles.length} audio`
        );

        if (videoFiles.length === 0) {
          throw new Error("No video segments found");
        }

        // Process in smaller batches to avoid memory issues
        const AV_BATCH_SIZE = 100;
        const videoTempFiles = [];
        const audioTempFiles = [];

        // Process video files in batches
        console.log("📹 Processing video files in batches...");
        for (let i = 0; i < videoFiles.length; i += AV_BATCH_SIZE) {
          const batch = videoFiles.slice(i, i + AV_BATCH_SIZE);
          const batchDir = `/video_batch_${i}`;

          await ffmpeg.createDir(batchDir);
          await ffmpeg.mount("WORKERFS", { files: batch }, batchDir);

          let concatList = "";
          for (const file of batch) {
            concatList += `file '${batchDir}/${file.name}'\n`;
          }

          const listPath = `/video_list_${i}.txt`;
          await ffmpeg.writeFile(listPath, concatList);

          const outputPath = `/video_temp_${i}.ts`;
          await ffmpeg.exec([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            listPath,
            "-c",
            "copy",
            "-y",
            outputPath,
          ]);

          videoTempFiles.push(outputPath);

          await ffmpeg.unmount(batchDir);
          await ffmpeg.deleteDir(batchDir);
          await ffmpeg.deleteFile(listPath);
          console.log(`✅ Video batch ${i} processed`);
        }

        // Process audio files in batches if they exist
        if (audioFiles.length > 0) {
          console.log("🎵 Processing audio files in batches...");
          for (let i = 0; i < audioFiles.length; i += AV_BATCH_SIZE) {
            const batch = audioFiles.slice(i, i + AV_BATCH_SIZE);
            const batchDir = `/audio_batch_${i}`;

            await ffmpeg.createDir(batchDir);
            await ffmpeg.mount("WORKERFS", { files: batch }, batchDir);

            let concatList = "";
            for (const file of batch) {
              concatList += `file '${batchDir}/${file.name}'\n`;
            }

            const listPath = `/audio_list_${i}.txt`;
            await ffmpeg.writeFile(listPath, concatList);

            const outputPath = `/audio_temp_${i}.ts`;
            await ffmpeg.exec([
              "-f",
              "concat",
              "-safe",
              "0",
              "-i",
              listPath,
              "-c",
              "copy",
              "-y",
              outputPath,
            ]);

            audioTempFiles.push(outputPath);

            await ffmpeg.unmount(batchDir);
            await ffmpeg.deleteDir(batchDir);
            await ffmpeg.deleteFile(listPath);
            console.log(`✅ Audio batch ${i} processed`);
          }
        }

        // Concatenate all video temp files
        console.log("📹 Concatenating all video batches...");
        if (videoTempFiles.length === 1) {
          await ffmpeg.exec(["cp", videoTempFiles[0], "/final_video.ts"]);
        } else {
          let videoList = "";
          for (const file of videoTempFiles) {
            videoList += `file '${file}'\n`;
          }
          await ffmpeg.writeFile("/final_video_list.txt", videoList);
          await ffmpeg.exec([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            "/final_video_list.txt",
            "-c",
            "copy",
            "-y",
            "/final_video.ts",
          ]);
          await ffmpeg.deleteFile("/final_video_list.txt");
        }

        // Cleanup video temp files
        for (const file of videoTempFiles) {
          await ffmpeg.deleteFile(file);
        }

        let ffmpegCommand;
        if (audioTempFiles.length > 0) {
          // Concatenate all audio temp files
          console.log("🎵 Concatenating all audio batches...");
          if (audioTempFiles.length === 1) {
            await ffmpeg.exec(["cp", audioTempFiles[0], "/final_audio.ts"]);
          } else {
            let audioList = "";
            for (const file of audioTempFiles) {
              audioList += `file '${file}'\n`;
            }
            await ffmpeg.writeFile("/final_audio_list.txt", audioList);
            await ffmpeg.exec([
              "-f",
              "concat",
              "-safe",
              "0",
              "-i",
              "/final_audio_list.txt",
              "-c",
              "copy",
              "-y",
              "/final_audio.ts",
            ]);
            await ffmpeg.deleteFile("/final_audio_list.txt");
          }

          // Cleanup audio temp files
          for (const file of audioTempFiles) {
            await ffmpeg.deleteFile(file);
          }

          // Merge audio and video
          ffmpegCommand = [
            "-i",
            "/final_video.ts",
            "-i",
            "/final_audio.ts",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            "-movflags",
            "faststart",
            "-y",
            "output.mp4",
          ];
        } else {
          // Video only
          ffmpegCommand = [
            "-i",
            "/final_video.ts",
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            "-movflags",
            "faststart",
            "-y",
            "output.mp4",
          ];
        }

        console.log("🏃‍♂️ Executing final merge command...");
        await ffmpeg.exec(ffmpegCommand);

        // Read output
        console.log("📖 Reading final output file...");
        const finalData = await ffmpeg.readFile("output.mp4");
        const finalBlob = new Blob([finalData], { type: "video/mp4" });

        console.log(
          `✅ Final MP4 size: ${(finalBlob.size / 1024 / 1024).toFixed(2)} MB`
        );

        // Cleanup
        await ffmpeg.deleteFile("/final_video.ts");
        if (audioTempFiles.length > 0) {
          await ffmpeg.deleteFile("/final_audio.ts");
        }
        await ffmpeg.deleteFile("output.mp4");
        await ffmpeg.deleteDir("/av_segments");

        // Handle download with chunking support
        const outputFileName = fileName.replace(/\.(webm|mkv|avi)$/i, ".mp4");
        const downloadSuccess = await chunkedDownload(
          finalBlob,
          outputFileName
        );

        chrome.runtime.sendMessage({
          type: "MERGE_SEPARATE_AV_RESPONSE",
          success: true,
          requestId: requestId,
          downloadInitiated: downloadSuccess,
        });
      } catch (error) {
        console.error("❌ Error in mergeSeparateAVSegments:", error);
        // Cleanup on error
        try {
          await ffmpeg.deleteDir("/av_segments").catch(() => {});
        } catch (cleanupError) {
          console.warn("⚠️ Cleanup error:", cleanupError);
        }

        chrome.runtime.sendMessage({
          type: "MERGE_SEPARATE_AV_RESPONSE",
          success: false,
          requestId: request.requestId,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        });
      }
    }

    // Message listener for incoming requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("🔔 Offscreen received message:", request);

      // Only handle messages intended for the offscreen document
      const offscreenMessageTypes = [
        "MERGE_AUDIO_VIDEO",
        "MERGE_SEGMENTS",
        "MERGE_SEPARATE_AV",
        "PING",
      ];

      if (!offscreenMessageTypes.includes(request.type)) {
        console.log(
          "🔄 Ignoring message not intended for offscreen:",
          request.type || request.action
        );
        return false; // Don't handle this message, let background script handle it
      }

      if (request.type === "MERGE_AUDIO_VIDEO") {
        // Handle the merge asynchronously and send response via message
        runMerge(request)
          .then(() => {
            console.log("✅ Sending success response via message");
            chrome.runtime.sendMessage({
              type: "MERGE_RESPONSE",
              success: true,
              requestId: request.requestId,
            });
          })
          .catch((error) => {
            console.error("❌ Error during merge process:", error);
            console.log("❌ Sending error response via message");
            chrome.runtime.sendMessage({
              type: "MERGE_RESPONSE",
              success: false,
              requestId: request.requestId,
              error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
              },
            });
          });

        // Return true to indicate we will respond asynchronously
        return true;
      } else if (request.type === "MERGE_SEGMENTS") {
        // Always use the optimized streaming merge approach for HLS with direct MP4 output
        mergeSegmentsStream(request).catch((error) => {
          console.error("❌ Error during segments merge:", error);
          chrome.runtime.sendMessage({
            type: "MERGE_SEGMENTS_RESPONSE",
            success: false,
            requestId: request.requestId,
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
          });
        });

        // Return true to indicate we will respond asynchronously
        return true;
      } else if (request.type === "MERGE_SEPARATE_AV") {
        // Handle separate audio/video merge with optimizations and direct MP4 output
        mergeSeparateAVSegments(request).catch((error) => {
          console.error("❌ Error during separate A/V merge:", error);
          chrome.runtime.sendMessage({
            type: "MERGE_SEPARATE_AV_RESPONSE",
            success: false,
            requestId: request.requestId,
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
          });
        });

        // Return true to indicate we will respond asynchronously
        return true;
      } else if (request.type === "PING") {
        // Respond to pings for testing connectivity
        console.log("Received PING, sending PONG");
        sendResponse({
          type: "PONG",
          testId: request.testId,
        });
        // Return true for async response
        return true;
      }

      // For other message types, don't keep the channel open
      return false;
    });

    // Load ffmpeg immediately and then signal readiness
    loadFFmpeg()
      .then(() => {
        console.log("✅ Offscreen document is ready. Sending ready signal.");
        chrome.runtime.sendMessage({
          type: "OFFSCREEN_DOCUMENT_READY",
        });
      })
      .catch((error) => {
        console.error(
          "❌ Offscreen script failed to initialize ffmpeg:",
          error
        );
        chrome.runtime.sendMessage({
          type: "OFFSCREEN_ERROR",
          error: { message: error.message, stack: error.stack },
        });
      });
  } catch (error) {
    // Catch errors during initial script load (e.g., import failure)
    console.error("❌ Offscreen script failed to initialize:", error);
    chrome.runtime.sendMessage({
      type: "OFFSCREEN_ERROR",
      error: { message: error.message, stack: error.stack },
    });
  }
}

// Initialize the offscreen document
initializeOffscreen();
