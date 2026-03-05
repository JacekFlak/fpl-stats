const XP_CALCULATION_CONTENT = `
    <p class="intro">Our AI uses an advanced algorithm powered by <strong>Opta professional statistics</strong> to predict player performance.</p>

    <div class="formula-box">
        <h3>Main Formula</h3>
        <div class="formula">
            xP = (0.1×Form + 0.25×PPG + 0.4×Opta + 0.25×xGI) × Difficulty × Availability
        </div>
    </div>

    <div class="components-grid">
        <div class="component">
            <h4>🔥 Form Component (10%)</h4>
            <p>Recent performance trend from last gameweeks</p>
            <div class="formula-small">Form Score from FPL API</div>
        </div>

        <div class="component">
            <h4>📈 Points Per Game (25%)</h4>
            <p>Season average performance baseline</p>
            <div class="formula-small">Total Points ÷ Games Played</div>
        </div>

        <div class="component highlight">
            <h4>⚽ Opta Component (40%)</h4>
            <p><strong>Professional statistics</strong> from official Premier League data provider:</p>
            <ul>
                <li><strong>Expected Goals (xG)</strong> × 5 - Shot quality analysis</li>
                <li><strong>Expected Assists (xA)</strong> × 3 - Chance creation probability</li>
                <li><strong>Influence</strong> ÷ 100 - Match impact metric</li>
                <li><strong>Creativity</strong> ÷ 100 - Offensive contribution</li>
                <li><strong>Threat</strong> ÷ 100 - Attacking danger posed</li>
                <li><strong>ICT Index</strong> ÷ 50 - Combined statistical index</li>
            </ul>
        </div>

        <div class="component">
            <h4>🎯 xGI Component (25%)</h4>
            <p>Direct attacking contributions (DEF, MID, FWD only)</p>
            <div class="formula-small">(xG + xA) from FPL data</div>
        </div>
    </div>

    <div class="multipliers">
        <h3>Adjustment Factors</h3>
        <div class="multiplier-grid">
            <div class="multiplier">
                <h4>🏟️ Fixture Difficulty</h4>
                <ul>
                    <li><span class="easy">Easy (FDR ≤ 2)</span>: 1.4× multiplier</li>
                    <li><span class="medium">Medium (FDR = 3)</span>: 1.0× baseline</li>
                    <li><span class="hard">Hard (FDR ≥ 4)</span>: 0.65× reduced</li>
                </ul>
            </div>
            <div class="multiplier">
                <h4>⏱️ Availability Factor</h4>
                <ul>
                    <li><span class="easy">60+ min/game</span>: 1.0×</li>
                    <li><span class="medium">45-60 min/game</span>: 0.75×</li>
                    <li><span class="hard">30-45 min/game</span>: 0.5×</li>
                    <li><span class="hard">&lt;30 min/game</span>: 0.3×</li>
                </ul>
                <p class="small-text">Also adjusted by chance of playing next round.</p>
            </div>
        </div>
    </div>

    <div class="value-calculation">
        <h3>💰 Value Rating</h3>
        <div class="formula">Value = xP ÷ Price (£m)</div>
        <p>Used to identify expected points per million spent.</p>
    </div>
`;

function renderXPMethodology(targetId) {
    const container = document.getElementById(targetId);
    if (!container) return;
    container.innerHTML = XP_CALCULATION_CONTENT;
}

function renderAllXPMethodology() {
    ['methodologyContent', 'analysisContent', 'comparisonMethodologyContent'].forEach(renderXPMethodology);
}

window.renderXPMethodology = renderXPMethodology;
window.renderAllXPMethodology = renderAllXPMethodology;

document.addEventListener('DOMContentLoaded', () => {
    renderAllXPMethodology();
});
