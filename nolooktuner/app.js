// ======= Configuration =======
const A4 = 440;                 // reference
const NOTE_NAMES = ['C','C sharp','D','D sharp','E','F','F sharp','G','G sharp','A','A sharp','B'];
const MIN_CONFIDENCE_RMS = 0.003; // more sensitive minimal loudness to trust (RMS)
const ACTIVITY_THRESHOLD = 0.005; // more sensitive RMS threshold for activity detection
const ACTIVITY_FADE_THRESHOLD = 0.002; // more sensitive RMS threshold for activity fade
const ACTIVITY_DEBOUNCE_MS = 500; // debounce time for activity state changes
const HZ_MIN = 50;              // ignore sub-bass noise
const HZ_MAX = 2000;            // cap for typical vocal/instrument range
const ANALYSIS_BUFFER_SIZE = 4096; // larger buffer for better accuracy
const SPEAK_COOLDOWN_MS = 3000; // longer delay between announcements

// ======= State =======
let audioCtx, analyser, micSource, scriptNode;
let running = false;
let speechOn = true;
let lastSpokenNote = '';
let lastSpokenAt = 0;
let speakCooldownMs = SPEAK_COOLDOWN_MS; // longer delay between announcements
let isSpeaking = false; // prevent simultaneous recording and speaking
let micPermissionGranted = false;
let lastTuningStatus = '';

// Application states
const STATE = {
  WAITING: 'waiting',
  LISTENING: 'listening',
  ANNOUNCING: 'announcing'
};
let currentState = STATE.WAITING;

// Audio buffer for recording
let audioBuffer = [];
let lastActivityChange = 0;
let activityStartTime = 0;
let activityEndTime = 0;

// ======= DOM =======
const $toggle       = document.getElementById('toggle');
const $speakToggle  = document.getElementById('speakToggle');
const $note         = document.getElementById('noteText');
const $freq         = document.getElementById('freq');
const $cents        = document.getElementById('cents');
const $rms          = document.getElementById('rms');
const $srLive       = document.getElementById('sr-live');
const $vadIndicator = document.getElementById('vadIndicator');
const $vadText      = document.getElementById('vadText');
const $tunerArm     = document.getElementById('tunerArm');

// ======= Helpers =======
function freqToNoteData(f) {
  // Convert frequency to nearest MIDI note & cents deviation (A4=440)
  const n = Math.round(12 * Math.log2(f / A4)) + 69; // MIDI
  const noteIndex = (n % 12 + 12) % 12;
  const octave = Math.floor(n / 12) - 1;
  const noteName = NOTE_NAMES[noteIndex];
  const refHz = A4 * Math.pow(2, (n - 69) / 12);
  const cents = 1200 * Math.log2(f / refHz);
  return { noteName, octave, cents, midi: n, refHz };
}

function announce(text) {
  // Also send to screen-reader live region
  $srLive.textContent = text;

  if (!speechOn) {
    console.log('Not announcing: speech is off');
    return false;
  }
  if (isSpeaking) {
    console.log('Not announcing: already speaking');
    return false;
  }
  if (!('speechSynthesis' in window)) {
    console.log('Not announcing: speechSynthesis not available');
    return false;
  }

  console.log(`Announcing: "${text}"`);
  isSpeaking = true;

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.05;
  utter.pitch = 1.0;
  utter.volume = 1.0;

  utter.onend = function() {
    console.log('Speech ended');
    isSpeaking = false;
    lastSpokenAt = performance.now();
  };

  utter.onerror = function(e) {
    console.log('Speech error:', e);
    isSpeaking = false;
    lastSpokenAt = performance.now();
  };

  window.speechSynthesis.cancel(); // interrupt if needed
  window.speechSynthesis.speak(utter);

  return true;
}

function readableNote({noteName, octave}) {
  // Convert "A#" -> "A sharp"; "C#" -> "C sharp"
  const name = noteName.includes('#') ? noteName.replace('#', ' sharp') : noteName;
  return `${name} ${octave}`;
}

// Get tuning status based on cents deviation
function getTuningStatus(cents) {
  const absCents = Math.abs(cents);
  if (absCents < 5) {
    return 'is right on the money';
  } else if (cents > 0) {
    if (absCents > 25) {
      return 'is way sharp';
    } else if (absCents > 10) {
      return 'is sharp';
    } else {
      return 'is slightly sharp';
    }
  } else {
    if (absCents > 25) {
      return 'is way flat';
    } else if (absCents > 10) {
      return 'is flat';
    } else {
      return 'is slightly flat';
    }
  }
}

