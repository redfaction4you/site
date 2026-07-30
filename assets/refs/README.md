# Reference images for the column illustration

Drop files here, then `npm run refs:push` to sync them to R2. Only this README is
committed; the images themselves are gitignored and live in the bucket.

The illustration beside each night's write-up is composed from these rather than
imagined from scratch, so the picture shows the actual map that was played and the
actual player models, with the real number of players a side. What is in this
folder is the whole visual vocabulary the generator has.

## Layout

```
assets/refs/
  character-red-front.png     required
  character-red-back.png      optional, and worth having
  character-blue-front.png    required
  character-blue-back.png     optional, and worth having
  flag-red.png                required
  flag-blue.png               required
  maps/
    ankh-b12/01-flagroom.jpg
    ankh-b12/02-mid.jpg
    ankh-b12/03-corridor.jpg
    huna-b8/01-flagroom.jpg
    ...
```

## Naming

Lower case, hyphens, no spaces and no capitals anywhere. The map folder is a slug
of the map name: `Warlords Pro (No Amp)` becomes `warlords-pro`, brackets dropped.
Several in-game map names can point at one folder, which is what
`src/lib/ai/image-refs.ts` is for, so variants that share their geometry share
their screenshots.

Screenshots are `<nn>-<area>.jpg`, numbered from 01 with a leading zero so the
ordering is stable. The area suffix comes from this list, and it is not decorative:
it is how the code picks a screenshot that suits the moment being illustrated, so a
capture gets the flag room rather than an empty corridor.

```
overview   the whole level from outside or above, the shot that IS the map
flagroom   the flag stand and the room around it, or blue-/red- prefixed
base       the rest of a team's base
mid        the middle ground both teams fight over
corridor   an enclosed run between areas
open       a large or outdoor space
tunnel     a tight vertical or underground route
```

`overview` is the important one and every map should have exactly one. It is what
gets shown wherever a map is merely named, so a reader scanning a list of results
can recognise where each was played. A flag room close-up is the right picture for
illustrating a capture and the wrong one for labelling a match. The word
`default`, `hero`, `establish` or `wide` in a filename works too.

Three to six per map is plenty. More is not better: they are picked from, not
combined.

## Getting the shots right

**HUD off.** This one is not negotiable. Score, ammo counts, player names and the
crosshair are all text, and text in a reference bleeds into the generated picture.
The check in `src/lib/ai/vision.ts` rejects anything with legible lettering in it,
so a HUD in the reference means no illustration at all that night. Use spectator or
free camera if the HUD cannot be turned off.

**No other players in frame** for map shots. The generator places the figures; a
player already standing in the reference becomes a seventh person in a 3v3.

**Characters** want a plain flat background, full body, standing, as large as you
can capture. Transparent is ideal but a flat colour is fine. The back view matters
more than it sounds: celebration shots look right from behind, and a figure facing
away cannot have a wrong face.

**Format and size.** PNG for characters and flags, so transparency survives. JPEG
is fine for map screenshots. Keep each file under about 2 MB; they are downscaled
on the way to the model anyway, and several are sent in one request.
