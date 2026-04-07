/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ETH Reward Mini App — app.js
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// ── Constants ─────────────────────────────────────────────────────────────────
const REWARD_PER_AD     = 0.00005;   // ETH
const DAILY_AD_LIMIT    = 5;
const TIMER_SECONDS     = 15;
const MIN_WITHDRAW      = 0.001;     // ETH
const ETH_USD_PRICE     = 3500;      // Approximate (static fallback)
const BOT_API_URL       = 'https://eth-telegram-bot-4-j7vv.onrender.com'; // Update after deploy
const CIRCUMFERENCE     = 2 * Math.PI * 52; // svg circle r=52 → 326.73

// ── Telegram WebApp ───────────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

function haptic(type = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(type); } catch {}
}

function tgAlert(msg) {
  if (tg?.showAlert) tg.showAlert(msg);
  else showToast(msg);
}

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  balance:        0,
  adsToday:       0,
  lastResetDate:  null,
  savedAddress:   '',
  earnings:       [],
};

let adPlaying    = false;
let timerRunning = false;
let timerInterval = null;

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const profilePhoto    = document.getElementById('profilePhoto');
const profileInitials = document.getElementById('profileInitials');
const profileName     = document.getElementById('profileName');
const profileId       = document.getElementById('profileId');
const balanceEth      = document.getElementById('balanceEth');
const balanceUsd      = document.getElementById('balanceUsd');
const progressBar     = document.getElementById('progressBar');
const progressText    = document.getElementById('progressText');
const earnBtn         = document.getElementById('earnBtn');
const earnNote        = document.getElementById('earnNote');
const adStatusMsg     = document.getElementById('adStatusMsg');
const timerOverlay    = document.getElementById('timerOverlay');
const timerCount      = document.getElementById('timerCount');
const timerCircle     = document.getElementById('timerCircle');
const ethAddressInput = document.getElementById('ethAddressInput');
const pasteBtn        = document.getElementById('pasteBtn');
const saveAddressBtn  = document.getElementById('saveAddressBtn');
const withdrawBtn     = document.getElementById('withdrawBtn');
const withdrawMsg     = document.getElementById('withdrawMsg');
const earningsLog     = document.getElementById('earningsLog');
const toast           = document.getElementById('toast');

// ── SVG gradient for timer ────────────────────────────────────────────────────
(function injectSvgDefs() {
  const svg = timerCircle.closest('svg');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>`;
  svg.prepend(defs);
  timerCircle.setAttribute('stroke', 'url(#timerGrad)');
  timerCircle.style.strokeDasharray = CIRCUMFERENCE;
  timerCircle.style.strokeDashoffset = 0;
})();

// ── Persist State ─────────────────────────────────────────────────────────────
function loadState() {
  try {
    const saved = localStorage.getItem('ethRewardState');
    if (saved) {
      const parsed = JSON.parse(saved);
      const today  = getDateKey();

      // Reset daily count if new day
      if (parsed.lastResetDate !== today) {
        parsed.adsToday      = 0;
        parsed.lastResetDate = today;
      }
      state = { ...state, ...parsed };
    } else {
      state.lastResetDate = getDateKey();
      saveState();
    }
  } catch (e) {
    console.warn('[STATE LOAD]', e);
    state.lastResetDate = getDateKey();
  }
}

function saveState() {
  try {
    localStorage.setItem('ethRewardState', JSON.stringify(state));
  } catch (e) {
    console.warn('[STATE SAVE]', e);
  }
}

function getDateKey() {
  return new Date().toISOString().slice(0, 10); // "2025-01-01"
}

// ── Profile Setup ─────────────────────────────────────────────────────────────
function setupProfile() {
  const user = tg?.initDataUnsafe?.user;

  if (user) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Crypto User';
    profileName.textContent = name;
    profileId.textContent   = `ID: ${user.id}`;

    const initials = (name[0] || '?').toUpperCase();
    profileInitials.textContent = initials;

    if (user.photo_url) {
      profilePhoto.src = user.photo_url;
      profilePhoto.onload = () => {
        profilePhoto.classList.remove('hidden');
        profileInitials.classList.add('hidden');
      };
      profilePhoto.onerror = () => {
        profilePhoto.classList.add('hidden');
        profileInitials.classList.remove('hidden');
      };
    }

    // Schedule notification via bot
    scheduleNotificationViaBot(user.id, tg?.initDataUnsafe?.user?.id);
  } else {
    profileName.textContent = 'Guest User';
    profileId.textContent   = 'ID: ——';
    profileInitials.textContent = '👤';
  }
}

// ── UI Update ─────────────────────────────────────────────────────────────────
function updateUI() {
  // Balance
  balanceEth.textContent = state.balance.toFixed(5);
  balanceUsd.textContent = `≈ $${(state.balance * ETH_USD_PRICE).toFixed(2)} USD`;

  // Progress
  const pct = (state.adsToday / DAILY_AD_LIMIT) * 100;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${state.adsToday} / ${DAILY_AD_LIMIT}`;

  // Dots
  for (let i = 0; i < DAILY_AD_LIMIT; i++) {
    const dot = document.getElementById(`dot${i}`);
    if (dot) {
      dot.classList.toggle('active', i < state.adsToday);
    }
  }

  // Earn button state
  const limitReached = state.adsToday >= DAILY_AD_LIMIT;
  earnBtn.disabled = limitReached || timerRunning;

  if (limitReached) {
    earnNote.textContent = '✅ Aaj ke saare ads dekh liye! Kal wapas aao.';
  } else {
    const remaining = DAILY_AD_LIMIT - state.adsToday;
    earnNote.textContent = `⚡ ${remaining} ads baaki hain aaj ke liye`;
  }

  // Saved address
  if (state.savedAddress) {
    ethAddressInput.value = state.savedAddress;
  }

  // Earnings log
  renderEarningsLog();
}

// ── Earnings Log Render ───────────────────────────────────────────────────────
function renderEarningsLog() {
  if (!state.earnings.length) {
    earningsLog.innerHTML = '<div class="log-empty">Abhi tak koi earning nahi…</div>';
    return;
  }

  earningsLog.innerHTML = state.earnings
    .slice(-10)
    .reverse()
    .map(e => `
      <div class="log-item">
        <div class="log-item-left">
          <div class="log-dot"></div>
          <div>
            <div class="log-desc">Ad Reward</div>
            <div class="log-time">${e.time}</div>
          </div>
        </div>
        <div class="log-amount">+${REWARD_PER_AD.toFixed(5)} ETH</div>
      </div>`)
    .join('');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  void toast.offsetWidth; // force reflow
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, duration);
}

