// --- Firebase v10 Modular SDK Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, onValue, get, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDoVWb4rxNm5Urf85vPiuRzXm5S2f1U_oA",
  authDomain: "ujjwal-rhythm.firebaseapp.com",
  databaseURL: "https://ujjwal-rhythm-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ujjwal-rhythm",
  storageBucket: "ujjwal-rhythm.firebasestorage.app",
  messagingSenderId: "594042991928",
  appId: "1:594042991928:web:0c2f5a95d38b18b3f5fdcd",
  measurementId: "G-XRGXZZQ5TE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- Global App State & Keys ---
const LOCAL_STORAGE_KEY_QUIZ = 'dailyRhythmSelfQuizState';
const LOCAL_STORAGE_KEY_TAB = 'dailyRhythmLastActiveTab';
const LOCAL_STORAGE_KEY_AUTH_CACHE = 'dailyRhythmAuthSnapshot'; // Immediate secure UI rendering key

let currentScheduleData = [];
let activeRoutineBarInterval;
let currentUser = null;
let userGeminiApiKey = null;
let routinesUnsubscribe = null; 

// --- UI Element Selectors ---
const loginSection = document.getElementById('login-section');
const mainTabs = document.getElementById('main-tabs');
const activitySection = document.getElementById('activity-section');
const quizSection = document.getElementById('quiz-section');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userAvatar = document.getElementById('user-avatar');
const appTitle = document.getElementById('oneui-app-title');
const dateDayHeader = document.getElementById('date-day-header');
const svgChart = document.getElementById('schedule-chart');
const centerActivityLabel = document.getElementById('center-activity-label');
const addActivityButton = document.getElementById('add-activity-button');
const timelineContainer = document.getElementById('timeline-container');

// API Key Elements
const apiKeyModal = document.getElementById('api-key-modal');
const settingsBtn = document.getElementById('settings-btn');
const closeApiKeyBtn = document.getElementById('close-api-key-btn');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const geminiApiKeyInput = document.getElementById('gemini-api-key-input');

// Routine Form Modal
const activityModal = document.getElementById('activity-modal');
const activityForm = document.getElementById('activity-form');
const activityIdInput = document.getElementById('activity-id');
const activityLabelInput = document.getElementById('activity-label');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const saveButton = document.getElementById('save-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const formTitle = document.getElementById('form-title');

// Tooltip & Tabs Buttons
const arcInfoTooltip = document.getElementById('arc-info-tooltip');
const infoLabel = arcInfoTooltip.querySelector('.info-label');
const infoTime = arcInfoTooltip.querySelector('.info-time');
const activityTabBtn = document.getElementById('activity-tab-btn');
const quizTabBtn = document.getElementById('quiz-tab-btn');

// --- Instant UI Bootstrapping (Removes Flash/Flicker) ---
function bootstrapAuthState() {
    const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEY_AUTH_CACHE);
    if (cachedUser) {
        try {
            const userParsed = JSON.parse(cachedUser);
            // Instantly transition state wrappers to active layouts
            loginSection.style.display = 'none';
            loginSection.classList.remove('active');
            mainTabs.style.display = 'flex';
            
            if (userParsed.photoURL) {
                userAvatar.src = userParsed.photoURL;
                userAvatar.style.display = 'block';
            }
            logoutBtn.style.display = 'flex';
            settingsBtn.style.display = 'flex';
            
            // Re-apply targeted tab visibility instantly before Firebase responses finish
            const activeTab = localStorage.getItem(LOCAL_STORAGE_KEY_TAB) || 'activity';
            switchTab(activeTab);
        } catch (e) {
            clearAuthCacheUI();
        }
    } else {
        clearAuthCacheUI();
    }
}

function clearAuthCacheUI() {
    loginSection.style.display = 'block';
    loginSection.classList.add('active');
    activitySection.style.display = 'none';
    activitySection.classList.remove('active');
    quizSection.style.display = 'none';
    quizSection.classList.remove('active');
    mainTabs.style.display = 'none';
    userAvatar.style.display = 'none';
    logoutBtn.style.display = 'none';
    settingsBtn.style.display = 'none';
}

// Call bootstrapping instantly at engine evaluation phase
bootstrapAuthState();

// --- Theme Management ---
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeMeta = document.getElementById('theme-color-meta');
let isLightMode = localStorage.getItem('theme') === 'light';

