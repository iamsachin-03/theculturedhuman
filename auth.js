
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  projectId: "the-cultured-human-blog",
  appId: "1:1048541348767:web:ad036ea45cf8dc2ca033aa",
  storageBucket: "the-cultured-human-blog.firebasestorage.app",
  apiKey: "AIzaSyCkgwmL4nC7UAtMRX5RsFtiT6zujMswa_8",
  authDomain: "the-cultured-human-blog.firebaseapp.com",
  messagingSenderId: "1048541348767"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// DOM Elements
const loginLink = document.getElementById('login-link');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');
const logoutButton = document.getElementById('logout-button');
const authForm = document.getElementById('auth-form');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const toggleToSignup = document.getElementById('toggle-to-signup');
const toggleToLogin = document.getElementById('toggle-to-login');
const googleSignInButton = document.getElementById('google-signin');
const authFeedback = document.getElementById('auth-feedback');

// --- Auth State Observer ---
onAuthStateChanged(auth, user => {
    if (user) {
        // User is signed in
        if (userName) {
            userName.textContent = user.displayName || user.email.split('@')[0];
        }
        if (userInfo) userInfo.classList.remove('hidden');
        if (loginLink) loginLink.classList.add('hidden');
        
        // If on auth page, redirect to home
        if (window.location.pathname.includes('auth.html')) {
            window.location.href = 'index.html';
        }

    } else {
        // User is signed out
        if (userInfo) userInfo.classList.add('hidden');
        if (loginLink) loginLink.classList.remove('hidden');
    }
});


// --- Signup Form ---
if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = signupForm.email.value;
        const password = signupForm.password.value;

        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in 
                console.log('Signed up:', userCredential.user);
                if (authFeedback) authFeedback.textContent = 'Successfully signed up!';
                if (authFeedback) authFeedback.style.color = 'var(--primary-color)';
            })
            .catch((error) => {
                console.error('Signup error:', error.message);
                if (authFeedback) authFeedback.textContent = error.message;
                if (authFeedback) authFeedback.style.color = '#ef4444';
            });
    });
}

// --- Login Form ---
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in
                console.log('Logged in:', userCredential.user);
            })
            .catch((error) => {
                console.error('Login error:', error.message);
                if (authFeedback) authFeedback.textContent = error.message;
                if (authFeedback) authFeedback.style.color = '#ef4444';
            });
    });
}

// --- Google Sign-In ---
if (googleSignInButton) {
    googleSignInButton.addEventListener('click', () => {
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log('Google Sign-In success:', result.user);
            }).catch((error) => {
                console.error('Google Sign-In error:', error.message);
                if (authFeedback) authFeedback.textContent = `Google Sign-In Failed: ${error.message}`;
                if (authFeedback) authFeedback.style.color = '#ef4444';
            });
    });
}


// --- Logout Button ---
if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log('User signed out.');
            // Redirect to home page after logout to ensure clean state
            if (!window.location.pathname.includes('index.html')) {
                 window.location.href = 'index.html';
            }
        }).catch((error) => {
            console.error('Sign out error:', error);
        });
    });
}


// --- Form Toggling on Auth Page ---
if (toggleToSignup && toggleToLogin && loginForm && signupForm) {
    toggleToSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        if (authFeedback) authFeedback.textContent = '';
    });

    toggleToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        if (authFeedback) authFeedback.textContent = '';
    });
}

export { auth, db };