function stopEverything() {
  running = false;
  $toggle.textContent = 'Start Tuner';
  $toggle.setAttribute('aria-pressed', 'false');
  if (scriptNode) { scriptNode.disconnect(); scriptNode = null; }
  if (analyser) { analyser.disconnect(); analyser = null; }
  if (micSource) { micSource.disconnect(); micSource = null; }
  if (audioCtx) { /* keep ctx alive; user can restart */ }
  
  // Reset state
  setState(STATE.WAITING);
  clearAudioBuffer();
  analysisResult = null;
  $note.textContent = '—';
  $freq.textContent = '—';
  $cents.textContent = '—';
  $rms.textContent = '—';
}

// ======= State Management =======
function setState(newState) {
  console.log(`State transition: ${currentState} -> ${newState}`);
  currentState = newState;
  updateStateIndicators();
}

function updateStateIndicators() {
  switch (currentState) {
    case STATE.WAITING:
      $vadIndicator.style.background = '#ccc';
      $vadText.textContent = 'Waiting for audio';
      break;
    case STATE.LISTENING:
      $vadIndicator.style.background = '#4CAF50';
      $vadText.textContent = 'Recording audio';
      break;
    case STATE.ANNOUNCING:
      $vadIndicator.style.background = '#FF9800';
      $vadText.textContent = 'Announcing results';
      break;
  }
}

// ======= Audio Buffer Management =======
function addToAudioBuffer(buf) {
  // Create a copy of the buffer to avoid reference issues
  const bufferCopy = new Float32Array(buf.length);
  bufferCopy.set(buf);

  audioBuffer.push(bufferCopy);
}

function clearAudioBuffer() {
  audioBuffer = [];
}

function analyzeRecordedAudio() {
  if (audioBuffer.length === 0) {
    console.log('No audio data to analyze');
    return null;
  }

  console.log(`Analyzing ${audioBuffer.length} audio frames`);

  // Use only the most recent frames (about 0.5 seconds worth)
  const sampleRate = audioCtx.sampleRate;
  const targetSamples = Math.floor(sampleRate * 0.5); // 0.5 seconds
  const framesToUse = [];
  let totalSamples = 0;

  // Collect frames from the end until we have enough samples
  for (let i = audioBuffer.length - 1; i >= 0; i--) {
    framesToUse.unshift(audioBuffer[i]);
    totalSamples += audioBuffer[i].length;
    if (totalSamples >= targetSamples) break;
  }

  // Combine selected frames
  const combinedBuffer = new Float32Array(totalSamples);
  let offset = 0;
  for (const buf of framesToUse) {
    combinedBuffer.set(buf, offset);
    offset += buf.length;
  }

  // Normalize audio
  let maxAmplitude = 0;
  for (let i = 0; i < combinedBuffer.length; i++) {
    const abs = Math.abs(combinedBuffer[i]);
    if (abs > maxAmplitude) maxAmplitude = abs;
  }

  if (maxAmplitude > 0.001) {
    const normalizeGain = 0.8 / maxAmplitude; // normalize to 0.8 to avoid clipping
    for (let i = 0; i < combinedBuffer.length; i++) {
      combinedBuffer[i] *= normalizeGain;
    }
    console.log(`Normalized audio by gain ${normalizeGain.toFixed(2)} (max was ${maxAmplitude.toFixed(4)})`);
  }

  console.log(`Using ${framesToUse.length} frames, ${totalSamples} samples (~${(totalSamples/sampleRate).toFixed(2)}s)`);
  const result = detectPitch(combinedBuffer, sampleRate);
  console.log(`Pitch detection result:`, result);

  return result;
}

// ======= State Transition Logic =======
function updateStateDetection(rms) {
  const now = performance.now();
  
  // Debounce state changes
  if (now - lastActivityChange < ACTIVITY_DEBOUNCE_MS) {
    return;
  }
  
  switch (currentState) {
    case STATE.WAITING:
      if (rms >= ACTIVITY_THRESHOLD) {
        // Start recording - reset everything
        clearAudioBuffer();
        setState(STATE.LISTENING);
        lastActivityChange = now;
        activityStartTime = now;
      }
      break;
      
    case STATE.LISTENING:
      if (rms < ACTIVITY_FADE_THRESHOLD) {
        // Stop recording and start analysis/announcement
        setState(STATE.ANNOUNCING);
        lastActivityChange = now;
        activityEndTime = now;
      }
      break;

    case STATE.ANNOUNCING:
      // Don't change state during announcement
      break;
  }
}

