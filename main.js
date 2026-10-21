const API_URL = "https://genius-line.ru/api.php";

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.disableVerticalSwipes?.();
}

let score = 0;
let baseSpeed = 10;
let currentSpeed = baseSpeed;
let cooldownDuration = 5;
let cooldownTimer = 0;

let engineCost = 100;
let cooldownCost = 250;

let distanceBuffer = 0;
let isLoaded = false;
let isSyncing = false;

const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const boostBtn = document.getElementById('boostBtn');
const rocket = document.getElementById('rocket');
const rocketAura = document.getElementById('rocketAura');

// ==========================================
// ГРАФИЧЕСКИЙ ЭФФЕКТ СКОРОСТИ (CANVAS WARP)
// ==========================================
const canvas = document.getElementById('warpCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

let stars = [];
const STAR_COUNT = 90;
let warpMultiplier = 1;

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initStars() {
  stars = [];
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 1.8 + 0.8,
      speed: Math.random() * 2 + 1.2,
      opacity: Math.random() * 0.7 + 0.3
    });
  }
}
initStars();

function animateWarp() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isBoostActive = warpMultiplier > 1;

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const currentStarSpeed = s.speed * warpMultiplier;
    s.y += currentStarSpeed;

    if (s.y > canvas.height) {
      s.y = 0;
      s.x = Math.random() * canvas.width;
    }

    ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
    ctx.strokeStyle = `rgba(100, 225, 255, ${s.opacity * 0.8})`;

    if (isBoostActive) {
      // При форсаже точки вытягиваются в неоновые световые линии
      const tailLength = Math.min(60, currentStarSpeed * 5);
      ctx.lineWidth = s.size * 1.2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y - tailLength);
      ctx.stroke();
    } else {
      // В обычном режиме - круглые аккуратные звезды
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(animateWarp);
}
requestAnimationFrame(animateWarp);

// ==========================================
// ИГРОВАЯ ЭКОНОМИКА И ИНТЕРФЕЙС
// ==========================================
function recalculateCosts() {
  const engineLevels = Math.max(0, Math.round((baseSpeed - 10) / 10));
  engineCost = Math.round(100 * Math.pow(1.5, engineLevels));
  const btnEngine = document.getElementById('btn-engine');
  if (btnEngine) btnEngine.innerText = engineCost + ' км';

  const cooldownLevels = Math.max(0, Math.round((5 - cooldownDuration) / 0.5));
  cooldownCost = Math.round(250 * Math.pow(1.8, cooldownLevels));
  const btnCooldown = document.getElementById('btn-cooldown');
  if (btnCooldown) btnCooldown.innerText = cooldownCost + ' км';
}

function updateButtons() {
  const btnEngine = document.getElementById('btn-engine');
  const btnCooldown = document.getElementById('btn-cooldown');
  if (btnEngine) btnEngine.disabled = score < engineCost;
  if (btnCooldown) btnCooldown.disabled = score < cooldownCost || cooldownDuration <= 2;
}

// ==========================================
// АВТОРИЗАЦИЯ И СИНХРОНИЗАЦИЯ С БД
// ==========================================
async function authUser() {
  if (!tg?.initData) {
    console.log("Запуск вне Telegram или отсутствует initData");
    return;
  }

  try {
    const res = await fetch(`${API_URL}?action=auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        initData: tg.initData
      })
    });

    if (res.ok) {
      const data = await res.json();
      score = Number(data.distance) || 0;
      baseSpeed = Number(data.speed) || 10;
      currentSpeed = baseSpeed;
      cooldownDuration = 5 - (Number(data.cooldown_reduction) || 0.0);

      if (scoreEl) scoreEl.innerText = score.toLocaleString() + ' км';
      if (speedEl) speedEl.innerText = currentSpeed;

      recalculateCosts();
      updateButtons();
      console.log("Прогресс успешно синхронизирован с БД:", data);
    } else {
      const errText = await res.text();
      console.error("Ошибка авторизации:", res.status, errText);
    }
  } catch (err) {
    console.error("Сетевая ошибка при авторизации:", err);
  } finally {
    isLoaded = true;
  }
}

async function syncProgress() {
  if (!tg?.initData || distanceBuffer <= 0 || isSyncing) return;

  isSyncing = true;
  const toSend = distanceBuffer;
  distanceBuffer = 0;

  try {
    const res = await fetch(`${API_URL}?action=sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        initData: tg.initData,
        added_distance: toSend,
        speed: baseSpeed,
        cooldown_reduction: 5 - cooldownDuration
      })
    });

    if (!res.ok) {
      distanceBuffer += toSend;
    }
  } catch (err) {
    distanceBuffer += toSend;
  } finally {
    isSyncing = false;
  }
}

