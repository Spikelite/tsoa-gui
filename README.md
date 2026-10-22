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

`python -m tsoa_gui` serves the built client from `client/dist` and the API under `/api`, on port 8088. It reads the device's MQTT broker on `127.0.0.1:1883`, which is where it is when the server runs on the Venus OS device itself; `--mqtt-host` and `--mqtt-port` point it elsewhere. It only reads: the one thing it publishes is the keepalive Venus needs before it sends readings. Add `--mock` to serve invented readings instead of a device's, and `--certfile` and `--keyfile` to serve HTTPS. During development, run it beside `npm run dev`, which serves the client with live reload and passes `/api` through to it.

The browser reads the system model from `GET /api/system/events`, a stream of server-sent events: a `model` event with the whole model when the stream opens, then a `patch` event each time it changes, holding only what changed. `GET /api/system` returns the current model once.

## The system model

Everything a skin draws comes from one structure, the system model, defined in `server/tsoa_gui/model.py`. The client's TypeScript types are generated from it. After changing it, regenerate both files the client uses; the tests on both sides fail until they match:

    cd server
    python -m tsoa_gui.schema
    cd ../client
    npm run model

`server/tsoa_gui/mock.py` produces invented readings that run through a whole day every ten minutes, covering every status level, for developing and testing skins.