function applyTheme() {
    if (isLightMode) {
        document.body.setAttribute('data-theme', 'light');
        themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i> Theme';
        if(themeMeta) themeMeta.setAttribute('content', '#F2F2F7');
    } else {
        document.body.removeAttribute('data-theme');
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i> Theme';
        if(themeMeta) themeMeta.setAttribute('content', '#000000');
    }
}
applyTheme();

themeToggleBtn.addEventListener('click', () => {
    isLightMode = !isLightMode;
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    applyTheme();
});

// --- Tab Persistence Management ---
function persistActiveTab(tabName) {
    localStorage.setItem(LOCAL_STORAGE_KEY_TAB, tabName);
}

function restoreLastActiveTab() {
    const lastTab = localStorage.getItem(LOCAL_STORAGE_KEY_TAB);
    switchTab(lastTab === 'quiz' ? 'quiz' : 'activity');
}

// --- Auth Logic ---
googleLoginBtn.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch((error) => {
        console.error("Login Error:", error);
        triggerHUDToast("Login failed. Try again.");
    });
});

logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        if (routinesUnsubscribe) {
            routinesUnsubscribe();
            routinesUnsubscribe = null;
        }
        localStorage.removeItem(LOCAL_STORAGE_KEY_AUTH_CACHE);
        resetQuizEnv();
        currentScheduleData = [];
        drawChart();
        createScheduleTable();
    });
});

// Optimized dynamic state syncing engine
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        
        // Cache secure UI identity features
        const userSnapshot = {
            uid: user.uid,
            displayName: user.displayName,
            photoURL: user.photoURL
        };
        localStorage.setItem(LOCAL_STORAGE_KEY_AUTH_CACHE, JSON.stringify(userSnapshot));

        loginSection.style.display = 'none';
        loginSection.classList.remove('active');
        mainTabs.style.display = 'flex';
        
        userAvatar.src = user.photoURL;
        userAvatar.style.display = 'block';
        logoutBtn.style.display = 'flex';
        settingsBtn.style.display = 'flex';
        
        triggerHUDToast(`Welcome, ${user.displayName.split(' ')[0]}!`);
        
        // Restore tab layout config seamlessly
        restoreLastActiveTab();
        syncRoutines();
        fetchGeminiKey();
    } else {
        currentUser = null;
        userGeminiApiKey = null;
        localStorage.removeItem(LOCAL_STORAGE_KEY_AUTH_CACHE);
        clearAuthCacheUI();
    }
});

// --- API Key Management ---
function fetchGeminiKey() {
    const keyRef = ref(db, `users/${currentUser.uid}/geminiKey`);
    get(keyRef).then((snapshot) => {
        if (snapshot.exists()) {
            userGeminiApiKey = snapshot.val();
        } else {
            apiKeyModal.classList.add('show');
        }
    });
}

settingsBtn.onclick = () => {
    if(userGeminiApiKey) geminiApiKeyInput.value = userGeminiApiKey;
    apiKeyModal.classList.add('show');
};

closeApiKeyBtn.onclick = () => apiKeyModal.classList.remove('show');

saveApiKeyBtn.onclick = () => {
    const key = geminiApiKeyInput.value.trim();
    if(key) {
        set(ref(db, `users/${currentUser.uid}/geminiKey`), key).then(() => {
            userGeminiApiKey = key;
            apiKeyModal.classList.remove('show');
            triggerHUDToast("API Key Saved Successfully.");
        });
    }
};

// --- Routine Firebase Syncing ---
function syncRoutines() {
    if (routinesUnsubscribe) {
        routinesUnsubscribe();
    }

    const routinesRef = ref(db, `users/${currentUser.uid}/routines`);
    
    routinesUnsubscribe = onValue(routinesRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            currentScheduleData = Object.values(data).filter(item => item && typeof item === 'object' && item.id);
            currentScheduleData.sort((a,b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
        } else {
            currentScheduleData = [];
        }
        
        createScheduleTable();
        drawChart();
    });
}

// --- SVG & Chart Variables ---
const svgNS = "http://www.w3.org/2000/svg";
const cx = 50; const cy = 50; const radius = 45;
const strokeWidth = 9;

// Quiz State
let quizState = { topic: '', activeQuestions: [], selections: {}, submitted: false, score: 0, elapsedSeconds: 0, isLocked: false };
let quizTimerInterval = null;

