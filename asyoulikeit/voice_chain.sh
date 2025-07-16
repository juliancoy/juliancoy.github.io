#!/bin/bash

### --- Config ---
OUTPUT_FILE="final_output.wav"
NORMALIZED_FILE="normalized_$OUTPUT_FILE"
SAMPLE_RATE=48000

### --- Function: Cleanup ---
cleanup() {
  echo -e "\n🧹 Cleaning up... Duration: $((SECONDS / 60))m $((SECONDS % 60))s"
  
  # Only normalize if output file exists and has content
  if [[ -f "$OUTPUT_FILE" && -s "$OUTPUT_FILE" ]]; then
    echo "🔊 Normalizing volume..."
    if command -v sox &>/dev/null; then
      sox "$OUTPUT_FILE" "$NORMALIZED_FILE" gain -n 2>/dev/null || \
        echo "⚠️ Normalization failed - copying original file"
      [[ -f "$NORMALIZED_FILE" ]] || cp "$OUTPUT_FILE" "$NORMALIZED_FILE"
    else
      echo "⚠️ SoX not available - skipping normalization"
      cp "$OUTPUT_FILE" "$NORMALIZED_FILE"
    fi
    echo "✅ Final output saved to $NORMALIZED_FILE"
  else
    echo "⚠️ No audio was recorded - output file missing or empty"
  fi
}

trap cleanup EXIT
SECONDS=0

### --- Verify PipeWire ---
if ! command -v pw-cli &>/dev/null || ! pw-cli info &>/dev/null; then
  echo "❌ PipeWire not running or pw-cli not available."
  echo "   Try: systemctl --user start pipewire pipewire-pulse"
  exit 1
fi

### --- Get default audio devices ---
echo "🔍 Detecting audio devices..."
MIC_SOURCE=$(pw-cli list-objects | grep -A1 "alsa_input" | grep -A1 "node.name" | grep -oP 'node.name = "\K[^"]+' | head -n1)
DEFAULT_OUTPUT=$(pw-cli list-objects | grep -A1 "alsa_output" | grep -A1 "node.name" | grep -oP 'node.name = "\K[^"]+' | head -n1)

# Alternative method using wpctl (WirePlumber)
if [[ -z "$MIC_SOURCE" ]] && command -v wpctl &>/dev/null; then
  MIC_SOURCE=$(wpctl status | grep -A1 "Sources" | grep "input" | head -n1 | awk '{print $2}')
  DEFAULT_OUTPUT=$(wpctl status | grep -A1 "Sinks" | grep "output" | head -n1 | awk '{print $2}')
fi

if [[ -z "$MIC_SOURCE" ]]; then
  echo "❌ Could not detect microphone. Options:"
  echo "1. Check your microphone is properly connected"
  echo "2. Try these commands to debug:"
  echo "   pw-cli list-objects | grep -A3 Audio/Source"
  echo "   wpctl status"
  echo "3. Try setting manually with: pavucontrol"
  exit 1
fi

echo "🎤 Using microphone: $MIC_SOURCE"
echo "🔈 System output: ${DEFAULT_OUTPUT:-Not detected}"

### --- Check audio channels ---
CHANNELS=$(pw-cli dump-object "$MIC_SOURCE" | grep "audio.channel" | wc -l)
if [[ "$CHANNELS" -eq 1 ]]; then
  RNNOISE_LABEL="noise_suppressor_mono"
  echo "🔍 Mic appears to be mono"
else
  RNNOISE_LABEL="noise_suppressor_stereo"
  CHANNELS=2
  echo "🔍 Mic appears to be stereo"
fi

### --- Create processing pipeline ---
echo "🔄 Creating audio processing pipeline..."

# Create virtual sink for processed audio
VIRTUAL_SINK=$(pw-cli create-node adapter \
  factory.name=support.null-audio-sink \
  media.class=Audio/Sink \
  object.linger=true \
  node.name="voice_processing_sink" \
  monitor.channel-volumes=true | grep -oP 'id \K\d+')

# Create noise suppression filter
FILTER_NODE=$(pw-cli create-node adapter \
  factory.name=support.null-audio-sink \
  media.class=Audio/Source/Virtual \
  object.linger=true \
  node.name="voice_processing_filter" | grep -oP 'id \K\d+')

pw-cli set-param "$FILTER_NODE" ladspa.plugin=rnnoise_ladspa
pw-cli set-param "$FILTER_NODE" ladspa.label="$RNNOISE_LABEL"

# Connect microphone to filter
pw-cli connect "$MIC_SOURCE" "$FILTER_NODE"

# Connect filter to virtual sink
pw-cli connect "$FILTER_NODE" "$VIRTUAL_SINK"

### --- Verify setup ---
if [[ -z "$VIRTUAL_SINK" || -z "$FILTER_NODE" ]]; then
  echo "❌ Failed to create audio pipeline"
  exit 1
fi

echo "⏺️  Everything is ready - starting recording in 3 seconds..."
sleep 3

### --- Start recording ---
echo -e "\n🎙️  Recording to $OUTPUT_FILE (Press Ctrl+C to stop)..."
pw-record --target="$VIRTUAL_SINK" --rate=$SAMPLE_RATE --channels=$CHANNELS "$OUTPUT_FILE" || {
  echo "⚠️ Recording failed - check audio permissions and device availability"
  exit 1
}