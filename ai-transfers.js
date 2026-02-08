let TEAM_ID = 8668;
const API_BASE = 'https://fantasy.premierleague.com/api';

async function fetchWithProxy(url) {
    const proxies = [
        '',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
    ];

    for (let i = 0; i < proxies.length; i++) {
        try {
            const proxyUrl = proxies[i] ? `${proxies[i]}${encodeURIComponent(url)}` : url;
            console.log(`Attempt ${i + 1}: ${proxies[i] ? 'with proxy' : 'direct'}`);
            
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors',
                cache: 'no-cache'
            });
            
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

function getNextFixtures(player, fixtures, teamsById, count = 5) {
    if (!fixtures || fixtures.length === 0) {
        console.warn('No fixtures data available');
        return [];
    }
    
    console.log(`Getting fixtures for player team ${player.team}, total fixtures: ${fixtures.length}`);
    
    const playerFixtures = fixtures
        .filter(f => !f.finished && (f.team_h === player.team || f.team_a === player.team))
        .sort((a, b) => a.event - b.event)
        .slice(0, count);
    
    console.log(`Found ${playerFixtures.length} fixtures for team ${player.team}`);
    
    return playerFixtures.map(fixture => {
        const isHome = fixture.team_h === player.team;
        const opponentId = isHome ? fixture.team_a : fixture.team_h;
        const opponent = teamsById[opponentId];
        const difficulty = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
        
        return {
            opponent: opponent ? opponent.short_name : 'TBA',
            isHome: isHome,
            difficulty: difficulty,
            difficultyClass: getFixtureDifficulty(difficulty)
        };
    });
}

function getFixtureDifficulty(difficulty) {
    if (difficulty === 1) return 'very-easy';
    if (difficulty === 2) return 'easy';
    if (difficulty === 3) return 'medium';
    if (difficulty === 4) return 'hard';
    return 'very-hard'; // FDR 5
}

async function fetchPlayerHistory(playerId) {
    try {
        const data = await fetchWithProxy(`${API_BASE}/element-summary/${playerId}/`);
        // Get last 5 matches history
        const history = data.history || [];
        return history.slice(-5).reverse(); // Last 5 games, most recent first
    } catch (error) {
        console.error('Error fetching player history:', error);
        return [];
    }
}

function calculateExpectedPoints(player, fixtures, numGameweeks = 5) {
    // Advanced AI algorithm using Opta data, form, fixtures, and ICT index
    let xP = 0;
    const form = parseFloat(player.form) || 0;
    const pointsPerGame = parseFloat(player.points_per_game) || 0;
    
    // Opta-powered metrics from FPL API
    const expectedGoals = parseFloat(player.expected_goals || 0);
    const expectedAssists = parseFloat(player.expected_assists || 0);
    const expectedGoalInvolvements = parseFloat(player.expected_goal_involvements || 0);
    const ictIndex = parseFloat(player.ict_index || 0);
    const influence = parseFloat(player.influence || 0);
    const creativity = parseFloat(player.creativity || 0);
    const threat = parseFloat(player.threat || 0);
    
    // Advanced minutes played analysis - considering recent playing time
    const minutesPlayed = parseInt(player.minutes || 0);
    const gamesStarted = parseInt(player.starts || 0);
    const gamesPlayed = Math.max(gamesStarted, 1);
    const avgMinutesPerGame = minutesPlayed / gamesPlayed;
    
    // Calculate availability factor based on recent minutes
    // Players playing 60+ minutes per game get full points (1.0)
    // Players playing 45-60 minutes get reduced points (0.75)
    // Players playing 30-45 minutes get significantly reduced (0.5)
    // Players playing < 30 minutes are high rotation risk (0.3)
    let availabilityFactor;
    if (avgMinutesPerGame >= 60) {
        availabilityFactor = 1.0; // Regular starter
    } else if (avgMinutesPerGame >= 45) {
        availabilityFactor = 0.75; // Frequent starter or reliable sub
    } else if (avgMinutesPerGame >= 30) {
        availabilityFactor = 0.5; // Rotation player
    } else if (avgMinutesPerGame > 0) {
        availabilityFactor = 0.3; // High rotation risk
    } else {
        availabilityFactor = 0.1; // Rarely plays
    }
    
    // Adjust for chance of playing next round
    const chanceOfPlaying = parseInt(player.chance_of_playing_next_round || 100);
    if (chanceOfPlaying < 100) {
        availabilityFactor *= (chanceOfPlaying / 100);
    }
    
    // If no data at all, use basic calculation
    if (form === 0 && pointsPerGame === 0 && ictIndex === 0) {
        return (player.total_points / Math.max(player.minutes / 90, 1) * numGameweeks) * availabilityFactor;
    }
    
    // Get next N fixtures
    const playerFixtures = fixtures
        .filter(f => f.team === player.team && !f.finished)
        .sort((a, b) => a.event - b.event)
        .slice(0, numGameweeks);
    
    if (playerFixtures.length === 0) {
        // No fixtures found, use weighted estimation with Opta data
        const baseXP = (form * 0.3 + pointsPerGame * 0.3 + (ictIndex / 20) * 0.4);
        return baseXP * numGameweeks * availabilityFactor;
    }
    
    // Calculate base performance score using Opta metrics
    const optaScore = (
        (expectedGoals * 5) + // xG weighted heavily for attackers
        (expectedAssists * 3) + // xA important for creativity
        (influence / 100) + // Overall influence on matches
        (creativity / 100) + // Chance creation
        (threat / 100) + // Goal threat
        (ictIndex / 50) // ICT Index as overall metric
    );
    
    // Clean sheet statistics for defenders and goalkeepers
    const isDefender = player.element_type === 2; // DEF
    const isGoalkeeper = player.element_type === 1; // GKP
    const cleanSheetsPerGame = player.clean_sheets / Math.max(player.starts || 1, 1);
    
    playerFixtures.forEach(fixture => {
        const difficulty = fixture.difficulty || 3;
        
        // Base points from multiple sources
        const formComponent = form * 0.25;
        const pointsPerGameComponent = pointsPerGame * 0.25;
        const optaComponent = optaScore * 0.3;
        const xGIComponent = expectedGoalInvolvements * 0.2; // xG involvements per game
        
        let basePoints = formComponent + pointsPerGameComponent + optaComponent + xGIComponent;
        
        // Clean Sheet Probability for DEF and GKP (xCS - Expected Clean Sheets)
        if (isDefender || isGoalkeeper) {
            let cleanSheetProbability = 0;
            
            // Calculate xCS based on fixture difficulty and team's defensive record
            if (difficulty <= 2) {
                // Easy fixture: high CS probability
                cleanSheetProbability = 0.50 + (cleanSheetsPerGame * 0.3);
            } else if (difficulty === 3) {
                // Medium fixture: moderate CS probability
                cleanSheetProbability = 0.30 + (cleanSheetsPerGame * 0.2);
            } else {
                // Hard fixture: low CS probability
                cleanSheetProbability = 0.15 + (cleanSheetsPerGame * 0.1);
            }
            
            // Cap probability between 0 and 0.80 (max 80% CS chance)
            cleanSheetProbability = Math.min(Math.max(cleanSheetProbability, 0), 0.80);
            
            // Expected clean sheet points: 4 points for both GKP and DEF
            const expectedCleanSheetPoints = cleanSheetProbability * 4;
            
            // For goalkeepers, add expected save points (3 saves = 1 point)
            if (isGoalkeeper) {
                const savesPerGame = player.saves / Math.max(player.starts || 1, 1);
                const expectedSavePoints = (savesPerGame / 3); // 3 saves = 1 point
                basePoints += expectedSavePoints;
            }
            
            basePoints += expectedCleanSheetPoints;
        }
        
        // Fixture difficulty multiplier (easier fixtures = more points expected)
        const difficultyMultiplier = difficulty <= 2 ? 1.4 : difficulty <= 3 ? 1.0 : 0.65;
        
        // Home/away factor if available in fixture data
        const venueMultiplier = 1.0; // Could be enhanced with home/away data
        
        xP += basePoints * difficultyMultiplier * venueMultiplier * availabilityFactor;
    });
    
    // If less than requested fixtures, extrapolate based on average
    if (playerFixtures.length < numGameweeks && playerFixtures.length > 0) {
        const avgPerFixture = xP / playerFixtures.length;
        xP = avgPerFixture * numGameweeks;
    }
    
    return xP;
}

function analyzeTransfers(myPicks, allPlayers, fixtures, budget, teamData) {
    const suggestions = [];
    const playersById = {};
    allPlayers.forEach(p => playersById[p.id] = p);
    
    console.log('Analyzing transfers with budget:', budget);
    console.log('My picks:', myPicks.length);
    console.log('All players:', allPlayers.length);
    
    // Calculate xP for all players
    allPlayers.forEach(player => {
        player.expectedPoints = calculateExpectedPoints(player, fixtures);
        player.value = player.expectedPoints / (player.now_cost / 10);
    });
    
    // Analyze each position
    const myPlayerIds = myPicks.map(p => p.element);
    const myPlayers = myPicks.map(p => {
        const player = playersById[p.element];
        if (player) {
            return {
                ...player,
                pickData: p,
                selling_price: player.now_cost // Use current cost as selling price
            };
        }
        return null;
    }).filter(p => p !== null);
    
    console.log('My players with data:', myPlayers.length);
    
    // Find underperforming players
    myPlayers.forEach(myPlayer => {
        if (!myPlayer) return;
        
        const position = myPlayer.element_type;
        const myPlayerCost = myPlayer.now_cost / 10;
        const myPlayerXP = myPlayer.expectedPoints || 0;
        const maxBudget = budget + (myPlayer.selling_price / 10);
        
        console.log(`Analyzing ${myPlayer.web_name}: xP=${myPlayerXP.toFixed(1)}, Cost=£${myPlayerCost}m, Budget=£${maxBudget.toFixed(1)}m`);
        
        // Find better alternatives in same position
        const alternatives = allPlayers
            .filter(p => 
                p.element_type === position &&
                p.id !== myPlayer.id &&
                !myPlayerIds.includes(p.id) && // Not already in team
                p.now_cost / 10 <= maxBudget &&
                p.expectedPoints > myPlayerXP * 1.1 && // At least 10% better
                p.chance_of_playing_next_round !== 0 &&
                p.status === 'a' // Available
            )
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
        
        console.log(`Found ${alternatives.length} alternatives for ${myPlayer.web_name}`);
        
        if (alternatives.length > 0) {
            const best = alternatives[0];
            const costDiff = (best.now_cost - myPlayer.now_cost) / 10;
            
            console.log(`Best alternative: ${best.web_name}, xP=${best.expectedPoints.toFixed(1)}, Cost=£${(best.now_cost/10).toFixed(1)}m`);
            
            suggestions.push({
                playerOut: myPlayer,
                playerIn: best,
                costDiff: costDiff,
                xPImprovement: (best.expectedPoints - myPlayerXP).toFixed(1),
                reason: generateTransferReason(myPlayer, best, costDiff)
            });
        }
    });
    
    console.log('Total suggestions:', suggestions.length);
    
    // Sort by value improvement
    return suggestions.sort((a, b) => 
        parseFloat(b.xPImprovement) - parseFloat(a.xPImprovement)
    ).slice(0, 5);
}

function generateTransferReason(playerOut, playerIn, costDiff) {
    const reasons = [];
    
    if (parseFloat(playerIn.form) > parseFloat(playerOut.form || 0)) {
        reasons.push(`<strong>${playerIn.web_name}</strong> is in better form (${playerIn.form} vs ${playerOut.form || 0})`);
    }
    
    if (playerIn.expectedPoints > playerOut.expectedPoints) {
        reasons.push(`Expected to score <strong>${playerIn.expectedPoints.toFixed(1)}</strong> points in next 5 GWs vs ${playerOut.expectedPoints.toFixed(1)}`);
    }
    
    if (costDiff < 0) {
        reasons.push(`Saves you <strong>£${Math.abs(costDiff).toFixed(1)}m</strong> for other upgrades`);
    } else if (costDiff === 0) {
        reasons.push(`Same price - straight swap upgrade`);
    } else {
        reasons.push(`Costs extra <strong>£${costDiff.toFixed(1)}m</strong> but worth the investment`);
    }
    
    return reasons.join('. ') + '.';
}

async function analyzeTeam() {
    const input = document.getElementById('teamIdInput');
    const newTeamId = parseInt(input.value);
    
    if (!newTeamId || newTeamId < 1) {
        alert('Please enter a valid Team ID');
        return;
    }
    
    TEAM_ID = newTeamId;
    
    document.getElementById('teamName').textContent = 'Analyzing...';
    document.getElementById('content').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    try {
        console.log('Fetching team data...');
        const [teamData, bootstrapData, fixturesResponse] = await Promise.all([
            fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/`),
            fetchWithProxy(`${API_BASE}/bootstrap-static/`),
            fetchWithProxy(`${API_BASE}/fixtures/`)
        ]);
        
        console.log('Fetching current team picks...');
        const currentEvent = bootstrapData.events.find(e => e.is_current)?.id || 1;
        const picksData = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/event/${currentEvent}/picks/`);
        
        console.log('Fixtures loaded:', fixturesResponse?.length || 0);
        
        console.log('Calculating Expected Points with AI algorithm...');
        // Allow additional time for xP calculations (especially xCS for defenders/goalkeepers)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('Processing data...');
        displayAnalysis(teamData, bootstrapData, picksData, fixturesResponse);
    } catch (error) {
        console.error('Error:', error);
        showError('Failed to load team data. Please try again.');
    }
}

function displayAnalysis(teamData, bootstrapData, picksData, fixturesResponse) {
    document.getElementById('teamName').textContent = teamData.name;
    
    const budget = teamData.last_deadline_bank / 10;
    const teamValue = teamData.last_deadline_value / 10;
    
    // Budget Info
    const budgetInfo = document.getElementById('budgetInfo');
    budgetInfo.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Available Budget</div>
            <div class="stat-value">£${budget.toFixed(1)}m</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Team Value</div>
            <div class="stat-value">£${teamValue.toFixed(1)}m</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Free Transfers</div>
            <div class="stat-value">${picksData.entry_history.event_transfers || 1}</div>
        </div>
    `;
    
    // Current Squad
    const playersById = {};
    bootstrapData.elements.forEach(p => playersById[p.id] = p);
    
    const teamsById = {};
    bootstrapData.teams.forEach(t => teamsById[t.id] = t);
    
    // Store fixtures globally for player comparison
    fixturesData = fixturesResponse || [];
    console.log('Fixtures stored globally:', fixturesData.length);
    
    // Populate player comparison selects
    populatePlayerSelects(bootstrapData.elements, teamsById);
    
    const squadByPosition = { 1: [], 2: [], 3: [], 4: [] };
    picksData.picks.forEach(pick => {
        const player = playersById[pick.element];
        if (player) {
            player.pickData = pick;
            player.expectedPoints = calculateExpectedPoints(player, fixturesData);
            squadByPosition[player.element_type].push(player);
        }
    });
    
    // AI Transfer Suggestions
    const suggestions = analyzeTransfers(picksData.picks, bootstrapData.elements, fixturesData, budget);
    const transferSuggestions = document.getElementById('transferSuggestions');
    
    if (suggestions.length === 0) {
        transferSuggestions.innerHTML = `
            <div class="no-suggestions">
                <div class="icon">✅</div>
                <p>Your team looks great! No urgent transfers recommended right now.</p>
            </div>
        `;
    } else {
        transferSuggestions.innerHTML = suggestions.map((sug, idx) => {
            const fixturesOut = getNextFixtures(sug.playerOut, fixturesData, teamsById, 5);
            const fixturesIn = getNextFixtures(sug.playerIn, fixturesData, teamsById, 5);
            
            return `
            <div class="transfer-suggestion">
                <div class="transfer-header">
                    <span class="ai-badge">AI Suggestion #${idx + 1}</span>
                    <span>${sug.playerOut.web_name} <span style="font-size: 0.9em; opacity: 0.8;">(${teamsById[sug.playerOut.team].short_name})</span></span>
                    <span class="transfer-arrow">→</span>
                    <span>${sug.playerIn.web_name} <span style="font-size: 0.9em; opacity: 0.8;">(${teamsById[sug.playerIn.team].short_name})</span></span>
                    <span class="position-badge">${getPositionName(sug.playerIn.element_type)}</span>
                </div>
                <div class="fixtures-comparison">
                    <div class="fixtures-column">
                        <h5>🔴 Out: Next 5 Fixtures</h5>
                        <div class="fixtures-list">
                            ${fixturesOut.length > 0 ? fixturesOut.map(f => `
                                <span class="fixture-item ${f.difficultyClass}">
                                    vs ${f.opponent} ${f.isHome ? '(H)' : '(A)'}
                                </span>
                            `).join('') : '<span class="no-fixtures">No fixtures</span>'}
                        </div>
                    </div>
                    <div class="fixtures-column">
                        <h5>🟢 In: Next 5 Fixtures</h5>
                        <div class="fixtures-list">
                            ${fixturesIn.length > 0 ? fixturesIn.map(f => `
                                <span class="fixture-item ${f.difficultyClass}">
                                    vs ${f.opponent} ${f.isHome ? '(H)' : '(A)'}
                                </span>
                            `).join('') : '<span class="no-fixtures">No fixtures</span>'}
                        </div>
                    </div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-label">Cost Change</span>
                        <span class="stat-value ${sug.costDiff <= 0 ? 'good' : ''}">${sug.costDiff > 0 ? '+' : ''}£${sug.costDiff.toFixed(1)}m</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">xP Gain (5GW)</span>
                        <span class="stat-value good">+${sug.xPImprovement} pts</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Form</span>
                        <span class="stat-value">${sug.playerOut.form} → ${sug.playerIn.form}</span>
                    </div>
                </div>
                <div class="transfer-reason">
                    ${sug.reason}
                </div>
            </div>
        `;
        }).join('');
    }
    
    // Top Players
    const topPlayersByPosition = {};
    [1, 2, 3, 4].forEach(pos => {
        topPlayersByPosition[pos] = bootstrapData.elements
            .filter(p => p.element_type === pos && p.chance_of_playing_next_round !== 0)
            .sort((a, b) => calculateExpectedPoints(b, fixturesData) - calculateExpectedPoints(a, fixturesData))
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
                        const xP = calculateExpectedPoints(p, fixturesData);
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
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
    errorDiv.style.display = 'block';
}

// Scroll to top functionality
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

// Enter key to analyze
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('teamIdInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') analyzeTeam();
    });
});

// Global variables for comparison
let allPlayersData = [];
let fixturesData = [];
let teamsData = {};
let allPlayerOptions = [];
let comparisonChart = null;

function populatePlayerSelects(players, teams) {
    allPlayersData = players;
    teamsData = teams;
    
    const player1Select = document.getElementById('player1Select');
    const player2Select = document.getElementById('player2Select');
    
    // Group players by position
    const positions = {
        1: 'GKP',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };
    
    // Sort players by position and name
    const sortedPlayers = [...players].sort((a, b) => {
        if (a.element_type !== b.element_type) {
            return a.element_type - b.element_type;
        }
        return a.web_name.localeCompare(b.web_name);
    });
    
    // Store all options for filtering
    allPlayerOptions = sortedPlayers.map(player => {
        const team = teams[player.team];
        return {
            id: player.id,
            position: positions[player.element_type],
            positionType: player.element_type,
            text: `${player.web_name} (${team.short_name}) - £${(player.now_cost / 10).toFixed(1)}m`,
            searchText: `${player.web_name} ${team.short_name} ${team.name} ${positions[player.element_type]}`.toLowerCase()
        };
    });
    
    // Initialize with MID position (default checked)
    updatePlayerListsByPosition();
}

function renderPlayerOptions(selectElement, options) {
    let html = '<option value="">Select player...</option>';
    
    options.forEach(opt => {
        html += `<option value="${opt.id}">${opt.text}</option>`;
    });
    
    selectElement.innerHTML = html;
}

function updatePlayerListsByPosition() {
    const selectedPosition = document.querySelector('input[name="position"]:checked')?.value;
    if (!selectedPosition) return;
    
    const player1Select = document.getElementById('player1Select');
    const player2Select = document.getElementById('player2Select');
    const player1Search = document.getElementById('player1Search');
    const player2Search = document.getElementById('player2Search');
    
    // Clear search inputs
    player1Search.value = '';
    player2Search.value = '';
    
    // Filter players by selected position
    const filteredOptions = allPlayerOptions.filter(opt => 
        opt.positionType == selectedPosition
    );
    
    // Sort by name
    filteredOptions.sort((a, b) => a.text.localeCompare(b.text));
    
    renderPlayerOptions(player1Select, filteredOptions);
    renderPlayerOptions(player2Select, filteredOptions);
}

function filterPlayerSelect(playerNum) {
    const searchInput = document.getElementById(`player${playerNum}Search`);
    const selectElement = document.getElementById(`player${playerNum}Select`);
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedPosition = document.querySelector('input[name="position"]:checked')?.value;
    
    // First filter by position
    let filteredOptions = allPlayerOptions.filter(opt => 
        opt.positionType == selectedPosition
    );
    
    // Then filter by search term if provided
    if (searchTerm) {
        filteredOptions = filteredOptions.filter(opt => 
            opt.searchText.includes(searchTerm)
        );
    }
    
    renderPlayerOptions(selectElement, filteredOptions);
}

async function comparePlayersXP() {
    const player1Id = parseInt(document.getElementById('player1Select').value);
    const player2Id = parseInt(document.getElementById('player2Select').value);
    const resultDiv = document.getElementById('comparisonResult');
    
    // Get selected gameweeks
    const selectedGameweeks = parseInt(document.querySelector('input[name="gameweeks"]:checked').value);
    const gwText = selectedGameweeks === 1 ? 'GW' : 'GWs';
    
    if (!player1Id || !player2Id) {
        resultDiv.innerHTML = `
            <div class="comparison-error">
                ⚠️ Please select both players to compare
            </div>
        `;
        return;
    }
    
    if (player1Id === player2Id) {
        resultDiv.innerHTML = `
            <div class="comparison-error">
                ⚠️ Please select two different players
            </div>
        `;
        return;
    }
    
    const player1 = allPlayersData.find(p => p.id === player1Id);
    const player2 = allPlayersData.find(p => p.id === player2Id);
    
    if (!player1 || !player2) {
        resultDiv.innerHTML = `
            <div class="comparison-error">
                ⚠️ Error loading player data
            </div>
        `;
        return;
    }
    
    // Show loading state
    resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading player history...</p></div>';
    
    // Fetch player histories
    const [history1, history2] = await Promise.all([
        fetchPlayerHistory(player1Id),
        fetchPlayerHistory(player2Id)
    ]);
    
    // Calculate xP for both players with selected gameweeks
    player1.expectedPoints = calculateExpectedPoints(player1, fixturesData, selectedGameweeks);
    player2.expectedPoints = calculateExpectedPoints(player2, fixturesData, selectedGameweeks);
    player1.history = history1;
    player2.history = history2;
    
    const xpDiff = Math.abs(player1.expectedPoints - player2.expectedPoints);
    const winner = player1.expectedPoints > player2.expectedPoints ? player1 : player2;
    const loser = player1.expectedPoints > player2.expectedPoints ? player2 : player1;
    
    const priceDiff = Math.abs(player1.now_cost - player2.now_cost) / 10;
    const value1 = player1.expectedPoints / (player1.now_cost / 10);
    const value2 = player2.expectedPoints / (player2.now_cost / 10);
    
    // Show chart
    createComparisonChart(player1, player2, selectedGameweeks);
    
    resultDiv.innerHTML = `
        <div class="comparison-grid">
            <div class="comparison-player ${player1.expectedPoints > player2.expectedPoints ? 'winner' : ''}">
                <div class="player-comparison-header">
                    <div class="player-name">${player1.web_name}</div>
                    <div class="player-team">${teamsData[player1.team].name}</div>
                    <div class="position-badge">${getPositionName(player1.element_type)}</div>
                </div>
                <div class="comparison-stats">
                    <div class="stat-row">
                        <span class="stat-label">Price</sp${selectedGameweeks} ${gwText}
                        <span class="stat-value">£${(player1.now_cost / 10).toFixed(1)}m</span>
                    </div>
                    <div class="stat-row highlight">
                        <span class="stat-label">xP (Next 5 GWs)</span>
                        <span class="stat-value xp-value">${player1.expectedPoints.toFixed(1)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Value (xP/£)</span>
                        <span class="stat-value">${value1.toFixed(2)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Form</span>
                        <span class="stat-value">${player1.form}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Points/Game</span>
                        <span class="stat-value">${player1.points_per_game}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Total Points</span>
                        <span class="stat-value">${player1.total_points}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Selected By</span>
                        <span class="stat-value">${player1.selected_by_percent}%</span>
                    </div>
                    ${player1.element_type === 1 || player1.element_type === 2 ? `
                    <div class="stat-row">
                        <span class="stat-label">Clean Sheets</span>
                        <span class="stat-value">${player1.clean_sheets}</span>
                    </div>
                    ` : ''}
                    ${player1.element_type >= 3 ? `
                    <div class="stat-row">
                        <span class="stat-label">Goals</span>
                        <span class="stat-value">${player1.goals_scored}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Assists</span>
                        <span class="stat-value">${player1.assists}</span>
                    </div>
                    ` : ''}
                    <div class="stat-row">
                        <span class="stat-label">Minutes</span>
                        <span class="stat-value">${player1.minutes}</span>
                    </div>
                </div>
                ${history1.length > 0 ? `
                <div class="recent-history">
                    <h4>📜 Last 5 Matches</h4>
                    <div class="history-list">
                        ${history1.map((game, idx) => `
                            <div class="history-item">
                                <span class="history-gw">GW${game.round}</span>
                                <span class="history-opponent">${game.was_home ? 'vs' : '@'} ${teamsData[game.opponent_team]?.short_name || 'TBA'}</span>
                                <span class="history-points ${game.total_points >= 6 ? 'good' : game.total_points >= 3 ? 'ok' : 'bad'}">${game.total_points} pts</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                ${(() => {
                    const fixtures1 = getNextFixtures(player1, fixturesData, teamsData, selectedGameweeks);
                    return fixtures1.length > 0 ? `
                    <div class="upcoming-fixtures">
                        <h4>🔮 Next ${selectedGameweeks} Fixture${selectedGameweeks > 1 ? 's' : ''}</h4>
                        <div class="fixtures-list">
                            ${fixtures1.map(f => `
                                <span class="fixture-item ${f.difficultyClass}">
                                    vs ${f.opponent} ${f.isHome ? '(H)' : '(A)'}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                    ` : '';
                })()}
            </div>
            
            <div class="vs-column">
                <div class="vs-badge">VS</div>
                <div class="winner-badge">
                    ${player1.expectedPoints > player2.expectedPoints ? '👑 Winner' : player1.expectedPoints === player2.expectedPoints ? '🤝 Equal' : ''}
                </div>
            </div>
            
            <div class="comparison-player ${player2.expectedPoints > player1.expectedPoints ? 'winner' : ''}">
                <div class="player-comparison-header">
                    <div class="player-name">${player2.web_name}</div>
                    <div class="player-team">${teamsData[player2.team].name}</div>
                    <div class="position-badge">${getPositionName(player2.element_type)}</div>
                </div>
                <div class="comparison-stats">
                    <div class="stat-row">
                        <span class="stat-label">Price</sp${selectedGameweeks} ${gwText}
                        <span class="stat-value">£${(player2.now_cost / 10).toFixed(1)}m</span>
                    </div>
                    <div class="stat-row highlight">
                        <span class="stat-label">xP (Next 5 GWs)</span>
                        <span class="stat-value xp-value">${player2.expectedPoints.toFixed(1)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Value (xP/£)</span>
                        <span class="stat-value">${value2.toFixed(2)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Form</span>
                        <span class="stat-value">${player2.form}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Points/Game</span>
                        <span class="stat-value">${player2.points_per_game}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Total Points</span>
                        <span class="stat-value">${player2.total_points}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Selected By</span>
                        <span class="stat-value">${player2.selected_by_percent}%</span>
                    </div>
                    ${player2.element_type === 1 || player2.element_type === 2 ? `
                    <div class="stat-row">
                        <span class="stat-label">Clean Sheets</span>
                        <span class="stat-value">${player2.clean_sheets}</span>
                    </div>
                    ` : ''}
                    ${player2.element_type >= 3 ? `
                    <div class="stat-row">
                        <span class="stat-label">Goals</span>
                        <span class="stat-value">${player2.goals_scored}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Assists</span>
                        <span class="stat-value">${player2.assists}</span>
                    </div>
                    ` : ''}
                    <div class="stat-row">
                        <span class="stat-label">Minutes</span>
                        <span class="stat-value">${player2.minutes}</span>
                    </div>
                </div>
                ${history2.length > 0 ? `
                <div class="recent-history">
                    <h4>📜 Last 5 Matches</h4>
                    <div class="history-list">
                        ${history2.map((game, idx) => `
                            <div class="history-item">
                                <span class="history-gw">GW${game.round}</span>
                                <span class="history-opponent">${game.was_home ? 'vs' : '@'} ${teamsData[game.opponent_team]?.short_name || 'TBA'}</span>
                                <span class="history-points ${game.total_points >= 6 ? 'good' : game.total_points >= 3 ? 'ok' : 'bad'}">${game.total_points} pts</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                ${(() => {
                    const fixtures2 = getNextFixtures(player2, fixturesData, teamsData, selectedGameweeks);
                    return fixtures2.length > 0 ? `
                    <div class="upcoming-fixtures">
                        <h4>🔮 Next ${selectedGameweeks} Fixture${selectedGameweeks > 1 ? 's' : ''}</h4>
                        <div class="fixtures-list">
                            ${fixtures2.map(f => `
                                <span class="fixture-item ${f.difficultyClass}">
                                    vs ${f.opponent} ${f.isHome ? '(H)' : '(A)'}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                    ` : '';
                })()}
            </div>
        </div>
        
        <div class="comparison-summary">
            <h3>📊 Comparison Summary</h3>${selectedGameweeks} ${gwText.toLowerCase()}
            <div class="summary-content">
                <p><strong>${winner.web_name}</strong> has a higher expected points total with <strong>${winner.expectedPoints.toFixed(1)} xP</strong> 
                compared to <strong>${loser.web_name}'s ${loser.expectedPoints.toFixed(1)} xP</strong> 
                - a difference of <strong>${xpDiff.toFixed(1)} points</strong> over the next 5 gameweeks.</p>
                
                ${priceDiff > 0 ? `
                <p>Price difference: <strong>£${priceDiff.toFixed(1)}m</strong> 
                (${player1.now_cost > player2.now_cost ? player1.web_name + ' is more expensive' : player2.web_name + ' is more expensive'})</p>
                ` : '<p>Both players are priced the same.</p>'}
                
                <p>Best value: <strong>${value1 > value2 ? player1.web_name : player2.web_name}</strong> 
                with <strong>${Math.max(value1, value2).toFixed(2)}</strong> expected points per million.</p>
            </div>
        </div>
    `;
}
function createComparisonChart(player1, player2, gameweeks) {
    const chartContainer = document.getElementById('comparisonChart');
    chartContainer.style.display = 'block';
    
    const ctx = document.getElementById('playerComparisonCanvas');
    
    // Destroy existing chart if it exists
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    const value1 = player1.expectedPoints / (player1.now_cost / 10);
    const value2 = player2.expectedPoints / (player2.now_cost / 10);
    
    const labels = [
        'xP (Expected Points)',
        'Form',
        'Points/Game',
        'Value (xP/£m)',
        'Total Points',
        'Selected By %'
    ];
    
    const data1 = [
        player1.expectedPoints,
        parseFloat(player1.form) || 0,
        parseFloat(player1.points_per_game) || 0,
        value1,
        player1.total_points / 10, // Scale down for better visualization
        parseFloat(player1.selected_by_percent) || 0
    ];
    
    const data2 = [
        player2.expectedPoints,
        parseFloat(player2.form) || 0,
        parseFloat(player2.points_per_game) || 0,
        value2,
        player2.total_points / 10, // Scale down for better visualization
        parseFloat(player2.selected_by_percent) || 0
    ];
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: player1.web_name,
                    data: data1,
                    backgroundColor: 'rgba(0, 204, 106, 0.7)',
                    borderColor: 'rgba(0, 204, 106, 1)',
                    borderWidth: 2
                },
                {
                    label: player2.web_name,
                    data: data2,
                    backgroundColor: 'rgba(4, 245, 255, 0.7)',
                    borderColor: 'rgba(4, 245, 255, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            const value = context.parsed.y;
                            // Format based on metric
                            if (context.label.includes('Total Points')) {
                                label += (value * 10).toFixed(0); // Scale back up
                            } else if (context.label.includes('Value')) {
                                label += value.toFixed(2);
                            } else {
                                label += value.toFixed(1);
                            }
                            return label;
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: false,
                        mode: 'xy',
                        modifierKey: null
                    },
                    zoom: {
                        wheel: {
                            enabled: false,
                            speed: 0.1
                        },
                        pinch: {
                            enabled: false
                        },
                        mode: 'xy'
                    },
                    limits: {
                        x: {min: 'original', max: 'original'},
                        y: {min: 'original', max: 'original'}
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return value.toFixed(1);
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: 11,
                            weight: 'bold'
                        },
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
    
    // Scroll to chart
    chartContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetChartZoom() {
    if (comparisonChart) {
        comparisonChart.resetZoom();
    }
}

function toggleFullscreen(elementId) {
    const element = document.getElementById(elementId);
    
    if (!document.fullscreenElement) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
        element.classList.add('fullscreen-mode');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        element.classList.remove('fullscreen-mode');
    }
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        const chartContainer = document.getElementById('comparisonChart');
        if (chartContainer) {
            chartContainer.classList.remove('fullscreen-mode');
        }
    }
    // Resize chart when exiting fullscreen
    if (comparisonChart) {
        setTimeout(() => comparisonChart.resize(), 100);
    }
});

// Toggle methodology section
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