// Quiz Elements Reference Maps
const landingPage = document.getElementById('landingPage');
const loadingIndicator = document.getElementById('loadingIndicator');
const startQuizBtn = document.getElementById('startQuizBtn');
const inputModal = document.getElementById('inputModal');
const closeQuizConfigBtn = document.getElementById('closeQuizConfigBtn');
const generateBtn = document.getElementById('generateBtn');
const quizContainer = document.getElementById('quizContainer');
const controls = document.getElementById('controls');
const submitBtn = document.getElementById('submitBtn');
const resetQuizBtn = document.getElementById('resetQuizBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const resultsContainer = document.getElementById('resultsContainer');
const scoreText = document.getElementById('scoreText');
const timeText = document.getElementById('timeText');
const floatingTimerControls = document.getElementById('floatingTimerControls');
const timerDisplay = document.getElementById('timer');
const pauseBtn = document.getElementById('pauseBtn');
const quizOverlay = document.getElementById('quizOverlay');
const overlayResumeBtn = document.getElementById('overlayResumeBtn');
const progressWrapper = document.getElementById('progressWrapper');
const progressBarFill = document.getElementById('progressBarFill');

// --- Helper Functions ---
function generateUniqueId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7); }
function getRandomLightColor() { const hue = Math.floor(Math.random() * 360); return `hsl(${hue}, 75%, 70%)`; }
function triggerHUDToast(msg) {
    const el = document.getElementById('hud-toast');
    if(el) {
        el.textContent = msg; el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3500);
    }
}

function polarToCartesian(centerX, centerY, r, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return { x: centerX + (r * Math.cos(angleInRadians)), y: centerY + (r * Math.sin(angleInRadians)) };
}

