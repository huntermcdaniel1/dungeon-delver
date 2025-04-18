import * as THREE from "three";

// Global Variables
let health;
let maze = [];
const traps = [];
const coins = [];
let COIN_COUNT_RANGE, TRAP_COUNT_RANGE, MAZE_WIDTH, MAZE_HEIGHT;
let coinTiles, trapTiles, coinMeshes, trapMeshes;
let player, playerPos;
const floorTiles = [];
const TILE_SIZE = 32;
let collected = 0;
let isPaused = true;
let isMuted = false;
let camera, cameraWidth, cameraHeight;
let loader, tileTextures, playerTexture;
let sounds;

// Difficulty settings
const difficultySettings = {
  easy: {
    health: 4,
    coinCountRange: [2, 5],
    trapCountRange: [3, 6],
    mazeWidth: 15,
    mazeHeight: 15
  },
  medium: {
    health: 3,
    coinCountRange: [6, 9],
    trapCountRange: [7, 10],
    mazeWidth: 19,
    mazeHeight: 19
  },
  hard: {
    health: 2,
    coinCountRange: [10, 14],
    trapCountRange: [11, 15],
    mazeWidth: 23,
    mazeHeight: 23
  }
};

// HUD Elements
const heartEls = document.querySelector('#health');
const coinCountEl = document.getElementById('coin-count');
const muteEl = document.getElementById('mute-icon');

// Scene and Camera Properties
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game-container').appendChild(renderer.domElement);

// Import tile textures
loader = new THREE.TextureLoader();
tileTextures = {
  wall: new THREE.MeshBasicMaterial({ map: loader.load('./assets/pictures/dungeon_wall2_dark.png') }),
  floor: new THREE.MeshBasicMaterial({ map: loader.load('./assets/pictures/dungeon_floor3.png') }),
  coin: new THREE.MeshBasicMaterial({ map: loader.load('./assets/pictures/coin.png'), transparent: true}),
  trap: new THREE.MeshBasicMaterial({ map: loader.load('./assets/pictures/spikes.png'), transparent: true})
};

// Import sprite texture
playerTexture = loader.load('./assets/pictures/custom-knight-modified.png');
playerTexture.repeat.set(1 / 9, 1 / 4);  // 9 columns, 4 rows
playerTexture.wrapS = THREE.RepeatWrapping;
playerTexture.wrapT = THREE.RepeatWrapping;
let currentFrame = 0;
const totalFrames = 9;
let directionRow = 3;   // Start facing down
let animationInterval = null;
let animationFrame = 0;
let isAnimating = false;


// Import sound media
sounds = {
  coin: new Audio('./assets/audio/coin.mp3'),
  trap: new Audio('./assets/audio/trap.mp3'),
  gameOver: new Audio('./assets/audio/gameover-melody.mp3'),
  win: new Audio('./assets/audio/win-melody.mp3'),
  background: new Audio('./assets/audio/void.mp3')
};
sounds.coin.volume = 0.25;
sounds.trap.volume = 0.25;
sounds.gameOver.volume = 0.25;
sounds.win.volume = 0.25;
sounds.background.volume = 0.05; sounds.background.loop = true;

// Persist mute state on reload
isMuted = localStorage.getItem('mute') === 'true';
applyMuteState();


// Event Listeners
window.addEventListener('resize', onWindowResize);
document.getElementById('restart-button').addEventListener('click', () => location.reload());
document.getElementById('exit-button').addEventListener('click', () => location.reload());
document.addEventListener('keydown', movePlayer);
document.getElementById('mute-button').addEventListener('click', toggleMute);   // Toggle Mute on button click
document.getElementById('easy-button').addEventListener('click', function() { startGame('easy'); });      // Easy Difficulty
document.getElementById('medium-button').addEventListener('click', function() { startGame('medium'); });  // Medium Difficulty
document.getElementById('hard-button').addEventListener('click', function() { startGame('hard'); });      // Hard Difficulty
document.getElementById('help-button').addEventListener('click', function() {
  const link = document.createElement('a');
  link.href = './assets/user-guide.pdf';
  link.download = 'dungeon-delver-user-guide.pdf';
  link.click();
});

