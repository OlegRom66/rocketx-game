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

const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const boostBtn = document.getElementById('boostBtn');
const rocket = document.getElementById('rocket');

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

async function authUser() {
  if (!tg?.initData) {
    console.log("Запуск вне Telegram, локальный режим.");
    isLoaded = true;
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
      console.log("Прогресс успешно загружен:", data);
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
  if (!tg?.initData || !isLoaded || distanceBuffer <= 0) return;

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
  }
}

setInterval(() => {
  if (!isLoaded) return;

  const step = Math.round(currentSpeed / 10);
  score += step;
  distanceBuffer += step;
  if (scoreEl) scoreEl.innerText = score.toLocaleString() + ' км';
  updateButtons();
}, 100);

function activateBoost() {
  if (cooldownTimer > 0) return;
  tg?.HapticFeedback?.impactOccurred('heavy');

  currentSpeed = baseSpeed * 3;
  if (speedEl) speedEl.innerText = currentSpeed;
  if (rocket) rocket.classList.add('boosting');

  setTimeout(() => {
    currentSpeed = baseSpeed;
    if (speedEl) speedEl.innerText = currentSpeed;
    if (rocket) rocket.classList.remove('boosting');
  }, 1500);

  cooldownTimer = cooldownDuration;
  runCooldown();
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
  }
}

function updateButtons() {
  const btnEngine = document.getElementById('btn-engine');
  const btnCooldown = document.getElementById('btn-cooldown');
  if (btnEngine) btnEngine.disabled = score < engineCost;
  if (btnCooldown) btnCooldown.disabled = score < cooldownCost || cooldownDuration <= 2;
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

authUser().then(() => {
  setInterval(syncProgress, 3000);
});