// ======= Improved Pitch Detection (YIN Algorithm) =======
function yinPitchDetection(buf, sampleRate) {
  const SIZE = buf.length;
  
  // Compute RMS for silence detection
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / SIZE);
  
  if (rms < MIN_CONFIDENCE_RMS) return { hz: -1, rms };

  // Apply Hanning window to reduce spectral leakage
  const windowed = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    windowed[i] = buf[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (SIZE - 1)));
  }

  // YIN algorithm implementation
  const MAX_TAU = Math.floor(sampleRate / HZ_MIN);
  const MIN_TAU = Math.floor(sampleRate / HZ_MAX);
  
  // Difference function
  const diff = new Float32Array(MAX_TAU);
  for (let tau = 0; tau < MAX_TAU; tau++) {
    let sum = 0;
    for (let j = 0; j < SIZE - tau; j++) {
      const delta = windowed[j] - windowed[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference function
  const cmndf = new Float32Array(MAX_TAU);
  cmndf[0] = 1;
  let runningSum = 0;
  
  for (let tau = 1; tau < MAX_TAU; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] * tau / runningSum;
  }

  // Find first local minimum below threshold
  const THRESHOLD = 0.1;
  let tau = MIN_TAU;
  while (tau < MAX_TAU - 1) {
    if (cmndf[tau] < THRESHOLD) {
      // Found candidate, refine with parabolic interpolation
      while (tau + 1 < MAX_TAU - 1 && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      
      // Parabolic interpolation for better accuracy
      const x0 = tau - 1;
      const x1 = tau;
      const x2 = tau + 1;
      const y0 = cmndf[x0];
      const y1 = cmndf[x1];
      const y2 = cmndf[x2];
      
      if (y0 === undefined || y2 === undefined) break;
      
      const denom = 2 * (y0 - 2 * y1 + y2);
      if (Math.abs(denom) < 1e-10) break;
      
      const peak = x1 + (y0 - y2) / denom;
      const freq = sampleRate / peak;
      
      // Validate frequency range
      if (freq >= HZ_MIN && freq <= HZ_MAX) {
        return { hz: freq, rms };
      }
      break;
    }
    tau++;
  }

  return { hz: -1, rms };
}

// ======= Fallback to FFT-based detection =======
function fftPitchDetection(buf, sampleRate) {
  const SIZE = buf.length;
  
  // Compute RMS
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / SIZE);
  
  if (rms < MIN_CONFIDENCE_RMS) return { hz: -1, rms };

  // Apply window function
  const windowed = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    windowed[i] = buf[i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (SIZE - 1))); // Hamming
  }

  // Simple FFT magnitude calculation
  const magnitudes = new Float32Array(SIZE / 2);
  for (let k = 0; k < SIZE / 2; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < SIZE; n++) {
      const angle = 2 * Math.PI * k * n / SIZE;
      real += windowed[n] * Math.cos(angle);
      imag -= windowed[n] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag);
  }

  // Find peak in frequency range
  const minBin = Math.floor(HZ_MIN * SIZE / sampleRate);
  const maxBin = Math.floor(HZ_MAX * SIZE / sampleRate);
  
  let maxMagnitude = 0;
  let peakBin = -1;
  
  for (let k = minBin; k <= maxBin; k++) {
    if (magnitudes[k] > maxMagnitude) {
      maxMagnitude = magnitudes[k];
      peakBin = k;
    }
  }

  if (peakBin === -1 || maxMagnitude < 0.01) return { hz: -1, rms };

  // Convert bin to frequency
  const freq = peakBin * sampleRate / SIZE;
  return { hz: freq, rms };
}

// ======= Tuner Arm Visualization =======
function updateTunerArm(cents) {
  // Map cents to rotation angle (-50 to +50 cents maps to -45 to +45 degrees)
  const maxCents = 50;
  const maxAngle = 45; // degrees
  
  // Clamp cents to reasonable range
  const clampedCents = Math.max(-maxCents, Math.min(maxCents, cents));
  
  // Calculate rotation angle
  const angle = (clampedCents / maxCents) * maxAngle;
  
  // Update tuner arm rotation
  $tunerArm.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
  
  // Change color based on tuning accuracy
  if (Math.abs(cents) < 5) {
    $tunerArm.style.background = '#4CAF50'; // Green for in tune
  } else if (cents > 0) {
    $tunerArm.style.background = '#FF5722'; // Orange for sharp
  } else {
    $tunerArm.style.background = '#2196F3'; // Blue for flat
  }
}

