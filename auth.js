
// --- Centralized Firebase Service Module: auth.js --- //

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    doc,
    getDoc,
    getDocs,
    updateDoc, // Added
    deleteDoc  // Added
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// --- Initialize Firebase and Services ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Central Auth Promise ---
const authReady = new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
        const loginLink = document.getElementById('login-link');
        const userInfo = document.getElementById('user-info');
        const userName = document.getElementById('user-name');
        
        let authData;

        if (user) {
            if(loginLink) loginLink.classList.add('hidden');
            if(userInfo) userInfo.classList.remove('hidden');
            if(userName) userName.textContent = user.displayName || user.email;
            
            const idTokenResult = await user.getIdTokenResult(true);
            
            authData = {
                user: user,
                isAdmin: idTokenResult.claims.admin === true,
                idTokenResult: idTokenResult
            };

        } else {
            if(loginLink) loginLink.classList.remove('hidden');
            if(userInfo) userInfo.classList.add('hidden');
            
            authData = {
                user: null,
                isAdmin: false,
                idTokenResult: null
            };
        }
        resolve(authData);
    });
});

// --- EXPORT ALL SERVICES AND FUNCTIONS ---
export { 
    // Services
    db, 
    auth, 
    authReady, 

    // Firestore Functions
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    doc,
    getDoc,
    getDocs,
    updateDoc, // Added
    deleteDoc  // Added
};


// --- Auth Flow Logic ---
const handleEmailAuth = () => {
    const emailForm = document.getElementById('email-form');
    const authFeedback = document.getElementById('auth-feedback');

    if (emailForm) {
        emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('email-input');
            const email = emailInput.value;

            const actionCodeSettings = {
                url: window.location.href.split('?')[0], 
                handleCodeInApp: true,
            };

            sendSignInLinkToEmail(auth, email, actionCodeSettings)
                .then(() => {
                    window.localStorage.setItem('emailForSignIn', email);
                    if (authFeedback) {
                        authFeedback.textContent = 'A sign-in link has been sent to your email!';
                        authFeedback.style.color = 'var(--primary-color)';
                    }
                    emailInput.value = '';
                })
                .catch((error) => {
                    console.error("Error sending sign-in link: ", error);
                     if (authFeedback) {
                        authFeedback.textContent = `Error: ${error.message}`;
                        authFeedback.style.color = '#ef4444';
                    }
                });
        });
    }

    if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
            email = window.prompt('Please provide your email for confirmation');
        }
        
        signInWithEmailLink(auth, email, window.location.href)
            .then(() => {
                window.localStorage.removeItem('emailForSignIn');
                window.location.href = '/';
            })
            .catch((error) => {
                console.error("Error signing in with email link: ", error);
                if (authFeedback) {
                    authFeedback.textContent = `Error: ${error.message}`;
                    authFeedback.style.color = '#ef4444';
                }
            });
    }
};

const handleSignOut = () => {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            signOut(auth).catch((error) => {
                console.error("Sign out failed: ", error.message);
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    handleEmailAuth();
    handleSignOut();
});
