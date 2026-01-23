let TEAM_ID = 8668;
const API_BASE = 'https://fantasy.premierleague.com/api';

async function fetchWithProxy(url) {
    // Lista proxy do wypróbowania
    const proxies = [
        '', // First try without proxy
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://api.allorigins.win/raw?url=',
    ];

    for (let i = 0; i < proxies.length; i++) {
        try {
            const proxyUrl = proxies[i] ? `${proxies[i]}${encodeURIComponent(url)}` : url;
            console.log(`Attempt ${i + 1}: ${proxies[i] ? 'with proxy' : 'direct'}`);
            
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                mode: proxies[i] ? 'cors' : 'cors',
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Success!');
            return data;
        } catch (error) {
            console.log(`Attempt ${i + 1} failed:`, error.message);
            if (i === proxies.length - 1) {
                throw error;
            }
        }
    }
}

async function fetchTeamData() {
    try {
        console.log('Fetching team data...');
        
        // Fetch team data
        const teamData = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/`);
        console.log('Team data fetched:', teamData);

        // Fetch history
        const historyData = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/history/`);
        console.log('History fetched:', historyData);

        // Fetch bootstrap-static for global averages and players
        const bootstrapData = await fetchWithProxy(`${API_BASE}/bootstrap-static/`);
        console.log('Bootstrap data fetched');

        // Fetch latest gameweek picks
        const currentGW = teamData.current_event || historyData.current[historyData.current.length - 1]?.event;
        let picksData = null;
        if (currentGW) {
            try {
                picksData = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/event/${currentGW}/picks/`);
                console.log('Latest picks fetched for GW', currentGW);
                
                // Fetch detailed stats for each player in the picks (with delay to avoid rate limiting)
                console.log('Fetching player stats...');
                for (let i = 0; i < picksData.picks.length; i++) {
                    const pick = picksData.picks[i];
                    try {
                        // Add small delay between requests
                        if (i > 0) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                        
                        const playerDetails = await fetchWithProxy(`${API_BASE}/element-summary/${pick.element}/`);
                        const gwHistory = playerDetails.history.find(h => h.round === currentGW);
                        if (gwHistory) {
                            const player = bootstrapData.elements.find(p => p.id === pick.element);
                            if (player) {
                                const saves = gwHistory.saves || 0;
                                const defConCount = gwHistory.defensive_contribution || 0;
                                
                                // Calculate defcon - check if player earned defensive contribution bonus
                                let defcon = 0;
                                
                                // DEF gets 1 point for 10+ defcons
                                if (player.element_type === 2 && defConCount >= 10) {
                                    defcon = 1;
                                }
                                // MID and FWD get 1 point for 12+ defcons
                                else if ((player.element_type === 3 || player.element_type === 4) && defConCount >= 12) {
                                    defcon = 1;
                                }
                                
                                player.gwStats = {
                                    goals: gwHistory.goals_scored || 0,
                                    assists: gwHistory.assists || 0,
                                    cleanSheets: gwHistory.clean_sheets || 0,
                                    yellowCards: gwHistory.yellow_cards || 0,
                                    bonus: gwHistory.bonus || 0,
                                    saves: saves,
                                    defcon: defcon
                                };
                                
                                console.log(`✓ ${player.web_name}: G${player.gwStats.goals} A${player.gwStats.assists} CS${player.gwStats.cleanSheets}`);
                            }
                        }
                    } catch (error) {
                        console.log(`✗ Could not fetch details for player ${pick.element}:`, error.message);
                    }
                }
                console.log('Finished fetching player stats');
            } catch (error) {
                console.log('Could not fetch picks for current GW');
            }
        }

        // Fetch captain info for TC chips
        const tcChips = historyData.chips.filter(chip => chip.name === '3xc');
        const captainData = {};
        
        for (const chip of tcChips) {
            try {
                const gwPicks = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/event/${chip.event}/picks/`);
                const captain = gwPicks.picks.find(pick => pick.is_captain);
                if (captain) {
                    const player = bootstrapData.elements.find(el => el.id === captain.element);
                    if (player) {
                        captainData[chip.event] = player.web_name;
                    }
                }
            } catch (error) {
                console.log(`Could not fetch captain for GW${chip.event}`);
            }
        }

        return { team: teamData, history: historyData, bootstrap: bootstrapData, captainData, picks: picksData };
    } catch (error) {
        console.error('Error details:', error);
        throw error;
    }
}

