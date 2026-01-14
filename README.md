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

The AI transfer advisor uses a custom **Expected Points (xP)** algorithm:

```
xP = (Form × 0.4 + PPG × 0.6) × Difficulty_Multiplier × 5_Gameweeks
```

Where:
- **Form**: Player's recent form score
- **PPG**: Points per game average
- **Difficulty_Multiplier**: Based on fixture difficulty (2-5 scale)
  - Difficulty 2: 1.2x multiplier
  - Difficulty 3: 1.0x multiplier
  - Difficulty 4: 0.8x multiplier
  - Difficulty 5: 0.6x multiplier

Transfer suggestions are made when a potential replacement has at least **10% higher xP** than current squad player.

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