// Launches game with selected settings
function startGame(difficulty) {
  const settings = difficultySettings[difficulty];
  health = settings.health;
  MAZE_WIDTH = settings.mazeWidth;
  MAZE_HEIGHT = settings.mazeHeight;
  COIN_COUNT_RANGE = settings.coinCountRange;
  TRAP_COUNT_RANGE = settings.trapCountRange;

  initCamera();

  // Hide the title screen and show the game container
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';

  // Initialize health and other elements based on the selected difficulty
  initHealth();
  maze = generateMaze(MAZE_WIDTH, MAZE_HEIGHT);

  textureMaze();

  initCoinsAndTraps();
  generateCoins();
  generateTraps();

  generatePlayer();
  updatePlayerPos();

  sounds.background.play();
  isPaused = false;

  showObjective();

  animate();
}

function initCamera() {
  cameraWidth = MAZE_WIDTH * TILE_SIZE; // Default MAZE_WIDTH * TILE_SIZE
  cameraHeight = MAZE_HEIGHT * TILE_SIZE; // Default MAZE_HEIGHT * TILE_SIZE
  camera = new THREE.OrthographicCamera(
    -cameraWidth / 2, cameraWidth / 2,
    cameraHeight / 2, -cameraHeight / 2,
    0.1, 1000
  );
  camera.position.z = 10;
}

// Design maze layout using Recursive Backtracking
function generateMaze(width, height) {
  const maze = Array.from({ length: height }, () => Array(width).fill(1));

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Carve floor spaces into wall segments
  function carve(x, y) {
    maze[y][x] = 0;
    const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    for (const [dx, dy] of dirs) {
      const nx = x + dx * 2;
      const ny = y + dy * 2;
      if (ny > 0 && ny < height && nx > 0 && nx < width && maze[ny][nx] === 1) {
        maze[y + dy][x + dx] = 0;
        carve(nx, ny);
      } else if (ny > 0 && ny < height && nx > 0 && nx < width && maze[ny][nx] === 0 && Math.random() < 0.25) {
        // Create more branching paths to prevent player being surroundeed by trap spaces
        if (maze[y + dy][x + dx] === 1) {
          maze[y + dy][x + dx] = 0;
        }
      }
    }
  }

  carve(1, 1);
  return maze;
}
// Render textures for maze and record which spaces are floor tiles
function textureMaze() {
  const tileGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < MAZE_HEIGHT; y++) {
    for (let x = 0; x < MAZE_WIDTH; x++) {
      const tile = maze[y][x];
      const material = tile === 1 ? tileTextures.wall : tileTextures.floor;
      const mesh = new THREE.Mesh(tileGeometry, material);
      mesh.position.set(
        x * TILE_SIZE - cameraWidth / 2 + TILE_SIZE / 2,
        -(y * TILE_SIZE - cameraHeight / 2 + TILE_SIZE / 2),
        0
      );
      scene.add(mesh);

      // Store empty floor tiles (not including starting position)
      if (tile === 0 && !(x === 1 && y === 1)) {
        floorTiles.push([x, y]);
      }
    }
  }
}

