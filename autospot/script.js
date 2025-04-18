// DOM Elements
const videoElement = document.getElementById('videoElement');
const outputCanvas = document.getElementById('outputCanvas');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const container = document.getElementById('container');
const statusElement = document.getElementById('status');
const loadingElement = document.getElementById('loading');

// Configuration variables
let flipHorizontal = true;
let blurAmount = 23;
let segmentationThreshold = 0.6;
let debugMode = false;
let opacity = 0.7;
let model = null;
let isRunning = false;
let showMaskOnly = true; // New flag to track mask view mode

// Add event listeners
fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen();
    }
});

document.getElementById('flipBtn').addEventListener('click', () => {
    flipHorizontal = !flipHorizontal;
    updateStatus(`Camera ${flipHorizontal ? 'flipped' : 'unflipped'}`);
});

document.getElementById('blurBtn').addEventListener('click', () => {
    blurAmount = (blurAmount >= 30) ? 3 : blurAmount + 5;
    updateStatus(`Blur intensity: ${blurAmount}px`);
});

document.getElementById('thresholdBtn').addEventListener('click', () => {
    segmentationThreshold = (segmentationThreshold >= 0.9) ? 0.1 : segmentationThreshold + 0.1;
    updateStatus(`Segmentation Threshold: ${segmentationThreshold.toFixed(1)} (Higher = more aggressive segmentation)`);
});

// Add mask button functionality
document.getElementById('maskBtn').addEventListener('click', () => {
    showMaskOnly = !showMaskOnly;
    updateStatus(`Mask view: ${showMaskOnly ? 'ON' : 'OFF'}`);
});

document.getElementById('debugBtn').addEventListener('click', () => {
    const debugInfo = document.getElementById('debugInfo');
    debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
    videoElement.style.opacity = debugInfo.style.display === 'none' ? 0.1 : 0.5;
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'f') {
        flipHorizontal = !flipHorizontal;
        updateStatus(`Camera ${flipHorizontal ? 'flipped' : 'unflipped'}`);
    } else if (event.key === 'b') {
        blurAmount = (blurAmount >= 30) ? 3 : blurAmount + 6;
        updateStatus(`Blur intensity: ${blurAmount}px`);
    } else if (event.key === 'm') {
        // Toggle mask with 'm' key
        showMaskOnly = !showMaskOnly;
        updateStatus(`Mask view: ${showMaskOnly ? 'ON' : 'OFF'}`);
    }
});

// Helper function for status updates
function updateStatus(message, duration = 3000) {
    console.log(message);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.opacity = 1;
        setTimeout(() => {
            statusElement.style.opacity = 0;
        }, duration);
    }
}

// Helper function for debug logging
function debugLog(message) {
    console.log(message);
    const debugInfo = document.getElementById('debugInfo');
    if (debugInfo) {
        const time = new Date().toLocaleTimeString();
        debugInfo.innerHTML += `<div>[${time}] ${message}</div>`;
        // Keep only last 10 messages
        if (debugInfo.children.length > 10) {
            debugInfo.removeChild(debugInfo.children[0]);
        }
        // Auto-scroll
        debugInfo.scrollTop = debugInfo.scrollHeight;
    }
}