// Fixed Arc path formula computation
function describeArc(x, y, r, startAngle, endAngle) {
    if (endAngle < startAngle) endAngle += 360;
    const start = polarToCartesian(x, y, r, startAngle);
    const end = polarToCartesian(x, y, r, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function timeToAngle(h, m) { return ((h * 60 + m) / 1440) * 360; }
function formatTime(h, m) {
    const period = h >= 12 ? 'PM' : 'AM'; const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m < 10 ? '0' + m : m} ${period}`;
}

function updateDateHeader() {
    if(dateDayHeader) {
        const now = new Date();
        dateDayHeader.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
}

// --- Chart Drawing ---
function drawChart() {
    if (!svgChart) return;
    svgChart.innerHTML = '';
    const bgCircle = document.createElementNS(svgNS, 'circle');
    bgCircle.setAttribute('cx', cx); bgCircle.setAttribute('cy', cy); bgCircle.setAttribute('r', radius);
    bgCircle.setAttribute('class', 'background-circle'); bgCircle.setAttribute('stroke-width', strokeWidth);
    svgChart.appendChild(bgCircle);

    currentScheduleData.forEach((item) => {
        const startAngle = timeToAngle(item.startH, item.startM);
        const endAngle = timeToAngle(item.endH, item.endM);
        const arc = document.createElementNS(svgNS, 'path');
        arc.setAttribute('d', describeArc(cx, cy, radius, startAngle, endAngle));
        arc.setAttribute('stroke', item.color); arc.setAttribute('stroke-width', strokeWidth);
        arc.setAttribute('class', 'schedule-arc'); arc.setAttribute('data-id', item.id);

        arc.addEventListener('mouseenter', handleArcHoverIn);
        arc.addEventListener('mousemove', handleArcHoverMove);
        arc.addEventListener('mouseleave', handleArcHoverOut);
        svgChart.appendChild(arc);
    });

    const timeDot = document.createElementNS(svgNS, 'circle');
    timeDot.setAttribute('id', 'time-indicator-dot');
    timeDot.setAttribute('r', '2.5');
    timeDot.setAttribute('fill', '#FFFFFF');
    timeDot.setAttribute('stroke', '#1D1D1F');
    timeDot.setAttribute('stroke-width', '1');
    timeDot.style.display = 'none';
    svgChart.appendChild(timeDot);

    if (activeRoutineBarInterval) clearInterval(activeRoutineBarInterval);
    activeRoutineBarInterval = setInterval(updateActiveRoutineBar, 10000); 
    updateActiveRoutineBar();
}

function getRoutineStatus(item, currentMinutes) {
    const startMin = item.startH * 60 + item.startM;
    let endMin = item.endH * 60 + item.endM;

    if (endMin < startMin) {
        if (currentMinutes >= startMin || currentMinutes < endMin) return 'now';
    } else if (startMin === endMin) {
        return 'upcoming';
    } else {
        if (currentMinutes >= startMin && currentMinutes < endMin) return 'now';
    }
    return (currentMinutes >= endMin && startMin <= endMin) ? 'done' : 'upcoming';
}

function updateActiveRoutineBar() {
    const now = new Date(); const curH = now.getHours(); const curM = now.getMinutes();
    const currentMinutes = curH * 60 + curM; 
    const timeDot = document.getElementById('time-indicator-dot');
    
    let activeRoutine = null;

    for (const activity of currentScheduleData) {
        if (getRoutineStatus(activity, currentMinutes) === 'now') {
            activeRoutine = activity;
            break;
        }
    }
        
    if (centerActivityLabel) {
        centerActivityLabel.textContent = activeRoutine ? activeRoutine.label : "No Active Routine";
    }

    if (timeDot) {
        const currentAngle = timeToAngle(curH, curM);
        const coords = polarToCartesian(cx, cy, radius, currentAngle);
        timeDot.setAttribute('cx', coords.x);
        timeDot.setAttribute('cy', coords.y);
        timeDot.style.display = 'block';
    }

    document.querySelectorAll('.timeline-row').forEach(row => {
        const item = currentScheduleData.find(i => i.id === row.dataset.id);
        if(item) {
            const status = getRoutineStatus(item, currentMinutes);
            const pill = row.querySelector('.status-pill');
            row.className = `timeline-row ${status === 'now' ? 'active-current' : ''}`;
            if(pill) {
                pill.className = `status-pill ${status}`;
                pill.innerHTML = status === 'now' ? '<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i> Active Now' : (status === 'done' ? 'Completed' : 'Upcoming');
            }
        }
    });
}

function createScheduleTable() {
    if(!timelineContainer) return;
    timelineContainer.innerHTML = '';
    if (currentScheduleData.length === 0) {
        timelineContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.95rem;">No assigned activities found. Setup a routine to monitor progress.</div>`;
        return;
    }
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    currentScheduleData.forEach(item => {
        const status = getRoutineStatus(item, currentMinutes);
        const isActive = status === 'now';
        
        const row = document.createElement('div');
        row.className = `timeline-row ${isActive ? 'active-current' : ''}`;
        row.setAttribute('data-id', item.id);
        
        let pillText = 'Upcoming';
        if(status === 'now') pillText = '<i class="fas fa-spinner fa-spin"></i> Active Now';
        if(status === 'done') pillText = 'Completed';

        row.innerHTML = `
            <div class="timeline-row-top">
                <div class="activity-meta">
                    <div class="activity-indicator-dot" style="background:${item.color}; box-shadow: 0 0 8px ${item.color};"></div>
                    <span>${item.label}</span>
                </div>
                <div class="action-menu-wrapper">
                    <button class="action-menu-btn" title="Options"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="action-menu-dropdown">
                        <button class="edit-btn"><i class="fas fa-edit"></i> Edit Activity</button>
                        <button class="delete-btn"><i class="fas fa-trash-alt"></i> Delete</button>
                    </div>
                </div>
            </div>
            <div class="timeline-row-bottom">
                <div class="time-duration-box">
                    <i class="far fa-clock"></i>
                    <span>${formatTime(item.startH, item.startM)} - ${formatTime(item.endH, item.endM)}</span>
                </div>
                <span class="status-pill ${status}">${pillText}</span>
            </div>
        `;

        const menuBtn = row.querySelector('.action-menu-btn');
        const dropdown = row.querySelector('.action-menu-dropdown');
        
        menuBtn.onclick = (e) => {
            e.stopPropagation(); 
            document.querySelectorAll('.action-menu-dropdown.show').forEach(d => {
                if (d !== dropdown) d.classList.remove('show');
            });
            dropdown.classList.toggle('show');
        };

        row.querySelector('.edit-btn').onclick = () => editActivity(item);
        row.querySelector('.delete-btn').onclick = () => deleteActivity(item.id);
        timelineContainer.appendChild(row);
    });
}

function handleArcHoverIn(e) {
    const target = currentScheduleData.find(item => item.id === e.target.dataset.id);
    if (!target) return;
    infoLabel.textContent = target.label;
    infoTime.textContent = `${formatTime(target.startH, target.startM)} - ${formatTime(target.endH, target.endM)}`;
    arcInfoTooltip.classList.add('show');
}
function handleArcHoverMove(e) { arcInfoTooltip.style.left = `${e.clientX}px`; arcInfoTooltip.style.top = `${e.clientY}px`; }
function handleArcHoverOut() { arcInfoTooltip.classList.remove('show'); }