function displayTeamData(data) {
    const { team, history, bootstrap, captainData, picks } = data;

    // Nazwa drużyny
    document.getElementById('teamName').textContent = team.name;

    // Określ zmianę rankingu (porównanie ostatniej i przedostatniej kolejki)
    let overallRankClass = 'rank';
    let rankArrow = '';
    if (history.current.length >= 2) {
        const lastGW = history.current[history.current.length - 1];
        const prevGW = history.current[history.current.length - 2];
        console.log('Last GW rank:', lastGW.overall_rank, 'Previous GW rank:', prevGW.overall_rank);
        console.log('Summary overall rank:', team.summary_overall_rank);
        
        if (lastGW.overall_rank < prevGW.overall_rank) {
            overallRankClass = 'rank positive'; // Improvement (lower number = better)
            rankArrow = ' <span style="color: #00cc6a; font-size: 1.2em;">↑</span>';
            console.log('Rank improved - GREEN');
        } else if (lastGW.overall_rank > prevGW.overall_rank) {
            overallRankClass = 'rank negative'; // Worsening (higher number = worse)
            rankArrow = ' <span style="color: #ff4444; font-size: 1.2em;">↓</span>';
            console.log('Rank worsened - RED');
        }
    }

    // Get current gameweek average
    const currentEvent = team.current_event || history.current[history.current.length - 1]?.event;
    const currentEventData = bootstrap.events.find(e => e.id === currentEvent);
    const gwAverage = currentEventData?.average_entry_score || 0;

    // Calculate available chips
    // From 2024/25 season, all chips reset after GW19
    const currentGW = currentEvent;
    const isSecondHalf = currentGW >= 19;
    
    // If in second half of season, only count chips used from GW19 onwards
    const usedChipsNames = history.chips
        .filter(chip => !isSecondHalf || chip.event >= 19)
        .map(chip => chip.name);
    
    console.log('Current GW:', currentGW);
    console.log('Is second half:', isSecondHalf);
    console.log('Used chips (relevant period):', usedChipsNames);
    console.log('All chips history:', history.chips);
    
    const allChips = [
        { name: 'wildcard', short: 'WC', max: isSecondHalf ? 1 : 2 },
        { name: 'bboost', short: 'BB', max: 1 },
        { name: '3xc', short: 'TC', max: 1 },
        { name: 'freehit', short: 'FH', max: 1 }
    ];
    
    const availableChipsShort = [];
    allChips.forEach(chip => {
        const usedCount = usedChipsNames.filter(c => c === chip.name).length;
        const remaining = chip.max - usedCount;
        console.log(`${chip.name}: used ${usedCount}, max ${chip.max}, remaining ${remaining}`);
        
        for (let i = 0; i < remaining; i++) {
            availableChipsShort.push(chip.short);
        }
    });
    
    console.log('Available chips:', availableChipsShort);
    
    const availableChipsDisplay = availableChipsShort.length > 0 
        ? availableChipsShort.join(', ')
        : 'None';

    // Basic statistics
    const stats = [
        { label: 'Overall Points', value: team.summary_overall_points, class: '' },
        { label: 'Overall Rank', value: (team.summary_overall_rank?.toLocaleString() || 'N/A') + rankArrow, class: overallRankClass },
        { label: 'GW Points', value: team.summary_event_points || 0, class: '' },
        { label: 'GW Average', value: gwAverage, class: '' },
        { label: 'GW Rank', value: team.summary_event_rank?.toLocaleString() || 'N/A', class: '' },
        { label: 'Available Chips', value: availableChipsDisplay, class: 'chips' },
        { label: 'Team Value', value: `£${(team.last_deadline_value / 10).toFixed(1)}m`, class: '' },
        { label: 'Bank Value', value: `£${(team.last_deadline_bank / 10).toFixed(1)}m`, class: '' }
    ];

    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = stats.map(stat => `
        <div class="stat-card">
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value ${stat.class}">${stat.value}</div>
        </div>
    `).join('');

    // Display latest gameweek squad
    if (picks) {
        displaySquad(picks, bootstrap);
    }

    // Manager information
    const managerInfo = document.getElementById('managerInfo');
    managerInfo.innerHTML = `
        <div class="info-item">
            <span class="info-label">Manager</span>
            <span class="info-value">${team.player_first_name} ${team.player_last_name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Region</span>
            <span class="info-value">${team.player_region_name || 'N/A'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Favourite Team</span>
            <span class="info-value">${team.favourite_team ? getTeamName(team.favourite_team) : 'N/A'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Started Gameweek</span>
            <span class="info-value">${team.started_event || 1}</span>
        </div>
    `;

    // Historia sezonowa - wszystkie kolejki
    const historyBody = document.getElementById('historyBody');
    const allHistory = [...history.current].reverse();
    
    // Create a map of chips by gameweek for quick lookup
    const chipsByGameweek = {};
    history.chips.forEach(chip => {
        let chipDisplay = getChipShortName(chip.name);
        // Add captain name for Triple Captain
        if (chip.name === '3xc' && captainData[chip.event]) {
            chipDisplay += ` (${captainData[chip.event]})`;
        }
        chipsByGameweek[chip.event] = chipDisplay;
    });
    
    historyBody.innerHTML = allHistory.map((gw, index) => {
        const transferCost = gw.event_transfers_cost;
        const transferClass = transferCost > 0 ? 'negative' : '';
        const transfersMade = gw.event_transfers || 0;
        
        // Determine color for ranking (comparison with previous gameweek)
        let rankClass = '';
        if (index < allHistory.length - 1) {
            const prevRank = allHistory[index + 1].overall_rank;
            const currentRank = gw.overall_rank;
            if (currentRank < prevRank) {
                rankClass = 'positive'; // Improvement (lower rank = better position)
            } else if (currentRank > prevRank) {
                rankClass = 'negative'; // Worsening (higher rank = worse position)
            }
        }
        
        // Get chip used in this gameweek
        const chipUsed = chipsByGameweek[gw.event] || '-';
        
        return `
            <tr>
                <td><strong>GW ${gw.event}</strong></td>
                <td><strong>${gw.points}</strong></td>
                <td>${gw.points_on_bench}</td>
                <td>£${(gw.value / 10).toFixed(1)}m</td>
                <td class="${rankClass}">${gw.overall_rank.toLocaleString()}</td>
                <td>${transfersMade}</td>
                <td class="${transferClass}">${transferCost > 0 ? `-${transferCost}` : '0'}</td>
                <td><strong>${chipUsed}</strong></td>
            </tr>
        `;
    }).join('');

    // Chips
    const chips = history.chips;
    const chipsDiv = document.getElementById('chips');
    if (chips.length > 0) {
        // Separate chips by half of season (before and after GW19)
        const firstHalfChips = chips.filter(chip => chip.event < 19);
        const secondHalfChips = chips.filter(chip => chip.event >= 19);
        
        let chipsHTML = '';
        
        if (firstHalfChips.length > 0) {
            chipsHTML += '<div style="margin-bottom: 15px;">';
            chipsHTML += '<div style="color: #666; font-size: 0.9em; margin-bottom: 8px; font-weight: bold;">First Half (GW1-18):</div>';
            chipsHTML += firstHalfChips.map(chip => 
                `<span class="chip used">${getChipShortName(chip.name)} - GW${chip.event}</span>`
            ).join('');
            chipsHTML += '</div>';
        }
        
        if (secondHalfChips.length > 0) {
            chipsHTML += '<div>';
            chipsHTML += '<div style="color: #666; font-size: 0.9em; margin-bottom: 8px; font-weight: bold;">Second Half (GW19+):</div>';
            chipsHTML += secondHalfChips.map(chip => 
                `<span class="chip used">${getChipShortName(chip.name)} - GW${chip.event}</span>`
            ).join('');
            chipsHTML += '</div>';
        }
        
        chipsDiv.innerHTML = chipsHTML;
    } else {
        chipsDiv.innerHTML = '<p>No chips used this season yet.</p>';
    }

    // Points chart
    createPointsChart(history.current, bootstrap);

    // Wykres rankingu
    createRankingChart(history.current);

    // Hide loading, show content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function displaySquad(picksData, bootstrapData) {
    const playersById = {};
    bootstrapData.elements.forEach(p => playersById[p.id] = p);
    
    const teamsById = {};
    bootstrapData.teams.forEach(t => teamsById[t.id] = t);
    
    // Update title with gameweek number
    const gwNumber = picksData.entry_history.event;
    document.getElementById('squadTitle').textContent = `Gameweek ${gwNumber} Squad`;
    
    // Separate starters and bench
    const starters = picksData.picks.filter(p => p.position <= 11);
    const bench = picksData.picks.filter(p => p.position > 11);
    
    // Group starters by position
    const formation = { GKP: [], DEF: [], MID: [], FWD: [] };
    
    starters.forEach(pick => {
        const player = playersById[pick.element];
        if (!player) return;
        
        const positionName = getPositionName(player.element_type);
        const gwPoints = pick.multiplier * (player.event_points || 0);
        
        // Get player stats for emoji badges
        const stats = player.gwStats || { goals: 0, assists: 0, cleanSheets: 0, yellowCards: 0, bonus: 0, saves: 0, defcon: 0 };
        
        formation[positionName].push({
            name: player.web_name,
            team: teamsById[player.team].short_name,
            points: gwPoints,
            isCaptain: pick.is_captain,
            isViceCaptain: pick.is_vice_captain,
            position: player.element_type,
            stats: stats
        });
    });
    
    // Render pitch
    const pitchPlayers = document.getElementById('pitchPlayers');
    let pitchHTML = '';
    
    // Goalkeeper
    if (formation.GKP.length > 0) {
        pitchHTML += '<div class="pitch-row">';
        formation.GKP.forEach(player => {
            pitchHTML += createPlayerCard(player);
        });
        pitchHTML += '</div>';
    }
    
    // Defenders
    if (formation.DEF.length > 0) {
        pitchHTML += '<div class="pitch-row">';
        formation.DEF.forEach(player => {
            pitchHTML += createPlayerCard(player);
        });
        pitchHTML += '</div>';
    }
    
    // Midfielders
    if (formation.MID.length > 0) {
        pitchHTML += '<div class="pitch-row">';
        formation.MID.forEach(player => {
            pitchHTML += createPlayerCard(player);
        });
        pitchHTML += '</div>';
    }
    
    // Forwards
    if (formation.FWD.length > 0) {
        pitchHTML += '<div class="pitch-row">';
        formation.FWD.forEach(player => {
            pitchHTML += createPlayerCard(player);
        });
        pitchHTML += '</div>';
    }
    
    pitchPlayers.innerHTML = pitchHTML;
    
    // Render bench
    const benchPlayers = document.getElementById('benchPlayers');
    let benchHTML = '';
    
    bench.forEach(pick => {
        const player = playersById[pick.element];
        if (!player) return;
        
        const gwPoints = player.event_points || 0;
        const stats = player.gwStats || { goals: 0, assists: 0, cleanSheets: 0, yellowCards: 0, bonus: 0, saves: 0, defcon: 0 };
        const badges = createStatBadges(stats, player.element_type);
        
        benchHTML += `
            <div class="bench-player">
                <div class="player-shirt">${teamsById[player.team].short_name}</div>
                <div class="player-name">${player.web_name}${badges ? '<div style="margin-top: 4px; font-size: 1em;">' + badges + '</div>' : ''}</div>
                <div class="player-points">${gwPoints} pts</div>
            </div>
        `;
    });
    
    benchPlayers.innerHTML = benchHTML;
}