// Camera setup
async function setupCamera() {
    try {
        updateStatus('Starting camera...');
        
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            debugLog(`Camera stream obtained with tracks: ${stream.getVideoTracks().length}`);
            
            videoElement.srcObject = stream;
            
            return new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    debugLog(`Video dimensions: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
                    updateStatus('Camera ready!');
                    resolve(videoElement);
                };
            });
        } else {
            throw new Error("getUserMedia() is not supported by your browser");
        }
    } catch (error) {
        updateStatus(`Camera error: ${error.message}`, 10000);
        debugLog(`Camera setup failed: ${error.message}`);
        return null;
    }
}

// Load BodyPix model
async function loadBodyPixModel() {
    try {
        updateStatus('Loading BodyPix model...');
        
        // Check if bodyPix is available
        if (!window.bodyPix) {
            throw new Error("BodyPix library not available");
        }
        
        model = await bodyPix.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            multiplier: 0.75,
            quantBytes: 2
        });
        
        debugLog("BodyPix model loaded successfully");
        updateStatus('BodyPix model loaded!');
        return model;
    } catch (error) {
        updateStatus(`Model loading error: ${error.message}`, 10000);
        debugLog(`BodyPix loading failed: ${error.message}`);
        return null;
    }
}

// Draw a frame without segmentation (fallback)
function drawVideoFrame() {
    if (!isRunning) return;
    
    // Make sure the canvas dimensions match the video
    if (outputCanvas.width !== videoElement.videoWidth || 
        outputCanvas.height !== videoElement.videoHeight) {
        outputCanvas.width = videoElement.videoWidth;
        outputCanvas.height = videoElement.videoHeight;
        debugLog(`Canvas resized to ${outputCanvas.width}x${outputCanvas.height}`);
    }
    
    const ctx = outputCanvas.getContext('2d');
    
    // Flip horizontally if needed
    if (flipHorizontal) {
        ctx.translate(outputCanvas.width, 0);
        ctx.scale(-1, 1);
    }
    
    // Draw the video frame
    ctx.drawImage(videoElement, 0, 0, outputCanvas.width, outputCanvas.height);
    
    // Reset transformation
    if (flipHorizontal) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    requestAnimationFrame(drawVideoFrame);
}

// Draw mask as white silhouette on black background with blur
function drawMaskOnly(segmentation) {
    // Create a mask from the segmentation
    const mask = bodyPix.toMask(
        segmentation,
        { r: 255, g: 255, b: 255, a: 255 },  // Foreground as white
        { r: 0, g: 0, b: 0, a: 255 }         // Background as black
    );
    
    const ctx = outputCanvas.getContext('2d');
    
    // Clear previous content
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    
    // Create a temporary canvas to hold the mask at its original size
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mask.width;
    tempCanvas.height = mask.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Put the mask data on the temporary canvas
    tempCtx.putImageData(mask, 0, 0);
    
    // Now draw the temporary canvas onto our output canvas, properly scaled
    // Apply blur directly to the main canvas
    ctx.filter = `blur(${blurAmount}px)`;
    
    if (flipHorizontal) {
        ctx.translate(outputCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(tempCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
        ctx.drawImage(tempCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
    }
    
    // Reset filter
    ctx.filter = 'none';
}

// Process video frames with BodyPix
async function segmentFrame() {
    if (!isRunning || !model) {
        debugLog("Not running segmentation (stopped or no model)");
        return;
    }
    
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
        debugLog("Video dimensions not available yet");
        requestAnimationFrame(segmentFrame);
        return;
    }
    
    try {
        // Make sure the canvas dimensions match the video
        if (outputCanvas.width !== videoElement.videoWidth || 
            outputCanvas.height !== videoElement.videoHeight) {
            outputCanvas.width = videoElement.videoWidth;
            outputCanvas.height = videoElement.videoHeight;
            debugLog(`Canvas resized to ${outputCanvas.width}x${outputCanvas.height}`);
        }
        
        // Perform segmentation
        const segmentation = await model.segmentPerson(videoElement, {
            internalResolution: 'medium',
            segmentationThreshold: segmentationThreshold,
            maxDetections: 1
        });
        
        if (!segmentation) {
            debugLog("No segmentation result");
            requestAnimationFrame(segmentFrame);
            return;
        }
        
        // Check which rendering mode to use
        if (showMaskOnly) {
            // Draw the mask as white silhouette on black background
            drawMaskOnly(segmentation);
        } else {
            // Use the standard blur effect
            const mask = bodyPix.toMask(segmentation);
            
            bodyPix.drawMask(
                outputCanvas,
                videoElement,
                mask,
                opacity,
                blurAmount,
                flipHorizontal
            );
        }
        
        requestAnimationFrame(segmentFrame);
    } catch (error) {
        console.error('Segmentation error:', error);
        debugLog(`Segmentation error: ${error.message}`);
        
        // Fallback to drawing video directly
        drawVideoFrame();
        
        // Try again after a delay
        setTimeout(() => {
            if (isRunning) requestAnimationFrame(segmentFrame);
        }, 1000);
    }
}

// Main initialization function
async function init() {
    try {
        debugLog("Starting initialization");
        
        // Step 1: Setup camera
        const cameraReady = await setupCamera();
        if (!cameraReady) {
            throw new Error("Failed to initialize camera");
        }
        
        // Step 2: Draw video feed directly first to ensure something displays
        outputCanvas.width = videoElement.videoWidth;
        outputCanvas.height = videoElement.videoHeight;
        drawVideoFrame();
        
        // Step 3: Load BodyPix model
        const loadedModel = await loadBodyPixModel();
        if (!loadedModel) {
            debugLog("Continuing with raw video feed, no BodyPix model available");
        }
        
        // Step 4: Hide loading element
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        // Step 5: Start segmentation or continue with video feed
        isRunning = true;
        if (loadedModel) {
            // Stop drawing raw video and start segmentation
            segmentFrame();
        }
        
        updateStatus('Everything is ready!', 2000);
        
    } catch (error) {
        console.error('Initialization failed:', error);
        debugLog(`Initialization error: ${error.message}`);
        updateStatus(`Initialization error: ${error.message}`, 10000);
        
        if (loadingElement) {
            loadingElement.innerHTML = `
                <div>Error: ${error.message}</div>
                <button onclick="location.reload()">Retry</button>
            `;
        }
    }
}

// Handle page visibility changes to conserve resources
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        isRunning = false;
        debugLog("Page hidden, pausing processing");
    } else {
        isRunning = true;
        debugLog("Page visible, resuming processing");
        if (model) {
            segmentFrame();
        } else {
            drawVideoFrame();
        }
    }
});

// Start the application when the page is fully loaded
window.addEventListener('DOMContentLoaded', () => {
    // Check if we need to add HTML elements that might be missing
    if (!document.getElementById('container')) {
        const container = document.createElement('div');
        container.id = 'container';
        document.body.appendChild(container);
        
        // Move existing elements to container
        if (videoElement) container.appendChild(videoElement);
        if (outputCanvas) container.appendChild(outputCanvas);
        if (fullscreenBtn) container.appendChild(fullscreenBtn);
        
        // Add missing elements
        if (!document.getElementById('status')) {
            const status = document.createElement('div');
            status.id = 'status';
            status.className = 'status';
            status.textContent = 'Initializing...';
            container.appendChild(status);
        }
        
        if (!document.getElementById('loading')) {
            const loading = document.createElement('div');
            loading.id = 'loading';
            loading.className = 'loading';
            loading.innerHTML = '<div class="spinner"></div><div>Loading resources...</div>';
            container.appendChild(loading);
        }
    }
    
    // Start initialization
    setTimeout(init, 500);
});