// Generate random Coins and Traps within allowed range
function initCoinsAndTraps() {
  const totalCoins = Math.floor(Math.random() * (COIN_COUNT_RANGE[1] - COIN_COUNT_RANGE[0] + 1)) + COIN_COUNT_RANGE[0];
  const totalTraps = Math.floor(Math.random() * (TRAP_COUNT_RANGE[1] - TRAP_COUNT_RANGE[0] + 1)) + TRAP_COUNT_RANGE[0];
  coinTiles = getRandomTiles(floorTiles, totalCoins);
  trapTiles = getRandomTiles(floorTiles.filter(([x, y]) => !coinTiles.some(([cx, cy]) => cx === x && cy === y)), totalTraps);
  coins.push(...coinTiles);
  traps.push(...trapTiles);
}
// Randomizer for tile selection
function getRandomTiles(tileList, count) {
  const shuffled = [...tileList].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Generate Coin locations
function generateCoins() {
  const coinGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.6, TILE_SIZE * 0.6);
  coinMeshes = coins.map(([x, y]) => {
    const mesh = new THREE.Mesh(coinGeometry, tileTextures.coin);
    mesh.position.set(
      x * TILE_SIZE - cameraWidth / 2 + TILE_SIZE / 2,
      -(y * TILE_SIZE - cameraHeight / 2 + TILE_SIZE / 2),
      1
    );
    scene.add(mesh);
    return { mesh, x, y };
  });
}
// Generate Trap locations
function generateTraps() {
  const trapGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.8, TILE_SIZE * 0.8);
  trapMeshes = traps.map(([x, y]) => {
    const mesh = new THREE.Mesh(trapGeometry, tileTextures.trap);
    mesh.position.set(
      x * TILE_SIZE - cameraWidth / 2 + TILE_SIZE / 2,
      -(y * TILE_SIZE - cameraHeight / 2 + TILE_SIZE / 2),
      1
    );
    scene.add(mesh);
    return { mesh, x, y };
  });
}
// Generate initial Player location
function generatePlayer() {
  // Generate Player Character
  const playerGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.8, TILE_SIZE * 0.8);
  const playerMaterial = new THREE.MeshBasicMaterial({ map: playerTexture, transparent: true });
  playerMaterial.map.offset.set(0, 1 - directionRow / 4);
  player = new THREE.Mesh(playerGeometry, playerMaterial);
  scene.add(player);

  // Ensure Player cannot spawn on Coin or Trap tiles
  const safeTiles = floorTiles.filter(([x, y]) => {
    return  !coinTiles.some(([cx, cy]) => cx === x && cy === y) &&
            !trapTiles.some(([tx, ty]) => tx === x && ty === y);
  });
  const [startX, startY] = safeTiles[Math.floor(Math.random() * safeTiles.length)];
  playerPos = { x: startX, y: startY };
}

function startWalkAnimation(row) {
  if (isAnimating) return;

  isAnimating = true;
  animationFrame = 0;
  directionRow = row;

  animationInterval = setInterval(() => {
    animationFrame = (animationFrame + 1) % totalFrames;
    player.material.map.offset.x = animationFrame / totalFrames;
    player.material.map.offset.y = 1 - directionRow / 4;
  }, 80); // adjust speed (80ms per frame)

  // Stop animation after a short burst (e.g. 7 frames = 560ms)
  setTimeout(() => {
    clearInterval(animationInterval);
    isAnimating = false;
  }, 250);
}
// Move Player Character
function updatePlayerPos() {
  player.position.set(
    playerPos.x * TILE_SIZE - cameraWidth / 2 + TILE_SIZE / 2,
    -(playerPos.y * TILE_SIZE - cameraHeight / 2 + TILE_SIZE / 2),
    2
  );
}
// Set Collisions for Player with Coins or Traps
function checkCollisions() {
  for (let i = 0; i < coinMeshes.length; i++) {
    const c = coinMeshes[i];
    if (c.x === playerPos.x && c.y === playerPos.y) {
      scene.remove(c.mesh);
      coinMeshes.splice(i, 1);
      collected++;
      sounds.coin.play();
      coinCountEl.textContent = collected;
      break;
    }
  }
  for (const t of trapMeshes) {
    if (t.x === playerPos.x && t.y === playerPos.y) {
      health--;
      sounds.trap.play();
      damageTaken();
      if (health <= 0) {
        requestAnimationFrame(() => { gameOver(); })
      }      
      break;
    }
  }
  if (coinMeshes.length === 0) {
    requestAnimationFrame(() => { gameWin(); })
  }
}
// Handle Player Movement based on keystroke
function movePlayer(e) {
  if (isPaused) return; // prevent movement when paused

  const dir = { x: 0, y: 0 };
  if (e.key === 'ArrowUp') { dir.y = -1; startWalkAnimation(1); }
  else if (e.key === 'ArrowDown') { dir.y = 1; startWalkAnimation(3); }
  else if (e.key === 'ArrowLeft') { dir.x = -1; startWalkAnimation(2); }
  else if (e.key === 'ArrowRight') { dir.x = 1; startWalkAnimation(0); }

  const newX = playerPos.x + dir.x;
  const newY = playerPos.y + dir.y;
  if (maze[newY] && maze[newY][newX] === 0) {
    playerPos = { x: newX, y: newY };
    updatePlayerPos();
    checkCollisions();

    // Update animation frame
    currentFrame = (currentFrame + 1) % totalFrames;
    player.material.map.offset.x = currentFrame / totalFrames;
    player.material.map.offset.y = 1 - directionRow / 4;
  }
};

