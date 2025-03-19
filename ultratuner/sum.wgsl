// Workgroup size (must match the size defined in the compute pipeline)
const WORKGROUP_SIZE: u32 = 128;

// Buffer for input data
struct InputBuffer {
    values: array<f32>,
};

// Buffer for output data (sum per workgroup)
struct OutputBuffer {
    sum: array<f32>,
};

// Bind groups
@group(0) @binding(0) var<storage, read> input_buf: InputBuffer;
@group(0) @binding(1) var<storage, read_write> output_buf: OutputBuffer;

// Shared memory for workgroup reduction
var<workgroup> shared_data: array<f32, WORKGROUP_SIZE>;

// Compute shader entry point
@compute @workgroup_size(WORKGROUP_SIZE)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) workgroup_id: vec3<u32>,
) {
    let thread_id: u32 = local_id.x;
    let global_index: u32 = global_id.x;

    // Load input value into shared memory
    shared_data[thread_id] = input_buf.values[global_index];
    workgroupBarrier();

    // Perform parallel reduction
    var offset: u32 = WORKGROUP_SIZE / 2;
    while (offset > 0) {
        if (thread_id < offset) {
            shared_data[thread_id] += shared_data[thread_id + offset];
        }
        workgroupBarrier();
        offset = offset / 2;
    }

    // Write the final sum to the output buffer
    if (thread_id == 0) {
        output_buf.sum[workgroup_id.x] = shared_data[0];
    }
}