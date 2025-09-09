class BazaarSection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                h3 {
                    font-size: 1.5rem;
                    text-align: center;
                    margin: 2rem 0;
                }
            </style>
            <h3>Bazaar</h3>
            <p style="text-align: center;">Bazaar content will be displayed here.</p>
        `;
    }
}

customElements.define('bazaar-section', BazaarSection);
