"use strict";
// Audio Spectrogram Processing System
// This extends the existing code to perform a spectrogram analysis across a full audio file
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// WebGPU constants
var GPUBufferUsage = {
    STORAGE: 0x0080,
    COPY_DST: 0x0008,
    COPY_SRC: 0x0004,
    UNIFORM: 0x0040,
};
var GPUShaderStage = {
    COMPUTE: 0x0004,
    FRAGMENT: 0x0002,
    VERTEX: 0x0001,
};
// Constants for the system
var SIGNAL_LENGTH = 32768; // FFT window size (power of 2 for efficiency)
var NUM_FREQUENCIES = 256; // Number of frequency bins to analyze
var THREADS_PER_WORKGROUP = 128;
// Global variables for shader code and buffers
// These are initialized in processAudioFile and used in runComputeShaders and renderSpectrogram
var frequencyBuffer = null;
var settingsBuffer = null;
var offsetBuffer = null;
var colorMapBuffer = null;
var minValueBuffer = null;
var maxValueBuffer = null;
// Initialize canvas and WebGPU context
var canvas = document.getElementById('spectrogram');
if (!canvas) {
    throw new Error('Canvas element not found');
}
var context = canvas.getContext('webgpu');
if (!context) {
    throw new Error('Failed to get WebGPU context. Please ensure: \n1. WebGPU is enabled in chrome://flags\n2. The canvas element exists\n3. The browser supports WebGPU');
}
// Initialize WebGPU adapter and device
function initWebGPU() {
    return __awaiter(this, void 0, void 0, function () {
        var adapter, device;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ((_a = navigator.gpu) === null || _a === void 0 ? void 0 : _a.requestAdapter())];
                case 1:
                    adapter = (_b.sent()) || null;
                    if (!adapter) {
                        throw new Error('WebGPU adapter not found');
                    }
                    return [4 /*yield*/, adapter.requestDevice()];
                case 2:
                    device = _b.sent();
                    return [2 /*return*/, device];
            }
        });
    });
}
// UI elements
var ctx = canvas.getContext('2d');
var statusElement = document.getElementById('status');
var webgpuWarning = document.getElementById('webgpu_warning');
var dropZone = document.getElementById('drop_zone');
// Check for WebGPU support
if (!navigator.gpu) {
    if (webgpuWarning) {
        webgpuWarning.style.display = 'block';
    }
}
else {
    // Automatically start processing DjembeBass.wav on page load
    loadAndProcessAudio();
}
// Update status message
function updateStatus(message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
    else {
        console.log("Status: ".concat(message));
    }
}
// Load shader code from file
function loadShaderCode(shaderPath) {
    return __awaiter(this, void 0, void 0, function () {
        var response, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch(shaderPath)];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Failed to load shader: ".concat(response.statusText));
                    }
                    return [4 /*yield*/, response.text()];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    error_1 = _a.sent();
                    console.error('Error loading shader:', error_1);
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Process audio from the default file
function loadAndProcessAudio() {
    return __awaiter(this, void 0, void 0, function () {
        var shaderCode, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    updateStatus('Loading default audio file...');
                    return [4 /*yield*/, loadShaderCode('shader.wgsl')];
                case 1:
                    shaderCode = _a.sent();
                    return [4 /*yield*/, processAudioFile('DjembeBass.wav', shaderCode)];
                case 2:
                    _a.sent();
                    updateStatus('Default audio processed successfully');
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    console.error('Error processing default audio:', error_2);
                    updateStatus("Error: ".concat(error_2.message));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Process audio from a user-provided file
function processAudioFromFile(file, shaderCode) {
    return __awaiter(this, void 0, void 0, function () {
        var url, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    url = URL.createObjectURL(file);
                    return [4 /*yield*/, processAudioFile(url, shaderCode)];
                case 1:
                    _a.sent();
                    URL.revokeObjectURL(url);
                    updateStatus("".concat(file.name, " processed successfully"));
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    console.error('Error processing audio file:', error_3);
                    updateStatus("Error: ".concat(error_3.message));
                    throw error_3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Main audio processing function
function processAudioFile(url, shaderCode) {
    return __awaiter(this, void 0, void 0, function () {
        var device, shaderModule, generateMagShaderCode, reduceToSpectrogramShaderCode, renderShaderCode, freqArray, i, colorArray, i, t, signalGPUBuffer, generateMagShader, reduceToSpectrogramShader, renderShader, spectrogramBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, initWebGPU()];
                case 1:
                    device = _a.sent();
                    shaderModule = device.createShaderModule({
                        code: shaderCode
                    });
                    generateMagShaderCode = shaderCode;
                    reduceToSpectrogramShaderCode = shaderCode;
                    renderShaderCode = shaderCode;
                    // Create buffers for settings and offsets
                    settingsBuffer = device.createBuffer({
                        size: 4, // Single u32 value
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                        mappedAtCreation: true
                    });
                    new Uint32Array(settingsBuffer.getMappedRange())[0] = 40; // FREQ_PRECISION_MULTIPLE
                    settingsBuffer.unmap();
                    offsetBuffer = device.createBuffer({
                        size: 4, // Single u32 value
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                        mappedAtCreation: true
                    });
                    new Uint32Array(offsetBuffer.getMappedRange())[0] = 0; // Initial offset
                    offsetBuffer.unmap();
                    // Create frequency buffer
                    frequencyBuffer = device.createBuffer({
                        size: NUM_FREQUENCIES * Float32Array.BYTES_PER_ELEMENT,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                        mappedAtCreation: true
                    });
                    freqArray = new Float32Array(frequencyBuffer.getMappedRange());
                    for (i = 0; i < NUM_FREQUENCIES; i++) {
                        // Logarithmic frequency spacing from 20Hz to 20kHz
                        freqArray[i] = 20 * Math.pow(1000, i / (NUM_FREQUENCIES - 1));
                    }
                    frequencyBuffer.unmap();
                    // Create color map buffer
                    colorMapBuffer = device.createBuffer({
                        size: 256 * 4 * Float32Array.BYTES_PER_ELEMENT, // 256 RGBA colors
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                        mappedAtCreation: true
                    });
                    colorArray = new Float32Array(colorMapBuffer.getMappedRange());
                    for (i = 0; i < 256; i++) {
                        t = i / 255;
                        // Simple viridis-like color map
                        colorArray[i * 4 + 0] = Math.max(0, Math.min(1, 0.8 - 1.8 * t + 1.2 * t * t)); // R
                        colorArray[i * 4 + 1] = Math.max(0, Math.min(1, t < 0.5 ? 2 * t : 2 - 2 * t)); // G
                        colorArray[i * 4 + 2] = Math.max(0, Math.min(1, t * 0.8 + 0.2)); // B
                        colorArray[i * 4 + 3] = 1.0; // A
                    }
                    colorMapBuffer.unmap();
                    // Create min/max value buffers for normalization
                    minValueBuffer = device.createBuffer({
                        size: Float32Array.BYTES_PER_ELEMENT,
                        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        mappedAtCreation: true
                    });
                    new Float32Array(minValueBuffer.getMappedRange())[0] = -60; // -60 dB
                    minValueBuffer.unmap();
                    maxValueBuffer = device.createBuffer({
                        size: Float32Array.BYTES_PER_ELEMENT,
                        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        mappedAtCreation: true
                    });
                    new Float32Array(maxValueBuffer.getMappedRange())[0] = 0; // 0 dB
                    maxValueBuffer.unmap();
                    return [4 /*yield*/, loadAudioBuffer(url, device)];
                case 2:
                    signalGPUBuffer = _a.sent();
                    return [4 /*yield*/, createShaderModule(device, generateMagShaderCode)];
                case 3:
                    generateMagShader = _a.sent();
                    return [4 /*yield*/, createShaderModule(device, reduceToSpectrogramShaderCode)];
                case 4:
                    reduceToSpectrogramShader = _a.sent();
                    return [4 /*yield*/, createShaderModule(device, renderShaderCode)];
                case 5:
                    renderShader = _a.sent();
                    return [4 /*yield*/, runComputeShaders(device, signalGPUBuffer, generateMagShader, reduceToSpectrogramShader)];
                case 6:
                    spectrogramBuffer = _a.sent();
                    if (!context) return [3 /*break*/, 8];
                    return [4 /*yield*/, renderSpectrogram(device, context, navigator.gpu.getPreferredCanvasFormat(), spectrogramBuffer, renderShader)];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8: return [2 /*return*/];
            }
        });
    });
}
// Handle file drop events
if (dropZone) {
    dropZone.ondragover = function (event) {
        event.preventDefault();
        dropZone.style.borderColor = '#8BC34A';
        dropZone.style.backgroundColor = '#2a2a2a';
    };
    dropZone.ondragleave = function () {
        dropZone.style.borderColor = '#4CAF50';
        dropZone.style.backgroundColor = '#1e1e1e';
    };
    dropZone.ondrop = function (event) { return __awaiter(void 0, void 0, void 0, function () {
        var file, shaderCode, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    event.preventDefault();
                    dropZone.style.borderColor = '#4CAF50';
                    dropZone.style.backgroundColor = '#1e1e1e';
                    file = (_a = event.dataTransfer) === null || _a === void 0 ? void 0 : _a.files[0];
                    if (!(file && file.type.startsWith('audio/'))) return [3 /*break*/, 6];
                    updateStatus("Processing ".concat(file.name, "..."));
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, loadShaderCode('shader.wgsl')];
                case 2:
                    shaderCode = _b.sent();
                    return [4 /*yield*/, processAudioFromFile(file, shaderCode)];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_4 = _b.sent();
                    console.error('Error processing audio file:', error_4);
                    updateStatus("Error: ".concat(error_4.message));
                    return [3 /*break*/, 5];
                case 5: return [3 /*break*/, 7];
                case 6:
                    updateStatus('Error: Please drop a valid audio file.');
                    _b.label = 7;
                case 7: return [2 /*return*/];
            }
        });
    }); };
    // Also allow clicking on the drop zone to select a file
    dropZone.onclick = function () {
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.onchange = function (event) { return __awaiter(void 0, void 0, void 0, function () {
            var file, shaderCode, error_5;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        file = (_b = (_a = event.target) === null || _a === void 0 ? void 0 : _a.files) === null || _b === void 0 ? void 0 : _b[0];
                        if (!file) return [3 /*break*/, 5];
                        updateStatus("Processing ".concat(file.name, "..."));
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, loadShaderCode('shader.wgsl')];
                    case 2:
                        shaderCode = _c.sent();
                        return [4 /*yield*/, processAudioFromFile(file, shaderCode)];
                    case 3:
                        _c.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_5 = _c.sent();
                        console.error('Error processing audio file:', error_5);
                        updateStatus("Error: ".concat(error_5.message));
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        fileInput.click();
    };
}
// Handle high DPI displays
var devicePixelRatio = window.devicePixelRatio || 1;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;
// Configure WebGPU context
var presentationFormat = navigator.gpu.getPreferredCanvasFormat();
if (context) {
    (function () { return __awaiter(void 0, void 0, void 0, function () {
        var device;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, initWebGPU()];
                case 1:
                    device = _a.sent();
                    context.configure({
                        device: device,
                        format: presentationFormat,
                    });
                    return [2 /*return*/];
            }
        });
    }); })();
}
// Load audio buffer from URL
function loadAudioBuffer(url, device) {
    return __awaiter(this, void 0, void 0, function () {
        var response, arrayBuffer, audioContext, audioBuffer, monoData, leftChannel, rightChannel, i, signalBuffer, samplesToCopy, signalGPUBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(url)];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.arrayBuffer()];
                case 2:
                    arrayBuffer = _a.sent();
                    audioContext = new AudioContext();
                    return [4 /*yield*/, audioContext.decodeAudioData(arrayBuffer)];
                case 3:
                    audioBuffer = _a.sent();
                    if (audioBuffer.numberOfChannels === 2) {
                        leftChannel = audioBuffer.getChannelData(0);
                        rightChannel = audioBuffer.getChannelData(1);
                        monoData = new Float32Array(leftChannel.length);
                        for (i = 0; i < leftChannel.length; i++) {
                            monoData[i] = (leftChannel[i] + rightChannel[i]) / 2;
                        }
                    }
                    else {
                        monoData = audioBuffer.getChannelData(0);
                    }
                    signalBuffer = new Float32Array(SIGNAL_LENGTH);
                    samplesToCopy = Math.min(monoData.length, SIGNAL_LENGTH);
                    signalBuffer.set(monoData.subarray(0, samplesToCopy));
                    signalGPUBuffer = device.createBuffer({
                        size: signalBuffer.byteLength,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    });
                    device.queue.writeBuffer(signalGPUBuffer, 0, signalBuffer);
                    return [2 /*return*/, signalGPUBuffer];
            }
        });
    });
}
// Create shader module
function createShaderModule(device, code) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, device.createShaderModule({
                    code: code,
                })];
        });
    });
}
// Run compute shaders
function runComputeShaders(device, signalGPUBuffer, generateMagShader, reduceToSpectrogramShader) {
    return __awaiter(this, void 0, void 0, function () {
        var magnitudeBuffer, spectrogramBuffer, generateMagBindGroupLayout, generateMagPipeline, generateMagBindGroup, reduceToSpectrogramBindGroupLayout, reduceToSpectrogramPipeline, reduceToSpectrogramBindGroup, commandEncoder, generateMagPass, reduceToSpectrogramPass, commandBuffer;
        return __generator(this, function (_a) {
            if (!frequencyBuffer || !settingsBuffer || !offsetBuffer) {
                throw new Error('Required buffers not initialized');
            }
            magnitudeBuffer = device.createBuffer({
                size: NUM_FREQUENCIES * SIGNAL_LENGTH * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            spectrogramBuffer = device.createBuffer({
                size: NUM_FREQUENCIES * SIGNAL_LENGTH * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            generateMagBindGroupLayout = device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                ],
            });
            generateMagPipeline = device.createComputePipeline({
                layout: device.createPipelineLayout({
                    bindGroupLayouts: [generateMagBindGroupLayout],
                }),
                compute: {
                    module: generateMagShader,
                    entryPoint: 'generate_mag',
                },
            });
            generateMagBindGroup = device.createBindGroup({
                layout: generateMagBindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: signalGPUBuffer } },
                    { binding: 2, resource: { buffer: magnitudeBuffer } },
                    { binding: 3, resource: { buffer: frequencyBuffer } },
                    { binding: 4, resource: { buffer: settingsBuffer } },
                ],
            });
            reduceToSpectrogramBindGroupLayout = device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                ],
            });
            reduceToSpectrogramPipeline = device.createComputePipeline({
                layout: device.createPipelineLayout({
                    bindGroupLayouts: [reduceToSpectrogramBindGroupLayout],
                }),
                compute: {
                    module: reduceToSpectrogramShader,
                    entryPoint: 'reduce_to_spectrogram',
                },
            });
            reduceToSpectrogramBindGroup = device.createBindGroup({
                layout: reduceToSpectrogramBindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: magnitudeBuffer } },
                    { binding: 1, resource: { buffer: settingsBuffer } },
                    { binding: 2, resource: { buffer: offsetBuffer } },
                    { binding: 3, resource: { buffer: spectrogramBuffer } },
                ],
            });
            commandEncoder = device.createCommandEncoder();
            generateMagPass = commandEncoder.beginComputePass();
            generateMagPass.setPipeline(generateMagPipeline);
            generateMagPass.setBindGroup(0, generateMagBindGroup);
            generateMagPass.dispatchWorkgroups(Math.ceil(SIGNAL_LENGTH / 128), NUM_FREQUENCIES);
            generateMagPass.end();
            reduceToSpectrogramPass = commandEncoder.beginComputePass();
            reduceToSpectrogramPass.setPipeline(reduceToSpectrogramPipeline);
            reduceToSpectrogramPass.setBindGroup(0, reduceToSpectrogramBindGroup);
            reduceToSpectrogramPass.dispatchWorkgroups(NUM_FREQUENCIES);
            reduceToSpectrogramPass.end();
            commandBuffer = commandEncoder.finish();
            device.queue.submit([commandBuffer]);
            return [2 /*return*/, spectrogramBuffer];
        });
    });
}
// Render spectrogram
function renderSpectrogram(device, context, format, spectrogramBuffer, renderShader) {
    return __awaiter(this, void 0, void 0, function () {
        var vertexShaderCode, vertexShaderModule, renderPipeline, renderBindGroup, renderPassDescriptor, commandEncoder, renderPass, commandBuffer;
        return __generator(this, function (_a) {
            if (!colorMapBuffer || !minValueBuffer || !maxValueBuffer) {
                throw new Error('Required buffers not initialized');
            }
            vertexShaderCode = "\n        @vertex\n        fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {\n            var pos = array<vec2<f32>, 6>(\n                vec2<f32>(-1.0, -1.0),\n                vec2<f32>(1.0, -1.0),\n                vec2<f32>(-1.0, 1.0),\n                vec2<f32>(-1.0, 1.0),\n                vec2<f32>(1.0, -1.0),\n                vec2<f32>(1.0, 1.0)\n            );\n            return vec4<f32>(pos[vertexIndex], 0.0, 1.0);\n        }\n    ";
            vertexShaderModule = device.createShaderModule({
                code: vertexShaderCode
            });
            renderPipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: vertexShaderModule,
                    entryPoint: 'vertexMain',
                },
                fragment: {
                    module: renderShader,
                    entryPoint: 'render_spectrogram',
                    targets: [{ format: format }],
                },
            });
            renderBindGroup = device.createBindGroup({
                layout: renderPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: spectrogramBuffer } },
                    { binding: 1, resource: { buffer: colorMapBuffer } },
                    { binding: 2, resource: { buffer: minValueBuffer } },
                    { binding: 3, resource: { buffer: maxValueBuffer } },
                ],
            });
            renderPassDescriptor = {
                colorAttachments: [
                    {
                        view: context.getCurrentTexture().createView(),
                        loadOp: 'clear',
                        storeOp: 'store',
                        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    },
                ],
            };
            commandEncoder = device.createCommandEncoder();
            renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
            renderPass.setPipeline(renderPipeline);
            renderPass.setBindGroup(0, renderBindGroup);
            renderPass.draw(6); // Draw a full-screen quad
            renderPass.end();
            commandBuffer = commandEncoder.finish();
            device.queue.submit([commandBuffer]);
            return [2 /*return*/];
        });
    });
}
