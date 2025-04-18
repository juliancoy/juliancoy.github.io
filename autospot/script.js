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

// Add variable to track controls visibility
let controlsVisible = true;

// Function to toggle controls visibility
function toggleControls() {
    controlsVisible = !controlsVisible;
    const buttons = document.querySelectorAll('button');
    const controlsContainer = document.getElementById('controls-container');
    const instructionsElement = document.getElementById('instructions');
    const sliderControls = document.querySelector('.slider-controls');
    const controls = document.querySelector('.controls');
    
    // Hide all control elements
    buttons.forEach(button => {
        button.style.display = controlsVisible ? 'block' : 'none';
    });
    
    if (controlsContainer) {
        controlsContainer.style.display = controlsVisible ? 'block' : 'none';
    }

    if (sliderControls) {
        sliderControls.style.display = controlsVisible ? 'block' : 'none';
    }

    if (controls) {
        controls.style.display = controlsVisible ? 'block' : 'none';
    }

    // Make sure instructions are properly hidden/shown
    if (instructionsElement) {
        instructionsElement.style.opacity = controlsVisible ? '1' : '0';
        instructionsElement.style.visibility = controlsVisible ? 'visible' : 'hidden';
        instructionsElement.style.display = controlsVisible ? 'block' : 'none';
        instructionsElement.textContent = controlsVisible ? 'Press C to hide controls' : 'Press C to show controls';
    }
    
    updateStatus(`Controls ${controlsVisible ? 'shown' : 'hidden'}`);
}

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
    } else if (event.key === 'm') {
        // Toggle mask with 'm' key
        showMaskOnly = !showMaskOnly;
        updateStatus(`Mask view: ${showMaskOnly ? 'ON' : 'OFF'}`);
    } else if (event.key === 'c') {
        toggleControls();
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
        
        // Add controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'controls-container';
        controlsContainer.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px;';
        
        // Add blur slider
        const blurControl = document.createElement('div');
        blurControl.innerHTML = `
            <label for="blurSlider" style="color: white; margin-right: 10px;">Blur: </label>
            <input type="range" id="blurSlider" min="3" max="30" value="${blurAmount}" step="1" style="width: 150px;">
            <span id="blurValue" style="color: white; margin-left: 10px;">${blurAmount}px</span>
        `;
        
        // Add threshold slider
        const thresholdControl = document.createElement('div');
        thresholdControl.innerHTML = `
            <label for="thresholdSlider" style="color: white; margin-right: 10px;">Threshold: </label>
            <input type="range" id="thresholdSlider" min="0.01" max="0.99" value="${segmentationThreshold}" step="0.01" style="width: 150px;">
            <span id="thresholdValue" style="color: white; margin-left: 10px;">${segmentationThreshold.toFixed(2)}</span>
        `;
        
        controlsContainer.appendChild(blurControl);
        controlsContainer.appendChild(thresholdControl);
        container.appendChild(controlsContainer);
        
        // Add instructions element (moved inside container creation)
        const instructions = document.createElement('div');
        instructions.id = 'instructions';
        instructions.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-family: Arial, sans-serif;
            z-index: 1000;
        `;
        instructions.textContent = 'Press C to hide controls';
        container.appendChild(instructions); // Add to container instead of document.body
        
        // Add remaining elements
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
    
    // Add slider event listeners
    const blurSlider = document.getElementById('blurSlider');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const blurValue = document.getElementById('blurValue');
    const thresholdValue = document.getElementById('thresholdValue');
    
    blurSlider.addEventListener('input', (e) => {
        blurAmount = parseInt(e.target.value);
        blurValue.textContent = `${blurAmount}px`;
        updateStatus(`Blur intensity: ${blurAmount}px`);
    });
    
    thresholdSlider.addEventListener('input', (e) => {
        segmentationThreshold = parseFloat(e.target.value);
        thresholdValue.textContent = segmentationThreshold.toFixed(2);
        updateStatus(`Segmentation Threshold: ${segmentationThreshold.toFixed(2)}`);
    });
    
    // Start initialization
    setTimeout(init, 500);
});