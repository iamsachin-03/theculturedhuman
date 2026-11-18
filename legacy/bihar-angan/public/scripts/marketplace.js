class MarketplaceSection extends HTMLElement {
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
            <h2>Marketplace</h2>
            <div id="bazaar-container"></div>
        `;
    }

    connectedCallback() {
        const bazaarContainer = this.shadowRoot.querySelector('#bazaar-container');
        const bazaarSection = document.createElement('bazaar-section');
        bazaarContainer.appendChild(bazaarSection);
    }
}

customElements.define('marketplace-section', MarketplaceSection);
