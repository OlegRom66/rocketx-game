const API_URL = "https://holders-second-robertson-lunch.trycloudflare.com";

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

// Цены улучшений
let engineCost = 100;
let cooldownCost = 250;

// Буфер дистанции для отправки на бэкенд
let distanceBuffer = 0;

const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const boostBtn = document.getElementById('boostBtn');
const rocket = document.getElementById('rocket');

// Авторизация и загрузка прогресса из БД
async function authUser() {
  if (!tg?.initData) {
    console.log("Запуск вне Telegram, используем локальный режим.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": tg.initData
      }
    });

    if (res.ok) {
      const data = await res.json();
      score = data.distance || 0;
      baseSpeed = data.speed || 10;
      currentSpeed = baseSpeed;
      cooldownDuration = 5 - (data.cooldown_reduction || 0);

      scoreEl.innerText = score.toLocaleString() + ' км';
      speedEl.innerText = currentSpeed;
      updateButtons();
      console.log("Прогресс успешно загружен с сервера:", data);
    }
  } catch (err) {
    console.error("Ошибка при авторизации:", err);
  }
}

// Фоновая синхронизация с сервером
async function syncProgress() {
  if (!tg?.initData || distanceBuffer <= 0) return;

  const toSend = distanceBuffer;
  distanceBuffer = 0;

  try {
    const res = await fetch(`${API_URL}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": tg.initData
      },
      body: JSON.stringify({
        added_distance: toSend,
        speed: baseSpeed,
        cooldown_reduction: 5 - cooldownDuration
      })
    });

    if (!res.ok) {
      distanceBuffer += toSend; // Возвращаем в буфер при ошибке
    }
  } catch (err) {
    distanceBuffer += toSend;
  }
}

// Игровой цикл начисления дистанции (каждые 100 мс)
setInterval(() => {
  const step = Math.round(currentSpeed / 10);
  score += step;
  distanceBuffer += step;
  scoreEl.innerText = score.toLocaleString() + ' км';
  updateButtons();
}, 100);

// Синхронизация с сервером каждые 3 секунды
setInterval(syncProgress, 3000);

function activateBoost() {
  if (cooldownTimer > 0) return;
  tg?.HapticFeedback?.impactOccurred('heavy');

  currentSpeed = baseSpeed * 3;
  speedEl.innerText = currentSpeed;
  rocket.classList.add('boosting');

  setTimeout(() => {
    currentSpeed = baseSpeed;
    speedEl.innerText = currentSpeed;
    rocket.classList.remove('boosting');
  }, 1500);

  cooldownTimer = cooldownDuration;
  runCooldown();
}

function runCooldown() {
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
    speedEl.innerText = currentSpeed;
    engineCost = Math.round(engineCost * 1.5);
    document.getElementById('btn-engine').innerText = engineCost + ' км';
  }
}

function buyCooldown() {
  if (score >= cooldownCost && cooldownDuration > 2) {
    score -= cooldownCost;
    cooldownDuration -= 0.5;
    cooldownCost = Math.round(cooldownCost * 1.8);
    document.getElementById('btn-cooldown').innerText = cooldownCost + ' км';
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
  document.getElementById(screenId).classList.add('active');
  btn.classList.add('active');
}

function shareRefLink() {
  const myId = tg?.initDataUnsafe?.user?.id || 'demo';
  const refUrl = `https://t.me/rocketX_tap_bot/app?startapp=ref_${myId}`;
  const text = `Полетели на Луну со мной в RocketX! Лови +5,000 км бонуса на старте:`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${encodeURIComponent(text)}`;
  tg?.openTelegramLink ? tg.openTelegramLink(shareUrl) : window.open(shareUrl, '_blank');
}

// Запускаем авторизацию, а затем включаем синхронизацию
authUser().then(() => {
  setInterval(syncProgress, 3000);
});
