// Universal Cookie Collector - Dashboard JavaScript
// Clean version without encoding issues

// State
let currentJobId = null;
let selectedType = 'netflix';
let pollInterval = null;
let allCookies = [];
let isAuthenticated = false;

// Type emoji map
const typeEmojis = {
    netflix: 'NF',
    hotstar: 'HS',
    prime: 'PR',
    crunchyroll: 'CR'
};

// ============== AUTHENTICATION FUNCTIONS ==============

async function checkAuthStatus() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        
        console.log('Auth status:', data);
        
        if (data.status === 'authenticated') {
            isAuthenticated = true;
            updateStatusBadge('authenticated');
            hideLoginModal();
            log('[OK] Telegram connected!', 'success');
        } else if (data.status === 'needs_auth' || data.status === 'idle') {
            isAuthenticated = false;
            showLoginModal();
            updateStatusBadge('idle');
            log('... Telegram login required', 'info');
        } else if (data.status === 'sent_code') {
            showCodeStep();
        }
    } catch (err) {
        console.error('Auth check error:', err);
        showLoginModal();
    }
}

function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if(modal) modal.style.display = 'flex';
    
    const stepPhone = document.getElementById('step-phone');
    if(stepPhone) stepPhone.style.display = 'block';
    
    const stepCode = document.getElementById('step-code');
    if(stepCode) stepCode.style.display = 'none';
    
    const stepSuccess = document.getElementById('step-success');
    if(stepSuccess) stepSuccess.style.display = 'none';
    
    const loginError = document.getElementById('login-error');
    if(loginError) loginError.style.display = 'none';
}

function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if(modal) modal.style.display = 'none';
}

function closeLoginModal() {
    hideLoginModal();
    log('Ready to collect cookies! Choose type and click Start.', 'success');
}

async function sendCode() {
    const phoneInput = document.getElementById('phone-input');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    
    if (!phone || phone.length < 10) {
        showLoginError('Please enter a valid phone number with country code');
        return;
    }
    
    try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '... Sending...';
        
        const res = await fetch('/api/auth/send-code?phone=' + encodeURIComponent(phone), {
            method: 'POST'
        });
        const data = await res.json();
        
        if (data.success) {
            showCodeStep();
            log('Code sent to ' + phone, 'success');
        } else {
            showLoginError(data.error || 'Failed to send code');
            btn.disabled = false;
            btn.innerHTML = 'Send Code';
        }
    } catch (err) {
        showLoginError('Network error. Try again.');
        console.error(err);
    }
}

function showCodeStep() {
    const stepPhone = document.getElementById('step-phone');
    if(stepPhone) stepPhone.style.display = 'none';
    
    const stepCode = document.getElementById('step-code');
    if(stepCode) stepCode.style.display = 'block';
    
    const loginError = document.getElementById('login-error');
    if(loginError) loginError.style.display = 'none';
}

async function verifyCode() {
    const codeInput = document.getElementById('code-input');
    const code = codeInput ? codeInput.value.trim() : '';
    
    if (!code || code.length < 4) {
        showLoginError('Please enter the verification code');
        return;
    }
    
    try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '... Verifying...';
        
        const res = await fetch('/api/auth/verify?code=' + encodeURIComponent(code), {
            method: 'POST'
        });
        const data = await res.json();
        
        if (data.success) {
            const stepCode = document.getElementById('step-code');
            if(stepCode) stepCode.style.display = 'none';
            
            const stepSuccess = document.getElementById('step-success');
            if(stepSuccess) stepSuccess.style.display = 'block';
            
            const userName = document.getElementById('user-name');
            if(userName) userName.textContent = 'Welcome, ' + (data.user || 'User') + '!';
            
            const loginError = document.getElementById('login-error');
            if(loginError) loginError.style.display = 'none';
            
            isAuthenticated = true;
            updateStatusBadge('authenticated');
            log('[OK] Logged in as ' + (data.user || 'User') + '!', 'success');
        } else {
            showLoginError(data.error || 'Verification failed');
            btn.disabled = false;
            btn.innerHTML = '[OK] Verify';
        }
    } catch (err) {
        showLoginError('Network error. Try again.');
        console.error(err);
    }
}

