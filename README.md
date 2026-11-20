# Barrel Adventure

A standalone canvas game. The player launches from barrel to barrel with the Space key and tries to reach the flag at the right edge of the screen.

## Run

Open `index.html` in a browser, or serve this folder with any static web server.

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- `Space`: launch from the current barrel
- `R`: restart after game over
- Click/tap the canvas or Launch button on touch devices

Each new game uses a fresh random level sequence. Difficulty increases each level until level 8, then the game continues at max difficulty with new random layouts until all lives are gone.

## Gameplay

Levels grow from 960 to 2640 world pixels, with a camera following the player and 4–11 barrels. Red gates track the calculated launch arcs; their openings narrow as difficulty increases. Flights may go above the screen, and crossing the flag clears the level at any height.

A level clear awards 100 points plus 150 per barrel skipped during the surviving attempt. Every 1,000 points earns an extra life. Best score is saved locally in the browser when storage is available; it turns green when beaten during the current run. Restart resets the run but keeps the best score.

The HUD shows the occupied barrel, and a YOU label and brighter barrel color mark it. Four backgrounds cycle by level. Synthesized sounds start after the first launch interaction when browser audio is available.

## Checks

Run `npm install`, then `npm test` for gameplay regression checks and `npm run lint` for JavaScript linting.
