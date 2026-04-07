// Telegram WebApp initialize
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Get user data
const user = tg.initDataUnsafe?.user;
const BOT_API_URL = 'https://eth-telegram-bot.onrender.com'; // Tumhara bot URL

// Constants
const DAILY_LIMIT = 5;
const REWARD_AMOUNT = 0.00005;
const MIN_WITHDRAWAL = 0.001;
const ETH_PRICE_USD = 2000;

// State
let userBalance = 0;
let todayClaims = 0;
let isAdWatching = false; // Prevent multiple ad clicks

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

// Give reward function
function giveReward() {
    if (todayClaims >= DAILY_LIMIT) {
        tg.showAlert('❌ Daily limit reached! Come back tomorrow.');
        return false;
    }
    
    todayClaims++;
    userBalance += REWARD_AMOUNT;
    saveData();
    renderUI();
    
    tg.showAlert(`✅ You earned ${REWARD_AMOUNT} ETH!\n💰 New Balance: ${userBalance.toFixed(8)} ETH`);
    scheduleNextNotification();
    
    // Haptic feedback
    tg.HapticFeedback.impactOccurred('medium');
    
    return true;
}

function showRewardedAd() {
    if (todayClaims >= DAILY_LIMIT) {
        tg.showAlert(`⚠️ Daily limit reached! You've claimed ${todayClaims}/${DAILY_LIMIT} ads today.`);
        return;
    }
    
    if (isAdWatching) {
        tg.showAlert('⏳ Please wait, ad is already playing...');
        return;
    }
    
    isAdWatching = true;
    
    // Try Monetag SDK first
    if (typeof window.show_10819887 !== 'undefined') {
        try {
            window.show_10819887({
                onReward: function() {
                    giveReward();
                    isAdWatching = false;
                },
                onClose: function() {
                    if (isAdWatching) {
                        tg.showAlert('⚠️ You closed the ad early. No reward given.');
                        isAdWatching = false;
                    }
                },
                onError: function() {
                    tg.showAlert('❌ Ad failed to load. Please try again.');
                    isAdWatching = false;
                }
            });
        } catch(e) {
            tg.showAlert('Ad error. Using fallback mode.');
            fallbackAd();
        }
    } else {
        // Fallback for testing (immediate reward)
        fallbackAd();
    }
}

