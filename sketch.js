// Global Variables
let video;
let handPose;
let sineOsc, sawOsc;
let playing = false;
let hands = [];
let smoothedHands = [];
let particles = [];
let song;
let vol = 0;
let background_ctx;

const FINGERTIP_INDICES = [4, 8, 12, 16, 20];
let COLOR_RANGES = []; // Will be initialized in setup()


class Particle {
  constructor(x, y, speed) {
    this.position = createVector(x, y);
    this.velocity = p5.Vector.random2D().mult(random(speed * 2, speed * 10));
    this.acceleration = createVector(0, 0);
    this.lifespan = 255;
    this.size = random(4, 15);
    this.color = this.assignColor(y);
  }

  // assigning Color Based on Y Position with Randomness
  assignColor(y) {
    for (let range of COLOR_RANGES) {
      if (y >= range.minY && y < range.maxY) {
        const [r, g, b] = range.baseColor.map(c => constrain(c + random(-20, 20), 0, 255));
        return color(r, g, b);
      }
    }
    // default white if Y is out of range
    return color(255, 255, 255);
  }


  applyForce(force) {
    this.acceleration.add(force);
  }

  attract(target) {
    let attraction = p5.Vector.sub(target, this.position); 
    let distance = attraction.mag(); 
    distance = constrain(distance, 5, 200);
    attraction.normalize(); 
    let strength = map(distance, 5, 200, 0.02, 0.1); 
    attraction.mult(strength); 
    this.applyForce(attraction); 
  }

  
  update() {
    this.velocity.add(this.acceleration);
    this.position.add(this.velocity);
    this.acceleration.mult(0);
    this.lifespan -= 2;
    this.size = lerp(this.size, 0, 0.02);
  }

  
  display() {
    noStroke();
    fill(
      this.color.levels[0],
      this.color.levels[1],
      this.color.levels[2],
      this.lifespan
    );
    circle(this.position.x, this.position.y, this.size);
  }

  
  isDead() {
    return this.lifespan <= 0 || this.size <= 0;
  }
}

// preload song and ml5 model
function preload() {
  handPose = ml5.handPose();
  song = loadSound('pad.mp3');
}


function mousePressed() {
  if (playing) {
    stopOscillators();
  } else {
    startOscillators();
  }
}


function keyPressed() {
  if (key === 'r') {
    toggleSong();
  }
}


function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  
  noStroke();


  // init oscs
  sineOsc = new p5.Oscillator('sine');
  sawOsc = new p5.Oscillator('sawtooth');
  sineOsc.start();
  sawOsc.start();
  sineOsc.amp(0);
  sawOsc.amp(0);

  // video setup
  video = createCapture(VIDEO, { flipped: true });
  video.size(width, height);
  video.hide();
  handPose.detectStart(video, gotHands);

  // Create Background Canvas
  background_ctx = createGraphics(width, height);
  background_ctx.colorMode(HSB, 360, 100, 100);
  background_ctx.noStroke();

  // Initialize Color Ranges Based on Height
  initializeColorRanges();
}

// Initialize Color Ranges
function initializeColorRanges() {
  const fifth = height / 5;
  COLOR_RANGES = [
    { minY: 0, maxY: fifth, baseColor: [230, 200, 255] },
    { minY: fifth, maxY: fifth * 2, baseColor: [180, 200, 255] },
    { minY: fifth * 2, maxY: fifth * 3, baseColor: [190, 160, 220] },
    { minY: fifth * 3, maxY: fifth * 4, baseColor: [0, 120, 200] },
    { minY: fifth * 4, maxY: height, baseColor: [80, 60, 130] }
  ];
}

// Handle Detected Hands
function gotHands(results) {
  hands = results;
  if (smoothedHands.length !== hands.length) {
    smoothedHands = hands.map(hand =>
      hand.keypoints.map(keypoint => ({ x: keypoint.x, y: keypoint.y }))
    );
  }
}

// Draw Perlin Noise-Based Background
function drawBackground() {
  background_ctx.clear();
  background_ctx.strokeWeight(2);
  background_ctx.noFill();

  // Draw lines across the screen
  for (let y = 0; y < height + 40; y += 10) {
    background_ctx.beginShape();
    for (let x = 0; x < width; x += 8) {
      
      const noiseVal = noise(x * 0.006, y * vol * 0.010 + random(0.001, 0.01), frameCount  * 0.01);
      const offset = map(noiseVal, 0, 1, -50, 50);
      const hueVal = map(y, 0, height, 260, 300);
      


      background_ctx.stroke(hueVal, 80, hueVal*0.1);
      background_ctx.vertex(x, y + offset);
    }
    background_ctx.endShape();
  }
}

// Main Draw Loop
function draw() {
  background(20, 10, 40);

  // Mirror and Translate Canvas
  scale(-1.0, 1.0);
  translate(-width / 2, -height / 2);

  // Draw and Display Background
  drawBackground();
  image(background_ctx, 0, 0, width, height);

  // Process Each Detected Hand
  hands.forEach((hand, handIndex) => {
    const smoothedKeypoints = smoothedHands[handIndex];
    let amplitude = calculateAmplitude(smoothedKeypoints);

    smoothKeypoints(smoothedKeypoints, hand.keypoints);

    drawHandConnections(smoothedKeypoints);
  });

  // Control Volume and Oscillator Frequencies Based on Hand Positions
  if (hands.length > 1) {
    controlVolumeAndOscillators();
  }

  // Update and Draw Particles
  updateAndDrawParticles();

  push();
  scale(0.1, 0.1)
  image(video, 0, 0, width, height);
  //draw lines over video
  stroke(255);
  strokeWeight(1);
  for (let i = 0; i < 5; i ++) {
    line(0, i * height / 5, width, i * height / 5);
  }
  pop();
}

