
function createAnimation() {
    const animationContainer = document.getElementById('animation-container');
    if (!animationContainer) return;

    const scenes = [
        { // Scene 1: Bodhi Tree
            icon: 'fas fa-tree',
            text: 'Land of Enlightenment'
        },
        { // Scene 2: Nalanda University
            icon: 'fas fa-landmark',
            text: 'Ancient Seat of Learning'
        },
        { // Scene 3: Madhubani Art
            icon: 'fas fa-palette',
            text: 'Vibrant Folk Art'
        },
        { // Scene 4: Chhath Puja
            icon: 'fas fa-sun',
            text: 'Devotion to the Sun God'
        },
    ];

    let currentScene = 0;

    function showScene(sceneIndex) {
        const scene = scenes[sceneIndex];
        animationContainer.innerHTML = `
            <div class="animation-scene">
                <i class="${scene.icon} animation-icon"></i>
                <p class="animation-text">${scene.text}</p>
            </div>
        `;
        const sceneElement = animationContainer.querySelector('.animation-scene');
        setTimeout(() => {
            sceneElement.classList.add('active');
        }, 100); // slight delay for transition
    }

    function nextScene() {
        currentScene = (currentScene + 1) % scenes.length;
        const sceneElement = animationContainer.querySelector('.animation-scene');
        if (sceneElement) {
            sceneElement.classList.remove('active');
            setTimeout(() => showScene(currentScene), 1000);
        } else {
            showScene(currentScene);
        }
    }

    // Start the animation
    showScene(currentScene);
    setInterval(nextScene, 4000); // Change scene every 4 seconds
}

createAnimation();
