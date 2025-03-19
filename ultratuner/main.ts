// Audio Spectrogram Processing System
// This extends the existing code to perform a spectrogram analysis across a full audio file

// Make this file a module to allow top-level await
export {};

// WebGPU type declarations
declare global {
    interface Navigator {
        gpu: {
            requestAdapter(): Promise<GPUAdapter | null>;
            getPreferredCanvasFormat(): GPUTextureFormat;
        };
    }

    interface GPUAdapter {
        requestDevice(): Promise<GPUDevice>;
    }

    interface GPUDevice {
        createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
        createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
        createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
        createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
        createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
        createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
        createCommandEncoder(): GPUCommandEncoder;
        createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
        queue: GPUQueue;
    }

    interface GPUQueue {
        writeBuffer(buffer: GPUBuffer, offset: number, data: BufferSource): void;
        submit(commandBuffers: GPUCommandBuffer[]): void;
    }

    interface GPUBuffer {
        getMappedRange(): ArrayBuffer;
        unmap(): void;
    }

    interface GPUShaderModule {}
    interface GPUBindGroupLayout {}
    interface GPUPipelineLayout {}
    interface GPUComputePipeline {}
    interface GPURenderPipeline {
        getBindGroupLayout(index: number): GPUBindGroupLayout;
    }
    interface GPUBindGroup {}
    interface GPUCommandEncoder {
        beginComputePass(): GPUComputePassEncoder;
        beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
        finish(): GPUCommandBuffer;
    }
    interface GPUComputePassEncoder {
        setPipeline(pipeline: GPUComputePipeline): void;
        setBindGroup(index: number, bindGroup: GPUBindGroup): void;
        dispatchWorkgroups(x: number, y?: number, z?: number): void;
        end(): void;
    }
    interface GPURenderPassEncoder {
        setPipeline(pipeline: GPURenderPipeline): void;
        setBindGroup(index: number, bindGroup: GPUBindGroup): void;
        draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
        end(): void;
    }
    interface GPUCommandBuffer {}

    interface GPUCanvasContext {
        configure(configuration: GPUCanvasConfiguration): void;
        getCurrentTexture(): GPUTexture;
    }

    interface GPUTexture {
        createView(): GPUTextureView;
    }

    interface GPUTextureView {}

    interface GPUBufferDescriptor {
        size: number;
        usage: number;
        mappedAtCreation?: boolean;
    }

    interface GPUShaderModuleDescriptor {
        code: string;
    }

    interface GPUBindGroupLayoutDescriptor {
        entries: GPUBindGroupLayoutEntry[];
    }

    interface GPUBindGroupLayoutEntry {
        binding: number;
        visibility: number;
        buffer?: {
            type: string;
        };
    }

    interface GPUPipelineLayoutDescriptor {
        bindGroupLayouts: GPUBindGroupLayout[];
    }

    interface GPUComputePipelineDescriptor {
        layout: GPUPipelineLayout | 'auto';
        compute: {
            module: GPUShaderModule;
            entryPoint: string;
        };
    }

    interface GPURenderPipelineDescriptor {
        layout: GPUPipelineLayout | 'auto';
        vertex: {
            module: GPUShaderModule;
            entryPoint: string;
        };
        fragment: {
            module: GPUShaderModule;
            entryPoint: string;
            targets: { format: GPUTextureFormat }[];
        };
    }

    interface GPUBindGroupDescriptor {
        layout: GPUBindGroupLayout;
        entries: {
            binding: number;
            resource: { buffer: GPUBuffer } | { sampler: GPUSampler } | { textureView: GPUTextureView };
        }[];
    }

    interface GPURenderPassDescriptor {
        colorAttachments: {
            view: GPUTextureView;
            loadOp: 'load' | 'clear';
            storeOp: 'store' | 'discard';
            clearValue?: { r: number; g: number; b: number; a: number };
        }[];
    }

    interface GPUCanvasConfiguration {
        device: GPUDevice;
        format: GPUTextureFormat;
        alphaMode?: 'opaque' | 'premultiplied';
    }

    interface GPUSampler {}

    type GPUTextureFormat = string;
    type GPUBufferUsage = number;
    type GPUShaderStage = number;
}

