import { visitCounter } from './visits.js';

class VisitorCounter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          text-align: center;
          padding: 1rem 0;
          font-family: 'Poppins', sans-serif;
        }
        .visitor-counter {
            font-size: 1rem;
            color: var(--text-color, #333);
        }
      </style>
      <div class="visitor-counter">Visitor Count: <span id="visitor-count"></span></div>
    `;
  }

  async connectedCallback() {
    const count = await visitCounter();
    if (count !== null) {
      this.shadowRoot.getElementById('visitor-count').textContent = count;
    }
  }
}

customElements.define('visitor-counter', VisitorCounter);