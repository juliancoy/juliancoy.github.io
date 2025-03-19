// PART 1: DFT REAL AND IMAGINARY COMPUTATION
// ================================
// This shader computes the DFT for signal analysis

// Constants
const PI: f32 = 3.1415926;
const FREQ_PRECISION_MULTIPLE: f32 = 40.0;
const SIGNAL_LENGTH: u32 = 32768;
const THREADS_PER_WORKGROUP: u32 = 128;
const NUM_FREQUENCIES: u32 = 256;

struct SpectrogramSettingsBuffer {
    FREQ_PRECISION_MULTIPLE: u32,
};

// Buffers for DFT computation
struct InputBuffer {
    values: array<f32, SIGNAL_LENGTH>,
};

struct FrequencyBuffer {
    values: array<f32, NUM_FREQUENCIES>,
};

struct MagnitudeBuffer {
    values: array<f32, NUM_FREQUENCIES * SIGNAL_LENGTH>,
};

struct SpectrogramBuffer {
    values: array<f32, NUM_FREQUENCIES * SIGNAL_LENGTH>,
};

// Bind groups for DFT shader
@group(0) @binding(0) var<storage, read> input_buf: InputBuffer;
@group(0) @binding(2) var<storage, read_write> output_mag_buf: MagnitudeBuffer;
@group(0) @binding(3) var<storage, read> frequency_buf: FrequencyBuffer;
@group(0) @binding(4) var<storage, read> settings_buf: SpectrogramSettingsBuffer;

// Main compute shader entrypoint
@compute @workgroup_size(THREADS_PER_WORKGROUP)
fn generate_mag(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) workgroup_id: vec3<u32>,
) {
    // Calculate indices
    let frequency_ix: u32 = global_id.y;
    let sample_ix: u32 = global_id.x;
    
    // Guard against out-of-bounds access
    if (frequency_ix >= NUM_FREQUENCIES) {
        return;
    }
    
    // Get the input sample value
    let sample_value: f32 = input_buf.values[sample_ix];
    
    // Get the frequency for this thread
    let freq: f32 = frequency_buf.values[frequency_ix];
    
    // Calculate the phase angle
    let phase: f32 = 2.0 * PI * freq * f32(sample_ix);
    
    // Calculate normalization factor
    let normalization: f32 = 1.0 / sqrt(settings_buf.FREQ_PRECISION_MULTIPLE / freq);
    
    // Compute the real (cosine) component
    var real = sample_value * cos(phase) * normalization;
    
    // Compute the imaginary (sine) component (negative for standard DFT)
    var imag = -sample_value * sin(phase) * normalization;
    
    // Calculate the output index
    let output_idx: u32 = frequency_ix * SIGNAL_LENGTH + sample_ix;
    
    // Store the results in the output buffers
    output_mag_buf.values[output_idx] = real * real + imag * imag;
}


// PART 2: REDUCTION SHADER
// ========================
// This shader reduces the DFT data into magnitude values for each frequency/time bin

struct OffsetBuffer {
    value: u32,
};

@group(0) @binding(0) var<storage, read_write> magnitude_buf: MagnitudeBuffer;
@group(0) @binding(1) var<storage, read> settings_buf: SpectrogramSettingsBuffer;
@group(0) @binding(2) var<storage, read> offset_buf: OffsetBuffer;
@group(0) @binding(3) var<storage, read_write> spectrogram_buf: SpectrogramBuffer;
@group(0) @binding(4) var<storage, read> frequency_buf: FrequencyBuffer;

@compute @workgroup_size(THREADS_PER_WORKGROUP)
fn reduce_to_spectrogram(
    @builtin(global_invocation_id) global_id: vec3<u32>,
) {

    let freq_idx: u32 = global_id.x;
    
    // Bounds check
    if (freq_idx >= NUM_FREQUENCIES) {
        return;
    }

    // Calculate the period for this frequency
    let period: f32 = 1.0 / frequency_buf.values[freq_idx];
    
    // Calculate power sum for this frequency/window combination
    var power_sum: f32 = 0.0;
    
    // Iterate through samples in the window
    for (var sample_idx: u32 = 0; sample_idx < SIGNAL_LENGTH; sample_idx = sample_idx + 1) {
        
        let data_idx: u32 = freq_idx * SIGNAL_LENGTH + sample_idx;
        let mag: f32 = magnitude_buf.values[data_idx];
        
        // Accumulate squared magnitude
        power_sum = power_sum + mag;

        // Delete the oldest element from the power sum
        if (sample_idx > period){
            // Store the power sum in the magnitude buffer
            let oldest_idx: u32 = sample_idx - period;
            
            // Subtract the oldest value from the power sum
            power_sum = power_sum - magnitude_buf.values[freq_idx * SIGNAL_LENGTH + oldest_idx];
        }

        // Convert to dB scale (with clamping to avoid log of zero)
        let power_db: f32 = 10.0 * log(max(power_sum, 1e-10)) / log(10.0);
        
        // Store in the magnitude buffer
        spectrogram_buf.values[data_idx] = power_db;
    }
}


// PART 3: VISUALIZATION SHADER
// ============================
// This fragment shader renders the magnitude values as a colored spectrogram

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

struct ColorMapBuffer {
    colors: array<vec4<f32>, 256>, // Color map with 256 entries
};

@group(0) @binding(0) var<storage, read> spectrogram_magnitude: SpectrogramBuffer;
@group(0) @binding(1) var<storage, read> color_map: ColorMapBuffer;
@group(0) @binding(2) var<uniform> min_value: f32;
@group(0) @binding(3) var<uniform> max_value: f32;

@fragment
fn render_spectrogram(in: VertexOutput) -> @location(0) vec4<f32> {
    // Calculate texture coordinates in pixel space
    let x: u32 = u32(in.texcoord.x * f32(SIGNAL_LENGTH));
    let y: u32 = u32((1.0 - in.texcoord.y) * f32(NUM_FREQUENCIES));
    
    // Bounds check
    if (x >= SIGNAL_LENGTH || y >= NUM_FREQUENCIES) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    
    // Get the magnitude value
    let magnitude: f32 = spectrogram_magnitude.values[x * NUM_FREQUENCIES + y];
    
    // Normalize to 0-1 range based on min/max values
    let normalized: f32 = clamp((magnitude - min_value) / (max_value - min_value), 0.0, 1.0);
    
    // Map to color using the color map
    let color_idx: u32 = u32(normalized * 255.0);
    return color_map.colors[color_idx];
}