// ── Ad Status Message ─────────────────────────────────────────────────────────
function showAdStatus(msg) {
  adStatusMsg.textContent = msg;
  adStatusMsg.classList.remove('hidden');
  setTimeout(() => adStatusMsg.classList.add('hidden'), 4000);
}

// ── Timer System ──────────────────────────────────────────────────────────────
function startTimer(onComplete) {
  timerRunning = true;
  earnBtn.disabled = true;
  timerOverlay.classList.remove('hidden');

  let remaining = TIMER_SECONDS;
  timerCount.textContent = remaining;
  timerCircle.style.strokeDashoffset = 0;

  timerInterval = setInterval(() => {
    remaining--;
    timerCount.textContent = remaining;

    // Update SVG circle
    const offset = CIRCUMFERENCE * (1 - remaining / TIMER_SECONDS);
    timerCircle.style.strokeDashoffset = offset;

    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      timerRunning = false;
      timerOverlay.classList.add('hidden');
      onComplete();
    }
  }, 1000);
}

function cancelTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerRunning = false;
  timerOverlay.classList.add('hidden');
  earnBtn.disabled = (state.adsToday >= DAILY_AD_LIMIT);
}

// ── Monetag Ad ────────────────────────────────────────────────────────────────
function playAd() {
  if (adPlaying) {
    showAdStatus('⏳ Ek ad pehle se chal raha hai, ruko…');
    return;
  }

  if (state.adsToday >= DAILY_AD_LIMIT) {
    tgAlert('Aaj ki daily limit (5 ads) poori ho gayi! Kal wapas aao.');
    return;
  }

  haptic('medium');
  adPlaying = true;
  earnBtn.disabled = true;

  // Try Monetag SDK
  const sdkAvailable = typeof window['show_10819887'] === 'function';

  if (sdkAvailable) {
    try {
      window['show_10819887']({
        onReward: function () {
          // Ad fully watched — start timer
          adPlaying = false;
          startTimer(grantReward);
        },
        onClose: function () {
          // Ad closed before completion
          adPlaying = false;
          cancelTimer();
          haptic('light');
          showAdStatus('❌ Ad beech mein band kiya! Reward nahi milega.');
          earnBtn.disabled = (state.adsToday >= DAILY_AD_LIMIT);
        },
        onError: function (err) {
          console.warn('[AD ERROR]', err);
          adPlaying = false;
          // Fallback to direct timer
          startTimer(grantReward);
        }
      });
    } catch (err) {
      console.warn('[SDK CALL ERROR]', err);
      adPlaying = false;
      fallbackAd();
    }
  } else {
    // Fallback: SDK not loaded — simulate ad with timer
    fallbackAd();
  }
}

function fallbackAd() {
  // Simulate "ad watched" after a short delay, then run timer
  adPlaying = false;
  showToast('📺 Ad load ho raha hai…', 1500);
  setTimeout(() => {
    startTimer(grantReward);
  }, 1000);
}

// ── Grant Reward ──────────────────────────────────────────────────────────────
function grantReward() {
  haptic('heavy');

  state.balance  += REWARD_PER_AD;
  state.adsToday += 1;
  state.earnings.push({
    time:   new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    amount: REWARD_PER_AD
  });

  saveState();
  updateUI();

  showToast(`🎉 +${REWARD_PER_AD.toFixed(5)} ETH mila!`, 4000);

  // Schedule bot notification
  const user = tg?.initDataUnsafe?.user;
  if (user) scheduleNotificationViaBot(user.id, user.id);
}

