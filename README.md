# TMNP

A Phaser 4 + TypeScript game, built with Vite and deployed to Cloudflare Workers static assets.

## Usage

Requires Node >= 20.19.

- `npm install`
- `npm run dev` – local dev server (http://localhost:5173)
- `npm run build` – typecheck and build to `dist/`
- `npm run lint` – ESLint (flat config) + Prettier
- `npm run deploy` – build and `wrangler deploy` (config in `wrangler.jsonc`)

Static files (sprites, sounds) live in `public/assets`.

## Extensions

You can edit this code with any text editor. VS Code is recommended, though. If you download the Prettier and ESLint extensions, you can get automatic code formatting to work.

## Contributions

I don't actively update this repository unless major breaking changes occur in either Phaser or TypeScript. Any PRs, whether to fix bugs or add new features, are welcomed and encouraged.

A big thank-you to these people who have contributed PRs to help keep this starter kit up-to-date:
 - @tailot - fixing issues with the Phaser 3.17 upgrade and getting the types aligned.
 - @sgparrish - adding ESLint and Prettier support
 - @WillMoreland - webpack copy plugin fixes and dependency updates
 
 ## Find me on YouTube
 
I make lots of game development tutorials on YouTube, mostly in the Godot engine.
I also post devlogs for the games I'm making. I usually post multiple videos a week.

[You can find my channel here.](https://www.youtube.com/channel/UCLzFt-NdfCm8WFKTyqD0yJw)

## Support my Work

If you've found this starter kit helpful and want to support my work and tutorials, [please consider buying me a coffee.](https://www.buymeacoffee.com/jmbiv)
 
## Further Reading

The [official Phaser documentation](https://phaser.io/learn) has lots of great tutorials, and the [Phaser Labs page](https://labs.phaser.io/) is full of great examples of using any aspect of Phaser.

I've written a few small games in Phaser. One was a game I created with a team of people for [Ludum Dare 44 called Root Maker](https://ldjam.com/events/ludum-dare/44/root-maker). You can find a great [post-mortem of that game here](https://spin.atomicobject.com/2019/05/11/ludum-dare-44/).
Additionally, Root Maker is open source. To see what a larger project might look like in Phaser (albeit one that doesn't use the physics system or much in the way of graphics), [you can find the source code here.](https://github.com/josephmbustamante/Root-Maker)