// Define Notifications Behavior
function showMessage(text, duration = 1000) {
  const msgEl = document.getElementById('center-message');
  msgEl.textContent = text;
  msgEl.style.opacity = '1';

  if (duration && duration > 0) {
    setTimeout(() => {
      msgEl.style.opacity = '0';
    }, duration);
  }
}
// Show and fade objective text
function showObjective() {
  const objectiveText = document.getElementById('objective');
  objectiveText.style.opacity = '1';  // Show the objective text

  setTimeout(() => { objectiveText.style.opacity = '0'; }, 5000);   // 5 seconds
}
// Define Game Over and Win Notifications
function showFinalMessage(text) {
  isPaused = true;
  const container = document.getElementById('center-final-container');
  const msgEl = document.getElementById('center-message-final');
  msgEl.textContent = text;
  container.style.display = 'block';
}
function gameOver() {
  sounds.background.pause();
  sounds.gameOver.play()
  showFinalMessage('Game Over!');
  document.getElementById('game-container').classList.add('blurred');
}
function gameWin() {
  sounds.background.pause();
  sounds.win.play()
  showFinalMessage('You win!');
  document.getElementById('game-container').classList.add('blurred');
}
// Player takes damage
function damageTaken() {
  const flash = document.getElementById('damage-flash');
  flash.style.opacity = '0.5';
  setTimeout(() => { flash.style.opacity = '0'; }, 200);
  updateHealth();
  if (health > 0) {
    showMessage(`You hit a trap! \nRemaining Health: ${health}`, 1000);
  }
  updateHealth();
}

// Initialize health based on difficulty
function initHealth() {
    heartEls.innerHTML = '';

    for (let i = 0; i < health; i++) { 
      const heartImg = document.createElement('img');
      heartImg.src = './assets/pictures/heart.png'; // Path to the heart image
      heartImg.classList.add('heart');
      heartEls.appendChild(heartImg);
  }
}
// Update heart icons based on health
function updateHealth() {
  const hearts = document.querySelectorAll('.heart');
  hearts.forEach((el, i) => {
      el.style.opacity = i < health ? '1' : '0.2';
  });
}

// Change mute state and store for later use
function toggleMute() {
  isMuted = !isMuted;
  localStorage.setItem('mute', isMuted ? 'true' : 'false');
  applyMuteState();
}
// Reapply mute state after restart
function applyMuteState() {  
  if (isMuted) {
    sounds.background.volume = 0;
    sounds.coin.volume = 0;
    sounds.trap.volume = 0;
    sounds.win.volume = 0;
    sounds.gameOver.volume = 0;
    muteEl.src = './assets/pictures/audio-muted.png';
  } else {
    sounds.background.volume = 0.05;
    sounds.coin.volume = 0.25;
    sounds.trap.volume = 0.25;
    sounds.win.volume = 0.25;
    sounds.gameOver.volume = 0.25;
    muteEl.src = './assets/pictures/audio-unmuted.png';
  }
}

// Handle window resizing
function onWindowResize() {
  const size = Math.min(window.innerWidth, window.innerHeight);

  renderer.setSize(size, size);

  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.left = '50%';
  renderer.domElement.style.top = '50%';
  renderer.domElement.style.transform = 'translate(-50%, -50%)';
}

function animate() {
  if (!isPaused) {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
}

onWindowResize();