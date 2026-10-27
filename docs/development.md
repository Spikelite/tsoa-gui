# Development

tsoa-gui has two halves. The browser client in `client/` is React and TypeScript, built with Vite and tested with Vitest and Playwright; it needs Node.js 24. The server in `server/` is Python with FastAPI; it needs Python 3.12. On a Venus OS device the server runs on the Python that Venus ships, which also provides pydantic, so `server/requirements-venus.txt` pins the versions Venus has and development tests against them.

## Building and testing

The client:

    cd client
    npm ci
    npm run lint
    npm run typecheck
    npm test
    npm run build
    npx playwright install chromium
    npm run e2e

The end-to-end tests run against `npm run preview` and answer the event stream themselves, so they need no server. Each runs on a landscape screen and on a phone.

The server:

    cd server
    python -m pip install -r requirements-dev.txt
    python -m pytest

CI runs all of this and builds a release; see `.github/workflows/ci.yml`.

## Running it without a device

    cd server
    python -m tsoa_gui --mock

This serves the built client from `client/dist` and the API under `/api` on `http://127.0.0.1:8088`, with invented readings from `server/tsoa_gui/mock.py` instead of a device's. The mock is a 24 V system with two solar arrays, a generator and shore power, and it runs through a whole day every ten minutes, starting at midnight, so every skin can be seen in every state: the generator at dawn, the sun through the day, shore power in the evening, a warning, an overload trip and a solar charger that stops reporting for half a minute.

To work on the client with live reload, run the server as above and `npm run dev` in `client/` beside it. Vite passes `/api` through to port 8088.

`python -m tsoa_gui --help` lists the other options. Without `--mock` the server reads a Venus OS device's MQTT broker on `127.0.0.1:1883`, which is where it is when the server runs on the device; `--mqtt-host` and `--mqtt-port` point it elsewhere. `--host` and `--port` set where it listens, and `--certfile` and `--keyfile` together make it serve HTTPS. It only reads from the broker: the one message it publishes is the keepalive Venus needs before it sends readings.

## How the client gets its readings

Everything a skin draws comes from one structure, the system model. `GET /api/system/events` is a stream of server-sent events. It opens with a `release` event naming the server's version, `null` on a development run, and a fingerprint of the client it serves; the page reloads when either differs from what it loaded with. Until the server has a model, a `status` event says why not each time that changes: `connecting`, `broker_unreachable` or `broker_silent`. Then comes a `model` event with the whole model, and a `patch` event holding only what changed, each time something does. When the server already has as many streams open as it allows, 100 in all and 20 from one address, it answers with a stream of one `busy` event instead, which says how many seconds to wait and sets the browser's own retry to match. `GET /api/system` returns the current model once. The model's `live` field turns false when the server has not heard from the device for ten seconds.

The model is defined in `server/tsoa_gui/model.py`, and the client's TypeScript types are generated from it. After changing it, regenerate both files the client uses; the tests on both sides fail until they match:

    cd server
    python -m tsoa_gui.schema
    cd ../client
    npm run model

A skin is a React component in `client/src/skins/` that receives the model and draws it. The skins share the readings each part shows, in `client/src/skins/readings.ts` for the overview and `client/src/skins/details.ts` for the parts' own pages, so that a new reading appears in every skin. `docs/design.md` describes what each skin draws.

## Building a release

A release is one archive that installs on a Venus OS device. Build the client first, then the archive, with the server's development environment:

    cd client
    npm run build
    cd ..
    python venus/build.py

This writes `dist/tsoa-gui-<version>.tar.gz` and its `.sha256`. The archive holds the server, the built client, the server's pure-Python dependencies, each checked against `server/requirements-hashes.txt`, the scripts in `venus/` that install, start, roll back and remove it, and the Python and pydantic versions it was tested with. `--version` sets the version, which otherwise comes from `git describe`. Every file in the archive carries the commit's date, taken from git or from `SOURCE_DATE_EPOCH`, so the same commit and client build give the same archive on any machine. Pushing a tag such as `v0.1.0` builds and publishes a release from CI. Installing it is covered in [install.md](install.md).

A release fails before anything is built unless `README.md` already contains its download URL, so the README's install block is updated to the new version, in a pull request merged before the tag.

On the device, a release lives under `/data/tsoa-gui/releases/`. `/data/tsoa-gui/current` points at the one in use and `/data/tsoa-gui/previous` at the one before, which `rollback.sh` returns to. The configuration is `/data/tsoa-gui/etc/tsoa-gui.conf`, the certificate is in `/data/tsoa-gui/tls/`, and one line in `/data/rc.local` starts the service at every boot under the device's daemontools, from `venus/boot.sh`. The server starts as root to read its TLS key, then runs as user and group ID 8088, with `/data/tsoa-gui/var/` the one place it can write. It logs warnings and errors only, to `/data/log/tsoa-gui`. The installer refuses a release whose tested Python or pydantic differ from the device's, and if a firmware update changes them later, the server serves only a page, with status 503, saying a newer release is needed.
