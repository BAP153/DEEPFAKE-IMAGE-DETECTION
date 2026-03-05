// Wrap everything in an IIFE to avoid global scope pollution
(function() {
    'use strict';
    
    // DOM Elements
    let uploadArea, fileInput, imagePreview, previewImg, removeBtn, analyzeBtn, resultsSection, errorMessage, analysisProgress, progressFill;
    let selectedFile = null;
    let analysisHistory = JSON.parse(localStorage.getItem('deepfakeHistory')) || [];

    // Initialize DOM elements after DOM is loaded
    function initializeDOMElements() {
        uploadArea = document.getElementById('uploadArea');
        fileInput = document.getElementById('fileInput');
        imagePreview = document.getElementById('imagePreview');
        previewImg = document.getElementById('previewImg');
        removeBtn = document.getElementById('removeBtn');
        analyzeBtn = document.getElementById('analyzeBtn');
        resultsSection = document.getElementById('resultsSection');
        errorMessage = document.getElementById('errorMessage');
        analysisProgress = document.getElementById('analysisProgress');
        progressFill = document.getElementById('progressFill');
    }

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', () => {
        initializeDOMElements();
        checkAuth();
        
        if (window.AnimationUtils) {
            window.AnimationUtils.initializeAnimations();
        }
        
        animateOnScroll();
        addRippleEffect();
        updateHistoryCount();
        setupUserMenu();
        setupEventListeners();
        setupHistoryListeners();
    });

    // Setup event listeners
    function setupEventListeners() {
        if (uploadArea) {
            uploadArea.addEventListener('click', () => fileInput.click());
            uploadArea.addEventListener('dragover', handleDragOver);
            uploadArea.addEventListener('dragleave', handleDragLeave);
            uploadArea.addEventListener('drop', handleDrop);
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', handleFileSelect);
        }
        
        if (removeBtn) {
            removeBtn.addEventListener('click', removeImage);
        }
        
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', analyzeImage);
        }
        
        const downloadReportBtn = document.getElementById('downloadReport');
        if (downloadReportBtn) {
            downloadReportBtn.addEventListener('click', downloadReport);
        }
    }

    // Setup history listeners
    function setupHistoryListeners() {
        const historyToggleBtn = document.getElementById('historyToggleBtn');
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        const modalClose = document.getElementById('modalClose');
        
        if (historyToggleBtn) {
            historyToggleBtn.addEventListener('click', toggleHistory);
        }
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', clearHistory);
        }
        if (modalClose) {
            modalClose.addEventListener('click', closeModal);
        }
        
        document.querySelectorAll('.history-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => filterHistory(e.target.dataset.filter));
        });
    }

    // Add ripple effect
    function addRippleEffect() {
        if (!analyzeBtn) return;
        
        analyzeBtn.addEventListener('click', function(e) {
            const ripple = document.createElement('div');
            ripple.className = 'ripple';
            
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    }

    // Animate on scroll
    function animateOnScroll() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);
        
        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }

    // Check authentication
    async function checkAuth() {
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            window.location.href = '/login';
            return;
        }
        
        try {
            const response = await fetch('/api/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Invalid token');
            }
            
            const tokenPayload = parseJwt(token);
            if (tokenPayload) {
                updateUserInfo(tokenPayload);
            }
            
        } catch (error) {
            localStorage.removeItem('authToken');
            window.location.href = '/login';
        }
    }

    // Parse JWT
    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }

    // Update user info
    function updateUserInfo(userInfo) {
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        
        if (userName && userInfo.name) {
            userName.textContent = userInfo.name;
        }
        if (userEmail && userInfo.email) {
            userEmail.textContent = userInfo.email;
        }
    }

    // Setup user menu
    function setupUserMenu() {
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdown = document.getElementById('userDropdown');
        
        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('show');
            });
            
            document.addEventListener('click', () => {
                userDropdown.classList.remove('show');
            });
        }
    }

    // File handling
    function handleDragOver(e) {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            showError('Please select an image file.');
            return;
        }
        
        if (file.size > 16 * 1024 * 1024) {
            showError('File size must be less than 16MB.');
            return;
        }
        
        selectedFile = file;
        displayPreview(file);
        analyzeBtn.disabled = false;
        hideError();
        hideResults();
    }

    function displayPreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            previewImg.src = imageData;
            uploadArea.style.display = 'none';
            imagePreview.style.display = 'block';
            
            previewImg.dataset.imageData = imageData;
            
            const fileName = document.getElementById('fileName');
            const fileSize = document.getElementById('fileSize');
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = formatFileSize(file.size);
        };
        reader.readAsDataURL(file);
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function removeImage() {
        selectedFile = null;
        fileInput.value = '';
        previewImg.src = '';
        uploadArea.style.display = 'block';
        imagePreview.style.display = 'none';
        analyzeBtn.disabled = true;
        hideResults();
        hideError();
    }

    // Analysis
    async function analyzeImage() {
        if (!selectedFile) return;
        
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login';
            return;
        }
        
        analyzeBtn.disabled = true;
        analyzeBtn.classList.add('loading');
        hideError();
        hideResults();
        showProgress();
        
        updateProgress(0, 1);
        
        const formData = new FormData();
        formData.append('image', selectedFile);
        
        try {
            setTimeout(() => updateProgress(33, 2), 500);
            
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok && data.success && data.result) {
                updateProgress(66, 3);
                setTimeout(() => {
                    updateProgress(100, 3);
                    setTimeout(() => {
                        hideProgress();
                        displayResults(data.result);
                        showSuccessToast();
                    }, 500);
                }, 500);
            } else {
                hideProgress();
                const errorMsg = data.error || 'Analysis failed. Please try again.';
                showError(errorMsg);
                console.error('Server error:', data);
            }
        } catch (error) {
            hideProgress();
            showError('Network error. Please check your connection and try again.');
            console.error('Analysis error:', error);
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.classList.remove('loading');
        }
    }

    function showProgress() {
        if (analysisProgress) {
            analysisProgress.style.display = 'block';
            if (progressFill) progressFill.style.width = '0%';
        }
    }

    function hideProgress() {
        if (analysisProgress) {
            analysisProgress.style.display = 'none';
        }
    }

    function updateProgress(percent, stage) {
        if (progressFill) {
            progressFill.style.width = percent + '%';
        }
        
        document.querySelectorAll('.stage').forEach((el, index) => {
            if (index < stage) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    function displayResults(result) {
        if (!result) {
            showError('Invalid response from server. Please try again.');
            return;
        }
        
        const imageData = previewImg.dataset.imageData;
        if (imageData && result) {
            saveToHistory(imageData, result);
        }
        
        const detectionResult = document.getElementById('detectionResult');
        const resultIcon = document.getElementById('resultIcon');
        
        if (detectionResult && result.is_ai_generated !== undefined) {
            detectionResult.textContent = formatDetectionResult(result.is_ai_generated);
            detectionResult.className = 'result-value ' + getResultClass(result.is_ai_generated);
        }
        
        if (resultIcon && result.is_ai_generated !== undefined) {
            resultIcon.className = 'result-icon ' + getResultClass(result.is_ai_generated);
            const iconClass = getResultIcon(result.is_ai_generated);
            resultIcon.innerHTML = `<i class="fas ${iconClass}"></i>`;
        }
        
        if (result.confidence !== undefined) {
            animateConfidenceMeter(result.confidence);
        }
        
        const explanationText = document.getElementById('explanationText');
        if (explanationText && result.explanation) {
            typewriterEffect(explanationText, result.explanation);
        }
        
        if (result.evidence && Array.isArray(result.evidence)) {
            updateEvidenceList(result.evidence);
        }
        
        if (result.suggested_next_steps && Array.isArray(result.suggested_next_steps)) {
            updateSuggestionsList(result.suggested_next_steps);
        }
        
        if (resultsSection) {
            resultsSection.style.display = 'block';
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function animateConfidenceMeter(confidence) {
        const confidencePercent = Math.round(confidence * 100);
        const progressCircle = document.getElementById('progressCircle');
        const confidenceValue = document.getElementById('confidenceValue');
        
        if (!progressCircle || !confidenceValue) return;
        
        if (!document.getElementById('gradient')) {
            const svg = progressCircle.parentElement;
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            gradient.id = 'gradient';
            gradient.innerHTML = `
                <stop offset="0%" stop-color="#667eea" />
                <stop offset="100%" stop-color="#764ba2" />
            `;
            defs.appendChild(gradient);
            svg.appendChild(defs);
            progressCircle.style.stroke = 'url(#gradient)';
        }
        
        let currentValue = 0;
        const increment = confidencePercent / 50;
        const timer = setInterval(() => {
            currentValue += increment;
            if (currentValue >= confidencePercent) {
                currentValue = confidencePercent;
                clearInterval(timer);
            }
            confidenceValue.textContent = Math.round(currentValue);
            
            const offset = 283 - (283 * currentValue) / 100;
            progressCircle.style.strokeDashoffset = offset;
        }, 20);
    }

    function typewriterEffect(element, text) {
        if (!element || !text) return;
        
        element.textContent = '';
        let index = 0;
        const timer = setInterval(() => {
            element.textContent += text[index];
            index++;
            if (index >= text.length) {
                                clearInterval(timer);
            }
        }, 20);
    }

    function updateEvidenceList(evidence) {
        const evidenceList = document.getElementById('evidenceList');
        if (!evidenceList || !evidence) return;
        
        evidenceList.innerHTML = '';
        
        evidence.forEach((item, index) => {
            const evidenceItem = document.createElement('div');
            evidenceItem.className = 'evidence-item';
            evidenceItem.style.animationDelay = `${index * 0.1}s`;
            evidenceItem.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>${item}</span>
            `;
            evidenceList.appendChild(evidenceItem);
        });
    }

    function updateSuggestionsList(suggestions) {
        const suggestionsList = document.getElementById('suggestionsList');
        if (!suggestionsList || !suggestions) return;
        
        suggestionsList.innerHTML = '';
        
        suggestions.forEach((step, index) => {
            const suggestionItem = document.createElement('div');
            suggestionItem.className = 'suggestion-item';
            suggestionItem.style.animationDelay = `${index * 0.1}s`;
            suggestionItem.innerHTML = `
                <i class="fas fa-arrow-right"></i>
                <span>${step}</span>
            `;
            suggestionsList.appendChild(suggestionItem);
        });
    }

    // Utility functions
    function formatDetectionResult(result) {
        if (!result) return 'Unknown';
        
        switch (result.toLowerCase()) {
            case 'yes':
                return 'AI-Generated';
            case 'no':
                return 'Real Image';
            default:
                return 'Undetermined';
        }
    }

    function getResultClass(result) {
        if (!result) return 'undetermined';
        
        switch (result.toLowerCase()) {
            case 'yes':
                return 'fake';
            case 'no':
                return 'real';
            default:
                return 'undetermined';
        }
    }

    function getResultIcon(result) {
        if (!result) return 'fa-question-circle';
        
        switch (result.toLowerCase()) {
            case 'yes':
                return 'fa-robot';
            case 'no':
                return 'fa-check-circle';
            default:
                return 'fa-question-circle';
        }
    }

    function showError(message) {
        if (!errorMessage) return;
        
        const errorText = errorMessage.querySelector('.error-text');
        if (errorText) {
            errorText.textContent = message;
        }
        errorMessage.style.display = 'flex';
    }

    function hideError() {
        if (errorMessage) {
            errorMessage.style.display = 'none';
        }
    }

    function hideResults() {
        if (resultsSection) {
            resultsSection.style.display = 'none';
        }
    }

    function showSuccessToast() {
        const toast = document.getElementById('successToast');
        if (!toast) return;
        
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // History Management Functions
    function saveToHistory(imageData, result) {
        if (!result || !selectedFile) return;
        
        const historyItem = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            imageThumb: imageData,
            result: result,
            isAiGenerated: result.is_ai_generated || 'undetermined',
            confidence: result.confidence || 0
        };
        
        analysisHistory.unshift(historyItem);
        
        // Keep only last 50 items
        if (analysisHistory.length > 50) {
            analysisHistory = analysisHistory.slice(0, 50);
        }
        
        localStorage.setItem('deepfakeHistory', JSON.stringify(analysisHistory));
        updateHistoryCount();
        
        // Refresh history display if visible
        const historySection = document.getElementById('historySection');
        if (historySection && historySection.classList.contains('show')) {
            displayHistory();
        }
    }

    function displayHistory(filter = 'all') {
        const historyGrid = document.getElementById('historyGrid');
        const emptyHistory = document.getElementById('emptyHistory');
        
        if (!historyGrid || !emptyHistory) return;
        
        // Filter history based on selection
        let filteredHistory = analysisHistory;
        if (filter !== 'all') {
            filteredHistory = analysisHistory.filter(item => {
                const isAi = item.isAiGenerated ? item.isAiGenerated.toLowerCase() : 'undetermined';
                switch (filter) {
                    case 'real':
                        return isAi === 'no';
                    case 'ai':
                        return isAi === 'yes';
                    case 'undetermined':
                        return isAi === 'undetermined' || isAi === '';
                    default:
                        return true;
                }
            });
        }
        
        if (filteredHistory.length === 0) {
            historyGrid.style.display = 'none';
            emptyHistory.style.display = 'block';
            return;
        }
        
        historyGrid.style.display = 'grid';
        emptyHistory.style.display = 'none';
        historyGrid.innerHTML = '';
        
        filteredHistory.forEach((item, index) => {
            const historyItem = createHistoryItem(item, index);
            historyGrid.appendChild(historyItem);
        });
    }

    function createHistoryItem(item, index) {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.style.animationDelay = `${index * 0.05}s`;
        
        const isAi = item.isAiGenerated ? item.isAiGenerated.toLowerCase() : 'undetermined';
        const resultClass = isAi === 'yes' ? 'ai' : 
                           isAi === 'no' ? 'real' : 'undetermined';
        const resultText = isAi === 'yes' ? 'AI-Generated' : 
                          isAi === 'no' ? 'Real Image' : 'Undetermined';
        
        div.innerHTML = `
            <img src="${item.imageThumb}" alt="${item.fileName}" class="history-item-image">
            <div class="history-item-content">
                <div class="history-item-header">
                    <span class="history-item-result ${resultClass}">${resultText}</span>
                    <span class="confidence-badge">${Math.round(item.confidence * 100)}%</span>
                </div>
                <div class="history-item-info">
                    <div class="history-item-filename">${item.fileName}</div>
                    <div class="history-item-date">${formatDate(item.timestamp)}</div>
                </div>
            </div>
            <button class="history-item-delete" onclick="window.deleteHistoryItem(${item.id})">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        div.onclick = (e) => {
            if (!e.target.closest('.history-item-delete')) {
                showHistoryDetail(item);
            }
        };
        
        return div;
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        // Less than 1 minute
        if (diff < 60000) {
            return 'Just now';
        }
        // Less than 1 hour
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        }
        // Less than 24 hours
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        // Less than 7 days
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }
        
        // Default to date format
        return date.toLocaleDateString();
    }

    function showHistoryDetail(item) {
        const modal = document.getElementById('historyModal');
        const modalBody = document.getElementById('modalBody');
        
        if (!modal || !modalBody || !item) return;
        
        const isAi = item.isAiGenerated ? item.isAiGenerated.toLowerCase() : 'undetermined';
        const resultClass = isAi === 'yes' ? 'ai-generated' : 
                           isAi === 'no' ? 'real' : 'undetermined';
        const resultText = isAi === 'yes' ? 'AI-Generated' : 
                          isAi === 'no' ? 'Real Image' : 'Undetermined';
        
        modalBody.innerHTML = `
            <div class="history-detail">
                <img src="${item.imageThumb}" alt="${item.fileName}" class="history-detail-image">
                <div class="history-detail-content">
                    <h2>${item.fileName}</h2>
                    <div class="history-detail-meta">
                        <span>Analyzed: ${new Date(item.timestamp).toLocaleString()}</span>
                        <span>Size: ${formatFileSize(item.fileSize)}</span>
                    </div>
                    
                    <div class="result-card main-result">
                        <div class="result-content">
                            <span class="result-label">Detection Result</span>
                            <span class="result-value ${resultClass}">${resultText}</span>
                        </div>
                    </div>
                    
                    <div class="confidence-meter">
                        <div class="confidence-label">
                            <span>Confidence Level:</span>
                            <span>${Math.round(item.result.confidence * 100)}%</span>
                        </div>
                        <div class="confidence-bar">
                            <div class="confidence-fill" style="width: ${item.result.confidence * 100}%"></div>
                        </div>
                    </div>
                    
                    ${item.result.explanation ? `
                    <div class="explanation-section">
                        <h3>Explanation</h3>
                        <p>${item.result.explanation}</p>
                    </div>
                    ` : ''}
                    
                    ${item.result.evidence ? `
                    <div class="evidence-section">
                        <h3>Visual Evidence</h3>
                        <ul>
                            ${item.result.evidence.map(e => `<li>${e}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                    
                    ${item.result.suggested_next_steps ? `
                    <div class="suggestions-section">
                        <h3>Suggested Next Steps</h3>
                        <ul>
                            ${item.result.suggested_next_steps.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        const modal = document.getElementById('historyModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    function clearHistory() {
        if (confirm('Are you sure you want to clear all history? This action cannot be undone.')) {
            analysisHistory = [];
            localStorage.removeItem('deepfakeHistory');
            updateHistoryCount();
            displayHistory();
        }
    }

    function filterHistory(filter) {
        // Update active button
        document.querySelectorAll('.history-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-filter="${filter}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // Display filtered history
        displayHistory(filter);
    }

    function toggleHistory() {
        const historySection = document.getElementById('historySection');
        const mainContent = document.querySelector('main');
        
        if (!historySection || !mainContent) return;
        
        if (historySection.classList.contains('show')) {
            historySection.classList.remove('show');
            mainContent.style.display = 'block';
        } else {
            historySection.classList.add('show');
            mainContent.style.display = 'none';
            displayHistory();
        }
    }

    function updateHistoryCount() {
        const historyCount = document.getElementById('historyCount');
        if (historyCount) {
            historyCount.textContent = analysisHistory.length;
        }
    }

    // Download report function
    function downloadReport() {
        const fileName = document.getElementById('fileName');
        const detectionResult = document.getElementById('detectionResult');
        const confidenceValue = document.getElementById('confidenceValue');
        const explanationText = document.getElementById('explanationText');
        
        if (!fileName || !detectionResult) return;
        
        const result = {
            fileName: fileName.textContent,
            detection: detectionResult.textContent,
            confidence: confidenceValue ? confidenceValue.textContent + '%' : 'N/A',
            explanation: explanationText ? explanationText.textContent : 'N/A',
            evidence: Array.from(document.querySelectorAll('.evidence-item span')).map(el => el.textContent),
            suggestions: Array.from(document.querySelectorAll('.suggestion-item span')).map(el => el.textContent),
            timestamp: new Date().toLocaleString()
        };
        
        const reportContent = `
DEEPFAKE DETECTION REPORT
========================

File: ${result.fileName}
Date: ${result.timestamp}

ANALYSIS RESULTS
----------------
Detection: ${result.detection}
Confidence: ${result.confidence}

EXPLANATION
-----------
${result.explanation}

VISUAL EVIDENCE
---------------
${result.evidence.map(e => '• ' + e).join('\n')}

RECOMMENDED ACTIONS
-------------------
${result.suggestions.map(s => '• ' + s).join('\n')}

---
Report generated by Deepfake Image Detector
Powered by Google Gemini Vision API
        `;
        
        const blob = new Blob([reportContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deepfake-report-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // Make necessary functions globally available
    window.hideError = hideError;
    window.deleteHistoryItem = function(id) {
        if (confirm('Are you sure you want to delete this item from history?')) {
            analysisHistory = analysisHistory.filter(item => item.id !== id);
            localStorage.setItem('deepfakeHistory', JSON.stringify(analysisHistory));
            updateHistoryCount();
            displayHistory();
        }
    };
    window.logout = function() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        window.location.href = '/login';
    };
    window.toggleHistory = toggleHistory;
    window.showSettings = function() {
        showSuccessToast();
        alert('Settings page coming soon!');
    };
    
    // Add modal close on outside click
    window.onclick = function(event) {
        const modal = document.getElementById('historyModal');
        if (event.target === modal) {
            closeModal();
        }
    };

})();