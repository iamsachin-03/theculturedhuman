class FitnessSection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                h2 {
                    font-size: 2rem;
                    text-align: center;
                    margin: 2rem 0;
                }
            </style>
            <h2>Fitness & Wellness</h2>
            <p style="text-align: center;">Fitness content will be displayed here.</p>
        `;
    }
}

customElements.define('fitness-section', FitnessSection);