// ======= Main pitch detection function =======
function detectPitch(buf, sampleRate) {
  // Try YIN algorithm first (more accurate for musical pitches)
  let result = yinPitchDetection(buf, sampleRate);
  
  // Fall back to FFT if YIN fails
  if (result.hz <= 0) {
    result = fftPitchDetection(buf, sampleRate);
  }
  
  return result;
}

// ======= Main loop =======
async function start() {
  if (running) { stopEverything(); return; }
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    micSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = ANALYSIS_BUFFER_SIZE;
    micSource.connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    running = true;
    $toggle.textContent = 'Stop Tuner';
    $toggle.setAttribute('aria-pressed', 'true');

    let lastNote = '';
    let lastStablePitch = null;
    let lastStableRMS = 0;
    let analysisResult = null;
    let hasAnalyzed = false;

    function tick() {
      if (!running) return;
      analyser.getFloatTimeDomainData(buf);
      const { hz, rms } = detectPitch(buf, audioCtx.sampleRate);

      // Update state detection based on audio activity
      updateStateDetection(rms);
      
      // Handle different states
      switch (currentState) {
        case STATE.WAITING:
          // Show waiting state
          $note.textContent = '—';
          $freq.textContent = '—';
          $cents.textContent = '—';
          $rms.textContent = rms.toFixed(3);
          updateTunerArm(0); // Reset tuner arm to center
          break;
          
        case STATE.LISTENING:
          // Record audio but don't show analysis
          // Reset analysis result at the start of listening
          if (analysisResult !== null) {
            analysisResult = null;
          }
          addToAudioBuffer(buf);
          $note.textContent = 'Recording...';
          $freq.textContent = '—';
          $cents.textContent = '—';
          $rms.textContent = rms.toFixed(3);
          updateTunerArm(0); // Reset tuner arm to center
          break;

        case STATE.ANNOUNCING:
          // Analyze recorded audio once, then show results and announce
          if (!analysisResult) {
            analysisResult = analyzeRecordedAudio();

            if (analysisResult && analysisResult.hz > 0) {
              const d = freqToNoteData(analysisResult.hz);
              const rn = readableNote(d);
              const cents = d.cents;
              const tuningStatus = getTuningStatus(cents);

              // Always announce
              const fullAnnouncement = `${rn} ${tuningStatus}`;
              announce(fullAnnouncement);
              lastSpokenNote = rn;
              lastNote = rn;
              lastTuningStatus = tuningStatus;
            }
          }

          // Display results (whether or not we're speaking)
          if (analysisResult && analysisResult.hz > 0) {
            const d = freqToNoteData(analysisResult.hz);
            $note.textContent = `${d.noteName}${d.octave}`;
            $freq.textContent = analysisResult.hz.toFixed(2);
            $cents.textContent = `${d.cents >= 0 ? '+' : ''}${d.cents.toFixed(1)}`;
            $rms.textContent = analysisResult.rms.toFixed(3);
            updateTunerArm(d.cents);
          } else {
            $note.textContent = 'No pitch detected';
            $freq.textContent = '—';
            $cents.textContent = '—';
            $rms.textContent = analysisResult ? analysisResult.rms.toFixed(3) : rms.toFixed(3);
            updateTunerArm(0);
          }

          // Return to waiting when done speaking (or immediately if not speaking)
          if (!isSpeaking) {
            analysisResult = null; // Reset for next cycle
            setState(STATE.WAITING);
          }
          break;
      }
      
      requestAnimationFrame(tick);
    }
    tick();
  } catch (err) {
    console.error(err);
    alert('Microphone access failed or AudioContext error. Please allow mic access and try again.');
    stopEverything();
  }
}

// ======= UI wiring =======
$toggle.addEventListener('click', start);
$speakToggle.addEventListener('change', (e) => {
  speechOn = e.target.checked;
  $speakToggle.setAttribute('aria-checked', String(speechOn));
  if (!speechOn && 'speechSynthesis' in window) window.speechSynthesis.cancel();
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); start(); }
  if (e.key.toLowerCase() === 'v') { $speakToggle.click(); }
});

// Politely resume AudioContext on user gesture (iOS)
document.addEventListener('touchend', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, { passive: true });