// WebGPU constants
const GPUBufferUsage = {
    STORAGE: 0x0080,
    COPY_DST: 0x0008,
    COPY_SRC: 0x0004,
    UNIFORM: 0x0040,
};

const GPUShaderStage = {
    COMPUTE: 0x0004,
    FRAGMENT: 0x0002,
    VERTEX: 0x0001,
};

// Constants for the system
const SIGNAL_LENGTH: number = 32768; // FFT window size (power of 2 for efficiency)
const NUM_FREQUENCIES: number = 256;  // Number of frequency bins to analyze
const THREADS_PER_WORKGROUP: number = 128;

// Global variables for shader code and buffers
// These are initialized in processAudioFile and used in runComputeShaders and renderSpectrogram
let frequencyBuffer: GPUBuffer | null = null;
let settingsBuffer: GPUBuffer | null = null;
let offsetBuffer: GPUBuffer | null = null;
let colorMapBuffer: GPUBuffer | null = null;
let minValueBuffer: GPUBuffer | null = null;
let maxValueBuffer: GPUBuffer | null = null;

// Initialize canvas and WebGPU context
const canvas: HTMLCanvasElement | null = document.getElementById('spectrogram') as HTMLCanvasElement;
if (!canvas) {
    throw new Error('Canvas element not found');
}

const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
if (!context) {
    throw new Error('Failed to get WebGPU context. Please ensure: \n1. WebGPU is enabled in chrome://flags\n2. The canvas element exists\n3. The browser supports WebGPU');
}

// Initialize WebGPU adapter and device
async function initWebGPU() {
    const adapter: GPUAdapter | null = await navigator.gpu?.requestAdapter() || null;
    if (!adapter) {
        throw new Error('WebGPU adapter not found');
    }
    
    const device: GPUDevice = await adapter.requestDevice();
    return device;
}

// UI elements
const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
const statusElement: HTMLElement | null = document.getElementById('status');
const webgpuWarning: HTMLElement | null = document.getElementById('webgpu_warning');
const dropZone: HTMLElement | null = document.getElementById('drop_zone');

// Check for WebGPU support
if (!navigator.gpu) {
    if (webgpuWarning) {
        webgpuWarning.style.display = 'block';
    }
} else {
    // Automatically start processing DjembeBass.wav on page load
    loadAndProcessAudio();
}

// Update status message
function updateStatus(message: string): void {
    if (statusElement) {
        statusElement.textContent = message;
    } else {
        console.log(`Status: ${message}`);
    }
}

