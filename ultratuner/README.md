# UltraTuner

UltraTuner is a tool that processes audio files to generate and display a heatmap. The following steps outline how the code works:

1. **Load Example WAV File**:
    - The example WAV file is converted to mono.
    - The mono audio data is loaded into GPU memory.

2. **Set Temporal Centers**:
    - Temporal centers are defined for processing.

3. **GPU Processing**:
    - The GPU processes the appropriate length of audio data around the temporal centers.
    - A heatmap is generated based on the processed data.

4. **Display Heatmap**:
    - The generated heatmap is displayed on the screen.

## License

This project is licensed under the MIT License.

## Contact

For any questions or issues, please contact [Julian](mailto:julian@codecollective.us).
