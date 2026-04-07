// Telegram WebApp initialize
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Get user data
const user = tg.initDataUnsafe?.user;
const BOT_API_URL = 'https://eth-telegram-bot.up.railway.app'; // Bot project ka URL

// Constants
const DAILY_LIMIT = 5;
const REWARD_AMOUNT = 0.00005;
const MIN_WITHDRAWAL = 0.001;
const ETH_PRICE_USD = 2000;

// State
let userBalance = 0;
let todayClaims = 0;

// Load data from localStorage
function loadData() {
    const userId = user?.id;
    if (!userId) return;
    
    const savedBalance = localStorage.getItem(`balance_${userId}`);
    const savedDate = localStorage.getItem(`date_${userId}`);
    const savedClaims = localStorage.getItem(`claims_${userId}`);
    const today = new Date().toISOString().split('T')[0];
    
    if (savedDate === today) {
        todayClaims = parseInt(savedClaims) || 0;
        userBalance = parseFloat(savedBalance) || 0;
    } else {
        todayClaims = 0;
        userBalance = parseFloat(savedBalance) || 0;
        localStorage.setItem(`date_${userId}`, today);
        localStorage.setItem(`claims_${userId}`, '0');
    }
    
    renderUI();
}

function saveData() {
    const userId = user?.id;
    if (!userId) return;
    
    localStorage.setItem(`balance_${userId}`, userBalance);
    localStorage.setItem(`claims_${userId}`, todayClaims);
}

function renderUI() {
    const remaining = DAILY_LIMIT - todayClaims;
    const usdValue = userBalance * ETH_PRICE_USD;
    
    document.getElementById('app').innerHTML = `
        <div class="user-card">
            <div class="user-avatar">${user?.first_name?.charAt(0) || '👤'}</div>
            <div class="user-info">
                <h3>${user?.first_name || 'User'} ${user?.last_name || ''}</h3>
                <p>ID: ${user?.id || '-'}</p>
            </div>
        </div>
        
        <div class="balance-card">
            <div class="balance-label">💰 Your Balance</div>
            <div class="balance-amount">${userBalance.toFixed(8)} ETH</div>
            <div class="balance-usd">≈ $${usdValue.toFixed(2)} USD</div>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${todayClaims}</div>
                <div class="stat-label">Today's Claims</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${remaining}</div>
                <div class="stat-label">Remaining Today</div>
            </div>
        </div>
        
        <button class="ad-button" id="watchAdBtn" ${todayClaims >= DAILY_LIMIT ? 'disabled' : ''}>
            🎬 Watch Ad & Earn ${REWARD_AMOUNT} ETH
        </button>
        
        <button class="withdraw-btn" id="withdrawBtn">
            💸 Withdraw ETH (Min ${MIN_WITHDRAWAL} ETH)
        </button>
        
        <div class="info-text">
            ⚡ Daily limit: ${DAILY_LIMIT} ads | ${REWARD_AMOUNT} ETH per ad<br>
            💎 Min withdrawal: ${MIN_WITHDRAWAL} ETH
        </div>
        
        <div class="limit-warning" id="limitWarning" style="${todayClaims >= DAILY_LIMIT ? 'display:block' : 'display:none'}">
            ⚠️ You've reached today's limit! Come back tomorrow.
        </div>
    `;
    
    document.getElementById('watchAdBtn')?.addEventListener('click', showRewardedAd);
    document.getElementById('withdrawBtn')?.addEventListener('click', withdraw);
}

function scheduleNextNotification() {
    const nextTime = new Date();
    nextTime.setHours(nextTime.getHours() + 6);
    
    fetch(`${BOT_API_URL}/api/schedule-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: user?.id,
            notify_at: nextTime.toISOString()
        })
    }).catch(e => console.log('Schedule failed:', e));
}

function showRewardedAd() {
    if (todayClaims >= DAILY_LIMIT) {
        tg.showAlert('Daily limit reached! Come back tomorrow.');
        return;
    }
    
    // Monetag ad show
    if (typeof window.show_10819887 !== 'undefined') {
        window.show_10819887({
            onReward: () => {
                todayClaims++;
                userBalance += REWARD_AMOUNT;
                saveData();
                renderUI();
                tg.showAlert(`✅ You earned ${REWARD_AMOUNT} ETH!`);
                scheduleNextNotification();
            },
            onClose: () => {
                tg.showAlert('You need to watch the full ad to get reward!');
            }
        });
    } else {
        // Fallback for testing
        tg.showConfirm('⚠️ Ad SDK loading. Simulate ad watch?', (confirmed) => {
            if (confirmed) {
                todayClaims++;
                userBalance += REWARD_AMOUNT;
                saveData();
                renderUI();
                tg.showAlert(`✅ You earned ${REWARD_AMOUNT} ETH!`);
            }
        });
    }
}

function withdraw() {
    if (userBalance < MIN_WITHDRAWAL) {
        tg.showAlert(`❌ Minimum withdrawal is ${MIN_WITHDRAWAL} ETH\nYour balance: ${userBalance} ETH`);
        return;
    }
    
    tg.showPopup({
        title: 'Withdraw ETH',
        message: 'Enter your ETH wallet address (0x...)',
        buttons: [{ type: 'ok' }, { type: 'cancel' }]
    }, (buttonId) => {
        if (buttonId === 'ok') {
            tg.showPopup({
                title: 'Wallet Address',
                message: 'Type your 0x... address',
                type: 'prompt'
            }, (result) => {
                if (result?.startsWith('0x') && result.length === 42) {
                    const requests = JSON.parse(localStorage.getItem('withdrawals') || '[]');
                    requests.push({
                        user_id: user?.id,
                        amount: userBalance,
                        wallet: result,
                        date: new Date().toISOString()
                    });
                    localStorage.setItem('withdrawals', JSON.stringify(requests));
                    
                    userBalance = 0;
                    saveData();
                    renderUI();
                    
                    tg.showAlert(`✅ Withdrawal request submitted!\nAmount: ${userBalance} ETH\nWallet: ${result}`);
                } else {
                    tg.showAlert('Invalid ETH address! Must be 42 chars starting with 0x');
                }
            });
        }
    });
}

// Start the app
if (user) {
    loadData();
} else {
    document.getElementById('app').innerHTML = '<div class="loading">Please open from Telegram</div>';
}