async function resendCode() {
    const phoneInput = document.getElementById('phone-input');
    const phone = phoneInput ? phoneInput.value : '';
    if (phone) {
        const stepPhone = document.getElementById('step-phone');
        if(stepPhone) stepPhone.style.display = 'block';
        
        const stepCode = document.getElementById('step-code');
        if(stepCode) stepCode.style.display = 'none';
        sendCode();
    }
}

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    if(el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}

// ============== UI FUNCTIONS ==============

function selectType(el) {
    const options = document.querySelectorAll('.type-option');
    options.forEach(function(opt) { opt.classList.remove('selected'); });
    el.classList.add('selected');
    selectedType = el.dataset.type;
    log('Selected: ' + (typeEmojis[selectedType] || '') + ' ' + selectedType.toUpperCase(), 'info');
}

function updateStatusBadge(status) {
    const el = document.getElementById('connection-status');
    if(!el) return;
    
    const statusMap = {
        'idle': { cls: 'status-idle', text: 'NOT CONNECTED' },
        'connecting': { cls: 'status-running', text: 'CONNECTING...' },
        'running': { cls: 'status-running', text: 'RUNNING' },
        'completed': { cls: 'status-completed', text: 'COMPLETED' },
        'error': { cls: 'status-error', text: 'ERROR' },
        'authenticated': { cls: 'status-completed', text: '[OK] CONNECTED' },
        'stopped': { cls: 'status-idle', text: 'STOPPED' }
    };
    
    const s = statusMap[status] || statusMap['idle'];
    el.className = 'status-badge ' + s.cls;
    el.textContent = s.text;
}

async function startCollection() {
    if (!isAuthenticated) {
        showLoginModal();
        log('[!] Please login with Telegram first!', 'error');
        return;
    }
    
    const countInput = document.getElementById('cookie-count');
    const count = parseInt(countInput ? countInput.value : '10');
    
    if (!count || count < 1 || count > 500) {
        alert('Please enter a valid number (1-500)');
        return;
    }
    
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const progressContainer = document.getElementById('progress-container');
    const logArea = document.getElementById('log-area');
    
    if(startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '... Starting...';
    }
    if(stopBtn) stopBtn.style.display = 'block';
    if(progressContainer) progressContainer.classList.add('active');
    if(logArea) logArea.classList.add('active');
    
    log('Starting collection of ' + count + ' ' + selectedType + ' cookies...', 'info');
    
    try {
        const res = await fetch('/api/collect?cookie_type=' + selectedType + '&count=' + count, {
            method: 'POST'
        });
        const data = await res.json();
        
        if (data.success) {
            currentJobId = data.job_id;
            log('Job started: ' + data.job_id, 'success');
            pollInterval = setInterval(pollJobStatus, 2000);
        } else {
            throw new Error(data.error || 'Failed to start');
        }
    } catch (err) {
        log('Error: ' + err.message, 'error');
        resetUI();
    }
}

async function pollJobStatus() {
    if (!currentJobId) return;
    
    try {
        const res = await fetch('/api/job/' + currentJobId);
        const job = await res.json();
        
        const fill = document.getElementById('progress-fill');
        const text = document.getElementById('progress-text');
        if(fill) fill.style.width = job.progress + '%';
        if(text) text.textContent = job.collected_count + '/' + job.target_count + ' (' + Math.round(job.progress) + '%)';
        
        updateStatusBadge(job.status);
        
        if (job.cookies && job.cookies.length > 0) {
            allCookies = job.cookies;
            renderCookies();
            updateStats();
        }
        
        if (job.status === 'completed' || job.status === 'error' || job.status === 'stopped') {
            clearInterval(pollInterval);
            pollInterval = null;
            
            if (job.status === 'completed') {
                log('[OK] Complete! Collected ' + job.collected_count + ' cookies', 'success');
            } else if (job.status === 'error') {
                log('[X] Error: ' + (job.error || 'Unknown error'), 'error');
            } else {
                log('[||] Stopped at ' + job.collected_count + ' cookies', 'info');
            }
            
            resetUI();
        }
    } catch (err) {
        console.error('Poll error:', err);
    }
}

async function stopCollection() {
    if (!currentJobId) return;
    
    try {
        await fetch('/api/job/' + currentJobId + '/stop', { method: 'POST' });
        log('Stopping...', 'info');
    } catch (err) {
        console.error('Stop error:', err);
    }
}

