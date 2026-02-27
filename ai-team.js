let isLoading = false;
const API_BASE = 'https://fantasy.premierleague.com/api';

async function fetchWithProxy(url) {
    const proxies = [
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://api.allorigins.win/raw?url=',
    ];

    for (let i = 0; i < proxies.length; i++) {
        try {
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const proxyUrl = proxies[i] ? `${proxies[i]}${encodeURIComponent(url)}` : url;
            console.log(`Attempt ${i + 1}: ${proxies[i] ? 'with proxy' : 'direct'}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors',
                cache: 'no-cache',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log('Success!');
            return data;
        } catch (error) {
            console.log(`Attempt ${i + 1} failed:`, error.message);
            if (i === proxies.length - 1) throw error;
        }
    }
}

function getPositionName(type) {
    const positions = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
    return positions[type] || 'Unknown';
}

// Helper function to organize fixtures by gameweek
function getFixturesByGameweek(player, fixtures, numGameweeks) {
    if (!fixtures || fixtures.length === 0) return [];
    
    // Get all upcoming fixtures for this player's team
    const allTeamFixtures = fixtures
        .filter(f => !f.finished && f.event && (f.team_h === player.team || f.team_a === player.team))
        .sort((a, b) => a.event - b.event);
    
    if (allTeamFixtures.length === 0) return [];
    
    // Get the next N gameweeks
    const firstGW = allTeamFixtures[0].event;
    const gameweeks = [];
    
    for (let i = 0; i < numGameweeks; i++) {
        const gw = firstGW + i;
        const gwFixtures = allTeamFixtures.filter(f => f.event === gw);
        
        gameweeks.push({
            gameweek: gw,
            fixtures: gwFixtures,
            isBlank: gwFixtures.length === 0,
            isDouble: gwFixtures.length > 1
        });
    }
    
    return gameweeks;
}

function getNextFixtures(player, fixtures, teamsById, count = 1) {
    if (!fixtures || fixtures.length === 0) {
        console.warn('No fixtures data available');
        return [];
    }
    
    const fixturesByGW = getFixturesByGameweek(player, fixtures, count);
    
    return fixturesByGW.flatMap(gw => {
        if (gw.isBlank) {
            return [{
                opponent: 'BLANK',
                isHome: false,
                difficulty: 0,
                difficultyClass: 'blank',
                isBlank: true
            }];
        }
        
        return gw.fixtures.map(fixture => {
            const isHome = fixture.team_h === player.team;
            const opponentId = isHome ? fixture.team_a : fixture.team_h;
            const opponent = teamsById[opponentId];
            const difficulty = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
            
            return {
                opponent: opponent ? opponent.short_name : 'TBA',
                isHome: isHome,
                difficulty: difficulty,
                difficultyClass: getFixtureDifficulty(difficulty),
                isDouble: gw.isDouble
            };
        });
    });
}

function getFixtureDifficulty(difficulty) {
    if (difficulty === 1) return 'very-easy';
    if (difficulty === 2) return 'easy';
    if (difficulty === 3) return 'medium';
    if (difficulty === 4) return 'hard';
    return 'very-hard';
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
    const gamesStarted = parseInt(player.starts || 0);
    const gamesPlayed = Math.max(gamesStarted, 1);
    const avgMinutesPerGame = minutesPlayed / gamesPlayed;
    
    let availabilityFactor;
    if (avgMinutesPerGame >= 60) {
        availabilityFactor = 1.0;
    } else if (avgMinutesPerGame >= 45) {
        availabilityFactor = 0.75;
    } else if (avgMinutesPerGame >= 30) {
        availabilityFactor = 0.5;
    } else if (avgMinutesPerGame > 0) {
        availabilityFactor = 0.3;
    } else {
        availabilityFactor = 0.1;
    }
    
    const chanceOfPlaying = parseInt(player.chance_of_playing_next_round || 100);
    if (chanceOfPlaying < 100) {
        availabilityFactor *= (chanceOfPlaying / 100);
    }
    
    if (form === 0 && pointsPerGame === 0 && ictIndex === 0) {
        return (player.total_points / Math.max(player.minutes / 90, 1) * numGameweeks) * availabilityFactor;
    }
    
    // Get fixtures organized by gameweek (handles blank/double GWs)
    const fixturesByGW = getFixturesByGameweek(player, fixtures, numGameweeks);
    
    if (fixturesByGW.length === 0) {
        const baseXP = (form * 0.15 + pointsPerGame * 0.35 + (ictIndex / 20) * 0.5);
        return baseXP * numGameweeks * availabilityFactor;
    }
    
    const optaScore = (
        (expectedGoals * 5) +
        (expectedAssists * 3) +
        (influence / 100) +
        (creativity / 100) +
        (threat / 100) +
        (ictIndex / 50)
    );
    
    const isDefender = player.element_type === 2;
    const isGoalkeeper = player.element_type === 1;
    const cleanSheetsPerGame = player.clean_sheets / Math.max(player.starts || 1, 1);
    
    // Process each gameweek (accounting for blank and double gameweeks)
    fixturesByGW.forEach(gw => {
        if (gw.isBlank) {
            // Blank gameweek = 0 points
            return;
        }
        
        let gwPoints = 0;
        
        // Calculate points for each fixture in this gameweek
        gw.fixtures.forEach(fixture => {
            const isHome = fixture.team_h === player.team;
            const difficulty = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
            
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
            const venueMultiplier = 1.0;
            
            gwPoints += basePoints * difficultyMultiplier * venueMultiplier;
        });
        
        // Apply double gameweek adjustment (rotation/fatigue factor)
        if (gw.isDouble) {
            // In double gameweeks, players don't score exactly 2x due to rotation and fatigue
            // Apply 0.85 factor per game (so 2 games = 1.7x instead of 2.0x)
            gwPoints *= 0.85;
        }
        
        xP += gwPoints * availabilityFactor;
    });
    
    return xP;
}

function buildOptimalXI(allPlayers, fixturesData) {
    // Build best XI for 1 GW (3-5-2 or similar formation)
    // Calculate xP for all players for 1 GW
    allPlayers.forEach(p => {
        p.xpOneGW = calculateExpectedPoints(p, fixturesData, 1);
    });
    
    const XI = { 1: null, 2: [], 3: [], 4: [] };
    const usedPositions = [];
    
    // Select 1 GKP
    const gkps = allPlayers
        .filter(p => p.element_type === 1 && p.chance_of_playing_next_round !== 0 && p.status === 'a')
        .sort((a, b) => b.xpOneGW - a.xpOneGW);
    XI[1] = gkps[0];
    
    // Select 5 DEF
    const defs = allPlayers
        .filter(p => p.element_type === 2 && p.chance_of_playing_next_round !== 0 && p.status === 'a')
        .sort((a, b) => b.xpOneGW - a.xpOneGW)
        .slice(0, 5);
    XI[2] = defs;
    
    // Select 5 MID
    const mids = allPlayers
        .filter(p => p.element_type === 3 && p.chance_of_playing_next_round !== 0 && p.status === 'a')
        .sort((a, b) => b.xpOneGW - a.xpOneGW)
        .slice(0, 5);
    XI[3] = mids;
    
    // Select 2 FWD
    const fwds = allPlayers
        .filter(p => p.element_type === 4 && p.chance_of_playing_next_round !== 0 && p.status === 'a')
        .sort((a, b) => b.xpOneGW - a.xpOneGW)
        .slice(0, 2);
    XI[4] = fwds;
    
    return XI;
}

async function buildAITeam() {
    if (isLoading) {
        console.log('Already loading, please wait...');
        return;
    }
    
    isLoading = true;
    
    document.getElementById('content').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    try {
        console.log('Fetching data...');
        const [bootstrapData, fixturesResponse] = await Promise.all([
            fetchWithProxy(`${API_BASE}/bootstrap-static/`),
            fetchWithProxy(`${API_BASE}/fixtures/`)
        ]);
        
        console.log('Building optimal XI...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('Processing data...');
        displayAiTeam(bootstrapData, fixturesResponse);
    } catch (error) {
        console.error('Error:', error);
        showError('Failed to load data. Please try again.');
    } finally {
        isLoading = false;
    }
}

function displayAiTeam(bootstrapData, fixturesResponse) {
    const teamsById = {};
    bootstrapData.teams.forEach(t => teamsById[t.id] = t);
    
    const fixturesData = fixturesResponse || [];
    
    // Build optimal XI for 1 GW
    const XI = buildOptimalXI(bootstrapData.elements, fixturesData);
    
    // Display XI on pitch
    displayXI(XI, teamsById, fixturesData);
    
    // Display Top Players for 5 GWs
    displayTopPlayers(bootstrapData.elements, teamsById, fixturesData);
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function displayXI(XI, teamsById, fixturesData) {
    let xiPlayers = '';
    
    // GKP
    if (XI[1]) {
        xiPlayers += createPlayerElement(XI[1], teamsById, 'gkp', fixturesData);
    }
    
    // DEF (3-5 players)
    XI[2].forEach((player, idx) => {
        xiPlayers += createPlayerElement(player, teamsById, 'def', fixturesData);
    });
    
    // MID (5 players)
    XI[3].forEach((player, idx) => {
        xiPlayers += createPlayerElement(player, teamsById, 'mid', fixturesData);
    });
    
    // FWD (2 players)
    XI[4].forEach((player, idx) => {
        xiPlayers += createPlayerElement(player, teamsById, 'fwd', fixturesData);
    });
    
    document.getElementById('xiPlayers').innerHTML = xiPlayers;
    
    // Display bench (remaining players or alternates)
    displayXIBench(XI);
    
    // Display XI summary
    displayXISummary(XI, fixturesData);
}

function createPlayerElement(player, teamsById, position, fixturesData) {
    const team = teamsById[player.team];
    const xpOneGW = calculateExpectedPoints(player, fixturesData, 1);
    const fixture = getNextFixtures(player, fixturesData, teamsById, 1)[0];
    let fixtureText = 'No fixture';
    let fixtureClass = '';
    
    if (fixture) {
        if (fixture.isBlank) {
            fixtureText = 'BLANK';
            fixtureClass = 'blank';
        } else {
            fixtureText = `vs ${fixture.opponent} ${fixture.isHome ? '(H)' : '(A)'}`;
            if (fixture.isDouble) {
                fixtureText += ' 🔥';
                fixtureClass = 'double';
            }
        }
    }
    
    return `
        <div class="player-tile" data-position="${position}">
            <div class="player-name-tile">${player.web_name}</div>
            <div class="player-team-tile">${team.short_name}</div>
            <div class="player-xp-tile">${xpOneGW.toFixed(1)} xP</div>
            <div class="player-fixture-tile ${fixtureClass}">${fixtureText}</div>
        </div>
    `;
}

function displayXIBench(XI) {
    const benchHTML = `
        <div class="bench-label">🔄 Alternatives</div>
        <div class="bench-players-grid">
            <div class="bench-info">Squad built with 1 GKP + ${XI[2].length} DEF + ${XI[3].length} MID + ${XI[4].length} FWD</div>
        </div>
    `;
    document.getElementById('xiBench').innerHTML = benchHTML;
}

function displayXISummary(XI, fixturesData) {
    let totalXP = 0;
    const positions = [1, 2, 3, 4];
    
    positions.forEach(pos => {
        if (pos === 1) {
            if (XI[1]) totalXP += XI[1].xpOneGW;
        } else {
            XI[pos].forEach(p => {
                totalXP += p.xpOneGW;
            });
        }
    });
    
    const summaryHTML = `
        <div class="xi-summary-card">
            <div class="summary-title">⚡ Squad Statistics</div>
            <div class="summary-stat">
                <span class="stat-label">Total xP (1 GW)</span>
                <span class="stat-value highlight">${totalXP.toFixed(1)} points</span>
            </div>
            <div class="summary-stat">
                <span class="stat-label">Average xP per Player</span>
                <span class="stat-value">${(totalXP / 11).toFixed(2)} points</span>
            </div>
            <div class="summary-stat">
                <span class="stat-label">Formation</span>
                <span class="stat-value">1-${XI[2].length}-${XI[3].length}-${XI[4].length}</span>
            </div>
        </div>
    `;
    
    document.getElementById('xiSummary').innerHTML = summaryHTML;
}

function displayTopPlayers(allPlayers, teamsById, fixturesData) {
    // Calculate xP for 5 GWs
    allPlayers.forEach(p => {
        p.xpFiveGW = calculateExpectedPoints(p, fixturesData, 5);
    });
    
    const topPlayersByPosition = {};
    [1, 2, 3, 4].forEach(pos => {
        topPlayersByPosition[pos] = allPlayers
            .filter(p => p.element_type === pos && p.chance_of_playing_next_round !== 0)
            .sort((a, b) => b.xpFiveGW - a.xpFiveGW)
            .slice(0, 5);
    });
    
    const topPlayers = document.getElementById('topPlayers');
    let topPlayersHTML = '';
    
    [1, 2, 3, 4].forEach(pos => {
        const posName = getPositionName(pos);
        const players = topPlayersByPosition[pos];
        
        topPlayersHTML += `
            <div class="position-section">
                <div class="position-title">
                    <span>${posName}</span>
                </div>
                <div class="players-grid">
                    ${players.map(p => {
                        const xP = p.xpFiveGW;
                        return `
                            <div class="player-card">
                                <div class="player-info">
                                    <div class="player-name">${p.web_name}</div>
                                    <div class="player-team">${teamsById[p.team].name}</div>
                                </div>
                                <div class="player-stats">
                                    <div class="stat-item">
                                        <span class="stat-label">Price</span>
                                        <span class="stat-value">£${(p.now_cost / 10).toFixed(1)}m</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Form</span>
                                        <span class="stat-value good">${p.form}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">xP (5GW)</span>
                                        <span class="stat-value good">${xP.toFixed(1)}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Selected</span>
                                        <span class="stat-value">${p.selected_by_percent}%</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });
    
    topPlayers.innerHTML = topPlayersHTML;
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
    errorDiv.style.display = 'block';
}

// Scroll to top
const scrollToTopBtn = document.getElementById('scrollToTop');

window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Auto-load on page load
window.addEventListener('DOMContentLoaded', () => {
    buildAITeam();
});

// Toggle methodology
function toggleMethodology() {
    const content = document.getElementById('methodologyContent');
    const icon = document.querySelector('.methodology .toggle-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.add('rotated');
    } else {
        content.style.display = 'none';
        icon.classList.remove('rotated');
    }
}
