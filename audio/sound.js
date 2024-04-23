// sound.js
document.addEventListener("DOMContentLoaded", async () => {
    if (!('gpu' in navigator)) {
        console.error("WebGPU is not supported in this browser.");
        return;
    }

    const audioContext = new AudioContext();
    try {
        await audioContext.audioWorklet.addModule('sineWaveProcessor.js');
    } catch (e) {
        console.error("Failed to load Audio Worklet module: ", e);
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (! adapter){
        throw Error('Couldnt request WebGPU adapter.')
    }
    const gpuDevice = await adapter.requestDevice(); 
    
    const shaderModule = gpuDevice.createShaderModule({
        code: `
            @group(0) @binding(0) var<storage, read_write> bufferOut: array<f32>;
    
            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let sampleRate = 44100.0;
                let frequency = 440.0; // Frequency of A4 note
                let amplitude = 0.5;
                let t = f32(global_id.x) / sampleRate;
                let theta = t * frequency * 2.0 * 3.14159265;
                let sample = amplitude * sin(theta);
                bufferOut[global_id.x] = sample;
            }
        `
    });
    
    const bufferSize = 44100; // 1 second of audio at 44100Hz sample rate
    const buffer = gpuDevice.createBuffer({
        size: bufferSize * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      
    const bindGroupLayout = gpuDevice.createBindGroupLayout({
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' }
        }]
    });

    const bindGroup = gpuDevice.createBindGroup({
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: {
                buffer: buffer
            }
        }]
    });

    const pipeline = gpuDevice.createComputePipeline({
        compute: {
            module: shaderModule,
            entryPoint: 'main'
        },
        layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] })
    });

    const commandEncoder = gpuDevice.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(bufferSize / 64));
    // End the compute pass.
    passEncoder.end();

    gpuDevice.queue.submit([commandEncoder.finish()]);

    await buffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = buffer.getMappedRange();
    const audioBuffer = new Float32Array(arrayBuffer).slice(); // Copy the data to a new Float32Array
    buffer.unmap();

    const audioNode = new AudioWorkletNode(audioContext, 'sine-wave-processor');
    audioNode.port.postMessage(audioBuffer);
    audioNode.connect(audioContext.destination);
});