function editActivity(item) {
    activityIdInput.value = item.id; activityLabelInput.value = item.label;
    startTimeInput.value = `${String(item.startH).padStart(2, '0')}:${String(item.startM).padStart(2, '0')}`;
    endTimeInput.value = `${String(item.endH).padStart(2, '0')}:${String(item.endM).padStart(2, '0')}`;
    saveButton.textContent = 'Update Activity'; formTitle.textContent = 'Edit Activity';
    activityModal.classList.add('show');
}

function deleteActivity(id) {
    if(confirm("Delete this activity?")) {
        const routineRef = ref(db, `users/${currentUser.uid}/routines/${id}`);
        remove(routineRef).then(() => {
            triggerHUDToast("Activity deleted.");
        }).catch((error) => {
            console.error("Delete error:", error);
            triggerHUDToast("Error deleting activity.");
        });
    }
}

if(addActivityButton) {
    addActivityButton.onclick = () => {
        activityIdInput.value = ''; activityForm.reset();
        saveButton.textContent = 'Add Activity'; formTitle.textContent = 'Add New Activity';
        activityModal.classList.add('show');
    };
}
if(cancelEditButton) cancelEditButton.onclick = () => activityModal.classList.remove('show');

activityForm.addEventListener('submit', (e) => {
    e.preventDefault(); 
    if(!currentUser) {
        triggerHUDToast("Please log in to save activities.");
        return;
    }

    try {
        const id = activityIdInput.value || generateUniqueId();
        const label = activityLabelInput.value.trim();
        const startH = parseInt(startTimeInput.value.split(':')[0]);
        const startM = parseInt(startTimeInput.value.split(':')[1]);
        const endH = parseInt(endTimeInput.value.split(':')[0]);
        const endM = parseInt(endTimeInput.value.split(':')[1]);
        
        const existing = currentScheduleData.find(i => i.id === id);
        const color = existing ? existing.color : getRandomLightColor();
        
        const packed = { id, label, startH, startM, endH, endM, color };
        const routineRef = ref(db, `users/${currentUser.uid}/routines/${id}`);
        
        set(routineRef, packed).then(() => {
            activityModal.classList.remove('show'); 
            triggerHUDToast("Activity saved.");
        }).catch((error) => {
            console.error("Firebase save error:", error);
            triggerHUDToast("Failed to save activity.");
        });
    } catch (error) {
        console.error("Form parsing error:", error);
        triggerHUDToast("Failed to parse activity.");
    }
});

activityTabBtn.addEventListener('click', () => {
    switchTab('activity');
    persistActiveTab('activity');
});

quizTabBtn.addEventListener('click', () => {
    switchTab('quiz');
    persistActiveTab('quiz');
});

function switchTab(target) {
    if(!currentUser) return; // Prevent tab routing if unauthenticated

    activityTabBtn.classList.remove('active'); 
    quizTabBtn.classList.remove('active');
    
    if(target === 'activity') { 
        activityTabBtn.classList.add('active'); 
        activitySection.classList.add('active'); 
        activitySection.style.display = 'block';
        quizSection.style.display = 'none';
        quizSection.classList.remove('active');
        if(appTitle) appTitle.textContent = "Routine";
    } else { 
        quizTabBtn.classList.add('active'); 
        quizSection.classList.add('active'); 
        quizSection.style.display = 'block';
        activitySection.style.display = 'none';
        activitySection.classList.remove('active');
        if(appTitle) appTitle.textContent = "Quiz practice";
    }
}

// --- Quiz Logic ---
function cleanTextForComparison(text) { 
    if (!text) return '';
    return text.toString().replace(/^[a-zA-Z0-9][-.)]\s*/, '').trim().toLowerCase(); 
}

if(startQuizBtn) {
    startQuizBtn.onclick = () => {
        if(!userGeminiApiKey) {
            triggerHUDToast("Please add your Gemini API Key in settings first.");
            apiKeyModal.classList.add('show');
            return;
        }
        inputModal.classList.add('show');
    };
}
if(closeQuizConfigBtn) closeQuizConfigBtn.onclick = () => inputModal.classList.remove('show');

