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

// Helper function to get next full gameweek fixtures (gameweek that hasn't started yet)
function getNextGameweekFixtures(fixturesData) {
    if (!fixturesData || fixturesData.length === 0) return fixturesData;
    
    // Find the highest gameweek that has any finished fixture (current/latest completed GW)
    const finishedFixtures = fixturesData.filter(f => f.finished);
    let maxFinishedEvent = 0;
    if (finishedFixtures.length > 0) {
        maxFinishedEvent = Math.max(...finishedFixtures.map(f => f.event || 0));
    }
    
    // Next full gameweek = max finished event + 1 (or if no finished yet, first unfinished)
    let targetEvent;
    if (maxFinishedEvent > 0) {
        targetEvent = maxFinishedEvent + 1;
    } else {
        // No finished fixtures - find first unfinished event
        const unfinished = fixturesData.filter(f => !f.finished).sort((a, b) => a.event - b.event);
        targetEvent = unfinished.length > 0 ? unfinished[0].event : fixturesData[0].event;
    }
    
    // Get all fixtures for the target gameweek
    const nextGWFixtures = fixturesData.filter(f => f.event === targetEvent);
    return nextGWFixtures.length > 0 ? nextGWFixtures : fixturesData;
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
    
    // Get next gameweek fixtures for XI display (skip current GW if already started)
    const nextGWFixtures = getNextGameweekFixtures(fixturesData);
    
    // Build optimal XI for next full GW
    const XI = buildOptimalXI(bootstrapData.elements, nextGWFixtures);
    
    // Display XI on pitch
    displayXI(XI, teamsById, fixturesData);
    
    // Display Top Players for 5 GWs (use all future fixtures)
    displayTopPlayers(bootstrapData.elements, teamsById, fixturesData);
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function displayXI(XI, teamsById, fixturesData) {
    let xiPlayers = '';
    
    // GKP
    xiPlayers += '<div class="pitch-section pitch-section-gkp">';
    if (XI[1]) {
        xiPlayers += createPlayerElement(XI[1], teamsById, 'gkp', fixturesData);
    }
    xiPlayers += '</div>';
    
    // DEF (3-5 players)
    xiPlayers += '<div class="pitch-section pitch-section-def">';
    XI[2].forEach((player) => {
        xiPlayers += createPlayerElement(player, teamsById, 'def', fixturesData);
    });
    xiPlayers += '</div>';
    
    // MID (5 players)
    xiPlayers += '<div class="pitch-section pitch-section-mid">';
    XI[3].forEach((player) => {
        xiPlayers += createPlayerElement(player, teamsById, 'mid', fixturesData);
    });
    xiPlayers += '</div>';
    
    // FWD (2 players)
    xiPlayers += '<div class="pitch-section pitch-section-fwd">';
    XI[4].forEach((player) => {
        xiPlayers += createPlayerElement(player, teamsById, 'fwd', fixturesData);
    });
    xiPlayers += '</div>';
    
    document.getElementById('xiPlayers').innerHTML = xiPlayers;
    
    // Display XI summary
    displayXISummary(XI, fixturesData);
}

function createPlayerElement(player, teamsById, position, fixturesData) {
    const team = teamsById[player.team];
    // Calculate xP for 5 GW and divide by 5 to get normalized value for 1 match
    const xp5GW = calculateExpectedPoints(player, fixturesData, 5);
    const xpPerMatch = xp5GW / 5;
    const fixture = getNextFixtures(player, fixturesData, teamsById, 1)[0];
    let fixtureText = 'No fixture';
    
    if (fixture) {
        if (fixture.isBlank) {
            fixtureText = 'BLANK';
        } else {
            fixtureText = `vs ${fixture.opponent} ${fixture.isHome ? '(H)' : '(A)'}`;
            if (fixture.isDouble) {
                fixtureText += ' 🔥';
            }
        }
    }
    
    // Position emoji
    const positionEmojis = {
        'gkp': '🧤',
        'def': '🛡️',
        'mid': '⚽',
        'fwd': '🎯'
    };
    const emoji = positionEmojis[position] || '⚽';
    
    return `
        <div class="pitch-player">
            <div class="player-emoji">${emoji}</div>
            <div class="player-name">${player.web_name}<div style="margin-top: 2px; font-size: 0.75em; opacity: 0.85;">${fixtureText}</div></div>
            <div class="player-points ai-xp">${xpPerMatch.toFixed(1)} xP</div>
        </div>
    `;
}

function displayXISummary(XI, fixturesData) {
    let totalXP = 0;
    const positions = [1, 2, 3, 4];
    
    positions.forEach(pos => {
        if (pos === 1) {
            if (XI[1]) {
                const xp5GW = XI[1].xp5GW || calculateExpectedPoints(XI[1], fixturesData, 5);
                totalXP += xp5GW / 5;
            }
        } else {
            XI[pos].forEach(p => {
                const xp5GW = p.xp5GW || calculateExpectedPoints(p, fixturesData, 5);
                totalXP += xp5GW / 5;
            });
        }
    });
    
    const summaryHTML = `
        <div class="xi-summary-card">
            <div class="summary-title">⚡Expected Squad Statistics</div>
            <div class="summary-stat">
                <span class="stat-label">Total xP per Match</span>
                <span class="stat-value highlight">${totalXP.toFixed(1)} points</span>
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
    // Calculate xP for 5 GW
    allPlayers.forEach(p => {
        p.xp5GW = calculateExpectedPoints(p, fixturesData, 5);
    });
    
    const topPlayersByPosition = {};
    [1, 2, 3, 4].forEach(pos => {
        topPlayersByPosition[pos] = allPlayers
            .filter(p => p.element_type === pos && p.chance_of_playing_next_round !== 0)
            .sort((a, b) => b.xp5GW - a.xp5GW)
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
                        const xP = p.xp5GW;
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
