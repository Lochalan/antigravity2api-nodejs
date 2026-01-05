// Token Management: CRUD, Enable/Disable

let cachedTokens = [];
let currentFilter = localStorage.getItem('tokenFilter') || 'all'; // 'all', 'enabled', 'disabled'
let skipAnimation = false; // Skip animation flag

// Initialize filter state
function initFilterState() {
    const savedFilter = localStorage.getItem('tokenFilter') || 'all';
    currentFilter = savedFilter;
    updateFilterButtonState(savedFilter);
}

// Update filter button state
function updateFilterButtonState(filter) {
    document.querySelectorAll('.stat-item').forEach(item => {
        item.classList.remove('active');
    });
    const filterMap = { 'all': 'totalTokens', 'enabled': 'enabledTokens', 'disabled': 'disabledTokens' };
    const activeElement = document.getElementById(filterMap[filter]);
    if (activeElement) {
        activeElement.closest('.stat-item').classList.add('active');
    }
}

// Filter tokens
function filterTokens(filter) {
    currentFilter = filter;
    localStorage.setItem('tokenFilter', filter); // Persist filter state
    
    updateFilterButtonState(filter);
    
    // Re-render
    renderTokens(cachedTokens);
}

async function loadTokens() {
    try {
        const response = await authFetch('/admin/tokens', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            renderTokens(data.data);
        } else {
            showToast('Load failed: ' + (data.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showToast('Failed to load tokens: ' + error.message, 'error');
    }
}

// Set of tokens currently being refreshed
const refreshingTokens = new Set();

function renderTokens(tokens) {
    // Only update cache on initial load
    if (tokens !== cachedTokens) {
        cachedTokens = tokens;
    }
    
    document.getElementById('totalTokens').textContent = tokens.length;
    document.getElementById('enabledTokens').textContent = tokens.filter(t => t.enable).length;
    document.getElementById('disabledTokens').textContent = tokens.filter(t => !t.enable).length;
    
    // Filter based on conditions
    let filteredTokens = tokens;
    if (currentFilter === 'enabled') {
        filteredTokens = tokens.filter(t => t.enable);
    } else if (currentFilter === 'disabled') {
        filteredTokens = tokens.filter(t => !t.enable);
    }
    
    const tokenList = document.getElementById('tokenList');
    if (filteredTokens.length === 0) {
        const emptyText = currentFilter === 'all' ? 'No Tokens' :
                          currentFilter === 'enabled' ? 'No enabled tokens' : 'No disabled tokens';
        const emptyHint = currentFilter === 'all' ? 'Click OAuth button above to add tokens' : 'Click "Total" above to view all';
        tokenList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">${emptyText}</div>
                <div class="empty-state-hint">${emptyHint}</div>
            </div>
        `;
        return;
    }
    
    // Collect expired tokens that need auto-refresh
    const expiredTokensToRefresh = [];
    
    tokenList.innerHTML = filteredTokens.map((token, index) => {
        const expireTime = new Date(token.timestamp + token.expires_in * 1000);
        const isExpired = expireTime < new Date();
        const isRefreshing = refreshingTokens.has(token.refresh_token);
        const expireStr = expireTime.toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
        const cardId = token.refresh_token.substring(0, 8);
        
        // Calculate index in original list (based on add order)
        const originalIndex = cachedTokens.findIndex(t => t.refresh_token === token.refresh_token);
        const tokenNumber = originalIndex + 1;
        
        // If expired and enabled, add to refresh queue
        if (isExpired && token.enable && !isRefreshing) {
            expiredTokensToRefresh.push(token.refresh_token);
        }
        
        // Escape all user data to prevent XSS
        const safeRefreshToken = escapeJs(token.refresh_token);
        const safeAccessTokenSuffix = escapeHtml(token.access_token_suffix || '');
        const safeProjectId = escapeHtml(token.projectId || '');
        const safeEmail = escapeHtml(token.email || '');
        const safeProjectIdJs = escapeJs(token.projectId || '');
        const safeEmailJs = escapeJs(token.email || '');
        
        return `
        <div class="token-card ${!token.enable ? 'disabled' : ''} ${isExpired ? 'expired' : ''} ${isRefreshing ? 'refreshing' : ''} ${skipAnimation ? 'no-animation' : ''}" id="card-${escapeHtml(cardId)}">
            <div class="token-header">
                <span class="status ${token.enable ? 'enabled' : 'disabled'}">
                    ${token.enable ? '✅ Enabled' : '❌ Disabled'}
                </span>
                <div class="token-header-right">
                    <button class="btn-icon" onclick="showTokenDetail('${safeRefreshToken}')" title="Edit All">✏️</button>
                    <span class="token-id">#${tokenNumber}</span>
                </div>
            </div>
            <div class="token-info">
                <div class="info-row sensitive-row">
                    <span class="info-label">🎫</span>
                    <span class="info-value sensitive-info" title="${safeAccessTokenSuffix}">${safeAccessTokenSuffix}</span>
                </div>
                <div class="info-row editable sensitive-row" onclick="editField(event, '${safeRefreshToken}', 'projectId', '${safeProjectIdJs}')" title="Click to edit">
                    <span class="info-label">📦</span>
                    <span class="info-value sensitive-info">${safeProjectId || 'Click to set'}</span>
                    <span class="info-edit-icon">✏️</span>
                </div>
                <div class="info-row editable sensitive-row" onclick="editField(event, '${safeRefreshToken}', 'email', '${safeEmailJs}')" title="Click to edit">
                    <span class="info-label">📧</span>
                    <span class="info-value sensitive-info">${safeEmail || 'Click to set'}</span>
                    <span class="info-edit-icon">✏️</span>
                </div>
                <div class="info-row ${isExpired ? 'expired-text' : ''}" id="expire-row-${escapeHtml(cardId)}">
                    <span class="info-label">⏰</span>
                    <span class="info-value">${isRefreshing ? '🔄 Refreshing...' : escapeHtml(expireStr)}${isExpired && !isRefreshing ? ' (Expired)' : ''}</span>
                    <button class="btn-icon btn-refresh" onclick="manualRefreshToken('${safeRefreshToken}')" title="Refresh Token" ${isRefreshing ? 'disabled' : ''}>🔄</button>
                </div>
            </div>
            <div class="token-quota-inline" id="quota-inline-${escapeHtml(cardId)}">
                <div class="quota-inline-header" onclick="toggleQuotaExpand('${escapeJs(cardId)}', '${safeRefreshToken}')">
                    <span class="quota-inline-summary" id="quota-summary-${escapeHtml(cardId)}">📊 Loading...</span>
                    <span class="quota-inline-toggle" id="quota-toggle-${escapeHtml(cardId)}">▼</span>
                </div>
                <div class="quota-inline-detail hidden" id="quota-detail-${escapeHtml(cardId)}"></div>
            </div>
            <div class="token-actions">
                <button class="btn btn-info btn-xs" onclick="showQuotaModal('${safeRefreshToken}')" title="View Quota">📊 Details</button>
                <button class="btn ${token.enable ? 'btn-warning' : 'btn-success'} btn-xs" onclick="toggleToken('${safeRefreshToken}', ${!token.enable})" title="${token.enable ? 'Disable' : 'Enable'}">
                    ${token.enable ? '⏸️ Disable' : '▶️ Enable'}
                </button>
                <button class="btn btn-danger btn-xs" onclick="deleteToken('${safeRefreshToken}')" title="Delete">🗑️ Delete</button>
            </div>
        </div>
    `}).join('');
    
    filteredTokens.forEach(token => {
        loadTokenQuotaSummary(token.refresh_token);
    });
    
    updateSensitiveInfoDisplay();
    
    // Reset animation skip flag
    skipAnimation = false;
    
    // Auto-refresh expired tokens
    if (expiredTokensToRefresh.length > 0) {
        expiredTokensToRefresh.forEach(refreshToken => {
            autoRefreshToken(refreshToken);
        });
    }
}

// Manual refresh token
async function manualRefreshToken(refreshToken) {
    if (refreshingTokens.has(refreshToken)) {
        showToast('This token is already refreshing', 'warning');
        return;
    }
    await autoRefreshToken(refreshToken);
}

// Auto-refresh expired token
async function autoRefreshToken(refreshToken) {
    if (refreshingTokens.has(refreshToken)) return;
    
    refreshingTokens.add(refreshToken);
    const cardId = refreshToken.substring(0, 8);
    
    // Update UI to show refreshing state
    const card = document.getElementById(`card-${cardId}`);
    const expireRow = document.getElementById(`expire-row-${cardId}`);
    if (card) card.classList.add('refreshing');
    if (expireRow) {
        const valueSpan = expireRow.querySelector('.info-value');
        if (valueSpan) valueSpan.textContent = '🔄 Refreshing...';
    }
    
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(refreshToken)}/refresh`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Token auto-refreshed', 'success');
            // Reload list after successful refresh
            refreshingTokens.delete(refreshToken);
            loadTokens();
        } else {
            showToast(`Token refresh failed: ${data.message || 'Unknown error'}`, 'error');
            refreshingTokens.delete(refreshToken);
            // Update UI to show refresh failed
            if (expireRow) {
                const valueSpan = expireRow.querySelector('.info-value');
                if (valueSpan) valueSpan.textContent = '❌ Refresh failed';
            }
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Token refresh failed: ${error.message}`, 'error');
        }
        refreshingTokens.delete(refreshToken);
        // Update UI to show refresh failed
        if (expireRow) {
            const valueSpan = expireRow.querySelector('.info-value');
            if (valueSpan) valueSpan.textContent = '❌ Refresh failed';
        }
    }
}

function showManualModal() {
    const modal = document.createElement('div');
    modal.className = 'modal form-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">✏️ Manual Token Entry</div>
            <div class="form-row">
                <input type="text" id="modalAccessToken" placeholder="Access Token (required)">
                <input type="text" id="modalRefreshToken" placeholder="Refresh Token (required)">
                <input type="number" id="modalExpiresIn" placeholder="Expiry time (seconds)" value="3599">
            </div>
            <p style="font-size: 0.8rem; color: var(--text-light); margin-bottom: 12px;">💡 Default expiry: 3599 seconds (~1 hour)</p>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-success" onclick="addTokenFromModal()">✅ Add</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function addTokenFromModal() {
    const modal = document.querySelector('.form-modal');
    const accessToken = document.getElementById('modalAccessToken').value.trim();
    const refreshToken = document.getElementById('modalRefreshToken').value.trim();
    const expiresIn = parseInt(document.getElementById('modalExpiresIn').value);
    
    if (!accessToken || !refreshToken) {
        showToast('Please fill in complete token info', 'warning');
        return;
    }
    
    showLoading('Adding token...');
    try {
        const response = await authFetch('/admin/tokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn })
        });
        
        const data = await response.json();
        hideLoading();
        if (data.success) {
            modal.remove();
            showToast('Token added successfully', 'success');
            loadTokens();
        } else {
            showToast(data.message || 'Add failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Add failed: ' + error.message, 'error');
    }
}

function editField(event, refreshToken, field, currentValue) {
    event.stopPropagation();
    const row = event.currentTarget;
    const valueSpan = row.querySelector('.info-value');
    
    if (row.querySelector('input')) return;
    
    const fieldLabels = { projectId: 'Project ID', email: 'Email' };
    
    const input = document.createElement('input');
    input.type = field === 'email' ? 'email' : 'text';
    input.value = currentValue;
    input.className = 'inline-edit-input';
    input.placeholder = `Enter ${fieldLabels[field]}`;
    
    valueSpan.style.display = 'none';
    row.insertBefore(input, valueSpan.nextSibling);
    input.focus();
    input.select();
    
    const save = async () => {
        const newValue = input.value.trim();
        input.disabled = true;
        
        try {
            const response = await authFetch(`/admin/tokens/${encodeURIComponent(refreshToken)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ [field]: newValue })
            });
            
            const data = await response.json();
            if (data.success) {
                showToast('Saved', 'success');
                loadTokens();
            } else {
                showToast(data.message || 'Save failed', 'error');
                cancel();
            }
        } catch (error) {
            showToast('Save failed', 'error');
            cancel();
        }
    };
    
    const cancel = () => {
        input.remove();
        valueSpan.style.display = '';
    };
    
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (document.activeElement !== input) {
                if (input.value.trim() !== currentValue) {
                    save();
                } else {
                    cancel();
                }
            }
        }, 100);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            save();
        } else if (e.key === 'Escape') {
            cancel();
        }
    });
}