function resetUI() {
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    if(startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '>> Start Collection';
    }
    if(stopBtn) stopBtn.style.display = 'none';
}

function renderCookies() {
    const container = document.getElementById('cookies-list');
    if(!container) return;
    
    if (!allCookies || allCookies.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">cookie</div><p>No cookies yet</p></div>';
        return;
    }
    
    let html = '';
    for(let i = 0; i < allCookies.length; i++) {
        const cookie = allCookies[i];
        html += '<div class="cookie-item ' + cookie.cookie_type + '">';
        html += '<div class="cookie-header">';
        html += '<span class="cookie-badge badge-' + cookie.cookie_type + '">' + (typeEmojis[cookie.cookie_type] || '') + ' ' + cookie.cookie_type.toUpperCase() + '</span>';
        html += '<span class="cookie-time">#' + (i + 1) + ' - ' + new Date(cookie.timestamp).toLocaleTimeString() + '</span>';
        html += '</div>';
        html += '<div class="cookie-data">' + escapeHtml(cookie.data) + '</div>';
        html += '<button class="copy-btn" onclick="copyCookie(' + i + ')">[clip] Copy This Cookie</button>';
        html += '</div>';
    }
    container.innerHTML = html;
}

async function updateStats() {
    try {
        const res = await fetch('/api/cookies');
        const data = await res.json();
        
        const totalEl = document.getElementById('total-cookies');
        if(totalEl) totalEl.textContent = data.total;
        
        const nfEl = document.getElementById('nf-count');
        if(nfEl) nfEl.textContent = data.cookies.filter(function(c) { return c.cookie_type === 'netflix'; }).length;
        
        const hsEl = document.getElementById('hs-count');
        if(hsEl) hsEl.textContent = data.cookies.filter(function(c) { return c.cookie_type === 'hotstar'; }).length;
        
        const prEl = document.getElementById('pr-count');
        if(prEl) prEl.textContent = data.cookies.filter(function(c) { return c.cookie_type === 'prime'; }).length;
        
        const crEl = document.getElementById('cr-count');
        if(crEl) crEl.textContent = data.cookies.filter(function(c) { return c.cookie_type === 'crunchyroll'; }).length;
    } catch (err) {
        console.error('Stats error:', err);
    }
}

async function copyCookie(index) {
    const cookie = allCookies[index];
    try {
        await navigator.clipboard.writeText(cookie.data);
        log('Copied cookie #' + (index + 1) + '!', 'success');
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = cookie.data;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        log('Copied cookie #' + (index + 1) + '!', 'success');
    }
}

async function copyAllCookies() {
    if (!allCookies || allCookies.length === 0) {
        alert('No cookies to copy!');
        return;
    }
    
    let allText = '';
    for(let i = 0; i < allCookies.length; i++) {
        const c = allCookies[i];
        allText += '### ' + (typeEmojis[c.cookie_type] || '') + ' ' + c.cookie_type.toUpperCase() + ' #' + (i+1) + ' ###\n' + c.data;
        if(i < allCookies.length - 1) allText += '\n\n---\n\n';
    }
    
    try {
        await navigator.clipboard.writeText(allText);
        log('Copied ' + allCookies.length + ' cookies to clipboard!', 'success');
        alert('[OK] Copied ' + allCookies.length + ' cookies!');
    } catch (err) {
        console.error('Copy error:', err);
    }
}

function exportJSON() {
    if (!allCookies || allCookies.length === 0) {
        alert('No cookies to export!');
        return;
    }
    
    const data = {
        export_time: new Date().toISOString(),
        total: allCookies.length,
        cookies: allCookies
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cookies-' + Date.now() + '.json';
    a.click();
    log('Exported to JSON!', 'success');
}

async function clearAll() {
    if (!confirm('Clear ALL cookies?')) return;
    
    try {
        await fetch('/api/cookies', { method: 'DELETE' });
        allCookies = [];
        renderCookies();
        updateStats();
        log('Cleared all cookies!', 'info');
    } catch (err) {
        console.error('Clear error:', err);
    }
}

function log(msg, type) {
    type = type || 'info';
    const area = document.getElementById('log-area');
    if(!area) return;
    
    const entry = document.createElement('div');
    entry.className = 'log-entry log-' + type;
    entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    area.appendChild(entry);
    area.scrollTop = area.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    updateStats();
    checkAuthStatus();
});
