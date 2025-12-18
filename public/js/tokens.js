// Token管理：增删改查、启用禁用

let cachedTokens = [];

async function loadTokens() {
    try {
        const response = await authFetch('/admin/tokens', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            renderTokens(data.data);
        } else {
            showToast('加载失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (error) {
        showToast('加载Token失败: ' + error.message, 'error');
    }
}

function renderTokens(tokens) {
    cachedTokens = tokens;
    
    document.getElementById('totalTokens').textContent = tokens.length;
    document.getElementById('enabledTokens').textContent = tokens.filter(t => t.enable).length;
    document.getElementById('disabledTokens').textContent = tokens.filter(t => !t.enable).length;
    
    const tokenList = document.getElementById('tokenList');
    if (tokens.length === 0) {
        tokenList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">暂无Token</div>
                <div class="empty-state-hint">点击上方OAuth按钮添加Token</div>
            </div>
        `;
        return;
    }
    
    tokenList.innerHTML = tokens.map(token => {
        const expireTime = new Date(token.timestamp + token.expires_in * 1000);
        const isExpired = expireTime < new Date();
        const expireStr = expireTime.toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
        const cardId = token.refresh_token.substring(0, 8);
        
        return `
        <div class="token-card ${!token.enable ? 'disabled' : ''} ${isExpired ? 'expired' : ''}">
            <div class="token-header">
                <span class="status ${token.enable ? 'enabled' : 'disabled'}">
                    ${token.enable ? '✅ 启用' : '❌ 禁用'}
                </span>
                <div class="token-header-right">
                    <button class="btn-icon" onclick="showTokenDetail('${token.refresh_token}')" title="编辑全部">✏️</button>
                    <span class="token-id">#${token.refresh_token.substring(0, 6)}</span>
                </div>
            </div>
            <div class="token-info">
                <div class="info-row">
                    <span class="info-label">🎫</span>
                    <span class="info-value sensitive-info" title="${token.access_token_suffix}">${token.access_token_suffix}</span>
                </div>
                <div class="info-row editable" onclick="editField(event, '${token.refresh_token}', 'projectId', '${(token.projectId || '').replace(/'/g, "\\'")}')" title="点击编辑">
                    <span class="info-label">📦</span>
                    <span class="info-value sensitive-info">${token.projectId || '点击设置'}</span>
                    <span class="info-edit-icon">✏️</span>
                </div>
                <div class="info-row editable" onclick="editField(event, '${token.refresh_token}', 'email', '${(token.email || '').replace(/'/g, "\\'")}')" title="点击编辑">
                    <span class="info-label">📧</span>
                    <span class="info-value sensitive-info">${token.email || '点击设置'}</span>
                    <span class="info-edit-icon">✏️</span>
                </div>
                <div class="info-row ${isExpired ? 'expired-text' : ''}">
                    <span class="info-label">⏰</span>
                    <span class="info-value">${expireStr}${isExpired ? ' (已过期)' : ''}</span>
                </div>
            </div>
            <div class="token-quota-inline" id="quota-inline-${cardId}">
                <div class="quota-inline-header" onclick="toggleQuotaExpand('${cardId}', '${token.refresh_token}')">
                    <span class="quota-inline-summary" id="quota-summary-${cardId}">📊 加载中...</span>
                    <span class="quota-inline-toggle" id="quota-toggle-${cardId}">▼</span>
                </div>
                <div class="quota-inline-detail hidden" id="quota-detail-${cardId}"></div>
            </div>
            <div class="token-actions">
                <button class="btn btn-info btn-xs" onclick="showQuotaModal('${token.refresh_token}')" title="查看额度">📊 详情</button>
                <button class="btn ${token.enable ? 'btn-warning' : 'btn-success'} btn-xs" onclick="toggleToken('${token.refresh_token}', ${!token.enable})" title="${token.enable ? '禁用' : '启用'}">
                    ${token.enable ? '⏸️ 禁用' : '▶️ 启用'}
                </button>
                <button class="btn btn-danger btn-xs" onclick="deleteToken('${token.refresh_token}')" title="删除">🗑️ 删除</button>
            </div>
        </div>
    `}).join('');
    
    tokens.forEach(token => {
        loadTokenQuotaSummary(token.refresh_token);
    });
    
    updateSensitiveInfoDisplay();
}

function showManualModal() {
    const modal = document.createElement('div');
    modal.className = 'modal form-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">✏️ 手动填入Token</div>
            <div class="form-row">
                <input type="text" id="modalAccessToken" placeholder="Access Token (必填)">
                <input type="text" id="modalRefreshToken" placeholder="Refresh Token (必填)">
                <input type="number" id="modalExpiresIn" placeholder="过期时间(秒)" value="3599">
            </div>
            <p style="font-size: 0.8rem; color: var(--text-light); margin-bottom: 12px;">💡 过期时间默认3599秒(约1小时)</p>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">取消</button>
                <button class="btn btn-success" onclick="addTokenFromModal()">✅ 添加</button>
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
        showToast('请填写完整的Token信息', 'warning');
        return;
    }
    
    showLoading('正在添加Token...');
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
            showToast('Token添加成功', 'success');
            loadTokens();
        } else {
            showToast(data.message || '添加失败', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('添加失败: ' + error.message, 'error');
    }
}

function editField(event, refreshToken, field, currentValue) {
    event.stopPropagation();
    const row = event.currentTarget;
    const valueSpan = row.querySelector('.info-value');
    
    if (row.querySelector('input')) return;
    
    const fieldLabels = { projectId: 'Project ID', email: '邮箱' };
    
    const input = document.createElement('input');
    input.type = field === 'email' ? 'email' : 'text';
    input.value = currentValue;
    input.className = 'inline-edit-input';
    input.placeholder = `输入${fieldLabels[field]}`;
    
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
                showToast('已保存', 'success');
                loadTokens();
            } else {
                showToast(data.message || '保存失败', 'error');
                cancel();
            }
        } catch (error) {
            showToast('保存失败', 'error');
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
        showToast('Token不存在', 'error');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal form-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">📝 Token详情</div>
            <div class="form-group compact">
                <label>🎫 Access Token (只读)</label>
                <div class="token-display">${token.access_token || ''}</div>
            </div>
            <div class="form-group compact">
                <label>🔄 Refresh Token (只读)</label>
                <div class="token-display">${token.refresh_token}</div>
            </div>
            <div class="form-group compact">
                <label>📦 Project ID</label>
                <input type="text" id="editProjectId" value="${token.projectId || ''}" placeholder="项目ID">
            </div>
            <div class="form-group compact">
                <label>📧 邮箱</label>
                <input type="email" id="editEmail" value="${token.email || ''}" placeholder="账号邮箱">
            </div>
            <div class="form-group compact">
                <label>⏰ 过期时间</label>
                <input type="text" value="${new Date(token.timestamp + token.expires_in * 1000).toLocaleString('zh-CN')}" readonly style="background: var(--bg); cursor: not-allowed;">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">取消</button>
                <button class="btn btn-success" onclick="saveTokenDetail('${refreshToken}')">💾 保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function saveTokenDetail(refreshToken) {
    const projectId = document.getElementById('editProjectId').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    
    showLoading('保存中...');
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
            showToast('保存成功', 'success');
            loadTokens();
        } else {
            showToast(data.message || '保存失败', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('保存失败: ' + error.message, 'error');
    }
}

async function toggleToken(refreshToken, enable) {
    const action = enable ? '启用' : '禁用';
    const confirmed = await showConfirm(`确定要${action}这个Token吗？`, `${action}确认`);
    if (!confirmed) return;
    
    showLoading(`正在${action}...`);
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
            showToast(`已${action}`, 'success');
            loadTokens();
        } else {
            showToast(data.message || '操作失败', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function deleteToken(refreshToken) {
    const confirmed = await showConfirm('删除后无法恢复，确定删除？', '⚠️ 删除确认');
    if (!confirmed) return;
    
    showLoading('正在删除...');
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(refreshToken)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        hideLoading();
        if (data.success) {
            showToast('已删除', 'success');
            loadTokens();
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('删除失败: ' + error.message, 'error');
    }
}
