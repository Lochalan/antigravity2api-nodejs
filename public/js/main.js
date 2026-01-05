// Main entry: initialization and event binding

// Initialize on page load
initFontSize();
initSensitiveInfo();
initFilterState(); // Restore filter state

// If logged in, show main content
if (authToken) {
    showMainContent();
    restoreTabState(); // Restore tab state
    loadTokens();
    // Only load config when on settings page
    if (localStorage.getItem('currentTab') === 'settings') {
        loadConfig();
    }
}

// Login form submit
document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn.disabled) return;
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    btn.disabled = true;
    btn.classList.add('loading');
    const originalText = btn.textContent;
    btn.textContent = 'Logging in';
    
    try {
        const response = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            showToast('Login successful', 'success');
            showMainContent();
            loadTokens();
            loadConfig();
        } else {
            showToast(data.message || 'Invalid username or password', 'error');
        }
    } catch (error) {
        showToast('Login failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = originalText;
    }
});

// Config form submit
document.getElementById('configForm').addEventListener('submit', saveConfig);
