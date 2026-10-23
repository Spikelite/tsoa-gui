# Contributing to tsoa-gui

Bug reports, feature requests and pull requests are welcome. Issues and pull requests are public, so leave out anything that identifies your installation: the portal ID, serial numbers, IP addresses, hostnames and your VRM site name.

## Reporting a bug

Open an issue with the bug report form. It asks for the device, the Venus OS and tsoa-gui versions, the browser and screen, and the server's log, which is in `/data/log/tsoa-gui/current` on the device. One problem per issue.

Security problems go through private reporting instead; see [SECURITY.md](SECURITY.md).

## Asking for a feature

Open an issue with the feature request form and describe what you want to see or do, rather than only how it should look. The design brief in [docs/design.md](docs/design.md) says what tsoa-gui is meant to be.

## Pull requests

For anything larger than a small fix, open an issue first, so that the approach is agreed before you spend time on it. Building, running and testing tsoa-gui are covered in [docs/development.md](docs/development.md).

- Keep a pull request to one change, on a branch named for it, such as `fix/flow-direction`.
- Add or update tests for what you change. Test data is invented; where an address or hostname is needed, use 192.0.2.0/24 and example.com.
- Every skin has to work on a landscape screen, from a small touch panel to a TV, as well as on a phone.
- Artwork is original. Do not add logos, sounds or names taken from films, games or other products.
- A new dependency needs a permissive license such as MIT, BSD, ISC, Apache-2.0 or PSF-2.0; copyleft licenses such as GPL and AGPL cannot be used. The server runs on the Venus OS device with the Python and pydantic that Venus ships, so its dependencies have to be pure Python.

## How changes are reviewed

Every change reaches `main` through a pull request that has been reviewed, the maintainer's own included. Review checks that the change builds and passes its tests, fits the design brief, and carries nothing from a real installation. Pull requests merge with a merge commit, so the commits you push are the ones that land: tidy them before asking for review.

## Commit messages

The first line says what the change does, in the imperative, in under 72 characters and without a full stop, for example "Make an update restart the server reliably". After a blank line, the body explains what changed and why, wrapped at 72 characters, and how it was tested when that is not obvious.

Your commit's email address becomes public. GitHub's noreply address for your account works if you would rather not publish your own.

## Licensing your contribution

tsoa-gui is published under the [PolyForm Noncommercial License 1.0.0](LICENSE), and its copyright holder, Spikelite, may also license it commercially. For that to stay possible, a contribution needs a broader license than the one tsoa-gui is published under. By ticking the box in your pull request's description, you agree to the following for everything the pull request contains:

- You wrote it, or you otherwise have the right to contribute it on these terms, and anyone else with rights in it, such as an employer, has agreed.
- You grant Spikelite a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, copy, modify and distribute it, to sublicense it, and to license it to others on any terms, commercial ones included.
- You grant Spikelite, and everyone who receives tsoa-gui, a license on the same terms under any patent of yours that the contribution would otherwise infringe.
- You keep your copyright, and you remain free to use your contribution however you like.
- Your contribution is published as part of tsoa-gui under its license.

A pull request whose box is not ticked is not merged.