// ── Schedule Notification via Bot ────────────────────────────────────────────
async function scheduleNotificationViaBot(userId, chatId) {
  try {
    await fetch(`${BOT_API_URL}/api/schedule-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:    String(userId),
        chatId:    String(chatId || userId),
        firstName: tg?.initDataUnsafe?.user?.first_name || ''
      })
    });
  } catch (e) {
    // Silently fail — non-critical
    console.warn('[NOTIFY SCHEDULE FAILED]', e.message);
  }
}

// ── Earn Button Click ─────────────────────────────────────────────────────────
earnBtn.addEventListener('click', () => {
  if (earnBtn.disabled) return;
  playAd();
});

// ── Paste Button ──────────────────────────────────────────────────────────────
pasteBtn.addEventListener('click', async () => {
  haptic('light');
  try {
    const text = await navigator.clipboard.readText();
    if (text.trim()) {
      ethAddressInput.value = text.trim();
      showToast('📋 Address paste kiya!');
    }
  } catch {
    showToast('Paste button dabao ya manually type karo');
  }
});

// ── Save Address ──────────────────────────────────────────────────────────────
saveAddressBtn.addEventListener('click', () => {
  haptic('light');
  const addr = ethAddressInput.value.trim();

  if (!addr) {
    showToast('⚠️ Pehle address enter karo');
    return;
  }

  if (!isValidEthAddress(addr)) {
    showToast('❌ Invalid ETH address! 0x se start hona chahiye');
    return;
  }

  state.savedAddress = addr;
  saveState();
  showToast('✅ Address save ho gaya!');
});

// ── Withdraw ──────────────────────────────────────────────────────────────────
withdrawBtn.addEventListener('click', () => {
  haptic('medium');

  const addr = ethAddressInput.value.trim();

  if (!addr) {
    showWithdrawMsg('⚠️ ETH address enter karo', 'error');
    return;
  }

  if (!isValidEthAddress(addr)) {
    showWithdrawMsg('❌ Invalid ETH address format!', 'error');
    return;
  }

  if (state.balance < MIN_WITHDRAW) {
    const needed = (MIN_WITHDRAW - state.balance).toFixed(5);
    showWithdrawMsg(
      `❌ Balance kam hai! Min. 0.001 ETH chahiye. Aur ${needed} ETH kamao.`,
      'error'
    );
    return;
  }

  // Show confirmation
  if (tg?.showPopup) {
    tg.showPopup({
      title: '🚀 Withdrawal Confirm',
      message: `${state.balance.toFixed(5)} ETH bheja jayega:\n${addr.slice(0, 10)}...${addr.slice(-8)}`,
      buttons: [
        { id: 'confirm', type: 'ok', text: 'Confirm' },
        { id: 'cancel', type: 'cancel', text: 'Cancel' }
      ]
    }, (buttonId) => {
      if (buttonId === 'confirm') processWithdrawal(addr);
    });
  } else {
    if (confirm(`${state.balance.toFixed(5)} ETH withdraw karna chahte ho?\n${addr}`)) {
      processWithdrawal(addr);
    }
  }
});

function processWithdrawal(addr) {
  haptic('heavy');

  // In real deployment, this would call a backend API with admin wallet
  const amount = state.balance.toFixed(5);
  state.balance = 0;
  saveState();
  updateUI();

  showWithdrawMsg(
    `✅ Withdrawal request submit! ${amount} ETH bheja jayega ${addr.slice(0,8)}...${addr.slice(-6)} pe 24-48 ghante mein.`,
    'success'
  );

  showToast('🚀 Withdrawal submitted!', 5000);
}

function showWithdrawMsg(msg, type) {
  withdrawMsg.textContent = msg;
  withdrawMsg.className   = `withdraw-msg ${type}`;
  withdrawMsg.classList.remove('hidden');
  setTimeout(() => withdrawMsg.classList.add('hidden'), 6000);
}

// ── ETH Address Validation ────────────────────────────────────────────────────
function isValidEthAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// ── Reset daily limit at midnight ────────────────────────────────────────────
function checkDailyReset() {
  const today = getDateKey();
  if (state.lastResetDate !== today) {
    state.adsToday      = 0;
    state.lastResetDate = today;
    saveState();
    updateUI();
    showToast('🌅 Naya din! 5 ads phir se available hain.');
  }
}

// Check every minute
setInterval(checkDailyReset, 60 * 1000);

// ── Visibility Change: cancel timer if tab hidden ────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden && timerRunning) {
    cancelTimer();
    showAdStatus('⚠️ App background mein gayi! Timer cancel ho gaya.');
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  loadState();
  setupProfile();
  updateUI();
  checkDailyReset();
}

init();
