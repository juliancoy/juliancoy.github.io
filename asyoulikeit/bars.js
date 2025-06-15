document.addEventListener("DOMContentLoaded", () => {
    // Check if screen is mobile (less than 768px wide)
    if (window.innerWidth <= 768) return;
    
    const overlay = document.createElement("div");
    overlay.className = "speaker-overlay";
    document.body.appendChild(overlay);
  
    const speakerColorMap = {};
    const palette = [
      "#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
      "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe",
      "#008080", "#e6beff", "#9a6324", "#800000", "#808000"
    ];
  
    function getColorForSpeaker(name) {
      if (!speakerColorMap[name]) {
        speakerColorMap[name] = palette[Object.keys(speakerColorMap).length % palette.length];
      }
      return speakerColorMap[name];
    }
  
    // Process each scene (content block)
    const scenes = document.querySelectorAll(".content");
    scenes.forEach(scene => {
      const paragraphs = scene.querySelectorAll(".paragraph");
      let currentSpeaker = null;
      const speakerSections = [];
      let startIdx = 0;
  
      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].innerText.trim();
        let speaker = null;
  
        const speakerMatch = text.match(/^([A-Z][A-Z\s\-']+):/);
        if (speakerMatch) {
          speaker = speakerMatch[1].trim();
        } else if (text === text.toUpperCase() && text.split(/\s+/).length <= 4 && text.length > 0) {
          speaker = text;
        } else {
          speaker = currentSpeaker;
        }
  
        if (speaker !== currentSpeaker) {
          if (currentSpeaker) {
            speakerSections.push({ speaker: currentSpeaker, start: startIdx, end: i - 1 });
          }
          currentSpeaker = speaker;
          startIdx = i;
        }
      }
  
      if (currentSpeaker) {
        speakerSections.push({ speaker: currentSpeaker, start: startIdx, end: paragraphs.length - 1 });
      }
  
      // Get scene boundaries
      const sceneRect = scene.getBoundingClientRect();
      const sceneTop = window.scrollY + sceneRect.top;
      const sceneHeight = sceneRect.height;
      
      // Get unique speakers in this scene
      const uniqueSpeakers = [...new Set(speakerSections.map(s => s.speaker).filter(s => s))];
      
      if (uniqueSpeakers.length === 0) return;
      
      // Create container for this scene's speaker bars
      const sceneBarContainer = document.createElement("div");
      sceneBarContainer.className = "scene-speaker-bars";
      sceneBarContainer.style.top = `${sceneTop}px`;
      sceneBarContainer.style.height = `${sceneHeight}px`;
      
      // Calculate bar width
      const barWidth = 50;
      
      // Create bars for each unique speaker
      uniqueSpeakers.forEach(speaker => {
        const bar = document.createElement("div");
        bar.className = "speaker-bar";
        bar.style.backgroundColor = getColorForSpeaker(speaker);
        bar.style.width = `${barWidth}px`;
        
        // Create multiple name labels spaced every 300px
        const repeatInterval = 300; // px between repeats
        const repeatCount = Math.floor(sceneHeight / repeatInterval);
        
        for (let i = 0; i <= repeatCount; i++) {
          const nameLabel = document.createElement("div");
          nameLabel.className = "speaker-name";
          nameLabel.innerText = speaker;
          nameLabel.style.position = "absolute";
          nameLabel.style.top = `${i * repeatInterval}px`;
          nameLabel.style.left = "0";
          nameLabel.style.width = "100%";
          nameLabel.style.textAlign = "center";
          bar.appendChild(nameLabel);
        }
        
        sceneBarContainer.appendChild(bar);
      });
      
      overlay.appendChild(sceneBarContainer);
    });
});