function fallbackAd() {
    tg.showPopup({
        title: '📺 Watch Ad (Demo Mode)',
        message: 'Monetag SDK is loading.\n\nClick "Watch" to simulate ad and get reward instantly.',
        buttons: [
            { id: 'watch', type: 'default', text: '🎬 Watch & Get Reward' },
            { id: 'cancel', type: 'cancel', text: 'Cancel' }
        ]
    }, (buttonId) => {
        if (buttonId === 'watch') {
            giveReward();
        }
        isAdWatching = false;
    });
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

// Profile picture function
function getUserPhotoUrl() {
    if (!user) return null;
    
    // Telegram provides photo_url in initDataUnsafe.user
    if (user.photo_url) {
        return user.photo_url;
    }
    
    // Alternative: Use Telegram's default avatar API
    if (user.id) {
        return `https://telegram.org/img/tl_card_people_${Math.floor(Math.random() * 5) + 1}.jpg`;
    }
    
    return null;
}

// Withdrawal with paste support
function withdraw() {
    if (userBalance < MIN_WITHDRAWAL) {
        tg.showAlert(`❌ Minimum withdrawal is ${MIN_WITHDRAWAL} ETH\n\nYour balance: ${userBalance.toFixed(8)} ETH\n\nNeed: ${(MIN_WITHDRAWAL - userBalance).toFixed(8)} more ETH`);
        return;
    }
    
    tg.showPopup({
        title: '💸 Withdraw ETH',
        message: `Amount: ${userBalance.toFixed(8)} ETH\n\nPaste your ETH wallet address below:`,
        buttons: [{ id: 'ok', type: 'ok', text: 'Continue' }, { id: 'cancel', type: 'cancel' }]
    }, (buttonId) => {
        if (buttonId === 'ok') {
            tg.showPopup({
                title: '📝 Enter Wallet Address',
                message: 'Paste your ETH address (starts with 0x)',
                type: 'prompt'
            }, (result) => {
                if (result && result.startsWith('0x') && result.length === 42) {
                    // Save withdrawal request
                    const requests = JSON.parse(localStorage.getItem('withdrawals_${user?.id}') || '[]');
                    requests.push({
                        amount: userBalance,
                        wallet: result,
                        date: new Date().toISOString(),
                        status: 'pending'
                    });
                    localStorage.setItem(`withdrawals_${user?.id}`, JSON.stringify(requests));
                    
                    const withdrawnAmount = userBalance;
                    userBalance = 0;
                    saveData();
                    renderUI();
                    
                    tg.showAlert(`✅ Withdrawal request submitted!\n\n💰 Amount: ${withdrawnAmount.toFixed(8)} ETH\n🏦 Wallet: ${result.substring(0, 10)}...${result.substring(38)}\n⏳ Processed within 24 hours.`);
                    tg.HapticFeedback.notificationOccurred('success');
                } else {
                    tg.showAlert('❌ Invalid ETH address!\n\nMust start with 0x and be 42 characters long.\nExample: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
                }
            });
        }
    });
}

function renderUI() {
    const remaining = DAILY_LIMIT - todayClaims;
    const usdValue = userBalance * ETH_PRICE_USD;
    const photoUrl = getUserPhotoUrl();
    const progressPercent = (todayClaims / DAILY_LIMIT) * 100;
    
    document.getElementById('app').innerHTML = `
        <style>
            @keyframes slideIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
            @keyframes shimmer {
                0% { background-position: -1000px 0; }
                100% { background-position: 1000px 0; }
            }
            
            .animated { animation: slideIn 0.4s ease forwards; }
            .balance-update { animation: pulse 0.3s ease; }
            .progress-bar {
                width: 100%;
                height: 8px;
                background: rgba(255,255,255,0.2);
                border-radius: 10px;
                margin-top: 10px;
                overflow: hidden;
            }
            .progress-fill {
                width: ${progressPercent}%;
                height: 100%;
                background: linear-gradient(90deg, #f093fb, #f5576c);
                border-radius: 10px;
                transition: width 0.5s ease;
            }
            .copy-btn {
                background: rgba(102, 126, 234, 0.2);
                border: 1px solid #667eea;
                padding: 4px 8px;
                border-radius: 8px;
                font-size: 10px;
                cursor: pointer;
                margin-left: 8px;
            }
            .withdraw-section {
                margin-top: 20px;
                padding-top: 15px;
                border-top: 1px solid rgba(255,255,255,0.1);
            }
            .paste-area {
                background: var(--tg-theme-secondary-bg-color, #1e1e1e);
                border-radius: 12px;
                padding: 12px;
                margin-top: 10px;
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .paste-area input {
                flex: 1;
                background: transparent;
                border: none;
                color: white;
                font-size: 12px;
                font-family: monospace;
                outline: none;
            }
            .paste-area button {
                background: #667eea;
                border: none;
                padding: 6px 12px;
                border-radius: 8px;
                color: white;
                cursor: pointer;
            }
        </style>
        
        <div class="user-card animated">
            <div class="user-avatar">
                ${photoUrl ? `<img src="${photoUrl}" onerror="this.src='https://telegram.org/img/tl_card_people_1.jpg'">` : '👤'}
            </div>
            <div class="user-info">
                <h3>${user?.first_name || 'User'} ${user?.last_name || ''}</h3>
                <p>🆔 ${user?.id || '-'}</p>
            </div>
        </div>
        
        <div class="balance-card animated" style="animation-delay: 0.05s">
            <div class="balance-label">💰 Your Balance</div>
            <div class="balance-amount" id="balanceAmount">${userBalance.toFixed(8)} ETH</div>
            <div class="balance-usd">≈ $${usdValue.toFixed(2)} USD</div>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <div style="font-size: 11px; margin-top: 8px;">Daily: ${todayClaims}/${DAILY_LIMIT} ads</div>
        </div>
        
        <div class="stats animated" style="animation-delay: 0.1s">
            <div class="stat-card">
                <div class="stat-value">${todayClaims}</div>
                <div class="stat-label">Today's Claims</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${remaining}</div>
                <div class="stat-label">Remaining Today</div>
            </div>
        </div>
        
        <button class="ad-button animated" id="watchAdBtn" style="animation-delay: 0.15s" ${todayClaims >= DAILY_LIMIT ? 'disabled' : ''}>
            🎬 Watch Ad & Earn ${REWARD_AMOUNT} ETH
        </button>
        
        <div class="withdraw-section animated" style="animation-delay: 0.2s">
            <button class="withdraw-btn" id="withdrawBtn">
                💸 Withdraw ETH (Min ${MIN_WITHDRAWAL} ETH)
            </button>
            
            <div class="paste-area">
                <span>📋</span>
                <input type="text" id="walletInput" placeholder="Paste your ETH address here (0x...)" value="${localStorage.getItem(`saved_wallet_${user?.id}`) || ''}">
                <button id="saveWalletBtn">Save</button>
            </div>
        </div>
        
        <div class="info-text animated" style="animation-delay: 0.25s">
            ⚡ Daily limit: ${DAILY_LIMIT} ads | ${REWARD_AMOUNT} ETH per ad<br>
            💎 Min withdrawal: ${MIN_WITHDRAWAL} ETH (${Math.ceil(MIN_WITHDRAWAL / REWARD_AMOUNT)} ads)
        </div>
        
        <div class="limit-warning" id="limitWarning" style="${todayClaims >= DAILY_LIMIT ? 'display:block' : 'display:none'}; animation-delay: 0.3s">
            ⚠️ You've reached today's limit! Come back tomorrow.
        </div>
    `;
    
    // Event listeners
    document.getElementById('watchAdBtn')?.addEventListener('click', showRewardedAd);
    document.getElementById('withdrawBtn')?.addEventListener('click', withdraw);
    
    // Save wallet address on button click
    document.getElementById('saveWalletBtn')?.addEventListener('click', () => {
        const walletInput = document.getElementById('walletInput');
        const wallet = walletInput?.value.trim();
        if (wallet && wallet.startsWith('0x') && wallet.length === 42) {
            localStorage.setItem(`saved_wallet_${user?.id}`, wallet);
            tg.showAlert('✅ Wallet address saved!');
            tg.HapticFeedback.impactOccurred('light');
        } else if (wallet) {
            tg.showAlert('❌ Invalid ETH address! Must start with 0x and be 42 characters.');
        }
    });
    
    // Animate balance when it changes
    const balanceEl = document.getElementById('balanceAmount');
    if (balanceEl) {
        balanceEl.classList.add('balance-update');
        setTimeout(() => balanceEl.classList.remove('balance-update'), 300);
    }
}

// Start the app
if (user) {
    loadData();
} else {
    document.getElementById('app').innerHTML = '<div class="loading" style="text-align:center;padding:60px;">⚠️ Please open from Telegram</div>';
}