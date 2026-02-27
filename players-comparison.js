const API_BASE = 'https://fantasy.premierleague.com/api';

let allPlayers = [];
let selectedPlayers = {};
let comparisonChart = null;
let fixturesData = [];

// Initialize
async function init() {
    try {
        document.getElementById('loading').style.display = 'block';
        const [bootstrapData, fixturesResponse] = await Promise.all([
            fetchWithProxy(`${API_BASE}/bootstrap-static/`),
            fetchWithProxy(`${API_BASE}/fixtures/`)
        ]);
        
        window.teamsData = {};
        bootstrapData.teams.forEach(t => window.teamsData[t.id] = t);
        window.allPlayersData = bootstrapData.elements;
        fixturesData = fixturesResponse || [];
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        loadPlayers();
    } catch (error) {
        showError('Failed to load player data. Please try again.');
    }
}

async function fetchWithProxy(url) {
    const proxies = ['https://corsproxy.io/?', 'https://api.codetabs.com/v1/proxy?quest=', 'https://api.allorigins.win/raw?url='];
    
    for (let i = 0; i < proxies.length; i++) {
        try {
            // Add delay between proxy attempts
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const proxyUrl = proxies[i] ? `${proxies[i]}${encodeURIComponent(url)}` : url;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(proxyUrl, { method: 'GET', headers: { 'Accept': 'application/json' }, mode: 'cors', cache: 'no-cache', signal: controller.signal });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (i === proxies.length - 1) throw error;
        }
    }
}

function getPositionName(type) {
    const positions = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
    return positions[type] || 'Unknown';
}

function calculateExpectedPoints(player, fixtures, numGameweeks = 5) {
    let xP = 0;
    const form = parseFloat(player.form) || 0;
    const pointsPerGame = parseFloat(player.points_per_game) || 0;
    const expectedGoals = parseFloat(player.expected_goals || 0);
    const expectedAssists = parseFloat(player.expected_assists || 0);
    const expectedGoalInvolvements = parseFloat(player.expected_goal_involvements || 0);
    const ictIndex = parseFloat(player.ict_index || 0);
    const influence = parseFloat(player.influence || 0);
    const creativity = parseFloat(player.creativity || 0);
    const threat = parseFloat(player.threat || 0);
    
    const minutesPlayed = parseInt(player.minutes || 0);
    const gamesStarted = parseInt(player.starts || 1);
    const avgMinutesPerGame = minutesPlayed / gamesStarted;
    
    let availabilityFactor = avgMinutesPerGame >= 60 ? 1.0 : avgMinutesPerGame >= 45 ? 0.75 : avgMinutesPerGame >= 30 ? 0.5 : avgMinutesPerGame > 0 ? 0.3 : 0.1;
    const chanceOfPlaying = parseInt(player.chance_of_playing_next_round || 100);
    if (chanceOfPlaying < 100) availabilityFactor *= (chanceOfPlaying / 100);
    
    if (form === 0 && pointsPerGame === 0 && ictIndex === 0) {
        return (player.total_points / Math.max(player.minutes / 90, 1) * numGameweeks) * availabilityFactor;
    }
    
    const playerFixtures = fixtures.filter(f => f.team === player.team && !f.finished).sort((a, b) => a.event - b.event).slice(0, numGameweeks);
    
    if (playerFixtures.length === 0) {
        const baseXP = form * 0.15 + pointsPerGame * 0.35 + (ictIndex / 20) * 0.5;
        return baseXP * numGameweeks * availabilityFactor;
    }
    
    const optaScore = (expectedGoals * 5) + (expectedAssists * 3) + (influence / 100) + (creativity / 100) + (threat / 100) + (ictIndex / 50);
    const isDefender = player.element_type === 2;
    const isGoalkeeper = player.element_type === 1;
    const cleanSheetsPerGame = player.clean_sheets / Math.max(player.starts || 1, 1);
    
    playerFixtures.forEach(fixture => {
        const difficulty = fixture.difficulty || 3;
        const formComponent = form * 0.1;
        const pointsPerGameComponent = pointsPerGame * 0.25;
        const optaComponent = optaScore * 0.4;
        const xGIComponent = isGoalkeeper ? 0 : (expectedGoalInvolvements * 0.25);
        
        let basePoints = formComponent + pointsPerGameComponent + optaComponent + xGIComponent;
        
        if (isDefender || isGoalkeeper) {
            let cleanSheetProbability = 0;
            if (difficulty <= 2) {
                cleanSheetProbability = 0.50 + (cleanSheetsPerGame * 0.3);
            } else if (difficulty === 3) {
                cleanSheetProbability = 0.30 + (cleanSheetsPerGame * 0.2);
            } else {
                cleanSheetProbability = 0.15 + (cleanSheetsPerGame * 0.1);
            }
            cleanSheetProbability = Math.min(Math.max(cleanSheetProbability, 0), 0.80);
            const expectedCleanSheetPoints = cleanSheetProbability * 4;
            
            if (isGoalkeeper) {
                const savesPerGame = player.saves / Math.max(player.starts || 1, 1);
                const expectedSavePoints = (savesPerGame / 3);
                basePoints += expectedSavePoints;
            }
            basePoints += expectedCleanSheetPoints;
        }
        
        const difficultyMultiplier = difficulty <= 2 ? 1.4 : difficulty <= 3 ? 1.0 : 0.65;
        xP += basePoints * difficultyMultiplier * availabilityFactor;
    });
    
    if (playerFixtures.length < numGameweeks && playerFixtures.length > 0) {
        const avgPerFixture = xP / playerFixtures.length;
        xP = avgPerFixture * numGameweeks;
    }
    
    return xP;
}

