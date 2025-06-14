#!/bin/bash

### --- Config ---
OUTPUT_FILE="final_output.wav"
NORMALIZED_FILE="normalized_$OUTPUT_FILE"
SAMPLE_RATE=48000

### --- Function: Safe Module Unload ---
unload_if_loaded() {
  if [[ $1 =~ ^[0-9]+$ ]]; then
    pactl unload-module "$1" 2>/dev/null
  fi
}

cleanup() {
  echo -e "\n🧹 Cleaning up... Duration: $((SECONDS / 60))m $((SECONDS % 60))s"
  unload_if_loaded "$LOOP_ID"
  unload_if_loaded "$RNN_ID"
  unload_if_loaded "$NULL_SINK_ID"
  echo "🔊 Normalizing volume..."
  sox "$OUTPUT_FILE" "$NORMALIZED_FILE" gain -n
  echo "✅ Done! Output saved to $NORMALIZED_FILE"
}

trap cleanup EXIT
SECONDS=0

### --- Verify PulseAudio ---
if ! pactl info &>/dev/null; then
  echo "❌ PulseAudio not running. Start it with: pulseaudio --start"
  exit 1
fi

### --- Get audio devices ---
MIC_SOURCE=$(pactl list short sources | grep input | grep -v monitor | awk '{print $2}' | head -n1)
SPEAKER_SINK=$(pactl list short sinks | grep -v monitor | awk '{print $2}' | head -n1)

if [ -z "$MIC_SOURCE" ] || [ -z "$SPEAKER_SINK" ]; then
  echo "❌ Could not detect mic or speaker. Plug in devices and try again."
  exit 1
fi

echo "🎤 Detected mic: $MIC_SOURCE"
echo "🔈 Using speaker: $SPEAKER_SINK"

### --- Check if mic is mono or stereo ---
CHANNELS=$(pactl list sources | awk -v mic="$MIC_SOURCE" '
  $1 == "Source" && $2 ~ mic { found = 1 }
  found && /Channels:/ { print $2; exit }
')

if [ "$CHANNELS" == "1" ]; then
  RNNOISE_LABEL="noise_suppressor_mono"
  echo "🔍 Mic is mono - using mono noise suppression"
else
  RNNOISE_LABEL="noise_suppressor_stereo"
  echo "🔍 Mic is stereo - using stereo noise suppression"
  CHANNELS=2
fi

### --- Create processing pipeline ---
echo "🔄 Creating audio processing pipeline..."

# Create null sink
NULL_SINK_ID=$(pactl load-module module-null-sink \
  sink_name=voice_processing \
  sink_properties=device.description="Voice_Processing")

# Load RNNoise LADSPA plugin
RNN_ID=$(pactl load-module module-ladspa-source \
  source_name=mic_denoised \
  master="$MIC_SOURCE" \
  plugin=rnnoise_ladspa \
  label="$RNNOISE_LABEL" \
  control=1)

# Loopback denoised mic to null sink (for recording) and optionally to speaker
LOOP_ID=$(pactl load-module module-loopback \
  source=mic_denoised.monitor \
  sink=voice_processing \
  latency_msec=1)

### --- Verify setup ---
if [ -z "$NULL_SINK_ID" ] || [ -z "$RNN_ID" ] || [ -z "$LOOP_ID" ]; then
  echo "❌ Failed to create audio pipeline:"
  [ -z "$NULL_SINK_ID" ] && echo " - Could not create null sink"
  [ -z "$RNN_ID" ] && echo " - Could not load RNNoise (is it installed?)"
  [ -z "$LOOP_ID" ] && echo " - Could not create loopback"
  cleanup
  exit 1
fi

### --- Start recording ---
echo -e "\n🎙️  Recording to $OUTPUT_FILE (Press Ctrl+C to stop)..."
parec -d voice_processing.monitor --format=s16le --rate=$SAMPLE_RATE --channels=$CHANNELS | \
  sox -t raw -r $SAMPLE_RATE -e signed -b 16 -c $CHANNELS - "$OUTPUT_FILE"
