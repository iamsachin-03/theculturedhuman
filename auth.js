
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- NEW ARCHITECTURE: A promise that resolves with the ID TOKEN RESULT --- //
const authReady = new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
        const loginLink = document.getElementById('login-link');
        const userInfo = document.getElementById('user-info');
        const userName = document.getElementById('user-name');
        
        if (user) {
            // User is signed in
            loginLink.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userName.textContent = user.displayName || user.email;
            
            // Get the fresh token with claims HERE and ONLY HERE.
            const idTokenResult = await user.getIdTokenResult(true);
            resolve(idTokenResult); // Resolve with the full token result

        } else {
            // User is signed out
            loginLink.classList.remove('hidden');
            userInfo.classList.add('hidden');
            resolve(null); // Resolve with null if no user
        }
    });
});

// Export the promise and the services
export { db, auth, authReady };

// --- Event Listeners --- //
const loginLink = document.getElementById('login-link');
const logoutButton = document.getElementById('logout-button');
const provider = new GoogleAuthProvider();

// Sign-in
loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signInWithPopup(auth, provider).catch((error) => {
        console.error("Authentication failed: ", error.message);
    });
});

// Sign-out
logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => {
        console.error("Sign out failed: ", error.message);
    });
});
