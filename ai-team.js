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

function getNextGameweekEvent(fixturesData) {
    if (!fixturesData || fixturesData.length === 0) return null;

    const fixturesWithEvent = fixturesData.filter(f => Number.isInteger(f.event));
    if (fixturesWithEvent.length === 0) return null;

    const finishedFixtures = fixturesWithEvent.filter(f => f.finished);
    if (finishedFixtures.length > 0) {
        const maxFinishedEvent = Math.max(...finishedFixtures.map(f => f.event));
        const hasNextEventFixtures = fixturesWithEvent.some(f => f.event === maxFinishedEvent + 1 && !f.finished);
        if (hasNextEventFixtures) return maxFinishedEvent + 1;
    }

    const unfinishedEvents = [...new Set(fixturesWithEvent.filter(f => !f.finished).map(f => f.event))].sort((a, b) => a - b);
    if (unfinishedEvents.length > 0) return unfinishedEvents[0];

    // Season likely finished: keep using the last available real GW from data.
    return Math.max(...fixturesWithEvent.map(f => f.event));
}

function getNextGameweekFixtures(fixturesData) {
    if (!fixturesData || fixturesData.length === 0) return fixturesData;

    const targetEvent = getNextGameweekEvent(fixturesData);
    if (targetEvent === null) return fixturesData;

    const nextGWFixtures = fixturesData.filter(f => f.event === targetEvent);
    return nextGWFixtures.length > 0 ? nextGWFixtures : fixturesData;
}

function getPlayerFixturesForEvent(player, fixturesData, event) {
    if (!fixturesData || !event) return [];
    return fixturesData.filter(f => f.event === event && (f.team_h === player.team || f.team_a === player.team));
}

function calculatePlayerXPForEvent(player, fixturesData, event) {
    const fixturesInEvent = getPlayerFixturesForEvent(player, fixturesData, event);
    if (fixturesInEvent.length === 0) return 0;

    // Map raw API fixtures to the format expected by calculateExpectedPoints
    // (f.team + f.difficulty) and pass only the target-event fixtures.
    // DGW: fixturesInEvent.length === 2, so xP is summed for both matches.
    const mappedFixtures = fixturesInEvent.map(fixture => {
        const isHome = fixture.team_h === player.team;
        return {
            team: player.team,
            event,
            finished: false,
            difficulty: isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty
        };
    });

    return calculateExpectedPoints(player, mappedFixtures, mappedFixtures.length);
}

