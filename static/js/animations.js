// Shared animation functions for all pages

// Create floating particles
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;
    
    // Clear existing particles
    particlesContainer.innerHTML = '';
    
    const particleCount = window.innerWidth < 768 ? 10 : 20;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.width = Math.random() * 10 + 5 + 'px';
        particle.style.height = particle.style.width;
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 20 + 's';
        particle.style.animationDuration = 20 + Math.random() * 10 + 's';
        particlesContainer.appendChild(particle);
    }
}

// Animate logo on load
function animateLogo() {
    const logoIcon = document.querySelector('.logo-icon');
    const scanLine = document.querySelector('.scan-line');
    
    if (logoIcon) {
        logoIcon.style.animation = 'pulse 2s ease-in-out infinite';
    }
    
    if (scanLine) {
        scanLine.style.animation = 'scan 2s linear infinite';
    }
}

// Initialize all animations
function initializeAnimations() {
    // Create particles
    createParticles();
    
    // Animate logo
    animateLogo();
    
    // Re-create particles on resize (throttled)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            createParticles();
        }, 250);
    });
}

// Export for use in other files
window.AnimationUtils = {
    createParticles,
    animateLogo,
    initializeAnimations
};