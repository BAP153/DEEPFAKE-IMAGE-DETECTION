// Initialize animations and particles on load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize shared animations
    if (window.AnimationUtils) {
        window.AnimationUtils.initializeAnimations();
    }
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Form submissions
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Password strength checker
    document.getElementById('registerPassword').addEventListener('input', checkPasswordStrength);
    
    // Check if already logged in
    checkAuthStatus();
});

// Tab switching
function switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update form containers
    document.querySelectorAll('.auth-form-container').forEach(container => {
        container.classList.toggle('active', container.id === `${tab}-form`);
    });
}

// Toggle password visibility
function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// Check password strength
function checkPasswordStrength(e) {
    const password = e.target.value;
    const strengthBar = document.querySelector('.password-strength');
    const strengthFill = document.querySelector('.strength-fill');
    const strengthText = document.querySelector('.strength-text');
    
    if (password.length === 0) {
        strengthBar.classList.remove('show');
        return;
    }
    
    strengthBar.classList.add('show');
    
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    
    // Character variety
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    // Update UI
    strengthFill.className = 'strength-fill';
    
    if (strength <= 2) {
        strengthFill.classList.add('weak');
        strengthText.textContent = 'Weak password';
    } else if (strength <= 4) {
        strengthFill.classList.add('medium');
        strengthText.textContent = 'Medium strength';
    } else {
        strengthFill.classList.add('strong');
        strengthText.textContent = 'Strong password';
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const button = e.target.querySelector('.auth-btn');
    
    // Show loading state
    button.classList.add('loading');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, rememberMe })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('Login successful! Redirecting...', 'success');
            
            // Store auth token
            localStorage.setItem('authToken', data.token);
            if (rememberMe) {
                localStorage.setItem('userEmail', email);
            }
            
            // Redirect to main app
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            showMessage(data.error || 'Invalid credentials', 'error');
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
        console.error('Login error:', error);
    } finally {
        button.classList.remove('loading');
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const acceptTerms = document.getElementById('acceptTerms').checked;
    const button = e.target.querySelector('.auth-btn');
    
    // Validation
    if (password !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 8) {
        showMessage('Password must be at least 8 characters', 'error');
        return;
    }
    
    if (!acceptTerms) {
        showMessage('Please accept the terms and conditions', 'error');
        return;
    }
    
    // Show loading state
    button.classList.add('loading');
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('Registration successful! Please login.', 'success');
            
            // Switch to login tab
            setTimeout(() => {
                switchTab('login');
                document.getElementById('loginEmail').value = email;
            }, 1500);
        } else {
            showMessage(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
        console.error('Registration error:', error);
    } finally {
        button.classList.remove('loading');
    }
}

// Show message
function showMessage(text, type) {
    const container = document.getElementById('messageContainer');
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${text}</span>
    `;
    
    container.appendChild(message);
    
    // Remove after 5 seconds
    setTimeout(() => {
        message.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => message.remove(), 300);
    }, 5000);
}

// Check auth status
async function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    try {
        const response = await fetch('/api/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            // Already logged in, redirect to main app
            window.location.href = '/';
        } else {
            // Invalid token, remove it
            localStorage.removeItem('authToken');
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Social login handlers
document.querySelectorAll('.social-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const provider = btn.classList.contains('google') ? 'Google' : 'GitHub';
        showMessage(`${provider} login coming soon!`, 'info');
    });
});