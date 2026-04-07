// ==================== INITIALIZATION ====================
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const user = tg.initDataUnsafe?.user;
const BOT_API_URL = 'https://eth-telegram-bot.onrender.com';

// ==================== CONSTANTS ====================
const DAILY_LIMIT = 5;
const REWARD_AMOUNT = 0.00005;
const MIN_WITHDRAWAL = 0.001;
const ETH_PRICE = 2000;
const AD_DURATION = 15;

// ==================== STATE ====================
let balance = 0;
let todayCount = 0;
let isWatching = false;
let currentTimer = null;

// ==================== DATA FUNCTIONS ====================
function loadData() {
    if (!user?.id) return;
    
    const savedBalance = localStorage.getItem(`eth_balance_${user.id}`);
    const savedDate = localStorage.getItem(`eth_date_${user.id}`);
    const savedCount = localStorage.getItem(`eth_count_${user.id}`);
    const today = new Date().toISOString().split('T')[0];
    
    if (savedDate === today) {
        todayCount = parseInt(savedCount) || 0;
        balance = parseFloat(savedBalance) || 0;
    } else {
        todayCount = 0;
        balance = parseFloat(savedBalance) || 0;
        localStorage.setItem(`eth_date_${user.id}`, today);
        localStorage.setItem(`eth_count_${user.id}`, '0');
    }
    
    render();
}

function saveData() {
    if (!user?.id) return;
    localStorage.setItem(`eth_balance_${user.id}`, balance);
    localStorage.setItem(`eth_count_${user.id}`, todayCount);
}