function createStatBadges(stats, position) {
    let badges = '';
    if (!stats) return badges;
    
    // Goals - ⚽
    if (stats.goals > 0) {
        badges += '⚽'.repeat(stats.goals);
    }
    // Assists - 🅰️
    if (stats.assists > 0) {
        badges += '🅰️'.repeat(stats.assists);
    }
    // Clean sheet - 🛡️ (for goalkeepers, defenders and midfielders)
    if (stats.cleanSheets > 0 && (position === 1 || position === 2 || position === 3)) {
        badges += '🛡️';
    }
    // Saves for goalkeepers - 🧤 (if 3+ saves = got point for it)
    if (position === 1 && stats.saves >= 3) {
        badges += '🧤';
    }
    // Defense points (for defenders, midfielders, forwards) - 🧱
    if ((position === 2 || position === 3 || position === 4) && stats.defcon > 0) {
        badges += '🧱';
    }
    // Yellow cards - 🟨
    if (stats.yellowCards > 0) {
        badges += '🟨';
    }
    // Bonus points - show number
    if (stats.bonus > 0) {
        badges += `<span style="background: #ffd700; color: #37003c; padding: 2px 6px; border-radius: 50%; font-weight: bold; font-size: 0.85em; margin-left: 2px;">${stats.bonus}</span>`;
    }
    
    return badges;
}