function loadPlayers() {
    const positionFilter = document.getElementById('positionFilter').value;
    const players = window.allPlayersData.filter(p => p.element_type == positionFilter).sort((a, b) => a.web_name.localeCompare(b.web_name));
    
    allPlayers = players.map(p => ({
        id: p.id,
        name: p.web_name,
        team: window.teamsData[p.team].short_name,
        price: (p.now_cost / 10).toFixed(1),
        form: p.form || 0,
        data: p,
        text: `${p.web_name} (${window.teamsData[p.team].short_name}) - £${(p.now_cost / 10).toFixed(1)}m`
    }));
    
    updatePlayerLists();
    resetComparison();
}

function updatePlayerLists() {
    ['player1Select', 'player2Select'].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = '<option value="">Select player...</option>' + allPlayers.map(p => `<option value="${p.id}">${p.text}</option>`).join('');
    });
}

function filterPlayers(playerNum) {
    const searchTerm = document.getElementById(`player${playerNum}Search`).value.toLowerCase();
    const select = document.getElementById(`player${playerNum}Select`);
    const filtered = allPlayers.filter(p => p.text.toLowerCase().includes(searchTerm));
    select.innerHTML = '<option value="">Select player...</option>' + filtered.map(p => `<option value="${p.id}">${p.text}</option>`).join('');
}

function selectPlayer(playerNum) {
    const select = document.getElementById(`player${playerNum}Select`);
    const playerId = parseInt(select.value);
    
    if (playerId) {
        const player = allPlayers.find(p => p.id === playerId);
        selectedPlayers[`player${playerNum}`] = player;
        document.getElementById('compareBtn').style.display = 'block';
    }
}

async function comparePlayers() {
    if (!selectedPlayers.player1 || !selectedPlayers.player2) {
        alert('Please select both players');
        return;
    }
    
    const gameweeks = parseInt(document.getElementById('gameweeksFilter').value);
    const p1Data = selectedPlayers.player1.data;
    const p2Data = selectedPlayers.player2.data;
    
    p1Data.expectedPoints = calculateExpectedPoints(p1Data, fixturesData, gameweeks);
    p2Data.expectedPoints = calculateExpectedPoints(p2Data, fixturesData, gameweeks);
    
    displayComparison(selectedPlayers.player1, selectedPlayers.player2, p1Data, p2Data, gameweeks);
    createChart(p1Data, p2Data, gameweeks);
}