function showTokenDetail(refreshToken) {
    const token = cachedTokens.find(t => t.refresh_token === refreshToken);
    if (!token) {
        showToast('Token not found', 'error');
        return;
    }
    
    // Escape all user data to prevent XSS
    const safeAccessToken = escapeHtml(token.access_token || '');
    const safeRefreshToken = escapeHtml(token.refresh_token);
    const safeRefreshTokenJs = escapeJs(refreshToken);
    const safeProjectId = escapeHtml(token.projectId || '');
    const safeEmail = escapeHtml(token.email || '');
    const expireTimeStr = escapeHtml(new Date(token.timestamp + token.expires_in * 1000).toLocaleString('en-US'));
    
    const modal = document.createElement('div');
    modal.className = 'modal form-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">📝 Token Details</div>
            <div class="form-group compact">
                <label>🎫 Access Token (read-only)</label>
                <div class="token-display">${safeAccessToken}</div>
            </div>
            <div class="form-group compact">
                <label>🔄 Refresh Token (read-only)</label>
                <div class="token-display">${safeRefreshToken}</div>
            </div>
            <div class="form-group compact">
                <label>📦 Project ID</label>
                <input type="text" id="editProjectId" value="${safeProjectId}" placeholder="Project ID">
            </div>
            <div class="form-group compact">
                <label>📧 Email</label>
                <input type="email" id="editEmail" value="${safeEmail}" placeholder="Account email">
            </div>
            <div class="form-group compact">
                <label>⏰ Expiry Time</label>
                <input type="text" value="${expireTimeStr}" readonly style="background: var(--bg); cursor: not-allowed;">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-success" onclick="saveTokenDetail('${safeRefreshTokenJs}')">💾 Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function saveTokenDetail(refreshToken) {
    const projectId = document.getElementById('editProjectId').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    
    showLoading('Saving...');
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(refreshToken)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ projectId, email })
        });
        
        const data = await response.json();
        hideLoading();
        if (data.success) {
            document.querySelector('.form-modal').remove();
            showToast('Saved successfully', 'success');
            loadTokens();
        } else {
            showToast(data.message || 'Save failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Save failed: ' + error.message, 'error');
    }
}

async function toggleToken(refreshToken, enable) {
    const action = enable ? 'enable' : 'disable';
    const confirmed = await showConfirm(`Are you sure you want to ${action} this token?`, `Confirm ${action}`);
    if (!confirmed) return;
    
    showLoading(`Processing...`);
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(refreshToken)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ enable })
        });
        
        const data = await response.json();
        hideLoading();
        if (data.success) {
            showToast(`Token ${action}d`, 'success');
            skipAnimation = true; // Skip animation
            loadTokens();
        } else {
            showToast(data.message || 'Operation failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Operation failed: ' + error.message, 'error');
    }
}

async function deleteToken(refreshToken) {
    const confirmed = await showConfirm('Cannot be recovered after deletion. Are you sure?', '⚠️ Delete Confirm');
    if (!confirmed) return;
    
    showLoading('Deleting...');
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(refreshToken)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        hideLoading();
        if (data.success) {
            showToast('Deleted', 'success');
            loadTokens();
        } else {
            showToast(data.message || 'Delete failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Delete failed: ' + error.message, 'error');
    }
}
