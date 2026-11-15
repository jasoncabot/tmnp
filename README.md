# Teenage Mutant Ninja Parrots

A ninja parrot defends the jungle from an invading goldfish army of tanks, planes and helicopters. It's a 3D
twin-stick shooter built with three.js, TypeScript and Vite, and deployed to Cloudflare Workers static assets.

## Usage

Requires Node >= 20.19.

- `npm install`
- `npm run dev` starts the dev server. It also listens on your local network, so open the **Network** URL it prints
  on an iPad or phone on the same Wi-Fi.
- `npm run build` typechecks and builds to `dist/`.
- `npm run lint` runs ESLint (flat config) with Prettier.
- `npm run deploy` builds and runs `wrangler deploy` (config in `wrangler.jsonc`).

## Controls

Moving and aiming are separate on every device. The parrot spits ice bubbles from its beak, and each one carries the
parrot's momentum. Let go of movement and the parrot quickly glides to a hover, so you can turn and pick your target.

| | Mouse | Keyboard | Gamepad | iPad / iPhone |
| --- | --- | --- | --- | --- |
| Fly | Hold right button to fly towards the cursor | WASD / arrows | Left stick | Left thumb, anywhere on the left half |
| Aim | The parrot faces the cursor | Faces the way you fly | Right stick | Right thumb, anywhere on the right half |
| Fire | Hold left button | Hold Space | Right stick, RT or A | Holding the right thumb (tap to fire ahead) |
| Dash | | Shift | B / LB | Dash button |
| Frost bomb | | E / Q | Y / RB | Bomb button |
| Pause / mute | | Esc / M | Start | ❚❚ / ♪ buttons |

Sticks and touch get a gentle aim nudge of about 7° towards goldfish. Mouse aim has no assist.

<details>
<summary>Hidden techniques (spoilers, never explained in game)</summary>

- **Flick:** reverse your movement right as a dash ends, in a window from 0.06s before the end to 0.08s after.
  You barrel-roll into a faster dash the other way, and the dash recharges almost at once. You can chain up to three.
  Reversing too early spoils it.
- **Graze:** let a goldfish bubble skim past you mid-dash. Time slows briefly, your dash refunds, and you fire twice
  as fast for 1.6s, with your shots turning gold.

Tuning lives at the top of `src/game/game.ts`.

</details>

## Art and audio

Art, music and sound effects are generated with Replicate from the original sprites. See
[docs/style-guide.md](docs/style-guide.md) for the art direction, the goldfish rules and how to regenerate assets.
`public/assets/sounds/boom.wav` is the original explosion sound and always stays.

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