generateBtn.addEventListener('click', async () => {
    const topic = document.getElementById('modalTopicInput').value.trim();
    const difficulty = document.getElementById('modalDifficultySelect').value || 'medium';
    const numQuestions = parseInt(document.getElementById('modalNumQuestionsSelect').value);
    
    if(!topic) { alert("Please provide a quiz topic."); return; }
    if(!userGeminiApiKey) { alert("API Key missing!"); return; }

    inputModal.classList.remove('show');
    landingPage.style.display = 'none';
    loadingIndicator.style.display = 'block';
    
    const prompt = `Generate ${numQuestions} objective questions about "${topic}" tailored exactly to a **${difficulty}** level of difficulty. \nEach question should have exactly 4 options (A, B, C, D), one correct answer, and a short, concise explanation. \nProvide the output as a JSON array of objects. Each object should have 'questionText', 'options' (an array of strings), 'correctAnswer' (the exact text matches one of your options array strings), and 'explanation'.`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        "questionText": { "type": "STRING" },
                        "options": { "type": "ARRAY", "items": { "type": "STRING" } },
                        "correctAnswer": { "type": "STRING" },
                        "explanation": { "type": "STRING" }
                    },
                    required: ["questionText", "options", "correctAnswer", "explanation"]
                }
            }
        }
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${userGeminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Failed to connect to Gemini.");

        const jsonString = data.candidates[0].content.parts[0].text;
        const result = JSON.parse(jsonString);

        loadingIndicator.style.display = 'none';

        if (Array.isArray(result) && result.length > 0) {
            quizContainer.style.display = 'block';
            controls.style.display = 'block';
            progressWrapper.style.display = 'block';

            quizState = { topic, activeQuestions: result, selections: {}, submitted: false, score: 0, elapsedSeconds: 0, isLocked: false };

            renderQuizStructure();
            beginQuizTimer();
            saveQuizToLocalStorage(); 
            triggerHUDToast("Quiz ready!");
        } else {
            throw new Error("Failed to parse valid questions from AI response.");
        }
    } catch (err) {
        console.error("Gemini Generation Error:", err);
        loadingIndicator.style.display = 'none';
        quizContainer.style.display = 'block';
        quizContainer.innerHTML = `<h3 style="color:var(--danger-text); padding:20px;">Generation Error: ${err.message}</h3>`;
        setTimeout(() => resetQuizEnv(), 4000);
    }
});

function renderQuizStructure() {
    quizContainer.innerHTML = `<h2>Questions ready!</h2>`;
    quizState.activeQuestions.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'question-card';
        card.id = `qcard-${idx}`;
        
        let optionsHtml = '';
        q.options.forEach((opt) => {
            const displayOpt = opt.trim();
            const valueOpt = cleanTextForComparison(opt);
            const isSelected = quizState.selections[idx] === valueOpt;
            const checked = isSelected ? 'checked' : '';
            const disabled = quizState.submitted ? 'disabled' : '';
            optionsHtml += `
                <div class="option-wrapper">
                    <label>
                        <input type="radio" name="q-${idx}" value="${valueOpt}" ${checked} ${disabled}>
                        <span>${displayOpt}</span>
                    </label>
                </div>
            `;
        });

        card.innerHTML = `
            <div class="question-text">${idx + 1}. ${q.questionText}</div>
            <div class="options-block">${optionsHtml}</div>
            <div class="feedback-banner" id="fb-${idx}"></div>
            <div class="explanation-box" id="exp-${idx}"><strong>Explanation:</strong> ${q.explanation}</div>
        `;

        card.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.onchange = (e) => {
                quizState.selections[idx] = e.target.value;
                updateQuizProgressBarHUD();
                saveQuizToLocalStorage();
            };
        });
        quizContainer.appendChild(card);
    });

    if(quizState.submitted) applyQuizEvaluationFeedback();
}

function updateQuizProgressBarHUD() {
    const total = quizState.activeQuestions.length;
    if(total === 0 || !progressBarFill) return;
    const filled = Object.keys(quizState.selections).length;
    progressBarFill.style.width = `${(filled / total) * 100}%`;
}

function beginQuizTimer() {
    if(quizTimerInterval) clearInterval(quizTimerInterval);
    if(floatingTimerControls) floatingTimerControls.style.display = 'block';
    updateTimerDisplayHUD();
    quizTimerInterval = setInterval(() => {
        if(!quizState.isLocked && !quizState.submitted) {
            quizState.elapsedSeconds++; 
            updateTimerDisplayHUD();
            if(quizState.elapsedSeconds % 5 === 0) saveQuizToLocalStorage();
        }
    }, 1000);
}