// Игровой цикл начисления километров (каждые 100мс)
setInterval(() => {
  const step = Math.round(currentSpeed / 10);
  score += step;
  distanceBuffer += step;
  if (scoreEl) scoreEl.innerText = score.toLocaleString() + ' км';
  updateButtons();
}, 100);

// ==========================================
// УПРАВЛЕНИЕ И УЛУЧШЕНИЯ
// ==========================================
function activateBoost() {
  if (cooldownTimer > 0) return;
  tg?.HapticFeedback?.impactOccurred('heavy');

  currentSpeed = baseSpeed * 3;
  warpMultiplier = 6; // Включаем вытягивание звёзд в лучи
  if (speedEl) speedEl.innerText = currentSpeed;
  if (rocket) rocket.classList.add('boosting');
  if (rocketAura) rocketAura.classList.add('boosting');

  setTimeout(() => {
    currentSpeed = baseSpeed;
    warpMultiplier = 1; // Возвращаем обычную скорость звезд
    if (speedEl) speedEl.innerText = currentSpeed;
    if (rocket) rocket.classList.remove('boosting');
    if (rocketAura) rocketAura.classList.remove('boosting');
  }, 1500);

  cooldownTimer = cooldownDuration;
  runCooldown();
  syncProgress();
}

function runCooldown() {
  if (!boostBtn) return;
  if (cooldownTimer > 0) {
    boostBtn.disabled = true;
    boostBtn.innerText = `ПЕРЕЗАРЯДКА (${cooldownTimer}s)`;
    cooldownTimer--;
    setTimeout(runCooldown, 1000);
  } else {
    boostBtn.disabled = false;
    boostBtn.innerText = 'ФОРСАЖ (x3)';
  }
}

function buyEngine() {
  if (score >= engineCost) {
    score -= engineCost;
    baseSpeed += 10;
    currentSpeed = baseSpeed;
    if (speedEl) speedEl.innerText = currentSpeed;
    engineCost = Math.round(engineCost * 1.5);
    const btnEngine = document.getElementById('btn-engine');
    if (btnEngine) btnEngine.innerText = engineCost + ' км';
    distanceBuffer -= engineCost;
    syncProgress();
  }
}

function buyCooldown() {
  if (score >= cooldownCost && cooldownDuration > 2) {
    score -= cooldownCost;
    cooldownDuration -= 0.5;
    cooldownCost = Math.round(cooldownCost * 1.8);
    const btnCooldown = document.getElementById('btn-cooldown');
    if (btnCooldown) btnCooldown.innerText = cooldownCost + ' км';
    distanceBuffer -= cooldownCost;
    syncProgress();
  }
}

function switchTab(screenId, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
}

function shareRefLink() {
  const myId = tg?.initDataUnsafe?.user?.id || 'demo';
  const refUrl = `https://t.me/rocketX_tap_bot/app?startapp=ref_${myId}`;
  const text = `Полетели на Луну со мной в RocketX! Лови +5,000 км бонуса на старте:`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${encodeURIComponent(text)}`;
  tg?.openTelegramLink ? tg.openTelegramLink(shareUrl) : window.open(shareUrl, '_blank');
}

// Запуск: игра стартует сразу, авторизация идет параллельно,
// а синхронизация пакетов в БД отправляется каждую 1 секунду.
authUser();
setInterval(syncProgress, 1000);