function createPlayerCard(player) {
    const captainClass = player.isCaptain ? 'captain' : player.isViceCaptain ? 'vice-captain' : '';
    const badges = createStatBadges(player.stats, player.position);
    
    return `
        <div class="pitch-player">
            <div class="player-shirt ${captainClass}">${player.team}</div>
            <div class="player-name">${player.name}${badges ? '<div style="margin-top: 4px; font-size: 1.1em;">' + badges + '</div>' : ''}</div>
            <div class="player-points">${player.points} pts</div>
        </div>
    `;
}

function getPositionName(elementType) {
    const positions = {
        1: 'GKP',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };
    return positions[elementType] || 'Unknown';
}

function createRankingChart(historyData) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    
    const labels = historyData.map(gw => `GW${gw.event}`);
    const rankings = historyData.map(gw => gw.overall_rank);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ranking Position',
                data: rankings,
                borderColor: '#04f5ff',
                backgroundColor: 'rgba(4, 245, 255, 0.1)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#04f5ff',
                pointBorderColor: '#37003c',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#37003c',
                    titleColor: '#04f5ff',
                    bodyColor: '#fff',
                    borderColor: '#04f5ff',
                    borderWidth: 2,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Rank: ${context.parsed.y.toLocaleString()}`;
                        },
                        afterLabel: function(context) {
                            const currentRank = context.parsed.y;
                            const prevIndex = context.dataIndex - 1;
                            if (prevIndex >= 0) {
                                const prevRank = rankings[prevIndex];
                                const change = prevRank - currentRank;
                                if (change > 0) {
                                    return `↑ Up ${change.toLocaleString()} places`;
                                } else if (change < 0) {
                                    return `↓ Down ${Math.abs(change).toLocaleString()} places`;
                                } else {
                                    return '→ No change';
                                }
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    reverse: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: 'Position (lower = better)',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    title: {
                        display: true,
                        text: 'Gameweek',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

function createPointsChart(historyData, bootstrapData) {
    const ctx = document.getElementById('pointsChart').getContext('2d');
    
    const labels = historyData.map(gw => `GW${gw.event}`);
    const points = historyData.map(gw => gw.points);
    
    // Get global average for each gameweek from bootstrap data
    const eventsMap = {};
    bootstrapData.events.forEach(event => {
        eventsMap[event.id] = event.average_entry_score;
    });
    
    // Map the global average to each of the player's gameweeks
    const globalAverages = historyData.map(gw => eventsMap[gw.event] || 0);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Your Points',
                data: points,
                borderColor: '#00ff87',
                backgroundColor: 'rgba(0, 255, 135, 0.1)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#00ff87',
                pointBorderColor: '#37003c',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }, {
                label: 'Global Average',
                data: globalAverages,
                borderColor: '#04f5ff',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#04f5ff',
                pointBorderColor: '#37003c',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#37003c',
                    titleColor: '#00ff87',
                    bodyColor: '#fff',
                    borderColor: '#00ff87',
                    borderWidth: 2,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 0) {
                                return `Points: ${context.parsed.y}`;
                            } else {
                                return `Average: ${context.parsed.y.toFixed(1)}`;
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 12
                        }
                    },
                    title: {
                        display: true,
                        text: 'Points',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    title: {
                        display: true,
                        text: 'Gameweek',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.innerHTML = `
        <strong>Data Loading Error</strong><br>
        ${message}<br><br>
        <small>If the problem persists, try:<br>
        - Refresh the page (F5)<br>
        - Check your internet connection<br>
        - Check browser console (F12) for error details</small>
    `;
    errorDiv.style.display = 'block';
}

function getTeamName(teamId) {
    const teams = {
        1: 'Arsenal', 2: 'Aston Villa', 3: 'Bournemouth', 4: 'Brentford',
        5: 'Brighton', 6: 'Chelsea', 7: 'Crystal Palace', 8: 'Everton',
        9: 'Fulham', 10: 'Ipswich', 11: 'Leicester', 12: 'Liverpool',
        13: 'Man City', 14: 'Man Utd', 15: 'Newcastle', 16: 'Nott\'m Forest',
        17: 'Southampton', 18: 'Spurs', 19: 'West Ham', 20: 'Wolves'
    };
    return teams[teamId] || 'N/A';
}

function getChipShortName(chipName) {
    const chipMap = {
        'wildcard': 'WC',
        'bboost': 'BB',
        '3xc': 'TC',
        'freehit': 'FH'
    };
    return chipMap[chipName] || chipName;
}

// Load team by ID
async function loadTeamById() {
    const input = document.getElementById('teamIdInput');
    const newTeamId = parseInt(input.value);
    
    if (!newTeamId || newTeamId < 1) {
        alert('Please enter a valid Team ID');
        return;
    }
    
    TEAM_ID = newTeamId;
    
    // Reset display
    document.getElementById('teamName').textContent = 'Loading...';
    document.getElementById('content').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    // Clear previous chart instances
    const pointsChart = Chart.getChart('pointsChart');
    if (pointsChart) pointsChart.destroy();
    const rankingChart = Chart.getChart('rankingChart');
    if (rankingChart) rankingChart.destroy();
    
    try {
        console.log(`Loading data for team ID: ${TEAM_ID}`);
        const data = await fetchTeamData();
        displayTeamData(data);
    } catch (error) {
        console.error('Full error:', error);
        let errorMessage = 'An error occurred while loading data. ';
        
        if (error.message.includes('HTTP: 404')) {
            errorMessage += `Team with ID ${TEAM_ID} not found. Please check if the ID is correct.`;
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMessage += 'Network connection problem. Check your internet connection.';
        } else {
            errorMessage += error.message || 'Unknown error.';
        }
        
        showError(errorMessage);
    }
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
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Initialization
window.addEventListener('DOMContentLoaded', async () => {
    // Allow Enter key to search
    document.getElementById('teamIdInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loadTeamById();
        }
    });
    
    // Hide loading, show empty state
    document.getElementById('loading').style.display = 'none';
});