function displayComparison(player1, player2, p1Data, p2Data, gameweeks) {
    const result = document.getElementById('comparisonResult');
    const value1 = p1Data.expectedPoints / (p1Data.now_cost / 10);
    const value2 = p2Data.expectedPoints / (p2Data.now_cost / 10);
    const winner = p1Data.expectedPoints > p2Data.expectedPoints ? player1 : player2;
    const winnerData = p1Data.expectedPoints > p2Data.expectedPoints ? p1Data : p2Data;
    
    result.innerHTML = `
        <div class="comparison-results">
            <div class="player-card ${p1Data.expectedPoints > p2Data.expectedPoints ? 'winner' : ''}">
                <h3>${player1.name}</h3>
                <p class="team">${player1.team}</p>
                <div class="stats">
                    <div class="stat"><span>Price</span><span>£${player1.price}m</span></div>
                    <div class="stat highlight"><span>xP (Next ${gameweeks} GW)</span><span>${p1Data.expectedPoints.toFixed(1)}</span></div>
                    <div class="stat"><span>Value (xP/£)</span><span>${value1.toFixed(2)}</span></div>
                    <div class="stat"><span>Form</span><span>${p1Data.form}</span></div>
                    <div class="stat"><span>PPG</span><span>${p1Data.points_per_game}</span></div>
                    <div class="stat"><span>Selected %</span><span>${p1Data.selected_by_percent}%</span></div>
                </div>
            </div>
            <div class="vs">VS</div>
            <div class="player-card ${p2Data.expectedPoints > p1Data.expectedPoints ? 'winner' : ''}">
                <h3>${player2.name}</h3>
                <p class="team">${player2.team}</p>
                <div class="stats">
                    <div class="stat"><span>Price</span><span>£${player2.price}m</span></div>
                    <div class="stat highlight"><span>xP (Next ${gameweeks} GW)</span><span>${p2Data.expectedPoints.toFixed(1)}</span></div>
                    <div class="stat"><span>Value (xP/£)</span><span>${value2.toFixed(2)}</span></div>
                    <div class="stat"><span>Form</span><span>${p2Data.form}</span></div>
                    <div class="stat"><span>PPG</span><span>${p2Data.points_per_game}</span></div>
                    <div class="stat"><span>Selected %</span><span>${p2Data.selected_by_percent}%</span></div>
                </div>
            </div>
        </div>
        <div class="summary">
            <p><strong>${winner.name}</strong> is expected to score <strong>${winnerData.expectedPoints.toFixed(1)}</strong> points in the next ${gameweeks} gameweeks, giving them the edge.</p>
        </div>
    `;
}

function createChart(p1Data, p2Data, gameweeks) {
    document.getElementById('comparisonChart').style.display = 'block';
    
    if (comparisonChart) comparisonChart.destroy();
    
    const ctx = document.getElementById('playerComparisonCanvas');
    const labels = ['xP', 'Form', 'PPG', 'Value', 'Selected %'];
    const value1 = p1Data.expectedPoints / (p1Data.now_cost / 10);
    const value2 = p2Data.expectedPoints / (p2Data.now_cost / 10);
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: p1Data.web_name,
                    data: [p1Data.expectedPoints, parseFloat(p1Data.form) || 0, parseFloat(p1Data.points_per_game) || 0, value1, parseFloat(p1Data.selected_by_percent) || 0],
                    backgroundColor: 'rgba(0, 204, 106, 0.7)',
                    borderColor: 'rgba(0, 204, 106, 1)',
                    borderWidth: 2
                },
                {
                    label: p2Data.web_name,
                    data: [p2Data.expectedPoints, parseFloat(p2Data.form) || 0, parseFloat(p2Data.points_per_game) || 0, value2, parseFloat(p2Data.selected_by_percent) || 0],
                    backgroundColor: 'rgba(4, 245, 255, 0.7)',
                    borderColor: 'rgba(4, 245, 255, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function resetComparison() {
    document.getElementById('comparisonResult').innerHTML = '';
    document.getElementById('comparisonChart').style.display = 'none';
    document.getElementById('compareBtn').style.display = 'none';
    selectedPlayers = {};
}

function toggleFullscreen(elementId) {
    const element = document.getElementById(elementId);
    if (!document.fullscreenElement) {
        element.requestFullscreen ? element.requestFullscreen() : element.webkitRequestFullscreen && element.webkitRequestFullscreen();
    } else {
        document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen && document.webkitExitFullscreen();
    }
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
    errorDiv.style.display = 'block';
}

// Scroll to top
window.addEventListener('scroll', () => {
    const btn = document.getElementById('scrollToTop');
    btn.classList.toggle('visible', window.pageYOffset > 300);
});

document.getElementById('scrollToTop')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Initialize on load
window.addEventListener('DOMContentLoaded', init);
