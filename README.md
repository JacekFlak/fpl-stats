# FPL Stats - Fantasy Premier League Statistics & AI Transfer Advisor

Advanced statistics dashboard and AI-powered transfer recommendation system for Fantasy Premier League managers.

## Features

### 📊 Statistics Dashboard (index.html)
- **Team Overview**: Complete season statistics including total points, overall rank, team value
- **Manager Information**: Display manager details and league performance
- **Interactive Charts**: 
  - Points progression throughout the season
  - Rank changes over gameweeks
- **Season History Table**: Detailed gameweek breakdown including:
  - Points scored and bench points
  - Team value and rank
  - Transfers made and costs
  - Chips used (WC, BB, TC, FH)
  - Captain information for Triple Captain chips
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Scroll-to-Top Button**: Easy navigation for long statistics

### 🤖 AI Transfer Advisor (ai-transfers.html)
- **Intelligent Transfer Suggestions**: AI analyzes your squad and suggests optimal transfers
- **Expected Points (xP) Calculation**: Predicts player performance over next 5 gameweeks based on:
  - Current form
  - Points per game average
  - Fixture difficulty
- **Budget Management**: Shows available budget and transfer suggestions within budget constraints
- **Position-Based Analysis**: Analyzes each position (GK, DEF, MID, FWD) separately
- **Detailed Reasoning**: Explains why each transfer is recommended
- **Top Performers**: Lists highest xP players by position

## How to Use

### Statistics Dashboard
1. Open `index.html` in your browser
2. Enter your FPL Team ID (found in FPL website URL)
3. Click "Load Stats" to view your complete season statistics

### AI Transfer Advisor
1. Open `ai-transfers.html` in your browser
2. Enter your FPL Team ID
3. Click "Analyze Team" to receive AI-powered transfer recommendations
4. Review suggestions with expected points improvements and reasoning
5. Browse top performing players by position

## Team ID
Your Team ID can be found in the Fantasy Premier League website URL:
```
https://fantasy.premierleague.com/entry/YOUR_TEAM_ID/event/X
```

## Technologies

- **HTML5** - Structure and semantics
- **CSS3** - Styling with Flexbox, Grid, and responsive design
- **JavaScript (ES6+)** - Async/await, fetch API, data processing
- **Chart.js** - Interactive data visualizations
- **FPL API** - Official Fantasy Premier League API
- **CORS Proxies** - Cross-origin request handling

## API Endpoints Used

- `fantasy.premierleague.com/api/entry/{team-id}/` - Team data
- `fantasy.premierleague.com/api/entry/{team-id}/history/` - Season history
- `fantasy.premierleague.com/api/bootstrap-static/` - Players, teams, fixtures
- `fantasy.premierleague.com/api/entry/{team-id}/event/{gw}/picks/` - Gameweek picks

## AI Algorithm

The AI transfer advisor uses an advanced **Expected Points (xP)** algorithm powered by **Opta data** from the official FPL API.

### xP Calculation Formula

```
xP = (Form_Component + PPG_Component + Opta_Component + xGI_Component) 
     × Difficulty_Multiplier × Availability_Factor × 5_Gameweeks
```

### Components Breakdown

**1. Form Component (25% weight)**
- Recent form score from last gameweeks
- Reflects current player performance trend

**2. Points Per Game Component (25% weight)**
- Average points per game for the season
- Provides baseline performance metric

**3. Opta Component (30% weight)** - _Professional statistics_
- **Expected Goals (xG)** × 5 - Goal-scoring likelihood based on shot quality
- **Expected Assists (xA)** × 3 - Assist probability from chances created
- **Influence** ÷ 100 - Overall impact on team's match performance
- **Creativity** ÷ 100 - Chance creation and offensive contribution
- **Threat** ÷ 100 - Danger posed in attacking areas
- **ICT Index** ÷ 50 - Combined index of Influence, Creativity, and Threat

**4. Expected Goal Involvements Component (20% weight)**
- xG + xA per game - Direct attacking contributions
- Key metric for identifying high-value attacking players

**5. Availability Factor**
- Based on minutes played (capped at 900 minutes = full availability)
- Reduces xP for players with limited game time
- Formula: `min(minutes_played / 900, 1.0)`

**6. Fixture Difficulty Multiplier**
- **Easy fixtures (FDR ≤ 2)**: 1.4× points expected
- **Medium fixtures (FDR = 3)**: 1.0× baseline
- **Hard fixtures (FDR ≥ 4)**: 0.65× reduced expectation

### Transfer Recommendation Criteria

Transfers are suggested when:
- Replacement player has **≥10% higher xP** than current squad player
- Transfer fits within available budget
- Player is available (not injured, chance of playing > 0%)
- Player not already in squad

### Value Calculation

```
Player_Value = xP / (Price_in_£m)
```

This identifies players who provide the best expected points per million spent.

### Why Opta Data?

Opta is the official data provider for the Premier League and provides:
- **Objective metrics** - Based on actual match events, not opinions
- **Predictive power** - xG and xA are proven indicators of future performance
- **Professional grade** - Same data used by clubs and analysts
- **Real-time updates** - Continuously updated after each match

The algorithm combines traditional FPL metrics (form, PPG) with advanced Opta statistics to provide the most accurate transfer recommendations possible.

## File Structure

```
fpl-stats/
├── index.html              # Main statistics dashboard
├── ai-transfers.html       # AI transfer advisor page
├── style.css              # Shared styles for both pages
├── ai-transfers.css       # AI page specific styles
├── script.js              # Main dashboard logic
├── ai-transfers.js        # AI analysis and transfer logic
└── README.md              # This file
```

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

Requires JavaScript enabled and internet connection for API access.

## Author

**Powered by jSoft - Jacek Flak**

Website: [jacek-flak.com](https://jacek-flak.com)

## License

This project is for personal use. FPL data is property of Fantasy Premier League.

## Disclaimer

This is an unofficial tool and is not affiliated with Fantasy Premier League or the Premier League.
