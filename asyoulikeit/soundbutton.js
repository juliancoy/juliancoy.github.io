// Sound button functionality for Shakespeare play annotations
// Handles play/pause toggle for sound effects

// Keep track of currently playing audio
let currentAudio = null;
let currentButton = null;

function toggleSound(button) {
    const soundFile = button.getAttribute('data-sound');

    if (!soundFile) {
        console.warn('No sound file specified for this button');
        return;
    }

    // If there's currently playing audio
    if (currentAudio && !currentAudio.paused) {
        // If it's the same button, stop the audio
        if (currentButton === button) {
            fadeOutAndStop(currentAudio, () => {
                button.classList.remove('playing');
                button.setAttribute('title', 'Click to play sound');
                currentAudio = null;
                currentButton = null;
            });
            return;

        } else {
            // Stop the currently playing audio and reset its button
            currentAudio.pause();
            currentAudio.currentTime = 0;
            if (currentButton) {
                currentButton.classList.remove('playing');
                currentButton.setAttribute('title', 'Click to play sound');
            }
        }
    }

    // Create new audio element
    const audio = new Audio(soundFile);

    // Set up event listeners
    audio.addEventListener('loadstart', function () {
        button.classList.add('loading');
        button.setAttribute('title', 'Loading...');
    });

    audio.addEventListener('canplay', function () {
        button.classList.remove('loading');
        button.classList.add('playing');
        button.setAttribute('title', 'Click to stop sound');
    });

    audio.addEventListener('ended', function () {
        button.classList.remove('playing');
        button.setAttribute('title', 'Click to play sound');
        currentAudio = null;
        currentButton = null;
    });

    audio.addEventListener('error', function (e) {
        button.classList.remove('loading', 'playing');
        button.setAttribute('title', 'Error loading sound file');
        console.error('Error loading audio file:', soundFile, e);
        currentAudio = null;
        currentButton = null;
    });

    // Start playing
    currentAudio = audio;
    currentButton = button;

    audio.play().catch(function (error) {
        console.error('Error playing audio:', error);
        button.classList.remove('loading', 'playing');
        button.setAttribute('title', 'Error playing sound');
        currentAudio = null;
        currentButton = null;
    });
}

// Initialize all sound buttons when the page loads
document.addEventListener('DOMContentLoaded', function () {
    const soundButtons = document.querySelectorAll('.sound_button[data-sound]');

    soundButtons.forEach(function (button) {
        button.setAttribute('title', 'Click to play sound');
        button.style.cursor = 'pointer';

        // Add keyboard support
        button.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleSound(button);
            }
        });

        // Make buttons focusable for accessibility
        if (!button.hasAttribute('tabindex')) {
            button.setAttribute('tabindex', '0');
        }
    });
});

// Stop all audio when the page is unloaded
window.addEventListener('beforeunload', function () {
    if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
    }
});

function fadeOutAndStop(audio, onComplete) {
    const fadeDuration = 1500; // milliseconds
    const steps = 10;
    const stepTime = fadeDuration / steps;
    let volume = audio.volume;

    const fadeInterval = setInterval(() => {
        volume -= 1 / steps;
        if (volume <= 0) {
            clearInterval(fadeInterval);
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 1; // reset volume
            if (typeof onComplete === 'function') onComplete();
        } else {
            audio.volume = volume;
        }
    }, stepTime);
}