function getFixturesByGameweek(player, fixtures, numGameweeks) {
    if (!fixtures || fixtures.length === 0) return [];

    const teamFixtures = fixtures
        .filter(f => f.event && (f.team_h === player.team || f.team_a === player.team))
        .sort((a, b) => a.event - b.event);

    if (teamFixtures.length === 0) return [];

    const unfinishedTeamFixtures = teamFixtures.filter(f => !f.finished);
    const firstGW = unfinishedTeamFixtures.length > 0
        ? unfinishedTeamFixtures[0].event
        : Math.max(...teamFixtures.map(f => f.event));

    const gameweeks = [];
    
    for (let i = 0; i < numGameweeks; i++) {
        const gw = firstGW + i;
        const gwFixtures = teamFixtures.filter(f => f.event === gw);
        
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



function buildOptimalXI(allPlayers, fixturesData, targetEvent) {
    allPlayers.forEach(p => {
        p.xpOneGW = calculatePlayerXPForEvent(p, fixturesData, targetEvent);
        p.hasFixtureInTargetGW = getPlayerFixturesForEvent(p, fixturesData, targetEvent).length > 0;
    });

    const isAvailable = (player) => {
        const hasChance = player.chance_of_playing_next_round !== 0;
        const isUnavailable = player.status === 'u';
        const hasRecentForm = parseFloat(player.form || 0) > 0;
        return hasChance && !isUnavailable && player.hasFixtureInTargetGW && hasRecentForm;
    };

    const sortedByPosition = {
        1: allPlayers
            .filter(p => p.element_type === 1 && isAvailable(p))
            .sort((a, b) => b.xpOneGW - a.xpOneGW),
        2: allPlayers
            .filter(p => p.element_type === 2 && isAvailable(p))
            .sort((a, b) => b.xpOneGW - a.xpOneGW),
        3: allPlayers
            .filter(p => p.element_type === 3 && isAvailable(p))
            .sort((a, b) => b.xpOneGW - a.xpOneGW),
        4: allPlayers
            .filter(p => p.element_type === 4 && isAvailable(p))
            .sort((a, b) => b.xpOneGW - a.xpOneGW)
    };

    const XI = { 1: null, 2: [], 3: [], 4: [] };
    if (sortedByPosition[1].length === 0) return XI;

    const bestGkp = sortedByPosition[1][0];
    let bestOutfield = null;

    for (let defCount = 3; defCount <= 5; defCount++) {
        for (let midCount = 2; midCount <= 5; midCount++) {
            const fwdCount = 10 - defCount - midCount;
            if (fwdCount < 1 || fwdCount > 3) continue;

            const defs = sortedByPosition[2].slice(0, defCount);
            const mids = sortedByPosition[3].slice(0, midCount);
            const fwds = sortedByPosition[4].slice(0, fwdCount);

            if (defs.length < defCount || mids.length < midCount || fwds.length < fwdCount) continue;

            const outfieldXP = [...defs, ...mids, ...fwds].reduce((sum, player) => sum + player.xpOneGW, 0);

            if (!bestOutfield || outfieldXP > bestOutfield.totalXP) {
                bestOutfield = {
                    totalXP: outfieldXP,
                    defs,
                    mids,
                    fwds
                };
            }
        }
    }

    if (!bestOutfield) {
        return XI;
    }

    XI[1] = bestGkp;
    XI[2] = bestOutfield.defs;
    XI[3] = bestOutfield.mids;
    XI[4] = bestOutfield.fwds;

    return XI;
}

function setLoadingProgress(pct, text) {
    const fill = document.getElementById('loadingProgress');
    const label = document.getElementById('loadingPct');
    const msg = document.getElementById('loadingText');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = Math.round(pct) + '%';
    if (msg && text) msg.textContent = text;
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
    setLoadingProgress(0, 'Building optimal AI Starting XI...');
    
    try {
        console.log('Fetching data...');
        setLoadingProgress(10, 'Fetching player data...');
        const bootstrapData = await fetchWithProxy(`${API_BASE}/bootstrap-static/`);
        setLoadingProgress(55, 'Fetching fixtures...');
        const fixturesResponse = await fetchWithProxy(`${API_BASE}/fixtures/`);
        setLoadingProgress(80, 'Building optimal XI...');
        await new Promise(resolve => setTimeout(resolve, 300));
        setLoadingProgress(95, 'Rendering team...');
        displayAiTeam(bootstrapData, fixturesResponse);
        setLoadingProgress(100, 'Done!');
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
    const nextGWEvent = getNextGameweekEvent(fixturesData);

    const aiTeamHeader = document.getElementById('aiTeamHeader');
    if (aiTeamHeader) {
        aiTeamHeader.textContent = nextGWEvent
            ? `🏆 The best starting XI for GW ${nextGWEvent} by AI`
            : '🏆 The best starting XI for the next GW by AI';
    }
    
    const XI = buildOptimalXI(bootstrapData.elements, fixturesData, nextGWEvent);

    displayXI(XI, teamsById, fixturesData, nextGWEvent);

    displayTopPlayers(bootstrapData.elements, teamsById, fixturesData);
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function displayXI(XI, teamsById, fixturesData, targetEvent) {
    let xiPlayers = '';

    xiPlayers += '<div class="pitch-section pitch-section-gkp">';
    if (XI[1]) {
        xiPlayers += createPlayerElement(XI[1], teamsById, 'gkp', fixturesData, targetEvent);
    }
    xiPlayers += '</div>';
    
    xiPlayers += '<div class="pitch-section pitch-section-def">';
    XI[2].forEach((player) => {
        xiPlayers += createPlayerElement(player, teamsById, 'def', fixturesData, targetEvent);
    });
    xiPlayers += '</div>';
    
    xiPlayers += '<div class="pitch-section pitch-section-mid">';
    XI[3].forEach((player) => {
        xiPlayers += createPlayerElement(player, teamsById, 'mid', fixturesData, targetEvent);
    });
    xiPlayers += '</div>';
    
    xiPlayers += '<div class="pitch-section pitch-section-fwd">';
    XI[4].forEach((player) => {
        xiPlayers += createPlayerElement(player, teamsById, 'fwd', fixturesData, targetEvent);
    });
    xiPlayers += '</div>';
    
    document.getElementById('xiPlayers').innerHTML = xiPlayers;
    
    displayXISummary(XI, fixturesData);
}

function createPlayerElement(player, teamsById, position, fixturesData, targetEvent) {
    const xpPerMatch = player.xpOneGW !== undefined
        ? player.xpOneGW
        : calculatePlayerXPForEvent(player, fixturesData, targetEvent);
    const fixturesInTargetGW = getPlayerFixturesForEvent(player, fixturesData, targetEvent);
    let fixtureText = 'No fixture';

    if (fixturesInTargetGW.length > 0) {
        const fixtureLabels = fixturesInTargetGW.map(fixture => {
            const isHome = fixture.team_h === player.team;
            const opponentId = isHome ? fixture.team_a : fixture.team_h;
            const opponent = teamsById[opponentId];
            return `${opponent ? opponent.short_name : 'TBA'} ${isHome ? '(H)' : '(A)'}`;
        });

        fixtureText = `vs ${fixtureLabels.join(' + ')}`;
        if (fixturesInTargetGW.length > 1) {
            fixtureText += ' 🔥';
        }
    }
    
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
                const xpOneGW = XI[1].xpOneGW !== undefined ? XI[1].xpOneGW : calculateExpectedPoints(XI[1], fixturesData, 1);
                totalXP += xpOneGW;
            }
        } else {
            XI[pos].forEach(p => {
                const xpOneGW = p.xpOneGW !== undefined ? p.xpOneGW : calculateExpectedPoints(p, fixturesData, 1);
                totalXP += xpOneGW;
            });
        }
    });
    
    const summaryHTML = `
        <div class="xi-summary-card">
            <div class="summary-title">⚡Expected Squad Statistics</div>
            <div class="summary-stat">
                <span class="stat-label">Total xP</span>
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

window.addEventListener('DOMContentLoaded', () => {
    buildAITeam();
});

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
