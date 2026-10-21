// Адрес твоего PHP бэкенда на хостинге
const API_URL = "http://legacybjj.ru/api.php";

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
let isLoaded = false; // Блокировка начисления до завершения авторизации

const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const boostBtn = document.getElementById('boostBtn');
const rocket = document.getElementById('rocket');

// Пересчет цен магазинов под текущий уровень игрока
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

// Авторизация и загрузка прогресса из базы данных
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
        "Content-Type": "application/json",
        "Authorization": tg.initData
      }
    });

    if (res.ok) {
      const data = await res.json();
      score = Number(data.distance) || 0;
      baseSpeed = Number(data.speed) || 10;
      currentSpeed = baseSpeed;
      cooldownDuration = 5 - (Number(data.cooldown_reduction) || 0.0);

      scoreEl.innerText = score.toLocaleString() + ' км';
      speedEl.innerText = currentSpeed;

      recalculateCosts();
      updateButtons();
      console.log("Прогресс успешно загружен с сервера:", data);
    } else {
      console.error("Ошибка авторизации на сервере:", res.status);
    }
  } catch (err) {
    console.error("Сетевая ошибка при авторизации:", err);
  } finally {
    isLoaded = true;
  }
}

// Фоновая отправка набранной дистанции в базу данных
async function syncProgress() {
  if (!tg?.initData || !isLoaded || distanceBuffer <= 0) return;

  const toSend = distanceBuffer;
  distanceBuffer = 0;

  try {
    const res = await fetch(`${API_URL}?action=sync`, {
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
      distanceBuffer += toSend;
    }
  } catch (err) {
    distanceBuffer += toSend;
  }
}

// Игровой цикл начисления дистанции (работает только после загрузки данных)
setInterval(() => {
  if (!isLoaded) return;

  const step = Math.round(currentSpeed / 10);
  score += step;
  distanceBuffer += step;
  scoreEl.innerText = score.toLocaleString() + ' км';
  updateButtons();
}, 100);

function activateBoost() {
  if (cooldownTimer > 0) return;