// Load shader code from file
async function loadShaderCode(shaderPath: string): Promise<string> {
    try {
        const response = await fetch(shaderPath);
        if (!response.ok) {
            throw new Error(`Failed to load shader: ${response.statusText}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Error loading shader:', error);
        throw error;
    }
}

// Process audio from the default file
async function loadAndProcessAudio(): Promise<void> {
    try {
        updateStatus('Loading default audio file...');
        const shaderCode = await loadShaderCode('shader.wgsl');
        await processAudioFile('DjembeBass.wav', shaderCode);
        updateStatus('Default audio processed successfully');
    } catch (error: any) {
        console.error('Error processing default audio:', error);
        updateStatus(`Error: ${error.message}`);
    }
}

// Process audio from a user-provided file
async function processAudioFromFile(file: File, shaderCode: string): Promise<void> {
    try {
        const url = URL.createObjectURL(file);
        await processAudioFile(url, shaderCode);
        URL.revokeObjectURL(url);
        updateStatus(`${file.name} processed successfully`);
    } catch (error: any) {
        console.error('Error processing audio file:', error);
        updateStatus(`Error: ${error.message}`);
        throw error;
    }
}

// Main audio processing function
async function processAudioFile(url: string, shaderCode: string): Promise<void> {
    const device = await initWebGPU();
    
    // Create shader modules
    const shaderModule = device.createShaderModule({
        code: shaderCode
    });
    
    // Extract shader entry points
    const generateMagShaderCode = shaderCode;
    const reduceToSpectrogramShaderCode = shaderCode;
    const renderShaderCode = shaderCode;
    
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
    
    // Fill frequency buffer with logarithmically spaced frequencies
    const freqArray = new Float32Array(frequencyBuffer.getMappedRange());
    for (let i = 0; i < NUM_FREQUENCIES; i++) {
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
    
    // Fill color map with a viridis-like color scheme
    const colorArray = new Float32Array(colorMapBuffer.getMappedRange());
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
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
    
    // Load and process audio
    const signalGPUBuffer = await loadAudioBuffer(url, device);
    
    // Create shader modules
    const generateMagShader = await createShaderModule(device, generateMagShaderCode);
    const reduceToSpectrogramShader = await createShaderModule(device, reduceToSpectrogramShaderCode);
    const renderShader = await createShaderModule(device, renderShaderCode);
    
    // Run compute shaders
    const spectrogramBuffer = await runComputeShaders(
        device, 
        signalGPUBuffer, 
        generateMagShader, 
        reduceToSpectrogramShader
    );
    
    // Render spectrogram
    if (context) {
        await renderSpectrogram(
            device, 
            context, 
            navigator.gpu.getPreferredCanvasFormat(), 
            spectrogramBuffer, 
            renderShader
        );
    }
}

// Handle file drop events
if (dropZone) {
    dropZone.ondragover = (event: DragEvent) => {
        event.preventDefault();
        dropZone.style.borderColor = '#8BC34A';
        dropZone.style.backgroundColor = '#2a2a2a';
    };

    dropZone.ondragleave = () => {
        dropZone.style.borderColor = '#4CAF50';
        dropZone.style.backgroundColor = '#1e1e1e';
    };

    dropZone.ondrop = async (event: DragEvent) => {
        event.preventDefault();
        dropZone.style.borderColor = '#4CAF50';
        dropZone.style.backgroundColor = '#1e1e1e';
        
        const file: File | undefined = event.dataTransfer?.files[0];
        if (file && file.type.startsWith('audio/')) {
            updateStatus(`Processing ${file.name}...`);
            try {
                const shaderCode: string = await loadShaderCode('shader.wgsl');
                await processAudioFromFile(file, shaderCode);
            } catch (error: any) {
                console.error('Error processing audio file:', error);
                updateStatus(`Error: ${error.message}`);
            }
        } else {
            updateStatus('Error: Please drop a valid audio file.');
        }
    };

    // Also allow clicking on the drop zone to select a file
    dropZone.onclick = () => {
        const fileInput: HTMLInputElement = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.onchange = async (event: Event) => {
            const file: File | undefined = (event.target as HTMLInputElement)?.files?.[0];
            if (file) {
                updateStatus(`Processing ${file.name}...`);
                try {
                    const shaderCode: string = await loadShaderCode('shader.wgsl');
                    await processAudioFromFile(file, shaderCode);
                } catch (error: any) {
                    console.error('Error processing audio file:', error);
                    updateStatus(`Error: ${error.message}`);
                }
            }
        };
        fileInput.click();
    };
}

// Handle high DPI displays
const devicePixelRatio: number = window.devicePixelRatio || 1;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;

// Configure WebGPU context
const presentationFormat: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();
if (context) {
    (async () => {
        const device = await initWebGPU();
        context.configure({
            device: device,
            format: presentationFormat,
        });
    })();
}

// Load audio buffer from URL
async function loadAudioBuffer(url: string, device: GPUDevice) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert to mono if stereo
    let monoData: Float32Array;
    if (audioBuffer.numberOfChannels === 2) {
        const leftChannel = audioBuffer.getChannelData(0);
        const rightChannel = audioBuffer.getChannelData(1);
        monoData = new Float32Array(leftChannel.length);
        for (let i = 0; i < leftChannel.length; i++) {
            monoData[i] = (leftChannel[i] + rightChannel[i]) / 2;
        }
    } else {
        monoData = audioBuffer.getChannelData(0);
    }

    // Take the first SIGNAL_LENGTH samples or pad if shorter
    const signalBuffer = new Float32Array(SIGNAL_LENGTH);
    const samplesToCopy = Math.min(monoData.length, SIGNAL_LENGTH);
    signalBuffer.set(monoData.subarray(0, samplesToCopy));

    // Create a GPU buffer for the signal
    const signalGPUBuffer = device.createBuffer({
        size: signalBuffer.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(signalGPUBuffer, 0, signalBuffer);

    return signalGPUBuffer;
}

// Create shader module
async function createShaderModule(device: GPUDevice, code: string) {
    return device.createShaderModule({
        code: code,
    });
}

// Run compute shaders
async function runComputeShaders(
    device: GPUDevice, 
    signalGPUBuffer: GPUBuffer, 
    generateMagShader: GPUShaderModule, 
    reduceToSpectrogramShader: GPUShaderModule
) {
    if (!frequencyBuffer || !settingsBuffer || !offsetBuffer) {
        throw new Error('Required buffers not initialized');
    }

    // Create buffers for frequencies, magnitudes, and spectrogram
    const magnitudeBuffer = device.createBuffer({
        size: NUM_FREQUENCIES * SIGNAL_LENGTH * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const spectrogramBuffer = device.createBuffer({
        size: NUM_FREQUENCIES * SIGNAL_LENGTH * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create bind groups and pipeline for generate_mag
    const generateMagBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        ],
    });

    const generateMagPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [generateMagBindGroupLayout],
        }),
        compute: {
            module: generateMagShader,
            entryPoint: 'generate_mag',
        },
    });

    const generateMagBindGroup = device.createBindGroup({
        layout: generateMagBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: signalGPUBuffer } },
            { binding: 2, resource: { buffer: magnitudeBuffer } },
            { binding: 3, resource: { buffer: frequencyBuffer } },
            { binding: 4, resource: { buffer: settingsBuffer } },
        ],
    });

    // Create bind groups and pipeline for reduce_to_spectrogram
    const reduceToSpectrogramBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
    });

    const reduceToSpectrogramPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [reduceToSpectrogramBindGroupLayout],
        }),
        compute: {
            module: reduceToSpectrogramShader,
            entryPoint: 'reduce_to_spectrogram',
        },
    });

    const reduceToSpectrogramBindGroup = device.createBindGroup({
        layout: reduceToSpectrogramBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: magnitudeBuffer } },
            { binding: 1, resource: { buffer: settingsBuffer } },
            { binding: 2, resource: { buffer: offsetBuffer } },
            { binding: 3, resource: { buffer: spectrogramBuffer } },
        ],
    });

    // Run generate_mag shader
    const commandEncoder = device.createCommandEncoder();
    const generateMagPass = commandEncoder.beginComputePass();
    generateMagPass.setPipeline(generateMagPipeline);
    generateMagPass.setBindGroup(0, generateMagBindGroup);
    generateMagPass.dispatchWorkgroups(Math.ceil(SIGNAL_LENGTH / 128), NUM_FREQUENCIES);
    generateMagPass.end();

    // Run reduce_to_spectrogram shader
    const reduceToSpectrogramPass = commandEncoder.beginComputePass();
    reduceToSpectrogramPass.setPipeline(reduceToSpectrogramPipeline);
    reduceToSpectrogramPass.setBindGroup(0, reduceToSpectrogramBindGroup);
    reduceToSpectrogramPass.dispatchWorkgroups(NUM_FREQUENCIES);
    reduceToSpectrogramPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    return spectrogramBuffer;
}

// Render spectrogram
async function renderSpectrogram(
    device: GPUDevice, 
    context: GPUCanvasContext, 
    format: GPUTextureFormat, 
    spectrogramBuffer: GPUBuffer, 
    renderShader: GPUShaderModule
) {
    if (!colorMapBuffer || !minValueBuffer || !maxValueBuffer) {
        throw new Error('Required buffers not initialized');
    }

    // Create vertex shader for full-screen quad
    const vertexShaderCode = `
        @vertex
        fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
            var pos = array<vec2<f32>, 6>(
                vec2<f32>(-1.0, -1.0),
                vec2<f32>(1.0, -1.0),
                vec2<f32>(-1.0, 1.0),
                vec2<f32>(-1.0, 1.0),
                vec2<f32>(1.0, -1.0),
                vec2<f32>(1.0, 1.0)
            );
            return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        }
    `;
    
    const vertexShaderModule = device.createShaderModule({
        code: vertexShaderCode
    });
    
    const renderPipeline = device.createRenderPipeline({
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

    const renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: spectrogramBuffer } },
            { binding: 1, resource: { buffer: colorMapBuffer } },
            { binding: 2, resource: { buffer: minValueBuffer } },
            { binding: 3, resource: { buffer: maxValueBuffer } },
        ],
    });

    const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            },
        ],
    };

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(6); // Draw a full-screen quad
    renderPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
}