// ==================== REWARD FUNCTION ====================
function giveReward() {
    if (todayCount >= DAILY_LIMIT) {
        tg.showAlert(`❌ Daily limit reached! You've watched ${todayCount}/${DAILY_LIMIT} ads today.`);
        return false;
    }
    
    todayCount++;
    balance += REWARD_AMOUNT;
    saveData();
    render();
    
    tg.showAlert(`✅ You earned ${REWARD_AMOUNT} ETH!\n💰 New balance: ${balance.toFixed(8)} ETH`);
    tg.HapticFeedback.notificationOccurred('success');
    
    // Schedule notification for next reward (6 hours later)
    const nextTime = new Date();
    nextTime.setHours(nextTime.getHours() + 6);
    fetch(`${BOT_API_URL}/api/schedule-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, notify_at: nextTime.toISOString() })
    }).catch(e => console.log('Schedule error:', e));
    
    return true;
}

// ==================== TIMER FUNCTION ====================
function startTimer(callback) {
    let seconds = AD_DURATION;
    
    const timerHtml = `
        <div class="timer-box" id="timerBox">
            <div class="timer-label">🎬 Watching Ad</div>
            <div class="timer-seconds" id="timerSeconds">${seconds}</div>
            <div class="timer-label">Please wait... Don't close</div>
        </div>
    `;
    
    const watchBtn = document.getElementById('watchBtn');
    watchBtn.insertAdjacentHTML('afterend', timerHtml);
    watchBtn.disabled = true;
    
    currentTimer = setInterval(() => {
        seconds--;
        const timerEl = document.getElementById('timerSeconds');
        if (timerEl) timerEl.textContent = seconds;
        
        if (seconds <= 0) {
            clearInterval(currentTimer);
            currentTimer = null;
            document.getElementById('timerBox')?.remove();
            watchBtn.disabled = false;
            callback();
        }
    }, 1000);
}

function stopTimer() {
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
    }
    document.getElementById('timerBox')?.remove();
    const watchBtn = document.getElementById('watchBtn');
    if (watchBtn) watchBtn.disabled = false;
}

// ==================== AD FUNCTION ====================
function watchAd() {
    if (todayCount >= DAILY_LIMIT) {
        tg.showAlert(`⚠️ Daily limit reached! ${todayCount}/${DAILY_LIMIT} ads watched today.`);
        return;
    }
    
    if (isWatching) {
        tg.showAlert('⏳ Please wait! An ad is already playing.');
        return;
    }
    
    isWatching = true;
    
    tg.showPopup({
        title: '🎬 Watch Ad',
        message: `Watch a ${AD_DURATION} second ad to earn ${REWARD_AMOUNT} ETH\n\n⚠️ Closing early = NO REWARD!`,
        buttons: [
            { id: 'watch', type: 'default', text: '📺 Watch Now' },
            { id: 'cancel', type: 'cancel', text: 'Cancel' }
        ]
    }, (buttonId) => {
        if (buttonId !== 'watch') {
            isWatching = false;
            return;
        }
        
        if (typeof window.show_10819887 !== 'undefined') {
            try {
                window.show_10819887({
                    onReward: function() {
                        startTimer(function() {
                            giveReward();
                            isWatching = false;
                        });
                    },
                    onClose: function() {
                        stopTimer();
                        isWatching = false;
                        tg.showAlert('❌ Ad closed early! No reward given.');
                        tg.HapticFeedback.notificationOccurred('error');
                    },
                    onError: function() {
                        stopTimer();
                        isWatching = false;
                        tg.showAlert('❌ Failed to load ad. Please try again.');
                    }
                });
            } catch(e) {
                startTimer(function() {
                    giveReward();
                    isWatching = false;
                });
            }
        } else {
            startTimer(function() {
                giveReward();
                isWatching = false;
            });
        }
    });
}

// ==================== WITHDRAW FUNCTION ====================
function withdraw() {
    if (balance < MIN_WITHDRAWAL) {
        tg.showAlert(`❌ Minimum withdrawal: ${MIN_WITHDRAWAL} ETH\nYour balance: ${balance.toFixed(8)} ETH\nNeed: ${(MIN_WITHDRAWAL - balance).toFixed(8)} more ETH`);
        return;
    }
    
    tg.showPopup({
        title: '💸 Withdraw ETH',
        message: `Amount: ${balance.toFixed(8)} ETH\n\nEnter your ETH wallet address:`,
        buttons: [{ id: 'ok', type: 'ok', text: 'Continue' }, { id: 'cancel', type: 'cancel' }]
    }, (buttonId) => {
        if (buttonId === 'ok') {
            tg.showPopup({
                title: '📝 Wallet Address',
                message: 'Paste your ETH address (starts with 0x)',
                type: 'prompt'
            }, (result) => {
                if (result && result.startsWith('0x') && result.length === 42) {
                    const requests = JSON.parse(localStorage.getItem(`eth_withdrawals_${user?.id}`) || '[]');
                    requests.push({
                        amount: balance,
                        wallet: result,
                        date: new Date().toISOString(),
                        status: 'pending'
                    });
                    localStorage.setItem(`eth_withdrawals_${user?.id}`, JSON.stringify(requests));
                    
                    const withdrawnAmount = balance;
                    balance = 0;
                    saveData();
                    render();
                    
                    tg.showAlert(`✅ Withdrawal request submitted!\nAmount: ${withdrawnAmount.toFixed(8)} ETH\nWallet: ${result.substring(0, 10)}...${result.substring(38)}`);
                    tg.HapticFeedback.notificationOccurred('success');
                } else {
                    tg.showAlert('❌ Invalid ETH address!\nMust be 42 characters starting with 0x');
                }
            });
        }
    });
}

// ==================== SAVE WALLET ====================
function saveWallet() {
    const input = document.getElementById('walletInput');
    const wallet = input?.value.trim();
    if (wallet && wallet.startsWith('0x') && wallet.length === 42) {
        localStorage.setItem(`eth_wallet_${user?.id}`, wallet);
        tg.showAlert('✅ Wallet address saved!');
        tg.HapticFeedback.impactOccurred('light');
    } else if (wallet) {
        tg.showAlert('❌ Invalid ETH address!');
    }
}

// ==================== RENDER UI ====================
function render() {
    const remaining = DAILY_LIMIT - todayCount;
    const usdValue = balance * ETH_PRICE;
    const progressPercent = (todayCount / DAILY_LIMIT) * 100;
    const savedWallet = localStorage.getItem(`eth_wallet_${user?.id}`) || '';
    const photoUrl = user?.photo_url;
    
    document.getElementById('app').innerHTML = `
        <div class="user-card">
            <div class="avatar">
                ${photoUrl ? `<img src="${photoUrl}" onerror="this.innerHTML='👤'">` : '👤'}
            </div>
            <div>
                <div class="user-name">${user?.first_name || 'User'} ${user?.last_name || ''}</div>
                <div class="user-id">🆔 ${user?.id || '-'}</div>
            </div>
        </div>
        
        <div class="balance-card">
            <div class="balance-label">💰 YOUR BALANCE</div>
            <div class="balance-amount">${balance.toFixed(8)} ETH</div>
            <div class="balance-usd">≈ $${usdValue.toFixed(2)} USD</div>
            <div class="progress-section">
                <div class="progress-text">
                    <span>Daily Progress</span>
                    <span>${todayCount}/${DAILY_LIMIT}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
            </div>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${todayCount}</div>
                <div class="stat-label">Today's Claims</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${remaining}</div>
                <div class="stat-label">Remaining</div>
            </div>
        </div>
        
        <button class="btn-watch" id="watchBtn" ${todayCount >= DAILY_LIMIT ? 'disabled' : ''}>
            🎬 Watch Ad & Earn ${REWARD_AMOUNT} ETH
        </button>
        
        <button class="btn-withdraw" id="withdrawBtn">
            💸 Withdraw ETH (Min ${MIN_WITHDRAWAL} ETH)
        </button>
        
        <div class="wallet-area">
            <span>📋</span>
            <input type="text" id="walletInput" placeholder="Paste your ETH wallet address" value="${savedWallet}">
            <button id="saveWalletBtn">Save</button>
        </div>
        
        <div class="info">
            ⚡ ${DAILY_LIMIT} ads/day • ${REWARD_AMOUNT} ETH per ad<br>
            💎 Need ${Math.ceil(MIN_WITHDRAWAL / REWARD_AMOUNT)} ads to withdraw
        </div>
        
        <div class="warning" id="warningBox" style="${todayCount >= DAILY_LIMIT ? 'display:block' : 'display:none'}">
            ⚠️ Daily limit reached! Come back tomorrow.
        </div>
    `;
    
    document.getElementById('watchBtn')?.addEventListener('click', watchAd);
    document.getElementById('withdrawBtn')?.addEventListener('click', withdraw);
    document.getElementById('saveWalletBtn')?.addEventListener('click', saveWallet);
}

// ==================== START APP ====================
if (user) {
    loadData();
} else {
    document.getElementById('app').innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            ⚠️ Please open this app from Telegram
        </div>
    `;
}