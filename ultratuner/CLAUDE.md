# UltraTuner Project Guidelines

## Build and Run
- Serve locally: `python -m http.server` or any static file server
- Open: `http://localhost:8000` in Chrome 113+ or Edge 113+
- No build/compilation needed - WebGPU runs in-browser

## Code Style Guidelines
- **JavaScript**: Follow modern ES6+ syntax with consistent indentation (4 spaces)
- **Naming**: camelCase for variables/functions, UPPER_CASE for constants
- **Error handling**: Use try/catch blocks with specific error messages
- **WebGPU**: Document shader bindings with clear comments
- **WGSL**: Document shader sections and use consistent formatting
- **CSS**: Group related properties, use consistent selector naming

## WebGPU Implementation
- Always check for WebGPU support before accessing GPU features
- Handle device/adapter initialization failures gracefully
- Define precise buffer sizes based on audio requirements
- Properly manage GPU resource lifecycles (creation, usage, mapping)

## Audio Processing
- Support standard formats (MP3, WAV, OGG, FLAC)
- Process audio in appropriate chunks for spectral analysis
- Apply windowing functions to reduce spectral leakage
- Handle normalization of spectral data for visualization

## Components
- **index.html**: Main UI structure
- **main.js**: Core WebGPU and audio processing logic
- **shader.wgsl**: DFT computation, reduction, and visualization shaders
- **sum.wgsl**: Parallel reduction utilities
- **styles.css**: UI styling and layout