// Calculate Amplitude Based on Thumb and Index Finger Distance
function calculateAmplitude(smoothedKeypoints) {
  const thumb = smoothedKeypoints[4];
  const index = smoothedKeypoints[8];
  let amplitude = 1;

  if (thumb && index) {
    const distance = dist(thumb.x, thumb.y, index.x, index.y);
    amplitude = map(distance, 100, width / 1.5, 0, 3);
    amplitude = constrain(amplitude, 0, 3);
  }

  return amplitude;
}

// Smooth Keypoints for Smoother Motion
function smoothKeypoints(smoothedKeypoints, currentKeypoints) {
  currentKeypoints.forEach((keypoint, keypointIndex) => {
    if (keypoint) {
      smoothedKeypoints[keypointIndex].x = lerp(
        smoothedKeypoints[keypointIndex].x,
        keypoint.x,
        0.2
      );
      smoothedKeypoints[keypointIndex].y = lerp(
        smoothedKeypoints[keypointIndex].y,
        keypoint.y,
        0.2
      );
    }
  });
}

// Draw Connections Between Hand Keypoints
function drawHandConnections(smoothedKeypoints) {
  const connections = handPose.getConnections();
  connections.forEach(([pointAIndex, pointBIndex]) => {
    const pointA = smoothedKeypoints[pointAIndex];
    const pointB = smoothedKeypoints[pointBIndex];
    if (pointA && pointB) {
      stroke(255);
      strokeWeight(1);
      line(pointA.x, pointA.y, pointB.x, pointB.y);
    }
  });
}

// Control Volume and Oscillator Frequencies Based on Hand Positions
function controlVolumeAndOscillators() {
  const hand1 = smoothedHands[0];
  const hand2 = smoothedHands[1];

  const index1 = hand1[8];
  const thumb1 = hand1[4];
  const index2 = hand2[8];
  const thumb2 = hand2[4];

  if (index1 && thumb1 && index2 && thumb2) {
    const midX1 = (index1.x + thumb1.x) / 2;
    const midY1 = (index1.y + thumb1.y) / 2;
    const midX2 = (index2.x + thumb2.x) / 2;
    const midY2 = (index2.y + thumb2.y) / 2;

    // Calculate Distance Between Hands
    const distHands = Math.abs(midX2 - midX1);

    // Set Volume Based on Distance
    if (distHands < width / 8) {
      vol = 0;
    } else {
      vol = map(distHands, width / 8, width/5*4, 0, 1);
      vol = constrain(vol, 0, 1);
    }
    song.setVolume(vol);

    // Calculate Frequencies and Amplitudes
    const cScale = [130.81, 146.83, 164.81, 196.0, 220.0];
    const freqHand1 = cScale[floor(map(midY1, 0, height, cScale.length, 0))] || 130.81;
    let ampHand1 = map(dist(index1.x, index1.y, thumb1.x, thumb1.y), 100, 300, 0, 0.5);
    ampHand1 = constrain(ampHand1, 0, 0.5);

    const freqHand2 = cScale[floor(map(midY2, 0, height, cScale.length, 0))] || 130.81;
    let ampHand2 = map(dist(index2.x, index2.y, thumb2.x, thumb2.y), 100, 300, 0, 0.05);
    ampHand2 = constrain(ampHand2, 0, 0.05);

    // Set Oscillator Frequencies and Amplitudes
    sineOsc.freq(freqHand1, 0.1);
    sineOsc.amp(ampHand1, 0.1);

    sawOsc.freq(freqHand2 * 2, 0.1);
    sawOsc.amp(ampHand2, 0.1);

    // Emit Particles at Midpoints
    noStroke();   
    emitParticles(midX1, midY1, ampHand1 * 20, ampHand1);
    emitParticles(midX2, midY2, ampHand2 * 200, ampHand2 * 10);


  }
}


function emitParticles(x, y, amplitude, speed) {
  const numParticles = floor(amplitude);
  for (let i = 0; i < numParticles; i++) {
    particles.push(new Particle(
      x + random(-30, 20),
      y + random(-30, 30),
      speed
    ));
  }
}


function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];

    // Attract particle to each fingertip
    hands.forEach((hand, handIndex) => {
      if (smoothedHands[handIndex]) {
        FINGERTIP_INDICES.forEach(fingerTipIndex => {
          const fingertip = smoothedHands[handIndex][fingerTipIndex];
          if (fingertip) {
            const target = createVector(fingertip.x, fingertip.y);
            particle.attract(target);
          }
        });
      }
    });

    // Update and Display Particle
    particle.update();
    particle.display();

    // Remove Dead Particles
    if (particle.isDead()) {
      particles.splice(i, 1);
    }
  }
}

// Toggle Oscillators
function startOscillators() {
  sineOsc.start();
  sawOsc.start();
  playing = true;
}

function stopOscillators() {
  sineOsc.stop();
  sawOsc.stop();
  playing = false;
}

// Toggle Song Playback
function toggleSong() {
  if (song.isPlaying()) {
    song.stop();
  } else {
    song.play();
  }
}