function updateTimerDisplayHUD() {
    if(!timerDisplay) return;
    const m = Math.floor(quizState.elapsedSeconds / 60); const s = quizState.elapsedSeconds % 60;
    timerDisplay.innerHTML = `<i class="far fa-clock"></i> Time: ${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
}

if(pauseBtn) {
    pauseBtn.onclick = () => {
        quizState.isLocked = true; quizOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        saveQuizToLocalStorage();
    };
}

if(overlayResumeBtn) {
    overlayResumeBtn.onclick = () => {
        quizState.isLocked = false; quizOverlay.style.display = 'none';
        document.body.style.overflow = '';
        saveQuizToLocalStorage();
    };
}

if(submitBtn) {
    submitBtn.onclick = () => {
        if(Object.keys(quizState.selections).length < quizState.activeQuestions.length) {
            if(!confirm("Several questions remain unanswered. Submit evaluation regardless?")) return;
        }
        
        clearInterval(quizTimerInterval);
        quizState.submitted = true;
        document.body.style.overflow = ''; 
        
        let finalScore = 0;
        quizState.activeQuestions.forEach((q, idx) => {
            const cleanedSelected = quizState.selections[idx];
            const cleanedCorrect = cleanTextForComparison(q.correctAnswer);
            if(cleanedSelected === cleanedCorrect && cleanedSelected !== '') finalScore++;
        });
        quizState.score = finalScore;
    
        applyQuizEvaluationFeedback();
        saveQuizToLocalStorage();
    };
}

function applyQuizEvaluationFeedback() {
    if(floatingTimerControls) floatingTimerControls.style.display = 'none';
    if(progressWrapper) progressWrapper.style.display = 'none';
    
    quizState.activeQuestions.forEach((q, idx) => {
        const card = document.getElementById(`qcard-${idx}`);
        const fb = document.getElementById(`fb-${idx}`);
        const exp = document.getElementById(`exp-${idx}`);
        if(!card || !fb) return;

        const selected = quizState.selections[idx];
        const cleanedCorrect = cleanTextForComparison(q.correctAnswer);
        const printableCorrect = q.correctAnswer;

        card.querySelectorAll('input[type="radio"]').forEach(r => r.disabled = true);
        if(exp) exp.style.display = 'block';

        if(selected === cleanedCorrect) {
            card.className = 'question-card eval-correct';
            fb.innerHTML = `<span style="color:var(--accent-success);"><i class="fas fa-check-circle"></i> Correct!</span>`;
        } else if(!selected) {
            card.className = 'question-card eval-unanswered';
            fb.innerHTML = `<span style="color:var(--accent-warning);"><i class="fas fa-exclamation-triangle"></i> Unanswered. Correct answer: ${printableCorrect}</span>`;
        } else {
            card.className = 'question-card eval-incorrect';
            fb.innerHTML = `<span style="color:var(--danger-text);"><i class="fas fa-times-circle"></i> Incorrect. Correct answer: ${printableCorrect}</span>`;
        }
    });

    if(scoreText) scoreText.textContent = `Score: ${quizState.score} / ${quizState.activeQuestions.length}`;
    if(timeText) {
        const m = Math.floor(quizState.elapsedSeconds / 60); const s = quizState.elapsedSeconds % 60;
        timeText.textContent = `Time elapsed: ${m} Minutes ${s} Seconds`;
    }
    if(resultsContainer) resultsContainer.style.display = 'block';
    if(submitBtn) submitBtn.disabled = true;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function resetQuizEnv() {
    clearInterval(quizTimerInterval);
    localStorage.removeItem(LOCAL_STORAGE_KEY_QUIZ);
    document.body.style.overflow = '';
    quizState = { topic: '', activeQuestions: [], selections: {}, submitted: false, score: 0, elapsedSeconds: 0, isLocked: false };
    
    quizContainer.style.display = 'none'; if(controls) controls.style.display = 'none';
    if(resultsContainer) resultsContainer.style.display = 'none'; if(progressWrapper) progressWrapper.style.display = 'none';
    if(floatingTimerControls) floatingTimerControls.style.display = 'none'; if(quizOverlay) quizOverlay.style.display = 'none';
    if(landingPage) landingPage.style.display = 'block'; if(submitBtn) submitBtn.disabled = false;
}

if(resetQuizBtn) {
    resetQuizBtn.onclick = () => {
        if(confirm("Reset quiz and return to the main menu?")) {
            resetQuizEnv(); triggerHUDToast("Quiz reset successfully.");
        }
    };
}

function saveQuizToLocalStorage() { localStorage.setItem(LOCAL_STORAGE_KEY_QUIZ, JSON.stringify(quizState)); }

function loadQuizFromLocalStorage() {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_QUIZ);
    if(!raw) return;
    try {
        const parsed = JSON.parse(raw);
        if(parsed && parsed.activeQuestions && parsed.activeQuestions.length > 0) {
            quizState = parsed; if(landingPage) landingPage.style.display = 'none';
            quizContainer.style.display = 'block'; if(controls) controls.style.display = 'block';
            
            renderQuizStructure();
            
            if(!quizState.submitted) {
                if(progressWrapper) progressWrapper.style.display = 'block'; 
                updateQuizProgressBarHUD(); 
                beginQuizTimer();
                if(quizState.isLocked) { quizOverlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
            } else { applyQuizEvaluationFeedback(); }
        }
    } catch(e) { console.error("Error loading saved quiz.", e); }
}

if(downloadPdfBtn) {
    downloadPdfBtn.onclick = () => {
        if(quizState.activeQuestions.length === 0) return;
        triggerHUDToast("Generating PDF summary...");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40; let currentY = 50;
    
        function checkPageBreak(neededHeight) {
            if (currentY + neededHeight > pageHeight - margin) { doc.addPage(); currentY = margin; }
        }
    
        function parsePdfText(text, size, isBold, colorRGB, indent = 0) {
            doc.setFont("Helvetica", isBold ? "bold" : "normal");
            doc.setFontSize(size);
            if (colorRGB) doc.setTextColor(colorRGB[0], colorRGB[1], colorRGB[2]);
            else doc.setTextColor(20, 20, 20);
            const lines = doc.splitTextToSize(text, pageWidth - (margin * 2) - indent);
            checkPageBreak(lines.length * (size * 1.2));
            lines.forEach(line => { doc.text(line, margin + indent, currentY + size); currentY += size * 1.2; });
            currentY += 5;
        }
    
        const reportTitle = quizState.topic ? `${quizState.topic} Quiz Summary` : "Quiz Summary Report";
        parsePdfText(reportTitle, 18, true); currentY += 10;
    
        if (quizState.submitted) {
            parsePdfText(`Score: ${quizState.score} / ${quizState.activeQuestions.length}`, 13, true, [16, 185, 129]);
            const m = Math.floor(quizState.elapsedSeconds / 60); const s = quizState.elapsedSeconds % 60;
            parsePdfText(`Time Taken: ${m} Minutes ${s} Seconds`, 11, false, [100, 100, 100]); currentY += 15;
        }
    
        quizState.activeQuestions.forEach((q, idx) => {
            checkPageBreak(40); parsePdfText(`Q${idx + 1}: ${q.questionText}`, 12, true);
            q.options.forEach((opt) => { parsePdfText(`• ${opt.trim()}`, 11, false, null, 15); });
            if(quizState.submitted) {
                const selected = quizState.selections[idx];
                const cleanedCorrect = cleanTextForComparison(q.correctAnswer);
                if (selected === cleanedCorrect) { parsePdfText(`Your Answer: Correct`, 11, true, [16, 185, 129], 15); }
                else if (selected) { parsePdfText(`Your Answer: Incorrect`, 11, true, [248, 81, 73], 15); parsePdfText(`Correct Answer: ${q.correctAnswer}`, 11, true, [16, 185, 129], 15); }
                else { parsePdfText(`Your Answer: [Not Answered]`, 11, true, [245, 158, 11], 15); parsePdfText(`Correct Answer: ${q.correctAnswer}`, 11, true, [16, 185, 129], 15); }
                parsePdfText(`Explanation: ${q.explanation}`, 11, false, [100,100,100], 15);
            }
            currentY += 15;
        });
    
        const fileName = quizState.topic ? `${quizState.topic.replace(/[^a-zA-Z0-9]/g, '_')}_Quiz.pdf` : 'Quiz_Summary.pdf';
        doc.save(fileName);
        triggerHUDToast("PDF downloaded successfully.");
    };
}

// --- Init & Event Hookups ---
document.addEventListener('DOMContentLoaded', () => {
    updateDateHeader();
    loadQuizFromLocalStorage();
    
    document.addEventListener('click', () => { 
        document.querySelectorAll('.action-menu-dropdown.show').forEach(d => d.classList.remove('show')); 
    });
});
