// Since importing directly from GitHub raw content might be blocked by CORS,
// we'll implement a simplified WAV file parser for this example

// Simple WAV parser function
async function parseWAVFile(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const dataView = new DataView(arrayBuffer);
  
  // Basic WAV header parsing
  const riffHeader = String.fromCharCode(
    dataView.getUint8(0),
    dataView.getUint8(1),
    dataView.getUint8(2),
    dataView.getUint8(3)
  );
  
  if (riffHeader !== 'RIFF') {
    throw new Error('Not a valid WAV file: RIFF header not found');
  }
  
  const waveHeader = String.fromCharCode(
    dataView.getUint8(8),
    dataView.getUint8(9),
    dataView.getUint8(10),
    dataView.getUint8(11)
  );
  
  if (waveHeader !== 'WAVE') {
    throw new Error('Not a valid WAV file: WAVE header not found');
  }
  
  // Find the 'fmt ' chunk
  let offset = 12;
  let fmtChunkSize = 0;
  while (offset < arrayBuffer.byteLength) {
    const chunkType = String.fromCharCode(
      dataView.getUint8(offset),
      dataView.getUint8(offset + 1),
      dataView.getUint8(offset + 2),
      dataView.getUint8(offset + 3)
    );
    
    const chunkSize = dataView.getUint32(offset + 4, true);
    
    if (chunkType === 'fmt ') {
      const audioFormat = dataView.getUint16(offset + 8, true);
      const numChannels = dataView.getUint16(offset + 10, true);
      const sampleRate = dataView.getUint32(offset + 12, true);
      const bitsPerSample = dataView.getUint16(offset + 22, true);
      
      fmtChunkSize = chunkSize;
      offset += 8 + chunkSize;
      continue;
    }
    
    if (chunkType === 'data') {
      // Found the data chunk
      const dataOffset = offset + 8;
      const dataSize = chunkSize;
      
      // Assuming 16-bit PCM mono audio for simplicity
      const numSamples = dataSize / 2;
      const samples = new Float32Array(numSamples);
      
      // Convert from 16-bit PCM to float32 (-1.0 to 1.0)
      for (let i = 0; i < numSamples; i++) {
        const pcmValue = dataView.getInt16(dataOffset + i * 2, true);
        samples[i] = pcmValue / 32768.0; // Normalize to -1.0 to 1.0
      }
      
      return {
        channels: 1, // We're simplifying to mono only
        sampleRate: 44100, // Assuming standard sample rate
        samples: samples
      };
    }
    
    offset += 8 + chunkSize;
  }
  
  throw new Error('Could not find data chunk in WAV file');
}

