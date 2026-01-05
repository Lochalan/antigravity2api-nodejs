// Authentication: login, logout, OAuth

let authToken = localStorage.getItem('authToken');
let oauthPort = null;

const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs'
].join(' ');

// Wrapper for fetch, auto-handles 401
const authFetch = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (response.status === 401) {
        silentLogout();
        showToast('Session expired, please login again', 'warning');
        throw new Error('Unauthorized');
    }
    return response;
};

function showMainContent() {
    document.documentElement.classList.add('logged-in');
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
}

function silentLogout() {
    localStorage.removeItem('authToken');
    authToken = null;
    document.documentElement.classList.remove('logged-in');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
}

async function logout() {
    const confirmed = await showConfirm('Are you sure you want to logout?', 'Confirm Logout');
    if (!confirmed) return;
    
    silentLogout();
    showToast('Logged out', 'info');
}

function getOAuthUrl() {
    if (!oauthPort) oauthPort = Math.floor(Math.random() * 10000) + 50000;
    const redirectUri = `http://localhost:${oauthPort}/oauth-callback`;
    return `https://accounts.google.com/o/oauth2/v2/auth?` +
        `access_type=offline&client_id=${CLIENT_ID}&prompt=consent&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&` +
        `scope=${encodeURIComponent(SCOPES)}&state=${Date.now()}`;
}

function openOAuthWindow() {
    window.open(getOAuthUrl(), '_blank');
}

function copyOAuthUrl() {
    const url = getOAuthUrl();
    navigator.clipboard.writeText(url).then(() => {
        showToast('Authorization link copied', 'success');
    }).catch(() => {
        showToast('Copy failed', 'error');
    });
}

function showOAuthModal() {
    showToast('Please complete authorization in the new window', 'info');
    const modal = document.createElement('div');
    modal.className = 'modal form-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">🔐 OAuth Authorization</div>
            <div class="oauth-steps">
                <p><strong>📝 Authorization Steps:</strong></p>
                <p>1️⃣ Click the button below to open Google authorization page</p>
                <p>2️⃣ After authorization, copy the complete URL from browser address bar</p>
                <p>3️⃣ Paste the URL in the input box below and submit</p>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button type="button" onclick="openOAuthWindow()" class="btn btn-success" style="flex: 1;">🔐 Open Authorization</button>
                <button type="button" onclick="copyOAuthUrl()" class="btn btn-info" style="flex: 1;">📋 Copy Auth Link</button>
            </div>
            <input type="text" id="modalCallbackUrl" placeholder="Paste the complete callback URL (http://localhost:xxxxx/oauth-callback?code=...)">
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-success" onclick="processOAuthCallbackModal()">✅ Submit</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function processOAuthCallbackModal() {
    const modal = document.querySelector('.form-modal');
    const callbackUrl = document.getElementById('modalCallbackUrl').value.trim();
    if (!callbackUrl) {
        showToast('Please enter callback URL', 'warning');
        return;
    }
    
    showLoading('Processing authorization...');
    
    try {
        const url = new URL(callbackUrl);
        const code = url.searchParams.get('code');
        const port = new URL(url.origin).port || (url.protocol === 'https:' ? 443 : 80);
        
        if (!code) {
            hideLoading();
            showToast('Authorization code not found in URL', 'error');
            return;
        }
        
        const response = await authFetch('/admin/oauth/exchange', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ code, port })
        });
        
        const result = await response.json();
        if (result.success) {
            const account = result.data;
            const addResponse = await authFetch('/admin/tokens', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(account)
            });
            
            const addResult = await addResponse.json();
            hideLoading();
            if (addResult.success) {
                modal.remove();
                const message = result.fallbackMode 
                    ? 'Token added (account ineligible, using random ProjectId)' 
                    : 'Token added successfully';
                showToast(message, result.fallbackMode ? 'warning' : 'success');
                loadTokens();
            } else {
                showToast('Add failed: ' + addResult.message, 'error');
            }
        } else {
            hideLoading();
            showToast('Exchange failed: ' + result.message, 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Processing failed: ' + error.message, 'error');
    }
}
