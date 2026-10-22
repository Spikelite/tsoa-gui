# tsoa-gui

A web interface for Victron Energy systems running Venus OS: one page that shows the whole system and the power moving through it, in a choice of skins. It is in early development: it builds and runs, but shows no readings yet.

tsoa-gui is free for personal and other noncommercial use under the PolyForm Noncommercial License 1.0.0; see [LICENSE](LICENSE). Commercial use needs a separate license from the copyright holder.

Not affiliated with or endorsed by Victron Energy.

## Building and testing

The browser client is in `client/` and needs Node.js 24. The server is in `server/` and needs Python 3.12; it runs on the Venus OS device itself, which provides pydantic, so `server/requirements-venus.txt` pins the version Venus ships.

    cd client
    npm ci
    npm run lint
    npm run typecheck
    npm test
    npm run build
    npx playwright install chromium
    npm run e2e

    cd server
    python -m pip install -r requirements-dev.txt
    python -m pytest
    python -m tsoa_gui

`python -m tsoa_gui` serves the built client from `client/dist` and the API under `/api`, on port 8088. During development, run it beside `npm run dev`, which serves the client with live reload and passes `/api` through to it.