// Main WebGPU code
async function main() {
  // Check for WebGPU support
  if (!navigator.gpu) {
    console.error("WebGPU is not supported in your browser");
    return;
  }

  // Initialize WebGPU
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.error("WebGPU is not supported on this system");
    return;
  }
  const device = await adapter.requestDevice();
  console.log("WebGPU initialized successfully!");

  // Constants
  const SIGNAL_LENGTH = 32768;
  const NUM_FREQUENCIES = 256;
  const THREADS_PER_WORKGROUP = 128;

  // Load and parse WAV file
  // Note: In a real application, you'd need to use a proper URL to your WAV file
  try {
    console.log("Loading WAV file...");
    const wav = await parseWAVFile("./DjembeBass.wav"); // Replace with actual path
    
    // Ensure the WAV file is mono and has enough samples
    if (wav.channels !== 1) {
      throw new Error("WAV file must be mono.");
    }
    
    if (wav.samples.length < SIGNAL_LENGTH) {
      throw new Error(`WAV file must have at least ${SIGNAL_LENGTH} samples.`);
    }
    
    console.log(`WAV file loaded: ${wav.samples.length} samples`);
    
    // Extract the first SIGNAL_LENGTH samples as a mono signal
    const signal = new Float32Array(wav.samples.slice(0, SIGNAL_LENGTH));
    
    // Generate frequency array (in Hz)
    const sampleRate = wav.sampleRate;
    const frequencies = new Float32Array(NUM_FREQUENCIES);
    for (let i = 0; i < NUM_FREQUENCIES; i++) {
      // Linear frequency spacing from 20Hz to 20kHz
      frequencies[i] = 20.0 + (i / (NUM_FREQUENCIES - 1)) * (20000.0 - 20.0);
    }
    
    // Create buffers
    const signalBuffer = device.createBuffer({
      size: signal.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(signalBuffer, 0, signal);
    
    const frequencyBuffer = device.createBuffer({
      size: frequencies.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(frequencyBuffer, 0, frequencies);
    
    const magnitudeBuffer = device.createBuffer({
      size: NUM_FREQUENCIES * SIGNAL_LENGTH * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Create bind group layout and pipeline
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });
    
    // WGSL shader for computing the spectrogram
    const shaderCode = `
      struct Params {
        signal_length: u32,
        num_frequencies: u32,
      };
      
      @group(0) @binding(0) var<storage, read> signal: array<f32>;
      @group(0) @binding(1) var<storage, read> frequencies: array<f32>;
      @group(0) @binding(2) var<storage, read_write> magnitudes: array<f32>;
      
      @compute @workgroup_size(128)
      fn generate_mag(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let time_idx = global_id.x;
        let freq_idx = global_id.y;
        
        if (time_idx >= ${SIGNAL_LENGTH} || freq_idx >= ${NUM_FREQUENCIES}) {
          return;
        }
        
        let freq = frequencies[freq_idx];
        let time = f32(time_idx) / 44100.0; // Assuming 44.1kHz sample rate
        
        // Simple Goertzel algorithm for frequency detection
        let omega = 2.0 * 3.14159265359 * freq / 44100.0;
        let cos_omega = cos(omega);
        let sin_omega = sin(omega);
        
        var s0 = 0.0;
        var s1 = 0.0;
        var s2 = 0.0;
        
        // Process a window of samples centered around the current time
        let window_size = 1024u;
        let half_window = window_size / 2u;
        
        for (var i = 0u; i < window_size; i = i + 1u) {
          let sample_idx = time_idx + i - half_window;
          if (sample_idx < ${SIGNAL_LENGTH}) {
            let sample = signal[sample_idx];
            
            // Apply Hann window function
            let window_val = 0.5 * (1.0 - cos(2.0 * 3.14159265359 * f32(i) / f32(window_size)));
            let windowed_sample = sample * window_val;
            
            // Goertzel algorithm
            s0 = windowed_sample + 2.0 * cos_omega * s1 - s2;
            s2 = s1;
            s1 = s0;
          }
        }
        
        // Calculate magnitude
        let real = s1 - s2 * cos_omega;
        let imag = s2 * sin_omega;
        let magnitude = sqrt(real * real + imag * imag);
        
        // Store result
        let result_idx = freq_idx * ${SIGNAL_LENGTH} + time_idx;
        magnitudes[result_idx] = magnitude;
      }
    `;
    
    const pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          code: shaderCode,
        }),
        entryPoint: "generate_mag",
      },
    });
    
    // Create bind group
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: signalBuffer } },
        { binding: 1, resource: { buffer: frequencyBuffer } },
        { binding: 2, resource: { buffer: magnitudeBuffer } },
      ],
    });
    
    // Dispatch the compute shader
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(SIGNAL_LENGTH / THREADS_PER_WORKGROUP),
      NUM_FREQUENCIES,
      1
    );
    passEncoder.end();
    
    // Create a buffer for reading back results
    const outputBuffer = device.createBuffer({
      size: magnitudeBuffer.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    
    // Copy results to the output buffer
    commandEncoder.copyBufferToBuffer(
      magnitudeBuffer,
      0,
      outputBuffer,
      0,
      magnitudeBuffer.size
    );
    
    // Submit the commands
    device.queue.submit([commandEncoder.finish()]);
    
    // Read back the results
    await outputBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(outputBuffer.getMappedRange());
    
    // Display some sample results
    console.log("First few spectrogram values:");
    for (let i = 0; i < 10; i++) {
      console.log(`Frequency ${i}: ${result[i * SIGNAL_LENGTH]}`);
    }
    
    // Clean up
    outputBuffer.unmap();
    
    console.log("Spectrogram computation completed!");
    
    // In a real application, you would visualize the spectrogram here
    // ...
    
  } catch (error) {
    console.error("Error processing WAV file:", error);
  }
}

// Run the main function
main().catch(error => {
  console.error("An error occurred:", error);
});